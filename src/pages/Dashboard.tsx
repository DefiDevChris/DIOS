import { ArrowRight, Calendar, CheckSquare, CloudUpload, Edit3, Check } from 'lucide-react';
import { format } from 'date-fns';
import TasksWidget from '../components/TasksWidget';

export default function Dashboard() {
  const today = new Date();

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Good Morning</h1>
          <p className="mt-2 text-stone-500 text-sm">Here's what's happening with your certification operations today.</p>
        </div>
        <div className="flex items-center gap-2 text-stone-500 text-sm font-medium">
          <Calendar size={16} className="text-[#D49A6A]" />
          {format(today, 'EEEE, MMMM d, yyyy')}
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Upcoming Inspections (Spans 7 cols) */}
        <div className="col-span-12 lg:col-span-7 bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col min-h-[320px]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold text-stone-900">Upcoming Inspections</h2>
            <button className="text-stone-400 hover:text-[#D49A6A] transition-colors">
              <ArrowRight size={18} />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
            <div className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center mb-3 border border-stone-100">
              <Calendar size={24} className="text-stone-300" />
            </div>
            <p className="text-sm font-medium">No upcoming inspections</p>
          </div>
        </div>

        {/* Quick Note (Spans 5 cols) */}
        <div className="col-span-12 lg:col-span-5 bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <Edit3 size={18} className="text-[#D49A6A]" />
            <h2 className="text-base font-bold text-stone-900">Quick Note</h2>
          </div>
          <div className="flex-1 relative">
            <textarea 
              className="w-full h-full resize-none bg-[#FDFCFB] border border-stone-200 border-dashed rounded-2xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
              placeholder="Type your notes here"
            ></textarea>
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <button className="p-1.5 text-stone-400 hover:text-stone-600 transition-colors">
                <Edit3 size={16} />
              </button>
              <button className="p-1.5 text-[#D49A6A] bg-[#D49A6A]/10 rounded-md hover:bg-[#D49A6A]/20 transition-colors">
                <Check size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Tasks & Follow-ups (Spans 6 cols) */}
        <div className="col-span-12 lg:col-span-6 min-h-[280px]">
          <TasksWidget />
        </div>

        {/* Uploads (Spans 6 cols) */}
        <div className="col-span-12 lg:col-span-6 bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col min-h-[280px]">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <CloudUpload size={18} className="text-[#D49A6A]" />
              <h2 className="text-base font-bold text-stone-900">Uploads</h2>
            </div>
            <div className="flex items-center gap-3">
              <button className="text-stone-400 hover:text-[#D49A6A] transition-colors">
                <CloudUpload size={16} />
              </button>
              <button className="text-[#D49A6A] hover:text-[#c28a5c] transition-colors">
                <Edit3 size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
            <div className="mb-3">
              <CloudUpload size={36} className="text-stone-300" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-stone-500">No unassigned uploads</p>
            <p className="text-xs mt-1">Use Upload or Camera to add photos</p>
          </div>
        </div>

      </div>
    </div>
  );
}
