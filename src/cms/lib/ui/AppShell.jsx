import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { PanelLeft, PanelLeftClose, X, ChevronDown } from 'lucide-react';
import { GlassPanel, GlassInput } from './Glass.jsx';
import ProfileChip from '../ProfileChip.jsx';
import ThemeToggle from './ThemeToggle.jsx';

// App chrome for CmsLayout / CommerceLayout / SuperAdminLayout: a PERSISTENT
// left sidebar with the full nav, plus a slim top bar whose toggle hides it.
//
// Two hide behaviours by breakpoint:
//   • desktop (lg+): the toggle collapses the rail and the content reclaims
//     the space; the choice is remembered (localStorage).
//   • mobile: the rail is off-canvas by default and the toggle slides it in
//     over the content as a drawer with a backdrop.
//
// Wraps the page content (children) so the content column can offset itself
// by the rail width when it's shown.
const COLLAPSE_KEY = 'nx_nav_collapsed';

export default function AppShell({ logoTo, logoLabel, navItems, extraNavItem, searchItems = [], searchPlaceholder = 'Search…', rightSlot, banner, children }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);
  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Collapsible groups (Ops, Settings) start open only if the current page is
  // inside them, so the rail never hides where you already are.
  const [openSections, setOpenSections] = useState(() =>
    new Set(navItems.filter((i) => i.children?.some((c) => c.to === pathname)).map((i) => i.label))
  );
  const toggleSection = (label) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });

  // One toggle, breakpoint-aware: drawer on mobile, collapse on desktop.
  const toggleNav = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setMobileOpen((o) => !o);
    else setCollapsed((c) => !c);
  };

  const matches = query.trim()
    ? searchItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-xl text-sm transition block ${
      isActive
        ? 'bg-gradient-to-tr from-glass-indigo to-glass-fuchsia text-white shadow-lg shadow-glass-fuchsia/20'
        : 'text-zinc-300 hover:text-white hover:bg-white/10'
    }`;
  const childClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-lg text-sm transition block ${
      isActive
        ? 'bg-gradient-to-tr from-glass-indigo to-glass-fuchsia text-white shadow-lg shadow-glass-fuchsia/20'
        : 'text-zinc-400 hover:text-white hover:bg-white/10'
    }`;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Persistent sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-64 flex flex-col backdrop-blur-xl bg-white/[0.06] border-r border-white/10 transition-transform duration-200 ease-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0'}`}
      >
        <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/10">
          <Link to={logoTo} className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-glass-indigo via-glass-fuchsia to-glass-sky truncate">
            {logoLabel}
          </Link>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-zinc-400 hover:text-white" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1">
          {navItems.map((item) =>
            item.children ? (
              <div key={item.label}>
                <div className="flex items-center gap-1">
                  <NavLink to={item.to} end={item.end} className={linkClass} style={{ flex: 1 }}>
                    {item.label}
                  </NavLink>
                  <button
                    type="button"
                    onClick={() => toggleSection(item.label)}
                    aria-label={openSections.has(item.label) ? `Collapse ${item.label}` : `Expand ${item.label}`}
                    className="w-8 h-8 shrink-0 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 grid place-items-center"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${openSections.has(item.label) ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {openSections.has(item.label) && (
                  <div className="ml-3 pl-3 border-l border-white/10 flex flex-col gap-1 mt-1">
                    {item.children.map((child) => (
                      <NavLink key={child.to} to={child.to} end={child.end} className={childClass}>
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            )
          )}
          {extraNavItem && (
            <Link to={extraNavItem.to} className="px-3 py-2 rounded-xl text-sm text-zinc-300 hover:text-white hover:bg-white/10 mt-4 border-t border-white/10 pt-4">
              {extraNavItem.label}
            </Link>
          )}
        </nav>

        <div className="p-3 border-t border-white/10 shrink-0">
          <ProfileChip variant="wide" />
        </div>
      </aside>

      {/* Content column — offset by the rail on desktop when it's shown */}
      <div className={`transition-[margin] duration-200 ease-out ${collapsed ? '' : 'lg:ml-64'}`}>
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 h-14 backdrop-blur-xl bg-white/[0.04] border-b border-white/10">
          <button onClick={toggleNav} className="text-zinc-300 hover:text-white shrink-0" aria-label={collapsed ? 'Show navigation' : 'Hide navigation'} title={collapsed ? 'Show navigation' : 'Hide navigation'}>
            {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
          {/* Logo shows here when the rail is collapsed (desktop) or on mobile */}
          <Link to={logoTo} className={`font-semibold bg-clip-text text-transparent bg-gradient-to-r from-glass-indigo via-glass-fuchsia to-glass-sky shrink-0 truncate ${collapsed ? '' : 'lg:hidden'}`}>
            {logoLabel}
          </Link>

          <div className="relative flex-1 max-w-md">
            <GlassInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="w-full text-sm" />
            {matches.length > 0 && (
              <GlassPanel className="absolute top-full left-0 right-0 mt-1 p-1 z-20">
                {matches.map((item) => (
                  <Link key={item.to} to={item.to} onClick={() => setQuery('')} className="block px-3 py-1.5 rounded-lg text-sm text-zinc-200 hover:bg-white/10">
                    {item.label}
                  </Link>
                ))}
              </GlassPanel>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2 ml-auto">
            {rightSlot}
            <ThemeToggle />
            <ProfileChip variant="compact" />
          </div>
        </header>

        {banner}
        <main className="p-6">{children}</main>
      </div>
    </>
  );
}
