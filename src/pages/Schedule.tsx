import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Calendar as BigCalendar, dateFnsLocalizer, View, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { Calendar as CalendarIcon, RefreshCw, Loader } from 'lucide-react';
import { useNavigate } from 'react-router';
import 'react-big-calendar/lib/css/react-big-calendar.css';

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

  const handleGoogleCalendarSync = async () => {
    const token = googleAccessToken || localStorage.getItem('googleAccessToken');
    if (!token || token === 'dummy') {
      alert('Please sign in with Google to sync to Calendar. If you are signed in, your session may have expired — try signing out and back in.');
      return;
    }

    const scheduledEvents = events.filter(e => e.status === 'Scheduled');
    if (scheduledEvents.length === 0) {
      alert('No "Scheduled" inspections to sync.');
      return;
    }

    setSyncing(true);
    let successCount = 0;
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

        const response = await fetch(
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
          successCount++;
        } else {
          failCount++;
          console.error('Failed to create calendar event:', await response.text());
        }
      } catch (err) {
        failCount++;
        console.error('Calendar event creation error:', err);
      }
    }

    setSyncing(false);

    if (failCount === 0) {
      alert(`Successfully synced ${successCount} inspection(s) to Google Calendar!`);
    } else {
      alert(`Synced ${successCount} inspection(s) to Google Calendar. ${failCount} failed — check the console for details.`);
    }
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
          {syncing ? 'Syncing…' : 'Sync to Google Calendar'}
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
