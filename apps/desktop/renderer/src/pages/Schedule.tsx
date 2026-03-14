import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { collection, onSnapshot, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import { Calendar as BigCalendar, dateFnsLocalizer, View, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { Calendar as CalendarIcon, RefreshCw, Loader } from 'lucide-react';
import { useNavigate } from 'react-router';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import Swal from 'sweetalert2';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface InspectionEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  operationId: string;
  googleCalendarEventId?: string;
}

interface Operation {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
}

export default function Schedule() {
  const { user, googleAccessToken } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<InspectionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    if (!user) return;

    const fetchOperationsAndInspections = async () => {
      try {
        // Fetch operations first to get names
        const opsSnapshot = await getDocs(collection(db, `users/${user.uid}/operations`));
        const opsMap = new Map<string, string>();
        opsSnapshot.forEach(doc => {
          opsMap.set(doc.id, doc.data().name);
        });

        // Listen to inspections
        const inspectionsPath = `users/${user.uid}/inspections`;
        const unsubscribe = onSnapshot(
          collection(db, inspectionsPath),
          (snapshot) => {
            const eventsData: InspectionEvent[] = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              if (data.date) {
                // Parse the start date (YYYY-MM-DD format)
                const [year, month, day] = data.date.split('-');
                const startDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

                // Parse the end date if present; otherwise default to start date
                let endDate = startDate;
                if (data.endDate) {
                  const [eYear, eMonth, eDay] = data.endDate.split('-');
                  endDate = new Date(parseInt(eYear), parseInt(eMonth) - 1, parseInt(eDay));
                }

                eventsData.push({
                  id: doc.id,
                  title: `${opsMap.get(data.operationId) || 'Unknown Operation'} (${data.status})`,
                  start: startDate,
                  end: endDate,
                  status: data.status,
                  operationId: data.operationId,
                  googleCalendarEventId: data.googleCalendarEventId,
                });
              }
            });
            setEvents(eventsData);
            setLoading(false);
          },
          (error) => handleFirestoreError(error, OperationType.LIST, inspectionsPath)
        );

        return unsubscribe;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `users/${user?.uid}/operations`);
        setLoading(false);
      }
    };

    let unsub: () => void;
    fetchOperationsAndInspections().then(u => {
      if (u) unsub = u;
    });

    return () => {
      if (unsub) unsub();
    };
  }, [user]);

  const handleSelectEvent = (event: InspectionEvent) => {
    navigate(`/inspections/${event.id}`);
  };

  // Pull changes from Google Calendar → Firestore.
  // Returns the number of Firestore documents that were updated.
  const fetchUpdatesFromGoogleCalendar = useCallback(async (): Promise<number> => {
    const token = googleAccessToken || localStorage.getItem('googleAccessToken');
    if (!token || token === 'dummy' || !user) return 0;

    const syncableEvents = events.filter(e => e.status === 'Scheduled' && e.googleCalendarEventId);
    if (syncableEvents.length === 0) return 0;

    let updatedCount = 0;

    for (const event of syncableEvents) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.googleCalendarEventId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // 404 means the event was deleted from Google Calendar — leave Firestore alone
        if (!response.ok) continue;

        const gcalEvent = await response.json();

        // All-day events expose start.date; timed events expose start.dateTime
        const gcalStartDate: string | undefined =
          gcalEvent.start?.date ?? gcalEvent.start?.dateTime?.split('T')[0];
        const gcalEndDateRaw: string | undefined =
          gcalEvent.end?.date ?? gcalEvent.end?.dateTime?.split('T')[0];

        if (!gcalStartDate) continue;

        const firestoreStartDate = format(event.start, 'yyyy-MM-dd');
        if (gcalStartDate === firestoreStartDate) continue; // no drift — skip

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

        const inspectionRef = doc(db, `users/${user.uid}/inspections`, event.id);
        await updateDoc(inspectionRef, { date: gcalStartDate, endDate: newEndDate });
        updatedCount++;
        logger.debug(`[GCal sync] Updated inspection ${event.id}: ${firestoreStartDate} → ${gcalStartDate}`);
      } catch (err) {
        logger.error(`[GCal sync] Error checking event ${event.id}:`, err);
      }
    }

    return updatedCount;
  }, [events, googleAccessToken, user]);

  // Run a silent pull-sync once after the initial event load completes.
  const initialSyncRan = useRef(false);
  useEffect(() => {
    if (loading || initialSyncRan.current) return;
    initialSyncRan.current = true;

    const token = googleAccessToken || localStorage.getItem('googleAccessToken');
    if (!token || token === 'dummy') return;

    fetchUpdatesFromGoogleCalendar().then(count => {
      if (count > 0) {
        logger.debug(`[GCal sync] Auto-updated ${count} inspection(s) from Google Calendar on mount.`);
      }
    });
  }, [loading, fetchUpdatesFromGoogleCalendar, googleAccessToken]);

  const handleGoogleCalendarSync = async () => {
    const token = googleAccessToken || localStorage.getItem('googleAccessToken');
    if (!token || token === 'dummy') {
      Swal.fire({ text: 'Please sign in with Google to sync to Calendar. If you are signed in, your session may have expired — try signing out and back in.', icon: 'info' });
      return;
    }

    const scheduledEvents = events.filter(e => e.status === 'Scheduled');
    if (scheduledEvents.length === 0) {
      Swal.fire({ text: 'No "Scheduled" inspections to sync.', icon: 'info' });
      return;
    }

    setSyncing(true);

    // Phase 1: Pull any date changes from Google Calendar → Firestore
    const pulledCount = await fetchUpdatesFromGoogleCalendar();

    // Phase 2: Push Firestore events → Google Calendar
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

        // Fetch the latest googleCalendarEventId directly from Firestore to avoid stale state
        const inspectionRef = doc(db, `users/${user!.uid}/inspections`, event.id);
        const inspectionSnap = await getDoc(inspectionRef);
        const storedGcalId = inspectionSnap.exists()
          ? inspectionSnap.data().googleCalendarEventId
          : undefined;

        let response: Response;

        if (storedGcalId) {
          // Event already synced — PATCH to update in place (no duplicates)
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
            // Event was deleted from Google Calendar — fall through to recreate it
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
              await updateDoc(inspectionRef, { googleCalendarEventId: created.id });
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
          // First time syncing this inspection — POST to create
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
            await updateDoc(inspectionRef, { googleCalendarEventId: created.id });
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

  const eventStyleGetter = (event: InspectionEvent) => {
    let backgroundColor = '#e5e7eb'; // default gray
    let color = '#374151';

    if (event.status === 'Completed') {
      backgroundColor = '#d1fae5'; // emerald-100
      color = '#047857'; // emerald-700
    } else if (event.status === 'Scheduled') {
      backgroundColor = '#dbeafe'; // blue-100
      color = '#1d4ed8'; // blue-700
    } else if (event.status === 'In Progress') {
      backgroundColor = '#fef08a'; // yellow-200
      color = '#a16207'; // yellow-700
    }

    return {
      style: {
        backgroundColor,
        color,
        borderRadius: '8px',
        border: 'none',
        display: 'block',
        fontSize: '12px',
        fontWeight: 'bold',
        padding: '2px 8px',
      }
    };
  };

  return (
    <div className="animate-in fade-in duration-500 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-end mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-stone-100">
            <CalendarIcon size={24} className="text-[#D49A6A]" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Schedule</h1>
            <p className="mt-1 text-stone-500 text-sm">Manage your upcoming inspections.</p>
          </div>
        </div>

        <button
          onClick={handleGoogleCalendarSync}
          disabled={syncing}
          className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60"
        >
          {syncing ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {syncing ? 'Syncing…' : 'Sync with Google Calendar'}
        </button>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex-1 flex flex-col min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-stone-500">
            Loading schedule...
          </div>
        ) : (
          <div className="flex-1 min-h-0 calendar-container">
            <BigCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              view={view}
              onView={(newView) => setView(newView)}
              date={date}
              onNavigate={(newDate) => setDate(newDate)}
              onSelectEvent={handleSelectEvent}
              eventPropGetter={eventStyleGetter}
              views={['month', 'week', 'day', 'agenda']}
              popup
            />
          </div>
        )}
      </div>

      <style>{`
        .calendar-container .rbc-calendar {
          font-family: inherit;
        }
        .calendar-container .rbc-toolbar button {
          color: #57534e;
          border-color: #e7e5e4;
          border-radius: 8px;
          margin: 0 4px;
        }
        .calendar-container .rbc-toolbar button:active,
        .calendar-container .rbc-toolbar button.rbc-active {
          background-color: #D49A6A;
          color: white;
          border-color: #D49A6A;
          box-shadow: none;
        }
        .calendar-container .rbc-toolbar button:hover:not(.rbc-active) {
          background-color: #f5f5f4;
        }
        .calendar-container .rbc-header {
          padding: 8px 0;
          font-weight: 600;
          color: #44403c;
          border-bottom: 1px solid #e7e5e4;
        }
        .calendar-container .rbc-month-view,
        .calendar-container .rbc-time-view,
        .calendar-container .rbc-agenda-view {
          border-color: #e7e5e4;
          border-radius: 16px;
          overflow: hidden;
        }
        .calendar-container .rbc-day-bg + .rbc-day-bg,
        .calendar-container .rbc-month-row + .rbc-month-row {
          border-color: #e7e5e4;
        }
        .calendar-container .rbc-off-range-bg {
          background-color: #fafaf9;
        }
        .calendar-container .rbc-today {
          background-color: #fff7ed;
        }
      `}</style>
    </div>
  );
}
