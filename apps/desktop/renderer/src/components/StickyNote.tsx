import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Send, StickyNote as StickyNoteIcon, CheckSquare } from 'lucide-react';

interface StickyNoteProps {
  operationId: string;
  onSaved: () => void;
}

export default function StickyNote({ operationId, onSaved }: StickyNoteProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'note' | 'task'>('note');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!user || !content.trim()) return;
    setSaving(true);

    const now = new Date().toISOString();

    try {
      if (mode === 'note') {
        const colRef = collection(db, `users/${user.uid}/notes`);
        const newId = doc(colRef).id;
        await setDoc(doc(db, `users/${user.uid}/notes/${newId}`), {
          id: newId,
          content: content.trim(),
          operationId,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
      } else {
        const colRef = collection(db, `users/${user.uid}/tasks`);
        const newId = doc(colRef).id;
        await setDoc(doc(db, `users/${user.uid}/tasks/${newId}`), {
          id: newId,
          title: content.trim(),
          description: null,
          status: 'pending',
          operationId,
          dueDate: dueDate || null,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
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
    <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setMode('note')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            mode === 'note'
              ? 'bg-[#D49A6A] text-white'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
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
              ? 'bg-[#D49A6A] text-white'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
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
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all resize-none outline-none"
          />
          {mode === 'task' && (
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 text-xs focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
              placeholder="Due date (optional)"
            />
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!content.trim() || saving}
          className="p-2 h-fit bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
