import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import { format, addDays } from 'date-fns';
import { Calendar as CalendarIcon, RefreshCw, Loader, Settings } from 'lucide-react';
import { useNavigate } from 'react-router';
import Swal from 'sweetalert2';
import type { Inspection, Operation } from '@dios/shared';

interface InspectionEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  operationId: string;
  googleCalendarEventId?: string;
}

export default function Schedule() {
  const { user, googleAccessToken } = useAuth();
  const navigate = useNavigate();
  const { findAll: findAllInspections, save: saveInspection } = useDatabase<Inspection>({ table: 'inspections' });
  const { findAll: findAllOperations } = useDatabase<Operation>({ table: 'operations' });

  const [events, setEvents] = useState<InspectionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // Store inspections in state so the Google Calendar sync can access them
  const [inspections, setInspections] = useState<Inspection[]>([]);

  const hasGoogleToken = Boolean(
    googleAccessToken ||
    (typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('googleAccessToken'))
  );

  useEffect(() => {
    if (!user) return;

    const fetchOperationsAndInspections = async () => {
      try {
        // Fetch operations first to get names
        const opsData = await findAllOperations();
        const opsMap = new Map<string, string>();
        opsData.forEach(op => {
          opsMap.set(op.id, op.name);
        });

        // Fetch inspections
        const inspectionsData = await findAllInspections();
        setInspections(inspectionsData);
        const eventsData: InspectionEvent[] = [];

        inspectionsData.forEach((inspection) => {
          if (inspection.date) {
            // Parse the start date (YYYY-MM-DD format)
            const dateParts = inspection.date.split('-');
            if (dateParts.length !== 3) return; // skip malformed date strings
            const [year, month, day] = dateParts;
            const parsedYear = parseInt(year);
            const parsedMonth = parseInt(month);
            const parsedDay = parseInt(day);
            if (isNaN(parsedYear) || isNaN(parsedMonth) || isNaN(parsedDay)) return;
            const startDate = new Date(parsedYear, parsedMonth - 1, parsedDay);

            // Parse the end date if present; otherwise default to start date
            let endDate = startDate;
            if (inspection.endDate) {
              const endParts = inspection.endDate.split('-');
              if (endParts.length !== 3) {
                endDate = startDate;
              } else {
                const [eYear, eMonth, eDay] = endParts;
                const pe = parseInt(eYear);
                const pm = parseInt(eMonth);
                const pd = parseInt(eDay);
                if (isNaN(pe) || isNaN(pm) || isNaN(pd)) {
                  endDate = startDate;
                } else {
                  endDate = new Date(pe, pm - 1, pd);
                }
              }
            }

            eventsData.push({
              id: inspection.id,
              title: `${opsMap.get(inspection.operationId) || 'Unknown Operation'} (${inspection.status})`,
              start: startDate,
              end: endDate,
              status: inspection.status,
              operationId: inspection.operationId,
              googleCalendarEventId: inspection.googleCalendarEventId,
            });
          }
        });

        setEvents(eventsData);
        setLoading(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `users/${user?.uid}/inspections`);
        setLoading(false);
      }
    };

    fetchOperationsAndInspections();
  }, [user, findAllInspections, findAllOperations]);

  // Pull changes from Google Calendar -> Firestore.
  // Returns the number of Firestore documents that were updated.
  const fetchUpdatesFromGoogleCalendar = useCallback(async (): Promise<number> => {
    const token = googleAccessToken || sessionStorage.getItem('googleAccessToken');
    if (!token || !user) return 0;

    const syncableEvents = events.filter(e => e.status === 'Scheduled' && e.googleCalendarEventId);
    if (syncableEvents.length === 0) return 0;

    let updatedCount = 0;

    for (const event of syncableEvents) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.googleCalendarEventId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // 404 means the event was deleted from Google Calendar -- leave Firestore alone
        if (!response.ok) continue;

        const gcalEvent = await response.json();

        // All-day events expose start.date; timed events expose start.dateTime
        const gcalStartDate: string | undefined =
          gcalEvent.start?.date ?? gcalEvent.start?.dateTime?.split('T')[0];
        const gcalEndDateRaw: string | undefined =
          gcalEvent.end?.date ?? gcalEvent.end?.dateTime?.split('T')[0];

        if (!gcalStartDate) continue;

        const firestoreStartDate = format(event.start, 'yyyy-MM-dd');
        if (gcalStartDate === firestoreStartDate) continue; // no drift -- skip

        // Build the Firestore update
        const [sy, sm, sd] = gcalStartDate.split('-').map(Number);
        const newStart = new Date(sy, sm - 1, sd);

        // Google Calendar all-day end dates are exclusive (day after last day),
        // so subtract 1 day to get the inclusive end stored in Firestore.
        let newEndDate = format(newStart, 'yyyy-MM-dd'); // fallback: single-day
        if (gcalEndDateRaw) {
          const [ey, em, ed] = gcalEndDateRaw.split('-').map(Number);
          const gcalEndExclusive = new Date(ey, em - 1, ed);
          const inclusiveEnd = addDays(gcalEndExclusive, -1);
          newEndDate = format(inclusiveEnd, 'yyyy-MM-dd');
        }

        // Update inspection using useDatabase
        const inspectionToUpdate = inspections.find(i => i.id === event.id);
        if (inspectionToUpdate) {
          await saveInspection({
            ...inspectionToUpdate,
            date: gcalStartDate,
            endDate: newEndDate,
          });
        }
        updatedCount++;
        logger.debug(`[GCal sync] Updated inspection ${event.id}: ${firestoreStartDate} -> ${gcalStartDate}`);
      } catch (err) {
        logger.error(`[GCal sync] Error checking event ${event.id}:`, err);
      }
    }

    return updatedCount;
  }, [events, googleAccessToken, user, inspections, saveInspection]);

  // Run a silent pull-sync once after the initial event load completes.
  const initialSyncRan = useRef(false);
  useEffect(() => {
    if (loading || initialSyncRan.current) return;
    initialSyncRan.current = true;

    const token = googleAccessToken || sessionStorage.getItem('googleAccessToken');
    if (!token) return;

    fetchUpdatesFromGoogleCalendar().then(count => {
      if (count > 0) {
        logger.debug(`[GCal sync] Auto-updated ${count} inspection(s) from Google Calendar on mount.`);
      }
    });
  }, [loading, fetchUpdatesFromGoogleCalendar, googleAccessToken]);

  const handleGoogleCalendarSync = async () => {
    const token = googleAccessToken || sessionStorage.getItem('googleAccessToken');
    if (!token) {
      Swal.fire({ text: 'Please sign in with Google to sync to Calendar. If you are signed in, your session may have expired — try signing out and back in.', icon: 'info' });
      return;
    }

    const scheduledEvents = events.filter(e => e.status === 'Scheduled');
    if (scheduledEvents.length === 0) {
      Swal.fire({ text: 'No "Scheduled" inspections to sync.', icon: 'info' });
      return;
    }

    setSyncing(true);

    // Phase 1: Pull any date changes from Google Calendar -> Firestore
    const pulledCount = await fetchUpdatesFromGoogleCalendar();

    // Phase 2: Push Firestore events -> Google Calendar
    let createdCount = 0;
    let updatedCount = 0;
    let failCount = 0;

    for (const event of scheduledEvents) {
      try {
        // Google Calendar all-day events use exclusive end dates (end = day after last day)
        const gcalEnd = addDays(event.end, 1);

        const calendarEvent = {
          summary: event.title,
          description: `Inspection ID: ${event.id}\nManaged via DIOS Studio.`,
          start: { date: format(event.start, 'yyyy-MM-dd') },
          end: { date: format(gcalEnd, 'yyyy-MM-dd') },
        };

        // Get the latest googleCalendarEventId from local state to avoid stale state
        const currentInspection = inspections.find(i => i.id === event.id);
        const storedGcalId = currentInspection?.googleCalendarEventId;

        let response: Response;

        if (storedGcalId) {
          // Event already synced -- PATCH to update in place (no duplicates)
          response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${storedGcalId}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(calendarEvent),
            }
          );

          if (response.ok) {
            updatedCount++;
          } else if (response.status === 404) {
            // Event was deleted from Google Calendar -- fall through to recreate it
            response = await fetch(
              'https://www.googleapis.com/calendar/v3/calendars/primary/events',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(calendarEvent),
              }
            );

            if (response.ok) {
              const created = await response.json();
              // Update inspection with new googleCalendarEventId using useDatabase
              if (currentInspection) {
                await saveInspection({
                  ...currentInspection,
                  googleCalendarEventId: created.id,
                });
              }
              createdCount++;
            } else {
              failCount++;
              logger.error('Failed to recreate calendar event:', await response.text());
            }
            continue;
          } else {
            failCount++;
            logger.error('Failed to update calendar event:', await response.text());
          }
        } else {
          // First time syncing this inspection -- POST to create
          response = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(calendarEvent),
            }
          );

          if (response.ok) {
            const created = await response.json();
            // Persist the Google Calendar Event ID to prevent future duplicates
            if (currentInspection) {
              await saveInspection({
                ...currentInspection,
                googleCalendarEventId: created.id,
              });
            }
            createdCount++;
          } else {
            failCount++;
            logger.error('Failed to create calendar event:', await response.text());
          }
        }
      } catch (err) {
        failCount++;
        logger.error('Calendar sync error:', err);
      }
    }

    setSyncing(false);

    const parts: string[] = [];
    if (pulledCount > 0) parts.push(`Pulled ${pulledCount} date change(s) from Google Calendar`);
    if (createdCount > 0) parts.push(`Created ${createdCount} new event(s) in Google Calendar`);
    if (updatedCount > 0) parts.push(`Updated ${updatedCount} existing event(s) in Google Calendar`);
    if (failCount > 0) parts.push(`${failCount} failed — check the console`);

    Swal.fire({ text: parts.length > 0 ? parts.join('. ') + '.' : 'Everything is already in sync.', icon: 'info' });
  };

  return (
    <div className="animate-in fade-in duration-500 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-end mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 luxury-card rounded-2xl flex items-center justify-center">
            <CalendarIcon size={24} className="text-[#d4a574]" />
          </div>
          <div>
            <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420] tracking-tight">Schedule</h1>
            <p className="mt-1 text-[#8b7355] text-sm font-medium">Manage your upcoming inspections.</p>
          </div>
        </div>

        <button
          onClick={handleGoogleCalendarSync}
          disabled={syncing}
          className="px-4 py-2 bg-white border border-[rgba(212,165,116,0.15)] text-[#4a4038] rounded-xl text-sm font-medium hover:bg-[rgba(212,165,116,0.04)] transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60"
        >
          {syncing ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {syncing ? 'Syncing...' : 'Sync with Google Calendar'}
        </button>
      </div>

      <div className="luxury-card rounded-[24px] flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[#8b7355]">
            Loading schedule...
          </div>
        ) : hasGoogleToken ? (
          <iframe
            src="https://calendar.google.com/calendar/embed?src=primary&mode=MONTH"
            title="Google Calendar"
            className="w-full flex-1 border-0 rounded-[24px]"
            style={{ minHeight: 0 }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
            <div className="w-16 h-16 bg-[rgba(212,165,116,0.04)] rounded-2xl flex items-center justify-center border border-[rgba(212,165,116,0.12)]">
              <CalendarIcon size={32} className="text-[#d4a574]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#4a4038] mb-1">
                Google Calendar not connected
              </h2>
              <p className="text-[#8b7355] text-sm max-w-md">
                Sign in with Google in Settings to view your calendar here and sync inspection events.
              </p>
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="mt-2 px-5 py-2.5 luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer transition-colors flex items-center gap-2 shadow-sm"
            >
              <Settings size={16} />
              Go to Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
