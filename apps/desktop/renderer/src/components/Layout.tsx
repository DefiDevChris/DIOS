import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@dios/shared/firebase';
import {
  Search, CheckSquare, Settings, ChevronDown, Plus,
  LayoutDashboard, Building2, ClipboardCheck, FileText, Calendar,
  StickyNote, Mail, Map as MapIcon, BarChart2, LineChart,
  HardDrive, ExternalLink, Wallet, X
} from 'lucide-react';
import Swal from 'sweetalert2';
import LeafLogo from './LeafLogo'
import SyncIndicator from './SyncIndicator';

// All navigable items available in the command palette
const SEARCH_ITEMS = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, category: 'Navigation' },
  { label: 'Operations', to: '/operations', icon: Building2, category: 'Navigation' },
  { label: 'Inspections', to: '/inspections', icon: ClipboardCheck, category: 'Navigation' },
  { label: 'Invoices', to: '/invoices', icon: FileText, category: 'Navigation' },
  { label: 'Expenses', to: '/expenses', icon: Wallet, category: 'Navigation' },
  { label: 'Schedule', to: '/schedule', icon: Calendar, category: 'Navigation' },
  { label: 'Notes & Tasks', to: '/notes', icon: StickyNote, category: 'Tools' },
  { label: 'Email', to: '/email', icon: Mail, category: 'Tools' },
  { label: 'Map', to: '/routing', icon: MapIcon, category: 'Tools' },
  { label: 'Reports', to: '/reports', icon: BarChart2, category: 'Tools' },
  { label: 'Insights', to: '/insights', icon: LineChart, category: 'Analytics' },
  { label: 'Settings', to: '/settings', icon: Settings, category: 'System' },
];

/**
 * Layout component that wraps all authenticated pages in the application.
 * It provides the main navigation sidebar, the top header with a global
 * search command palette, and an active route content area.
 *
 * Includes global keyboard shortcut (⌘K / Ctrl+K) to open the command palette.
 */
export default function Layout() {
  const { user, googleAccessToken, signInWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [driveMasterId, setDriveMasterId] = useState<string | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Global search / command palette state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Year filter — persisted in the URL search param ?year=
  const selectedYear = searchParams.get('year') ?? '2026';

  // Detect local demo mode
  const isLocalDemo = (() => {
    try {
      const cfg = localStorage.getItem('dois_studio_config');
      if (!cfg) return false;
      return JSON.parse(cfg)?.firebaseConfig?.apiKey === 'dummy';
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (!user || isLocalDemo) return;
    const fetchDriveFolders = async () => {
      try {
        const snap = await getDoc(doc(db, `users/${user.uid}/system_settings/config`));
        const masterId = snap.data()?.driveFolders?.masterId;
        if (masterId) setDriveMasterId(masterId);
      } catch {
        // ignore
      }
    };
    fetchDriveFolders();
  }, [user, isLocalDemo]);

  // ⌘K / Ctrl+K listener to open the command palette
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setIsSearchOpen(prev => !prev);
    }
    if (e.key === 'Escape') {
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-focus the search input when the palette opens
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isSearchOpen]);

  const filteredSearchItems = searchQuery.trim()
    ? SEARCH_ITEMS.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SEARCH_ITEMS;

  const handleSearchSelect = (to: string) => {
    navigate(to);
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  const handleDriveClick = async () => {
    if (isLocalDemo) {
      Swal.fire({
        title: 'Google Drive Not Connected',
        text: 'Connect Google Drive by signing in with your Google account in Settings.',
        icon: 'info'
      });
      return;
    }
    if (driveMasterId && googleAccessToken) {
      window.open(`https://drive.google.com/drive/folders/${driveMasterId}`, '_blank', 'noopener,noreferrer');
      return;
    }
    setDriveLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      // ignore
    } finally {
      setDriveLoading(false);
    }
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('year', e.target.value);
      return next;
    });
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
          <LeafLogo size={28} />
          <span className="text-xl font-bold text-stone-900 tracking-tight">DOIS</span>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input
              type="text"
              readOnly
              onClick={() => setIsSearchOpen(true)}
              placeholder="Search..."
              className="w-full bg-stone-100 border-transparent focus:bg-white focus:border-stone-300 focus:ring-2 focus:ring-[#D49A6A]/20 rounded-full py-2 pl-10 pr-12 text-sm transition-all cursor-pointer"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="hidden sm:inline-block border border-stone-200 rounded px-1.5 text-[10px] font-medium text-stone-400 bg-white">
                ⌘K
              </kbd>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 w-64 justify-end">
          <button
            onClick={() => navigate('/notes')}
            className="text-stone-400 hover:text-stone-600 transition-colors"
            title="Notes & Tasks"
          >
            <CheckSquare size={20} />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="text-stone-400 hover:text-stone-600 transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>
          <SyncIndicator />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-[#F9F8F6] flex flex-col border-r border-stone-200 overflow-y-auto">
          <div className="p-4 relative" ref={newMenuRef}>
            <button
              onClick={() => setShowNewMenu(prev => !prev)}
              className="w-full bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl py-2.5 px-4 flex items-center justify-between transition-colors shadow-sm"
            >
              <div className="flex items-center gap-2 font-medium text-sm">
                <Plus size={18} />
                New
              </div>
              <ChevronDown
                size={16}
                className={`opacity-70 transition-transform duration-200 ${showNewMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {showNewMenu && (
              <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-stone-200 rounded-2xl shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                {[
                  { label: 'New Operation', icon: Building2, path: '/operations?new=1' },
                  { label: 'New Expense', icon: Wallet, path: '/expenses?new=1' }
                ].map(({ label, icon: Icon, path }) => (
                  <button
                    key={path}
                    onClick={() => {
                      setShowNewMenu(false);
                      navigate(path);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 hover:text-stone-900 transition-colors first:pt-3.5 last:pb-3.5"
                  >
                    <Icon size={16} className="text-[#D49A6A] shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <nav className="flex-1 px-3 pb-4 space-y-0.5">
            <SectionHeading>Main</SectionHeading>
            <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
            <NavItem to="/operations" icon={Building2} label="Operations" />
            <NavItem to="/inspections" icon={ClipboardCheck} label="Inspections" />
            <NavItem to="/invoices" icon={FileText} label="Invoices" />
            <NavItem to="/expenses" icon={Wallet} label="Expenses" />
            <NavItem to="/schedule" icon={Calendar} label="Schedule" />

            <SectionHeading>Tools</SectionHeading>
            <NavItem to="/notes" icon={StickyNote} label="Notes & Tasks" />
            <NavItem to="/email" icon={Mail} label="Email" />
            <NavItem to="/routing" icon={MapIcon} label="Map" />
            <NavItem to="/reports" icon={BarChart2} label="Reports" />

            <SectionHeading>Analytics</SectionHeading>
            <NavItem to="/insights" icon={LineChart} label="Insights" />

            <SectionHeading>Google Apps</SectionHeading>
            <button
              onClick={handleDriveClick}
              disabled={driveLoading}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-60"
            >
              <HardDrive size={18} className="text-stone-400 shrink-0" />
              <span className="flex-1 text-left">Google Drive</span>
              {driveMasterId && googleAccessToken && <ExternalLink size={13} className="text-stone-300" />}
              {driveLoading && <div className="w-3.5 h-3.5 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />}
            </button>

            <div className="pt-6">
              <NavItem to="/settings" icon={Settings} label="Settings" />
            </div>
          </nav>

          <div className="p-4 border-t border-stone-200">
            <select
              value={selectedYear}
              onChange={handleYearChange}
              className="w-full bg-white border border-stone-200 text-stone-700 text-sm rounded-lg focus:ring-[#D49A6A] focus:border-[#D49A6A] block p-2"
            >
              <option value="2026">2026 (current)</option>
              <option value="2025">2025</option>
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

      {/* Global Search / Command Palette Modal */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh] p-4"
          onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
              <Search size={18} className="text-stone-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search operations, inspections, clients..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-stone-900 text-sm placeholder:text-stone-400 outline-none"
              />
              <button
                onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                className="text-stone-400 hover:text-stone-600 transition-colors p-1 rounded-lg hover:bg-stone-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto py-2">
              {filteredSearchItems.length === 0 ? (
                <p className="text-center text-stone-400 text-sm py-8">No results found</p>
              ) : (
                (() => {
                  const categories = [...new Set(filteredSearchItems.map(i => i.category))];
                  return categories.map(category => (
                    <div key={category}>
                      <p className="px-4 py-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                        {category}
                      </p>
                      {filteredSearchItems
                        .filter(item => item.category === category)
                        .map(item => (
                          <button
                            key={item.to}
                            onClick={() => handleSearchSelect(item.to)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 hover:text-stone-900 transition-colors text-left"
                          >
                            <item.icon size={16} className="text-stone-400 shrink-0" />
                            {item.label}
                          </button>
                        ))}
                    </div>
                  ));
                })()
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2.5 border-t border-stone-100 flex items-center gap-4 text-[11px] text-stone-400">
              <span><kbd className="border border-stone-200 rounded px-1 py-0.5 text-[10px] bg-stone-50">↵</kbd> to select</span>
              <span><kbd className="border border-stone-200 rounded px-1 py-0.5 text-[10px] bg-stone-50">Esc</kbd> to close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Extracted to avoid calling useAuth hook conditionally inside handleSignOut
function SignOutButton() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex items-center gap-3 pl-4 border-l border-stone-200 cursor-pointer" onClick={handleSignOut}>
      <div className="w-8 h-8 rounded-full bg-[#D49A6A] flex items-center justify-center text-white font-bold text-sm shrink-0">
        {user?.displayName?.charAt(0) || 'U'}
      </div>
      <div className="hidden sm:block text-left">
        <div className="text-sm font-bold text-stone-900 leading-tight">{user?.displayName || 'User'}</div>
        <div className="text-[10px] text-stone-500 leading-tight">Administrator</div>
      </div>
    </div>
  );
}
