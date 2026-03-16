import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { configStore } from '@dios/shared';
import {
  Search, CheckSquare, Settings, ChevronDown, Plus,
  LayoutDashboard, Building2, ClipboardCheck, FileText, Calendar,
  StickyNote, Mail, Map as MapIcon, BarChart2, LineChart,
  HardDrive, ExternalLink, Wallet, X
} from 'lucide-react';
import Swal from 'sweetalert2';
import LeafLogo from './LeafLogo'

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
 * Includes global keyboard shortcut (Cmd+K / Ctrl+K) to open the command palette.
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

  // Year filter - persisted in the URL search param ?year=
  const currentYear = new Date().getFullYear();
  const selectedYear = searchParams.get('year') ?? String(currentYear);

  // Show 2026 through next year (grows automatically each January)
  const APP_LAUNCH_YEAR = 2026;
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = APP_LAUNCH_YEAR; y <= currentYear + 1; y++) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  // Detect local demo mode
  const isLocalDemo = (() => {
    try {
      const cfg = configStore.getConfig();
      if (!cfg) return false;
      return cfg.firebaseConfig?.apiKey === 'local';
    } catch {
      return false;
    }
  })();

  // Feature-availability flags based on configStore
  const appCfg = configStore.getConfig();
  const hasGoogleOAuth = !!(appCfg?.googleOAuthClientId || configStore.getOAuthClientId());
  const hasFirebase = !!appCfg?.firebaseConfig?.apiKey && appCfg.firebaseConfig.apiKey !== 'local';

  // Routes that require specific configuration
  const hiddenRoutes = useMemo(() => {
    const routes = new Set<string>();
    if (!hasGoogleOAuth) {
      routes.add('/email');
      routes.add('/drive');
      routes.add('/sheets');
    }
    return routes;
  }, [hasGoogleOAuth]);

  // Filtered search items for command palette (excludes unconfigured features)
  const availableSearchItems = useMemo(
    () => SEARCH_ITEMS.filter(item => !hiddenRoutes.has(item.to)),
    [hiddenRoutes],
  );

  useEffect(() => {
    if (!user || isLocalDemo) return;
    const fetchDriveFolders = async () => {
      try {
        const { getSystemConfig } = await import('../utils/systemConfig');
        const config = await getSystemConfig(user.uid);
        const masterId = (config.driveFolders as any)?.masterId;
        if (masterId) setDriveMasterId(masterId);
      } catch {
        // ignore
      }
    };
    fetchDriveFolders();
  }, [user, isLocalDemo]);

  // Cmd+K / Ctrl+K listener to open the command palette
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
    ? availableSearchItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableSearchItems;

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

  const renderNavItem = useCallback(({ to, icon: Icon, label, active }: { to: string, icon: any, label: string, active?: boolean }) => {
    const isActive = active !== undefined ? active : location.pathname === to;
    return (
      <Link
        key={to}
        to={to}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
          isActive
            ? 'text-white shadow-sm'
            : 'text-[#7a6b5a] hover:text-[#2a2420]'
        }`}
        style={isActive ? {
          background: 'linear-gradient(135deg, #d4a574 0%, #c9956b 100%)',
          boxShadow: '0 4px 12px rgba(212, 165, 116, 0.3), inset 0 1px 1px rgba(255,255,255,0.2)',
        } : {}}
        onMouseEnter={e => {
          if (!isActive) {
            (e.currentTarget as HTMLElement).style.background = 'rgba(212, 165, 116, 0.08)';
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            (e.currentTarget as HTMLElement).style.background = '';
          }
        }}
      >
        <Icon size={18} className={isActive ? 'text-white' : 'text-[#a89b8c]'} />
        {label}
      </Link>
    );
  }, [location.pathname]);

  const NavItem = renderNavItem;

  const SectionHeading = ({ children }: { children: React.ReactNode }) => (
    <h3 className="px-3 text-[10px] font-bold text-[#a89b8c] uppercase tracking-[0.15em] mt-6 mb-2">
      {children}
    </h3>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #ebe5df 100%)' }}>
      {/* Top Navigation Bar */}
      <header className="h-16 flex items-center justify-between px-6 shrink-0 z-10 border-b" style={{
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderColor: 'rgba(212, 165, 116, 0.12)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.02)',
      }}>
        <div className="flex items-center gap-2.5 w-64">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
            background: 'linear-gradient(135deg, rgba(212,165,116,0.15) 0%, rgba(212,165,116,0.05) 100%)',
            border: '1px solid rgba(212, 165, 116, 0.2)',
          }}>
            <LeafLogo size={20} fill="#d4a574" />
          </div>
          <span className="font-serif-display text-xl font-semibold text-[#2a2420] tracking-wide">DIOS</span>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-2xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a89b8c]" size={18} />
            <input
              type="text"
              readOnly
              onClick={() => setIsSearchOpen(true)}
              placeholder="Search..."
              className="w-full rounded-full py-2 pl-10 pr-12 text-sm transition-all cursor-pointer outline-none"
              style={{
                background: 'rgba(212, 165, 116, 0.06)',
                border: '1px solid rgba(212, 165, 116, 0.12)',
                color: '#2a2420',
              }}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="hidden sm:inline-block rounded px-1.5 text-[10px] font-medium text-[#a89b8c]" style={{
                border: '1px solid rgba(212, 165, 116, 0.2)',
                background: 'rgba(255,255,255,0.6)',
              }}>
                {'\u2318'}K
              </kbd>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 w-64 justify-end">
          <button
            onClick={() => navigate('/notes')}
            className="text-[#a89b8c] hover:text-[#d4a574] transition-colors"
            title="Notes & Tasks"
          >
            <CheckSquare size={20} />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="text-[#a89b8c] hover:text-[#d4a574] transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 flex flex-col overflow-y-auto border-r" style={{
          background: 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(10px)',
          borderColor: 'rgba(212, 165, 116, 0.1)',
        }}>
          <div className="p-4 relative" ref={newMenuRef}>
            <button
              onClick={() => setShowNewMenu(prev => !prev)}
              className="luxury-btn w-full text-white rounded-xl py-2.5 px-4 flex items-center justify-between border-0 cursor-pointer"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Plus size={18} />
                New
              </div>
              <ChevronDown
                size={16}
                className={`opacity-70 transition-transform duration-200 ${showNewMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {showNewMenu && (
              <div className="absolute left-4 right-4 top-full mt-1 rounded-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150" style={{
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(212, 165, 116, 0.15)',
                boxShadow: '0 8px 24px rgba(139, 94, 60, 0.1), 0 2px 8px rgba(0,0,0,0.04)',
              }}>
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
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#4a4038] hover:text-[#2a2420] transition-colors first:pt-3.5 last:pb-3.5"
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(212, 165, 116, 0.06)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                  >
                    <Icon size={16} className="text-[#d4a574] shrink-0" />
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
            {hasGoogleOAuth && <NavItem to="/email" icon={Mail} label="Email" />}
            <NavItem to="/routing" icon={MapIcon} label="Map" />
            <NavItem to="/reports" icon={BarChart2} label="Reports" />

            <SectionHeading>Analytics</SectionHeading>
            <NavItem to="/insights" icon={LineChart} label="Insights" />

            {hasGoogleOAuth && (
              <>
                <SectionHeading>Google Apps</SectionHeading>
                <button
                  onClick={handleDriveClick}
                  disabled={driveLoading}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium text-[#7a6b5a] hover:text-[#2a2420] disabled:opacity-60"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(212, 165, 116, 0.08)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <HardDrive size={18} className="text-[#a89b8c] shrink-0" />
                  <span className="flex-1 text-left">Google Drive</span>
                  {driveMasterId && googleAccessToken && <ExternalLink size={13} className="text-[#a89b8c]" />}
                  {driveLoading && <div className="w-3.5 h-3.5 border-2 border-[#d4a574]/30 border-t-[#d4a574] rounded-full animate-spin" />}
                </button>
              </>
            )}

            <div className="pt-6">
              <NavItem to="/settings" icon={Settings} label="Settings" />
            </div>
          </nav>

          <div className="p-4" style={{ borderTop: '1px solid rgba(212, 165, 116, 0.1)' }}>
            <select
              value={selectedYear}
              onChange={handleYearChange}
              className="w-full luxury-input rounded-xl text-sm p-2 outline-none text-[#4a4038]"
            >
              {yearOptions.map(y => (
                <option key={y} value={String(y)}>{y}{y === currentYear ? ' (current)' : ''}</option>
              ))}
            </select>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            <Outlet context={{ selectedYear: Number(selectedYear) }} />
          </div>
        </main>
      </div>

      {/* Global Search / Command Palette Modal */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 luxury-modal-backdrop z-50 flex items-start justify-center pt-[15vh] p-4"
          onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
        >
          <div
            className="luxury-modal-card rounded-[24px] w-full max-w-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(212, 165, 116, 0.12)' }}>
              <Search size={18} className="text-[#a89b8c] shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search operations, inspections, clients..."
                className="flex-1 bg-transparent border-none text-[#2a2420] text-sm placeholder:text-[#a89b8c] outline-none"
              />
              <button
                onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                className="text-[#a89b8c] hover:text-[#2a2420] transition-colors p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto py-2">
              {filteredSearchItems.length === 0 ? (
                <p className="text-center text-[#a89b8c] text-sm py-8">No results found</p>
              ) : (
                (() => {
                  const categories = [...new Set(filteredSearchItems.map(i => i.category))];
                  return categories.map(category => (
                    <div key={category}>
                      <p className="px-4 py-1.5 text-[10px] font-bold text-[#a89b8c] uppercase tracking-[0.15em]">
                        {category}
                      </p>
                      {filteredSearchItems
                        .filter(item => item.category === category)
                        .map(item => (
                          <button
                            key={item.to}
                            onClick={() => handleSearchSelect(item.to)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#4a4038] hover:text-[#2a2420] transition-colors text-left"
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(212, 165, 116, 0.06)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                          >
                            <item.icon size={16} className="text-[#a89b8c] shrink-0" />
                            {item.label}
                          </button>
                        ))}
                    </div>
                  ));
                })()
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2.5 flex items-center gap-4 text-[11px] text-[#a89b8c]" style={{ borderTop: '1px solid rgba(212, 165, 116, 0.12)' }}>
              <span><kbd className="rounded px-1 py-0.5 text-[10px]" style={{ border: '1px solid rgba(212,165,116,0.2)', background: 'rgba(255,255,255,0.6)' }}>{'\u21B5'}</kbd> to select</span>
              <span><kbd className="rounded px-1 py-0.5 text-[10px]" style={{ border: '1px solid rgba(212,165,116,0.2)', background: 'rgba(255,255,255,0.6)' }}>Esc</kbd> to close</span>
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
    try {
      await signOut();
    } catch (err) {
      // Ensure navigation happens even if signOut fails
    }
    localStorage.removeItem('dios_onboarding_completed');
    navigate('/login');
  };

  return (
    <div className="flex items-center gap-3 pl-4 cursor-pointer" style={{ borderLeft: '1px solid rgba(212, 165, 116, 0.15)' }} onClick={handleSignOut}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{
        background: 'linear-gradient(135deg, #d4a574 0%, #c9956b 100%)',
        boxShadow: '0 2px 8px rgba(212, 165, 116, 0.3)',
      }}>
        {user?.displayName?.charAt(0) || 'U'}
      </div>
      <div className="hidden sm:block text-left">
        <div className="text-sm font-bold text-[#2a2420] leading-tight">{user?.displayName || 'User'}</div>
        <div className="text-[10px] text-[#a89b8c] leading-tight">Administrator</div>
      </div>
    </div>
  );
}
