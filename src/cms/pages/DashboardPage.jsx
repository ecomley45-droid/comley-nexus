import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FileText, LayoutTemplate, Upload, Link2, Tag, UserPlus } from 'lucide-react';
import { usePagesStore } from '../lib/usePagesStore.js';
import { createPage } from '../lib/pageActions.js';
import { getAudit } from '../lib/api.js';
import { getFullPath } from '../../shared/compilePage.js';
import { GlassPanel, GlassSelect, Badge } from '../lib/ui/Glass.jsx';

const SHOW_OPTIONS = [25, 50, 100];

const QUICK_START = [
  { icon: FileText, label: 'New page', action: 'createPage' },
  { icon: LayoutTemplate, label: 'Library template', to: '/admin/library' },
  { icon: Upload, label: 'Upload media', to: '/admin/media' },
  { icon: Link2, label: 'New redirect', to: '/admin/redirects' },
  { icon: Tag, label: 'Discount code', to: '/admin/commerce/discounts' },
  { icon: UserPlus, label: 'Team member', to: '/admin/team' },
];

function QuickStartTile({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="text-left">
      <GlassPanel className="p-4 hover:bg-white/10 transition flex flex-col items-start gap-3 h-full">
        <Icon className="w-5 h-5 text-glass-sky" />
        <span className="text-sm text-zinc-200">{label}</span>
      </GlassPanel>
    </button>
  );
}

function ScheduledStrip({ pages }) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const countFor = (day) =>
    pages.filter((p) => {
      if (!p.scheduledPublishAt) return false;
      const d = new Date(p.scheduledPublishAt);
      return d.toDateString() === day.toDateString();
    }).length;

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const count = countFor(d);
        return (
          <div key={d.toISOString()} className={`rounded-lg p-2 text-center ${count > 0 ? 'bg-glass-indigo/20 border border-glass-indigo/30' : 'bg-white/5'}`}>
            <div className="text-[10px] text-zinc-500">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
            <div className="text-sm text-zinc-200">{d.getDate()}</div>
            {count > 0 && <div className="text-[10px] text-glass-sky mt-1">{count}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { pages, setPages, save, loading, error } = usePagesStore();
  const [audit, setAudit] = useState([]);
  const [activityCount, setActivityCount] = useState(25);
  const [draftsCount, setDraftsCount] = useState(25);
  const [draftsParentFilter, setDraftsParentFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => { getAudit().then(setAudit); }, []);

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const handleQuickStart = (item) => {
    if (item.action === 'createPage') return createPage(pages, setPages, save, navigate);
    navigate(item.to);
  };

  const scheduled = pages
    .filter((p) => p.scheduledPublishAt && p.scheduledPublishAt > Date.now())
    .sort((a, b) => a.scheduledPublishAt - b.scheduledPublishAt);

  const drafts = pages
    .filter((p) => p.status === 'draft')
    .filter((p) => !draftsParentFilter || p.parentId === draftsParentFilter);
  const parentOptions = pages.filter((p) => pages.some((child) => child.parentId === p.id));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>

      <h2 className="font-medium mb-2 text-zinc-300">Quick Start</h2>
      <div className="grid grid-cols-6 gap-3 mb-6">
        {QUICK_START.map((item) => (
          <QuickStartTile key={item.label} {...item} onClick={() => handleQuickStart(item)} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <GlassPanel className="p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-medium text-zinc-300">Recent activity</h2>
            <GlassSelect value={activityCount} onChange={(e) => setActivityCount(Number(e.target.value))} className="text-xs py-1">
              {SHOW_OPTIONS.map((n) => <option key={n} value={n}>Show {n}</option>)}
            </GlassSelect>
          </div>
          {audit.length === 0 && <p className="text-zinc-500 text-sm">No activity yet.</p>}
          <div className="max-h-80 overflow-auto space-y-2">
            {audit.slice(0, activityCount).map((entry) => (
              <div key={entry.id} className="text-sm border-b border-white/5 pb-2 last:border-0">
                <div className="flex justify-between">
                  <span className="text-zinc-200">{entry.action}</span>
                  <span className="text-zinc-500 text-xs">{new Date(entry.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-zinc-500 text-xs">{entry.details}</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-4">
          <h2 className="font-medium mb-3 text-zinc-300">Scheduled</h2>
          <ScheduledStrip pages={pages} />
          <div className="mt-3 space-y-1.5">
            {scheduled.length === 0 && <p className="text-zinc-500 text-sm">Nothing scheduled.</p>}
            {scheduled.map((p) => (
              <div key={p.id} className="flex justify-between text-sm">
                <Link to={`/admin/pages/${p.id}`} className="text-zinc-200 hover:text-glass-sky">{p.name}</Link>
                <span className="text-zinc-500">{new Date(p.scheduledPublishAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-medium text-zinc-300">Unpublished drafts</h2>
          <div className="flex gap-2">
            <GlassSelect value={draftsParentFilter} onChange={(e) => setDraftsParentFilter(e.target.value)} className="text-xs py-1">
              <option value="">All parents</option>
              {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </GlassSelect>
            <GlassSelect value={draftsCount} onChange={(e) => setDraftsCount(Number(e.target.value))} className="text-xs py-1">
              {SHOW_OPTIONS.map((n) => <option key={n} value={n}>Show {n}</option>)}
            </GlassSelect>
          </div>
        </div>
        {drafts.length === 0 && <p className="text-zinc-500 text-sm">No unpublished drafts.</p>}
        <table className="w-full text-sm">
          <tbody>
            {drafts.slice(0, draftsCount).map((p) => (
              <tr key={p.id} className="border-b border-white/5 last:border-0">
                <td className="py-2">
                  <Link to={`/admin/pages/${p.id}`} className="text-zinc-100 hover:text-glass-sky">{p.name}</Link>
                </td>
                <td className="text-zinc-500">/{getFullPath(p, pages)}</td>
                <td className="text-right"><Badge tone="draft">draft</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
