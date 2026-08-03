import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPages } from './api.js';

// Cmd/Ctrl+K palette: jump to any page by name, or to any CMS surface. Also
// opened by the search field in the top bar, which is now the only other
// search affordance — previously that field matched page names only while
// this matched everything, so the same gesture gave two different answers.
//
// Pages are fetched lazily on first open (not on layout mount) so the
// palette adds zero cost to normal navigation.
//
// This list must cover every nav destination. When it lagged behind, the
// surfaces added since (Collections, Templates, Newsletter…) were reachable
// by clicking but invisible to search, which is the worst of both.
const SURFACES = [
  { label: 'Dashboard', to: '' },
  // Content
  { label: 'Pages', to: '/pages' },
  { label: 'Collections', to: '/collections' },
  { label: 'Events', to: '/events' },
  { label: 'Media', to: '/media' },
  { label: 'Form responses', to: '/forms' },
  { label: 'Comments', to: '/comments' },
  // Design
  { label: 'Site templates', to: '/templates' },
  { label: 'Block catalog', to: '/blocks' },
  { label: 'Saved sections', to: '/library' },
  { label: 'Theme & branding', to: '/settings/design' },
  // Marketing
  { label: 'Newsletter', to: '/email' },
  { label: 'Newsletter campaigns', to: '/email/campaigns' },
  { label: 'Social', to: '/social' },
  // Settings
  { label: 'Settings', to: '/settings' },
  { label: 'Workspace settings', to: '/settings/workspace' },
  { label: 'Team & permissions', to: '/team' },
  { label: 'Integrations', to: '/connections' },
  { label: 'Redirects', to: '/redirects' },
  { label: 'Backups', to: '/settings/backups' },
  { label: 'Billing', to: '/settings/billing' },
  { label: 'Audit log', to: '/audit' },
  // Ops
  { label: 'Ops overview', to: '/ops/dashboard' },
  { label: 'Feedback inbox', to: '/feedback' },
  { label: 'System status', to: '/ops/system-status' },
  { label: 'Profile & preferences', to: '/ops/profile' },
];

export default function CommandPalette({ base, openSignal = 0 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // The top-bar search field bumps `openSignal` to open the palette, so
  // there's one implementation behind both entry points.
  useEffect(() => {
    if (openSignal > 0) { setOpen(true); setQuery(''); }
  }, [openSignal]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) { setQuery(''); setActive(0); return; }
    inputRef.current?.focus();
    if (pages === null) getPages().then((d) => setPages(d.pages || [])).catch(() => setPages([]));
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const surfaceHits = SURFACES
      .filter((s) => !q || s.label.toLowerCase().includes(q))
      .map((s) => ({ key: `s-${s.to}`, label: s.label, hint: 'Go to', to: `${base}${s.to}` }));
    const pageHits = (pages || [])
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.slug || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map((p) => ({ key: `p-${p.id}`, label: p.name, hint: p.status === 'published' ? 'Edit page' : 'Edit draft', to: `${base}/pages/${p.id}` }));
    return q ? [...pageHits, ...surfaceHits].slice(0, 10) : [...surfaceHits.slice(0, 5), ...pageHits.slice(0, 5)];
  }, [query, pages, base]);

  const go = (item) => {
    setOpen(false);
    navigate(item.to);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-start justify-center pt-[18vh] p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-zinc-900/95 backdrop-blur-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && results[active]) go(results[active]);
          }}
          placeholder="Search pages and sections…"
          className="w-full bg-transparent px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none border-b border-white/10"
        />
        <div className="max-h-72 overflow-y-auto py-1.5">
          {results.length === 0 && <p className="text-sm text-zinc-500 px-4 py-3">No matches.</p>}
          {results.map((item, i) => (
            <button
              key={item.key}
              onClick={() => go(item)}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center justify-between px-4 py-2 text-left text-sm ${i === active ? 'bg-white/10 text-zinc-100' : 'text-zinc-300'}`}
            >
              <span className="truncate">{item.label}</span>
              <span className="text-xs text-zinc-500 shrink-0 ml-3">{item.hint}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-white/10 text-[11px] text-zinc-500">
          ↑↓ navigate · Enter open · Esc close
        </div>
      </div>
    </div>
  );
}
