import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import {
  StickyNote,
  CheckSquare,
  Square,
  Trash2,
  Plus,
  Tag,
  ArrowUpDown,
  Loader2,
  Activity,
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import type { Task as SharedTask, OperationActivity } from '@dios/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

// Local Task interface extends shared Task with client-side enrichment
interface Task extends SharedTask {
  operationName?: string;
  _source: 'task';
  priority?: 'low' | 'medium' | 'high';
}

interface ActivityItem extends OperationActivity {
  // enriched client-side
  operationName?: string;
  _source: 'activity';
}

type AggregatedItem = (Task | ActivityItem) & { _sortDate: number };

type SortField = 'date' | 'priority' | 'operation';
type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, undefined: 3 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

const priorityBadge: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-[rgba(212,165,116,0.06)] text-[#7a6b5a]',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotesTasks() {
  const { user } = useAuth();
  const { findAll: findAllTasks, save: saveTask, remove: removeTask } = useDatabase<SharedTask>({ table: 'tasks' });
  const { findAll: findAllOperations } = useDatabase<{ id: string; name: string }>({ table: 'operations' });
  const { findAll: findAllActivities } = useDatabase<OperationActivity>({ table: 'operation_activities' });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [operationMap, setOperationMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // New-task form
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [addingTask, setAddingTask] = useState(false);

  // Sorting & filtering
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'task' | 'activity'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Fetch all data ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadAll = async () => {
      setLoading(true);
      try {
        // 1. Fetch all operations to build a name lookup map
        const opsData = await findAllOperations();
        const opMap: Record<string, string> = {};
        opsData.forEach((op) => {
          opMap[op.id] = op.name ?? op.id;
        });
        setOperationMap(opMap);

        // 2. Fetch global tasks
        const tasksData = await findAllTasks();
        const loadedTasks: Task[] = tasksData.map((t) => ({
          ...t,
          operationName: t.operationId ? opMap[t.operationId] : undefined,
          _source: 'task',
        }));
        setTasks(loadedTasks);

        // 3. Fetch all activities via useDatabase (works in Electron and web)
        const activitiesData = await findAllActivities();
        const loadedActivities: ActivityItem[] = activitiesData.map((a) => ({
          ...a,
          operationName: a.operationId ? opMap[a.operationId] : undefined,
          _source: 'activity' as const,
        }));
        setActivities(loadedActivities);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/tasks`);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [user, findAllTasks, findAllOperations, findAllActivities]);

  // ── Task actions ────────────────────────────────────────────────────────────

  const toggleTask = async (task: Task) => {
    if (!user) return;
    const next = task.status === 'pending' ? 'completed' : 'pending';
    try {
      await saveTask({ ...task, status: next });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: next } : t))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/tasks`);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!user) return;
    try {
      await removeTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/tasks`);
    }
  };

  const addTask = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    setAddingTask(true);
    const id = crypto.randomUUID();
    const task: SharedTask & { priority?: 'low' | 'medium' | 'high' } = {
      id,
      title: newTitle.trim(),
      status: 'pending',
      priority: newPriority,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    try {
      await saveTask(task);
      setTasks((prev) => [{ ...task, _source: 'task' as const }, ...prev]);
      setNewTitle('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/tasks`);
    } finally {
      setAddingTask(false);
    }
  };

  // ── Aggregation & sorting ───────────────────────────────────────────────────

  const allItems = useMemo<AggregatedItem[]>(() => {
    const combined: AggregatedItem[] = [
      ...tasks.map((t) => ({
        ...t,
        _sortDate: new Date(t.createdAt).getTime(),
      })),
      ...activities.map((a) => ({
        ...a,
        _sortDate: new Date(a.timestamp).getTime(),
      })),
    ];
    return combined;
  }, [tasks, activities]);

  const filtered = useMemo(() => {
    let items = allItems;

    // Source filter
    if (filterSource !== 'all') {
      items = items.filter((i) => i._source === filterSource);
    }

    // Status filter (only applies to tasks)
    if (filterStatus !== 'all') {
      items = items.filter((i) => {
        if (i._source === 'task') return (i as Task).status === filterStatus;
        return true; // activities always pass status filter
      });
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => {
        const text =
          i._source === 'task'
            ? `${(i as Task).title} ${(i as Task).description ?? ''}`
            : (i as ActivityItem).description;
        return (
          text.toLowerCase().includes(q) ||
          (i.operationName ?? '').toLowerCase().includes(q)
        );
      });
    }

    // Sort
    items = [...items].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') {
        cmp = a._sortDate - b._sortDate;
      } else if (sortField === 'priority') {
        const pa = PRIORITY_ORDER[(a as Task).priority ?? 'undefined'];
        const pb = PRIORITY_ORDER[(b as Task).priority ?? 'undefined'];
        cmp = pa - pb;
      } else if (sortField === 'operation') {
        cmp = (a.operationName ?? '').localeCompare(b.operationName ?? '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return items;
  }, [allItems, filterSource, filterStatus, searchQuery, sortField, sortDir]);

  // ── Sort toggle helper ──────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortBtn = (field: SortField, label: string) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        sortField === field
          ? 'bg-[#d4a574] text-white'
          : 'bg-[rgba(212,165,116,0.06)] text-[#7a6b5a] hover:bg-[rgba(212,165,116,0.12)]'
      }`}
    >
      {label}
      <ArrowUpDown size={12} className={sortField === field ? 'opacity-100' : 'opacity-40'} />
    </button>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="animate-in fade-in duration-500 flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="w-12 h-12 luxury-card rounded-2xl flex items-center justify-center">
          <StickyNote size={24} className="text-[#d4a574]" />
        </div>
        <div>
          <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420] tracking-tight">Notes & Tasks</h1>
          <p className="text-[#8b7355] text-sm font-medium mt-1">
            All tasks and activity notes across every operation — in one place.
          </p>
        </div>
      </div>

      {/* Quick-add task */}
      <form
        onSubmit={addTask}
        className="luxury-card rounded-[20px] p-4 mb-4 shrink-0 flex flex-col sm:flex-row gap-3"
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as 'low' | 'medium' | 'high')}
          className="luxury-input rounded-2xl px-3 py-3 text-sm outline-none"
        >
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>
        <button
          type="submit"
          disabled={!newTitle.trim() || addingTask}
          className="luxury-btn text-white px-4 py-2 rounded-xl text-sm font-bold border-0 cursor-pointer flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {addingTask ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Add Task
        </button>
      </form>

      {/* Filters + Sort bar */}
      <div className="luxury-card rounded-[20px] px-4 py-3 mb-4 shrink-0 flex flex-wrap gap-3 items-center justify-between">
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tasks and notes..."
          className="luxury-input rounded-2xl px-3 py-1.5 text-sm w-full sm:w-56 outline-none"
        />

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'completed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filterStatus === s
                  ? 'bg-[#2a2420] text-white'
                  : 'bg-[rgba(212,165,116,0.06)] text-[#7a6b5a] hover:bg-[rgba(212,165,116,0.12)]'
              }`}
            >
              {s}
            </button>
          ))}
          <span className="w-px bg-[rgba(212,165,116,0.15)]" />
          {(['all', 'task', 'activity'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterSource(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filterSource === s
                  ? 'bg-[#2a2420] text-white'
                  : 'bg-[rgba(212,165,116,0.06)] text-[#7a6b5a] hover:bg-[rgba(212,165,116,0.12)]'
              }`}
            >
              {s === 'all' ? 'All Types' : s === 'task' ? 'Tasks' : 'Activity Notes'}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex gap-2 items-center">
          <span className="text-xs text-[#a89b8c] font-medium">Sort:</span>
          {sortBtn('date', 'Date')}
          {sortBtn('priority', 'Priority')}
          {sortBtn('operation', 'Operation')}
        </div>
      </div>

      {/* Master list */}
      <div className="flex-1 min-h-0 luxury-card rounded-[24px] overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-[#a89b8c] gap-3">
            <Loader2 size={28} className="animate-spin" />
            <span className="text-sm">Loading all tasks and notes…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#a89b8c] gap-3 p-8">
            <CheckSquare size={40} className="text-[#d4a574]" strokeWidth={1.5} />
            <p className="text-sm font-medium">No items match your filters.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[rgba(212,165,116,0.06)]">
            {filtered.map((item) => {
              if (item._source === 'task') {
                const task = item as Task & { _sortDate: number };
                return (
                  <li
                    key={`task-${task.id}`}
                    className="flex items-start gap-3 px-5 py-4 hover:bg-[rgba(212,165,116,0.04)] group transition-colors"
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleTask(task)}
                      className="mt-0.5 text-[#a89b8c] hover:text-[#d4a574] transition-colors shrink-0"
                    >
                      {task.status === 'completed' ? (
                        <CheckSquare size={18} className="text-[#d4a574]" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-medium ${
                            task.status === 'completed'
                              ? 'text-[#a89b8c] line-through'
                              : 'text-[#2a2420]'
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.priority && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize ${
                              priorityBadge[task.priority]
                            }`}
                          >
                            {task.priority}
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-[#8b7355] mt-0.5">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-[#a89b8c]">
                          {formatRelativeDate(task.createdAt)}
                        </span>
                        {task.operationName && (
                          <span className="flex items-center gap-1 text-[11px] text-[#8b7355] bg-[rgba(212,165,116,0.06)] px-1.5 py-0.5 rounded-md">
                            <Tag size={9} className="text-[#a89b8c]" />
                            {task.operationName}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-[#a89b8c] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 p-1 mt-0.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              }

              // Activity item
              const act = item as ActivityItem & { _sortDate: number };
              return (
                <li
                  key={`activity-${act.id}`}
                  className="flex items-start gap-3 px-5 py-4 hover:bg-[rgba(212,165,116,0.04)] transition-colors"
                >
                  <div className="mt-0.5 shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                    <Activity size={15} className="text-[#d4a574]" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#d4a574] uppercase tracking-wide">
                        {act.type}
                      </span>
                    </div>
                    <p className="text-sm text-[#4a4038] mt-0.5">{act.description}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-[#a89b8c]">
                        {formatRelativeDate(act.timestamp)}
                      </span>
                      {act.operationName && (
                        <span className="flex items-center gap-1 text-[11px] text-[#8b7355] bg-[rgba(212,165,116,0.06)] px-1.5 py-0.5 rounded-md">
                          <Tag size={9} className="text-[#a89b8c]" />
                          {act.operationName}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Summary footer */}
      {!loading && (
        <div className="mt-3 text-xs text-[#a89b8c] text-right shrink-0">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          {' '}
          ({tasks.filter((t) => t.status === 'pending').length} pending task
          {tasks.filter((t) => t.status === 'pending').length !== 1 ? 's' : ''})
        </div>
      )}
    </div>
  );
}
