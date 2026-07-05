import { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { GlassPanel, GlassInput } from './Glass.jsx';
import ProfileChip from '../ProfileChip.jsx';

// Shared top-bar chrome for CmsLayout and CommerceLayout: logo, a hamburger
// that opens a slide-over drawer with the full nav list (replacing a
// permanent sidebar rail), a search box, and a caller-supplied right-side
// slot (role switcher, etc).
export default function TopBar({ logoTo, logoLabel, navItems, extraNavItem, searchItems = [], searchPlaceholder = 'Search…', rightSlot }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();

  // Sections with children (Ops, Settings) start collapsed unless the
  // current page is inside them, so opening the drawer never hides where
  // you already are. Toggling is a separate control from the label itself,
  // which still navigates to the section's own landing page.
  const [openSections, setOpenSections] = useState(() =>
    new Set(navItems.filter((i) => i.children?.some((c) => c.to === pathname)).map((i) => i.label))
  );
  const toggleSection = (label) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  const matches = query.trim()
    ? searchItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <>
      <GlassPanel className="mx-4 mt-4 px-4 py-3 flex items-center gap-4">
        <button onClick={() => setDrawerOpen(true)} className="text-zinc-300 hover:text-white">
          <Menu className="w-5 h-5" />
        </button>
        <Link to={logoTo} className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-glass-indigo via-glass-fuchsia to-glass-sky shrink-0">
          {logoLabel}
        </Link>

        <div className="relative flex-1 max-w-md">
          <GlassInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full text-sm"
          />
          {matches.length > 0 && (
            <GlassPanel className="absolute top-full left-0 right-0 mt-1 p-1 z-20">
              {matches.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setQuery('')}
                  className="block px-3 py-1.5 rounded-lg text-sm text-zinc-200 hover:bg-white/10"
                >
                  {item.label}
                </Link>
              ))}
            </GlassPanel>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {rightSlot}
          <ProfileChip variant="compact" />
        </div>
      </GlassPanel>

      {drawerOpen && (
        <div className="fixed inset-0 z-30 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <GlassPanel className="relative w-72 h-full rounded-none p-4 flex flex-col gap-1 animate-panel-in">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <span className="font-semibold text-zinc-100">Menu</span>
              <button onClick={() => setDrawerOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto">
            {navItems.map((item) =>
              item.children ? (
                <div key={item.label}>
                  <div className="flex items-center gap-1">
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setDrawerOpen(false)}
                      className={({ isActive }) =>
                        `flex-1 px-3 py-2 rounded-xl text-sm transition block ${
                          isActive
                            ? 'bg-gradient-to-tr from-glass-indigo to-glass-fuchsia text-white shadow-lg shadow-glass-fuchsia/20'
                            : 'text-zinc-300 hover:text-white hover:bg-white/10'
                        }`
                      }
                    >
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
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.end}
                          onClick={() => setDrawerOpen(false)}
                          className={({ isActive }) =>
                            `px-3 py-1.5 rounded-lg text-sm transition ${
                              isActive
                                ? 'bg-gradient-to-tr from-glass-indigo to-glass-fuchsia text-white shadow-lg shadow-glass-fuchsia/20'
                                : 'text-zinc-400 hover:text-white hover:bg-white/10'
                            }`
                          }
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-xl text-sm transition ${
                      isActive
                        ? 'bg-gradient-to-tr from-glass-indigo to-glass-fuchsia text-white shadow-lg shadow-glass-fuchsia/20'
                        : 'text-zinc-300 hover:text-white hover:bg-white/10'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              )
            )}
            {extraNavItem && (
              <Link
                to={extraNavItem.to}
                onClick={() => setDrawerOpen(false)}
                className="px-3 py-2 rounded-xl text-sm text-zinc-300 hover:text-white hover:bg-white/10 mt-4 border-t border-white/10 pt-4"
              >
                {extraNavItem.label}
              </Link>
            )}
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 shrink-0">
              <ProfileChip variant="wide" onClick={() => setDrawerOpen(false)} />
            </div>
          </GlassPanel>
        </div>
      )}
    </>
  );
}
