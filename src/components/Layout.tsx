import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { 
  Search, CheckSquare, Settings, ChevronDown, Plus,
  LayoutDashboard, Building2, ClipboardCheck, FileText, Calendar,
  StickyNote, Mail, Map as MapIcon, BarChart2, LineChart,
  HardDrive, Table, Leaf
} from 'lucide-react';

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const NavItem = ({ to, icon: Icon, label, active }: { to: string, icon: any, label: string, active?: boolean }) => {
    const isActive = active !== undefined ? active : location.pathname === to;
    return (
      <Link 
        to={to} 
        className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-sm font-medium ${
          isActive 
            ? 'bg-[#D49A6A] text-white shadow-sm' 
            : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
        }`}
      >
        <Icon size={18} className={isActive ? 'text-white' : 'text-stone-400'} />
        {label}
      </Link>
    );
  };

  const SectionHeading = ({ children }: { children: React.ReactNode }) => (
    <h3 className="px-3 text-[10px] font-bold text-stone-400 uppercase tracking-wider mt-6 mb-2">
      {children}
    </h3>
  );

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-2 w-64">
          <Leaf className="text-emerald-600" size={24} fill="currentColor" />
          <span className="text-xl font-bold text-stone-900 tracking-tight">DOIS</span>
        </div>
        
        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input 
              type="text" 
              placeholder="Search..." 
              className="w-full bg-stone-100 border-transparent focus:bg-white focus:border-stone-300 focus:ring-2 focus:ring-[#D49A6A]/20 rounded-full py-2 pl-10 pr-12 text-sm transition-all"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="hidden sm:inline-block border border-stone-200 rounded px-1.5 text-[10px] font-medium text-stone-400 bg-white">
                ⌘K
              </kbd>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 w-64 justify-end">
          <button className="text-stone-400 hover:text-stone-600 transition-colors">
            <CheckSquare size={20} />
          </button>
          <button className="text-stone-400 hover:text-stone-600 transition-colors">
            <Settings size={20} />
          </button>
          <div className="flex items-center gap-3 pl-4 border-l border-stone-200 cursor-pointer" onClick={handleSignOut}>
            <div className="w-8 h-8 rounded-full bg-[#D49A6A] flex items-center justify-center text-white font-bold text-sm shrink-0">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-bold text-stone-900 leading-tight">{user?.displayName || 'User'}</div>
              <div className="text-[10px] text-stone-500 leading-tight">Administrator</div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-[#F9F8F6] flex flex-col border-r border-stone-200 overflow-y-auto">
          <div className="p-4">
            <button className="w-full bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl py-2.5 px-4 flex items-center justify-between transition-colors shadow-sm">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Plus size={18} />
                New
              </div>
              <ChevronDown size={16} className="opacity-70" />
            </button>
          </div>
          
          <nav className="flex-1 px-3 pb-4 space-y-0.5">
            <SectionHeading>Main</SectionHeading>
            <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
            <NavItem to="/operations" icon={Building2} label="Operations" />
            <NavItem to="/inspections" icon={ClipboardCheck} label="Inspections" />
            <NavItem to="/invoices" icon={FileText} label="Invoices" />
            <NavItem to="/schedule" icon={Calendar} label="Schedule" />

            <SectionHeading>Tools</SectionHeading>
            <NavItem to="/notes" icon={StickyNote} label="Notes & Tasks" />
            <NavItem to="/email" icon={Mail} label="Email" />
            <NavItem to="/routing" icon={MapIcon} label="Map" />
            <NavItem to="/reports" icon={BarChart2} label="Reports" />

            <SectionHeading>Analytics</SectionHeading>
            <NavItem to="/insights" icon={LineChart} label="Insights" />

            <SectionHeading>Google Apps</SectionHeading>
            <NavItem to="/drive" icon={HardDrive} label="Google Drive" />
            <NavItem to="/sheets" icon={Table} label="Google Sheets" />

            <div className="pt-6">
              <NavItem to="/settings" icon={Settings} label="Settings" />
            </div>
          </nav>

          <div className="p-4 border-t border-stone-200">
            <select className="w-full bg-white border border-stone-200 text-stone-700 text-sm rounded-lg focus:ring-[#D49A6A] focus:border-[#D49A6A] block p-2">
              <option>2026 (current)</option>
              <option>2025</option>
            </select>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
