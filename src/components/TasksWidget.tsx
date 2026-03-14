import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { CheckSquare, Square, Trash2, Plus, Calendar, Tag } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'completed';
  createdAt: string;
  dueDate?: string;
  operationId?: string;
  inspectionId?: string;
}

interface Operation {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
}

interface Inspection {
  id: string;
  operationId: string;
  date: string;
}

interface TasksWidgetProps {
  operationId?: string;
  inspectionId?: string;
  title?: string;
}

export default function TasksWidget({ operationId, inspectionId, title = "Tasks & Follow-ups" }: TasksWidgetProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [taggedOperation, setTaggedOperation] = useState<Operation | null>(null);
  const [taggedInspection, setTaggedInspection] = useState<Inspection | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    let q = query(collection(db, `users/${user.uid}/tasks`), orderBy('createdAt', 'desc'));
    
    if (operationId) {
      q = query(collection(db, `users/${user.uid}/tasks`), where('operationId', '==', operationId));
    } else if (inspectionId) {
      q = query(collection(db, `users/${user.uid}/tasks`), where('inspectionId', '==', inspectionId));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData: Task[] = [];
      snapshot.forEach((doc) => {
        tasksData.push(doc.data() as Task);
      });
      // Sort in memory if we used where clause without orderby (due to index requirements)
      if (operationId || inspectionId) {
        tasksData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      setTasks(tasksData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/tasks`);
    });

    return () => unsubscribe();
  }, [user, operationId, inspectionId]);

  useEffect(() => {
    if (!user) return;
    
    // Fetch operations for tagging
    const unsubOps = onSnapshot(collection(db, `users/${user.uid}/operations`), (snapshot) => {
      const opsData: Operation[] = [];
      snapshot.forEach((doc) => {
        opsData.push({ id: doc.id, name: doc.data().name });
      });
      setOperations(opsData);
    });

    // Fetch inspections for tagging
    const unsubInsps = onSnapshot(collection(db, `users/${user.uid}/inspections`), (snapshot) => {
      const inspData: Inspection[] = [];
      snapshot.forEach((doc) => {
        inspData.push({ id: doc.id, operationId: doc.data().operationId, date: doc.data().date });
      });
      setInspections(inspData);
    });

    return () => {
      unsubOps();
      unsubInsps();
    };
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewTaskTitle(value);

    // Check for @ tagging
    const lastWord = value.split(' ').pop();
    if (lastWord && lastWord.startsWith('@')) {
      setShowTagMenu(true);
      setTagSearch(lastWord.substring(1).toLowerCase());
    } else {
      setShowTagMenu(false);
    }
  };

  const handleTagSelect = (type: 'operation' | 'inspection', item: any) => {
    if (type === 'operation') {
      setTaggedOperation(item);
      setTaggedInspection(null);
    } else {
      setTaggedInspection(item);
      setTaggedOperation(null);
    }
    
    // Remove the @search text
    const words = newTaskTitle.split(' ');
    words.pop();
    setNewTaskTitle(words.join(' ') + (words.length > 0 ? ' ' : ''));
    setShowTagMenu(false);
    inputRef.current?.focus();
  };

  const removeTag = () => {
    setTaggedOperation(null);
    setTaggedInspection(null);
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTaskTitle.trim()) return;

    const taskId = crypto.randomUUID();
    const task: Task = {
      id: taskId,
      title: newTaskTitle.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      operationId: operationId || taggedOperation?.id || taggedInspection?.operationId,
      inspectionId: inspectionId || taggedInspection?.id
    };

    try {
      await setDoc(doc(db, `users/${user.uid}/tasks/${taskId}`), task);
      setNewTaskTitle('');
      setTaggedOperation(null);
      setTaggedInspection(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/tasks`);
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/tasks/${task.id}`), {
        status: task.status === 'pending' ? 'completed' : 'pending'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/tasks`);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/tasks/${taskId}`));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/tasks`);
    }
  };

  const filteredOperations = operations.filter(op => op.name.toLowerCase().includes(tagSearch));
  const filteredInspections = inspections.filter(insp => {
    const op = operations.find(o => o.id === insp.operationId);
    const name = op ? `${op.name} - ${new Date(insp.date).toLocaleDateString()}` : insp.date;
    return name.toLowerCase().includes(tagSearch);
  });

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-base font-bold text-stone-900">{title}</h2>
      </div>

      <div className="flex-1 overflow-y-auto mb-4 space-y-2">
        {tasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 py-8">
            <CheckSquare size={32} className="text-stone-300 mb-3" strokeWidth={1.5} />
            <p className="text-sm font-medium">All caught up!</p>
          </div>
        ) : (
          tasks.map(task => (
            <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-stone-50 group transition-colors border border-transparent hover:border-stone-100">
              <button 
                onClick={() => toggleTaskStatus(task)}
                className="mt-0.5 text-stone-400 hover:text-[#D49A6A] transition-colors shrink-0"
              >
                {task.status === 'completed' ? (
                  <CheckSquare size={18} className="text-[#D49A6A]" />
                ) : (
                  <Square size={18} />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${task.status === 'completed' ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                  {task.title}
                </p>
                {(task.operationId || task.inspectionId) && !operationId && !inspectionId && (
                  <div className="flex items-center gap-1 mt-1">
                    <Tag size={10} className="text-stone-400" />
                    <span className="text-[10px] font-medium text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-md">
                      {task.operationId ? operations.find(o => o.id === task.operationId)?.name || 'Unknown Operation' : ''}
                      {task.inspectionId ? ' (Inspection)' : ''}
                    </span>
                  </div>
                )}
              </div>
              <button 
                onClick={() => deleteTask(task.id)}
                className="text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 p-1"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={addTask} className="relative mt-auto">
        {(taggedOperation || taggedInspection) && (
          <div className="flex items-center gap-1 mb-2">
            <span className="text-xs font-medium text-[#D49A6A] bg-[#D49A6A]/10 px-2 py-1 rounded-md flex items-center gap-1">
              <Tag size={10} />
              {taggedOperation ? taggedOperation.name : ''}
              {taggedInspection ? `Inspection on ${new Date(taggedInspection.date).toLocaleDateString()}` : ''}
              <button type="button" onClick={removeTag} className="ml-1 hover:text-red-500">
                &times;
              </button>
            </span>
          </div>
        )}
        
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={newTaskTitle}
            onChange={handleInputChange}
            placeholder={operationId || inspectionId ? "Add a task..." : "Add a task... (type @ to tag)"}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
          />
          <button 
            type="submit"
            disabled={!newTaskTitle.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-stone-400 hover:text-[#D49A6A] disabled:opacity-50 transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Tag Menu */}
        {showTagMenu && (filteredOperations.length > 0 || filteredInspections.length > 0) && (
          <div className="absolute bottom-full left-0 w-full mb-2 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden z-10 max-h-48 overflow-y-auto">
            {filteredOperations.length > 0 && (
              <div className="p-2">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-2 mb-1">Operations</div>
                {filteredOperations.map(op => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => handleTagSelect('operation', op)}
                    className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 rounded-lg transition-colors"
                  >
                    {op.name}
                  </button>
                ))}
              </div>
            )}
            {filteredInspections.length > 0 && (
              <div className="p-2 border-t border-stone-100">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-2 mb-1">Inspections</div>
                {filteredInspections.map(insp => {
                  const op = operations.find(o => o.id === insp.operationId);
                  return (
                    <button
                      key={insp.id}
                      type="button"
                      onClick={() => handleTagSelect('inspection', insp)}
                      className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Calendar size={12} className="text-stone-400" />
                      {op?.name} - {new Date(insp.date).toLocaleDateString()}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
