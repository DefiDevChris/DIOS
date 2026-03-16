import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Send, StickyNote as StickyNoteIcon, CheckSquare } from 'lucide-react';
import type { Note, Task } from '@dios/shared/types';

interface StickyNoteProps {
  operationId: string;
  onSaved: () => void;
}

export default function StickyNote({ operationId, onSaved }: StickyNoteProps) {
  const { user } = useAuth();
  const { save: saveNote } = useDatabase<Note>({ table: 'notes' });
  const { save: saveTask } = useDatabase<Task>({ table: 'tasks' });
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'note' | 'task'>('note');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!user || !content.trim()) return;
    setSaving(true);

    const now = new Date().toISOString();

    try {
      const newId = crypto.randomUUID();
      if (mode === 'note') {
        await saveNote({
          id: newId,
          content: content.trim(),
          operationId,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        } as Note);
      } else {
        await saveTask({
          id: newId,
          title: content.trim(),
          description: undefined,
          status: 'pending',
          operationId,
          dueDate: dueDate || undefined,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        } as Task);
      }

      setContent('');
      setDueDate('');
      onSaved();
    } catch (error) {
      const path = mode === 'note'
        ? `users/${user.uid}/notes`
        : `users/${user.uid}/tasks`;
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="luxury-card rounded-[20px] p-4">
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setMode('note')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            mode === 'note'
              ? 'bg-[#d4a574] text-white'
              : 'bg-[rgba(212,165,116,0.06)] text-[#7a6b5a] hover:bg-[rgba(212,165,116,0.1)]'
          }`}
        >
          <StickyNoteIcon size={14} />
          Note
        </button>
        <button
          type="button"
          onClick={() => setMode('task')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            mode === 'task'
              ? 'bg-[#d4a574] text-white'
              : 'bg-[rgba(212,165,116,0.06)] text-[#7a6b5a] hover:bg-[rgba(212,165,116,0.1)]'
          }`}
        >
          <CheckSquare size={14} />
          Task
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={mode === 'note' ? 'Add a quick note...' : 'Add a task...'}
            rows={2}
            className="w-full luxury-input rounded-2xl px-3 py-2 text-sm outline-none resize-none"
          />
          {mode === 'task' && (
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="luxury-input rounded-lg px-3 py-1.5 text-xs outline-none"
              placeholder="Due date (optional)"
            />
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!content.trim() || saving}
          className="p-2 h-fit luxury-btn text-white rounded-xl border-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
