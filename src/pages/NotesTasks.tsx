import React from 'react';
import TasksWidget from '../components/TasksWidget';
import { StickyNote } from 'lucide-react';

export default function NotesTasks() {
  return (
    <div className="animate-in fade-in duration-500 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-stone-100">
          <StickyNote size={24} className="text-[#D49A6A]" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Notes & Tasks</h1>
          <p className="text-stone-500 text-sm mt-1">Manage all your tasks and follow-ups across operations.</p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <TasksWidget title="All Tasks" />
      </div>
    </div>
  );
}
