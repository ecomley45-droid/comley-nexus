import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { PanelLeft, PanelLeftClose, X, ChevronDown, Search } from 'lucide-react';
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

// Search comes in two shapes. The CMS passes `onSearch` and gets a button
// that opens the ⌘K palette — one place to look for anything. The Commerce
// and Super Admin consoles have no palette, so they pass `searchItems` and
// keep the inline filter they always had rather than losing search entirely.
export default function AppShell({ logoTo, logoLabel, navItems, extraNavItem, onSearch, searchItems = [], searchPlaceholder = 'Search…', rightSlot, banner, children }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();

  const matches = !onSearch && query.trim()
    ? searchItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

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

  // One active treatment for the whole rail. The old build painted a full
  // brand gradient on every level, so with twenty items a nested selection
  // read as two competing "you are here" markers; a tinted row with an
  // accent bar is unambiguous and far calmer to sit in front of all day.
  const rowClass = (isActive, nested = false) =>
    `group relative flex items-center gap-2.5 rounded-lg pr-3 text-sm transition ${nested ? 'py-1.5 pl-3' : 'py-2 pl-3'} ${
      isActive
        // text-zinc-100 rather than text-white: the light-mode remap leaves
        // text-white alone (gradient buttons need it), so an active row would
        // be white-on-lavender there.
        ? 'bg-glass-indigo/[0.18] text-zinc-100 font-medium'
        : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
    }`;

  const ActiveBar = ({ show }) => (
    <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-gradient-to-b from-glass-indigo to-glass-fuchsia transition-opacity ${show ? 'opacity-100' : 'opacity-0'}`} />
  );

  const NavRow = ({ item, nested = false }) => (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => rowClass(isActive, nested)}>
      {({ isActive }) => (
        <>
          <ActiveBar show={isActive} />
          {item.icon && <item.icon size={nested ? 15 : 16} className="shrink-0" />}
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );

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

        <nav className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-0.5">
          {navItems.map((item) => {
            // A pure grouping header: a quiet label with its items beneath.
            // Nothing to click, nothing to expand — short groups don't earn
            // the interaction cost of collapsing.
            if (item.section) {
              return (
                <div key={item.label} className="mt-4 first:mt-0">
                  <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                    {item.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {item.children.map((child) => <NavRow key={child.to} item={child} />)}
                  </div>
                </div>
              );
            }

            // A group that is also a destination (Settings, Ops). The row
            // navigates; the chevron expands. Pinned groups sit at the
            // bottom, away from the daily-use items.
            if (item.children) {
              const open = openSections.has(item.label);
              return (
                <div key={item.label} className={item.pinned ? 'mt-4 pt-3 border-t border-white/[0.07]' : 'mt-1'}>
                  <div className="flex items-center gap-1">
                    <div className="flex-1 min-w-0"><NavRow item={item} /></div>
                    <button
                      type="button"
                      onClick={() => toggleSection(item.label)}
                      aria-expanded={open}
                      aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
                      className="w-7 h-7 shrink-0 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] grid place-items-center"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {open && (
                    <div className="ml-4 pl-2 border-l border-white/[0.07] flex flex-col gap-0.5 mt-0.5">
                      {item.children.map((child) => <NavRow key={child.to} item={child} nested />)}
                    </div>
                  )}
                </div>
              );
            }

            return <div key={item.to} className={item.pinned ? 'mt-4 pt-3 border-t border-white/[0.07]' : ''}><NavRow item={item} /></div>;
          })}

          {extraNavItem && (
            <Link to={extraNavItem.to} className="mt-4 pt-3 border-t border-white/[0.07] px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06]">
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

          {/* One search, not two. This used to be a box that matched page
              names only, sitting alongside a ⌘K palette that searched pages
              AND every surface — the same gesture, two answers. It now opens
              that palette, so there is a single place to look for anything. */}
          {!onSearch && (
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
          )}
          {onSearch && (
            <button
              type="button"
              onClick={onSearch}
              className="flex-1 max-w-md flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.07] transition"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="truncate">{searchPlaceholder}</span>
              <kbd className="ml-auto hidden sm:inline text-[10px] text-zinc-600 border border-white/10 rounded px-1.5 py-0.5">⌘K</kbd>
            </button>
          )}

          <div className="shrink-0 flex items-center gap-2 ml-auto">
            {rightSlot}
            <ThemeToggle />
            {/* The rail already carries the identity chip in its footer, so
                showing it here too put the same control on screen twice.
                It appears only when the rail isn't — collapsed on desktop,
                off-canvas on mobile. */}
            <span className={collapsed ? '' : 'lg:hidden'}>
              <ProfileChip variant="compact" />
            </span>
          </div>
        </header>

        {banner}
        <main className="p-6">{children}</main>
      </div>
    </>
  );
}
