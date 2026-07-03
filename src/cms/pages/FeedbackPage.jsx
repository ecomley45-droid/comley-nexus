import { useCallback, useEffect, useState } from 'react';
import {
  getFeedback,
  updateFeedbackStatus,
  getAssignees,
  assignFeedback,
  tagFeedbackSystem,
  getSystems,
  getPreferences,
  savePreferences,
} from '../lib/api.js';
import { GlassPanel, GlassButton, GlassSelect, Badge } from '../lib/ui/Glass.jsx';
import AssigneePicker, { Avatar } from '../lib/AssigneePicker.jsx';
import CommentsThread from '../lib/CommentsThread.jsx';

const TYPE_LABEL = {
  bug: 'Bug',
  non_functioning: 'Non-functioning',
  critical: 'Critical error',
  feature_request: 'Feature request',
};
const TYPE_TONE = {
  bug: 'default',
  non_functioning: 'draft',
  critical: 'default',
  feature_request: 'published',
};
const STATUS_OPTIONS = ['open', 'acknowledged', 'in_progress', 'sent_to_agent', 'resolved', 'closed'];
const STATUS_TONE = {
  open: 'default',
  acknowledged: 'default',
  in_progress: 'default',
  sent_to_agent: 'default',
  resolved: 'published',
  closed: 'draft',
};

// Kept identical to the previous implementation: the "Send to Claude" flow
// copies a plain-text task brief into the clipboard so a human can paste it
// into a Claude Code session. There's no autonomous agent trigger here.
function buildTaskPacket(ticket) {
  const lines = [
    `Fix this ${TYPE_LABEL[ticket.type].toLowerCase()} reported from the ${ticket.area} admin at ${ticket.path}.`,
    '',
    `Description: ${ticket.description}`,
  ];
  if (ticket.expectedBehavior) lines.push(`Expected behavior: ${ticket.expectedBehavior}`);
  if (ticket.currentBehavior) lines.push(`Current behavior: ${ticket.currentBehavior}`);
  if (ticket.urgent) lines.push('This was marked urgent.');
  if (ticket.screenshotUrl) lines.push(`Auto-captured screenshot: ${window.location.origin}${ticket.screenshotUrl}`);
  if (ticket.imageUrls?.length) lines.push(`Additional attachments: ${ticket.imageUrls.map((u) => window.location.origin + u).join(', ')}`);
  lines.push('', `Feedback ticket ID: ${ticket.id}`);
  return lines.join('\n');
}

function fmtDate(ms) {
  try { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
}

function TicketList({ tickets, selectedId, onSelect, assignees, systems, onAssign, onSystemChange }) {
  return (
    <div className="flex flex-col gap-2">
      {tickets.map((t) => {
        const selected = t.id === selectedId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`w-full text-left rounded-xl border transition-all ${
              selected
                ? 'border-glass-indigo/60 bg-white/[0.05] shadow-[inset_3px_0_0_theme(colors.glass-indigo)]'
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20'
            } backdrop-blur-xl p-3`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {t.urgent && <span className="text-red-400 text-[10px] font-bold uppercase tracking-wide">Urgent</span>}
              <Badge tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type]}</Badge>
              <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
              <span className="text-xs text-zinc-500 truncate">{t.path}</span>
              <span className="ml-auto text-xs text-zinc-500 shrink-0">{fmtDate(t.createdAt)}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-200 line-clamp-2">{t.description}</p>
            <div className="mt-2 flex items-center gap-3">
              <div onClick={(e) => e.stopPropagation()}>
                <AssigneePicker
                  ticketId={t.id}
                  value={t.assignee_email}
                  valueName={t.assignee_name}
                  valueImage={t.assignee_image}
                  assignees={assignees}
                  onChange={(email) => onAssign(t.id, email)}
                />
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <GlassSelect
                  value={t.system_id || ''}
                  onChange={(e) => onSystemChange(t.id, e.target.value || null)}
                  className="text-xs py-1"
                >
                  <option value="">No system</option>
                  {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </GlassSelect>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TicketGrid({ tickets, selectedId, onSelect, assignees }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {tickets.map((t) => {
        const selected = t.id === selectedId;
        const currentAssignee = assignees.find((a) => a.email === t.assignee_email);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`text-left rounded-xl border p-4 flex flex-col gap-2 min-h-[10rem] transition-all backdrop-blur-xl ${
              selected
                ? 'border-glass-indigo/60 bg-white/[0.06] ring-1 ring-glass-indigo/30'
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type]}</Badge>
              <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
              {t.urgent && <span className="text-red-400 text-[10px] font-bold uppercase">Urgent</span>}
              <span className="ml-auto text-xs text-zinc-500">{fmtDate(t.createdAt)}</span>
            </div>
            <p className="text-sm font-medium text-zinc-100 line-clamp-2">
              {t.description.split(/\r?\n/)[0]}
            </p>
            <div className="mt-auto pt-2 border-t border-white/10 flex items-center gap-2">
              {t.assignee_email ? (
                <>
                  <Avatar name={t.assignee_name || currentAssignee?.name || t.assignee_email} image={t.assignee_image || currentAssignee?.image || null} size={22} />
                  <span className="text-xs text-zinc-300 truncate">{t.assignee_name || currentAssignee?.name || t.assignee_email}</span>
                </>
              ) : (
                <span className="text-xs text-zinc-500 italic">Unassigned</span>
              )}
              <span className="ml-auto text-xs text-zinc-500 truncate max-w-[8rem]">{t.path}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TicketDetail({ ticket, assignees, systems, onClose, onAssign, onSystemChange, onStatusChange, onSendToAgent, layout }) {
  const [copied, setCopied] = useState(false);
  const sendToAgent = async () => {
    await navigator.clipboard.writeText(buildTaskPacket(ticket));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onSendToAgent();
  };

  return (
    <div className={layout === 'panel' ? 'flex flex-col gap-4' : 'flex flex-col gap-4'}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={TYPE_TONE[ticket.type]}>{TYPE_LABEL[ticket.type]}</Badge>
            <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
            {ticket.urgent && <span className="text-red-400 text-xs font-bold uppercase">Urgent</span>}
            <span className="text-xs text-zinc-500 font-mono">#{ticket.id.slice(-8)}</span>
          </div>
          <h2 className="text-lg font-semibold text-zinc-100 mt-1 leading-snug">
            {ticket.description.split(/\r?\n/)[0]}
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Filed by {ticket.reportedRole} from {ticket.area} · {new Date(ticket.createdAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-white/10 text-zinc-400 hover:text-zinc-100 shrink-0"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">Assignee</label>
          <AssigneePicker
            ticketId={ticket.id}
            value={ticket.assignee_email}
            valueName={ticket.assignee_name}
            valueImage={ticket.assignee_image}
            assignees={assignees}
            onChange={(email) => onAssign(ticket.id, email)}
            size="lg"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">System</label>
          <GlassSelect
            value={ticket.system_id || ''}
            onChange={(e) => onSystemChange(ticket.id, e.target.value || null)}
            className="text-sm w-full"
          >
            <option value="">No system</option>
            {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </GlassSelect>
        </div>
      </div>

      <section>
        <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Description</h3>
        <p className="text-sm text-zinc-200 whitespace-pre-wrap">{ticket.description}</p>
      </section>

      {(ticket.expectedBehavior || ticket.currentBehavior) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Expected</h3>
            <p className="text-sm text-zinc-300">{ticket.expectedBehavior || '—'}</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Current</h3>
            <p className="text-sm text-zinc-300">{ticket.currentBehavior || '—'}</p>
          </div>
        </div>
      )}

      {ticket.screenshotUrl && (
        <div>
          <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Auto-captured screenshot</h3>
          <img src={ticket.screenshotUrl} alt="Screenshot" className="w-full rounded-lg border border-white/10" />
        </div>
      )}

      {ticket.imageUrls?.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Attachments</h3>
          <div className="grid grid-cols-3 gap-2">
            {ticket.imageUrls.map((url) => (
              <img key={url} src={url} alt="Attachment" className="w-full h-24 object-cover rounded-lg border border-white/10" />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
        <GlassButton variant="secondary" onClick={sendToAgent} className="text-xs py-1.5">
          {copied ? 'Copied ✓ paste into Claude Code' : 'Send to Claude'}
        </GlassButton>
        <GlassSelect
          value={ticket.status}
          onChange={(e) => onStatusChange(ticket.id, e.target.value)}
          className="text-xs py-1"
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </GlassSelect>
      </div>

      <div className="pt-3 border-t border-white/10">
        <CommentsThread ticketId={ticket.id} />
      </div>
    </div>
  );
}

function SegmentedToggle({ value, options, onChange, size = 'md' }) {
  const btn = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <div className="inline-flex rounded-lg border border-white/10 overflow-hidden divide-x divide-white/10 backdrop-blur-xl bg-white/[0.04]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`${btn} font-semibold transition-colors ${
            value === o.value ? 'bg-glass-indigo/40 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const [tickets, setTickets] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [systems, setSystems] = useState([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [view, setView] = useState('list');
  const [detailMode, setDetailMode] = useState('popup');

  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);

  const loadTickets = useCallback(async () => {
    try { setTickets(await getFeedback()); }
    catch (e) { setError(e.message); }
  }, []);
  const loadAssignees = useCallback(async () => {
    try { setAssignees(await getAssignees()); }
    catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    loadTickets();
    loadAssignees();
    getSystems().then(setSystems).catch(() => {});
    getPreferences()
      .then((p) => {
        if (p.view === 'list' || p.view === 'card') setView(p.view);
        if (p.detail_mode === 'popup' || p.detail_mode === 'panel') setDetailMode(p.detail_mode);
      })
      .catch(() => {});
  }, [loadTickets, loadAssignees]);

  const changeView = (v) => {
    setView(v);
    savePreferences({ view: v }).catch(() => {});
  };
  const changeDetailMode = (m) => {
    setDetailMode(m);
    savePreferences({ detail_mode: m }).catch(() => {});
  };

  const changeStatus = async (id, status) => {
    await updateFeedbackStatus(id, status);
    loadTickets();
  };
  const assign = async (id, email) => {
    await assignFeedback(id, email);
    await Promise.all([loadTickets(), loadAssignees()]);
  };
  const changeSystem = async (id, systemId) => {
    await tagFeedbackSystem(id, systemId);
    loadTickets();
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!tickets) return <p className="text-zinc-400">Loading…</p>;

  const visible = tickets
    .filter((t) => !typeFilter || t.type === typeFilter)
    .filter((t) => !statusFilter || t.status === statusFilter)
    .filter((t) => !systemFilter || t.system_id === systemFilter)
    .filter((t) => !urgentOnly || t.urgent);

  const selected = visible.find((t) => t.id === selectedId);
  const panelOpen = detailMode === 'panel' && selected;
  const popupOpen = detailMode === 'popup' && selected;

  return (
    <div className="max-w-full">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <div className="ml-auto flex items-center gap-2">
          <SegmentedToggle
            value={view}
            options={[{ value: 'list', label: 'List' }, { value: 'card', label: 'Cards' }]}
            onChange={changeView}
            size="sm"
          />
          <SegmentedToggle
            value={detailMode}
            options={[{ value: 'popup', label: 'Popup' }, { value: 'panel', label: 'Panel' }]}
            onChange={changeDetailMode}
            size="sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <GlassSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs py-1">
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </GlassSelect>
        <GlassSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs py-1">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </GlassSelect>
        <GlassSelect value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)} className="text-xs py-1">
          <option value="">All systems</option>
          {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </GlassSelect>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} className="w-3.5 h-3.5" />
          Urgent only
        </label>
        <span className="ml-auto text-xs text-zinc-500">{visible.length} ticket{visible.length === 1 ? '' : 's'}</span>
      </div>

      <p className="text-xs text-zinc-500 mb-4">
        "Send to Claude" (inside a ticket) copies a ready-to-paste task brief and marks the ticket <code>sent_to_agent</code> —
        paste it into a Claude Code session to start work.
      </p>

      <div className={panelOpen ? 'grid grid-cols-1 xl:grid-cols-[1fr_28rem] gap-4 items-start' : ''}>
        <div>
          {visible.length === 0 ? (
            <p className="text-zinc-500">No tickets match these filters.</p>
          ) : view === 'list' ? (
            <TicketList
              tickets={visible}
              selectedId={selectedId}
              onSelect={setSelectedId}
              assignees={assignees}
              systems={systems}
              onAssign={assign}
              onSystemChange={changeSystem}
            />
          ) : (
            <TicketGrid
              tickets={visible}
              selectedId={selectedId}
              onSelect={setSelectedId}
              assignees={assignees}
            />
          )}
        </div>

        {panelOpen && (
          <aside className="xl:sticky xl:top-4 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
            <GlassPanel className="p-4">
              <TicketDetail
                ticket={selected}
                assignees={assignees}
                systems={systems}
                layout="panel"
                onClose={() => setSelectedId(null)}
                onAssign={assign}
                onSystemChange={changeSystem}
                onStatusChange={changeStatus}
                onSendToAgent={() => changeStatus(selected.id, 'sent_to_agent')}
              />
            </GlassPanel>
          </aside>
        )}
      </div>

      {popupOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 md:p-8 overflow-y-auto"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
        >
          <GlassPanel className="w-full max-w-3xl my-4 p-6">
            <TicketDetail
              ticket={selected}
              assignees={assignees}
              systems={systems}
              layout="popup"
              onClose={() => setSelectedId(null)}
              onAssign={assign}
              onSystemChange={changeSystem}
              onStatusChange={changeStatus}
              onSendToAgent={() => changeStatus(selected.id, 'sent_to_agent')}
            />
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
