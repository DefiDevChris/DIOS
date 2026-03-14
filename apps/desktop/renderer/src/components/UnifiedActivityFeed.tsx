import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
import { StickyNote, CheckSquare, Activity } from 'lucide-react';
import type { Note, Task, OperationActivity } from '@dios/shared/types';

interface UnifiedActivityFeedProps {
  operationId: string;
  operationEmail?: string;
  refreshTrigger?: number;
}

interface FeedEntry {
  id: string;
  type: 'note' | 'task' | 'activity';
  content: string;
  timestamp: string;
  status?: string;
}

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ICON_CONFIG = {
  note: { icon: StickyNote, bg: 'bg-amber-50', text: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  task: { icon: CheckSquare, bg: 'bg-blue-50', text: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' },
  activity: { icon: Activity, bg: 'bg-stone-100', text: 'text-stone-500', badge: 'bg-stone-100 text-stone-600' },
};

export default function UnifiedActivityFeed({ operationId, refreshTrigger }: UnifiedActivityFeedProps) {
  const { user } = useAuth();
  const { findAll: findAllNotes } = useDatabase<Note>({ table: 'notes' });
  const { findAll: findAllTasks } = useDatabase<Task>({ table: 'tasks' });
  const { findAll: findAllActivities } = useDatabase<OperationActivity>({ table: 'activities', parentPath: operationId ? `operations/${operationId}` : undefined });
  const [notes, setNotes] = useState<FeedEntry[]>([]);
  const [tasks, setTasks] = useState<FeedEntry[]>([]);
  const [activities, setActivities] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    let loadedCount = 0;
    const markLoaded = () => {
      loadedCount += 1;
      if (loadedCount >= 3) setLoading(false);
    };

    findAllNotes({ operationId }).then((notesData) => {
      setNotes(notesData.map((d) => ({
        id: d.id,
        type: 'note' as const,
        content: d.content || '',
        timestamp: d.createdAt || d.updatedAt || '',
      })));
      markLoaded();
    });

    findAllTasks({ operationId }).then((tasksData) => {
      setTasks(tasksData.map((d) => ({
        id: d.id,
        type: 'task' as const,
        content: d.title || '',
        timestamp: d.createdAt || d.updatedAt || '',
        status: d.status,
      })));
      markLoaded();
    });

    findAllActivities({ operationId }).then((activitiesData) => {
      setActivities(activitiesData.map((d) => ({
        id: d.id,
        type: 'activity' as const,
        content: d.description || '',
        timestamp: d.timestamp || d.updatedAt || '',
      })));
      markLoaded();
    });
  }, [user, operationId, refreshTrigger, findAllNotes, findAllTasks, findAllActivities]);

  const entries = useMemo(() => {
    return [...notes, ...tasks, ...activities].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [notes, tasks, activities]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-3 bg-white rounded-xl border border-stone-100 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-stone-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-stone-200 rounded w-3/4" />
              <div className="h-3 bg-stone-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-stone-400 text-sm">
        No activity yet. Add a note or complete an inspection step to see activity here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const config = ICON_CONFIG[entry.type];
        const Icon = config.icon;

        return (
          <div
            key={`${entry.type}-${entry.id}`}
            className="flex gap-3 p-3 bg-white rounded-xl border border-stone-100 hover:border-stone-200 transition-colors"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${config.bg}`}>
              <Icon size={14} className={config.text} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${config.badge}`}>
                  {entry.type}
                </span>
                {entry.type === 'task' && entry.status && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    entry.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-stone-100 text-stone-500'
                  }`}>
                    {entry.status}
                  </span>
                )}
                <span className="text-xs text-stone-400 ml-auto shrink-0">
                  {relativeTime(entry.timestamp)}
                </span>
              </div>
              <p className="text-sm text-stone-700 line-clamp-2">{entry.content}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
