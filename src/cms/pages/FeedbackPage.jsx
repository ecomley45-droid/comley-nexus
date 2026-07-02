import { useEffect, useState } from 'react';
import { getFeedback, updateFeedbackStatus } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassSelect, Badge } from '../lib/ui/Glass.jsx';

const TYPE_LABEL = { bug: 'Bug', non_functioning: 'Non-functioning', critical: 'Critical error', feature_request: 'Feature request' };
const STATUS_OPTIONS = ['open', 'acknowledged', 'in_progress', 'sent_to_agent', 'resolved', 'closed'];
const STATUS_TONE = { open: 'default', acknowledged: 'default', in_progress: 'default', sent_to_agent: 'default', resolved: 'published', closed: 'draft' };

// Builds the plain-text task brief a human pastes into a Claude Code session
// to actually start work — there's no autonomous agent wired up yet (no
// staging environment or API key in this project), so "send to Claude" means
// "prepare everything Claude needs and hand it off," not a live trigger.
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

function TicketRow({ ticket, expanded, onToggle, onStatusChange, onSendToAgent }) {
  const [copied, setCopied] = useState(false);

  const sendToAgent = async () => {
    await navigator.clipboard.writeText(buildTaskPacket(ticket));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onSendToAgent();
  };

  return (
    <GlassPanel className="p-3 mb-2">
      <button onClick={onToggle} className="w-full text-left flex justify-between items-center">
        <div className="flex items-center gap-2">
          {ticket.urgent && <span className="text-red-400 text-xs font-bold">URGENT</span>}
          <span className="text-sm text-zinc-100">{TYPE_LABEL[ticket.type]}</span>
          <span className="text-xs text-zinc-500">{ticket.path}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
          <span className="text-xs text-zinc-500">{new Date(ticket.createdAt).toLocaleDateString()}</span>
        </div>
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
          <p className="text-sm text-zinc-200">{ticket.description}</p>
          {(ticket.expectedBehavior || ticket.currentBehavior) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-zinc-500 block mb-1">Expected</span>
                <p className="text-zinc-300">{ticket.expectedBehavior || '—'}</p>
              </div>
              <div>
                <span className="text-zinc-500 block mb-1">Current</span>
                <p className="text-zinc-300">{ticket.currentBehavior || '—'}</p>
              </div>
            </div>
          )}
          {ticket.screenshotUrl && (
            <div>
              <span className="text-xs text-zinc-500 block mb-1">Auto-captured screenshot</span>
              <img src={ticket.screenshotUrl} alt="Screenshot" className="w-full rounded-lg border border-white/10" />
            </div>
          )}
          {ticket.imageUrls?.length > 0 && (
            <div>
              <span className="text-xs text-zinc-500 block mb-1">Attachments</span>
              <div className="grid grid-cols-3 gap-2">
                {ticket.imageUrls.map((url) => (
                  <img key={url} src={url} alt="Attachment" className="w-full h-24 object-cover rounded-lg border border-white/10" />
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <GlassButton variant="secondary" onClick={sendToAgent} className="text-xs py-1.5">
              {copied ? 'Copied ✓ paste into Claude Code' : 'Send to Claude'}
            </GlassButton>
            <GlassSelect value={ticket.status} onChange={(e) => onStatusChange(e.target.value)} className="text-xs py-1">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </GlassSelect>
          </div>
          <p className="text-xs text-zinc-500">Filed by {ticket.reportedRole} from {ticket.area} · {new Date(ticket.createdAt).toLocaleString()}</p>
        </div>
      )}
    </GlassPanel>
  );
}

export default function FeedbackPage() {
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);

  const load = () => getFeedback().then(setTickets).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!tickets) return <p className="text-zinc-400">Loading…</p>;

  const visible = tickets
    .filter((t) => !typeFilter || t.type === typeFilter)
    .filter((t) => !statusFilter || t.status === statusFilter)
    .filter((t) => !urgentOnly || t.urgent);

  const changeStatus = async (id, status) => {
    await updateFeedbackStatus(id, status);
    load();
  };

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <div className="flex gap-2">
          <GlassSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs py-1">
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </GlassSelect>
          <GlassSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs py-1">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </GlassSelect>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} className="w-3.5 h-3.5" />
            Urgent only
          </label>
        </div>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        "Send to Claude" copies a ready-to-paste task brief and marks the ticket <code>sent_to_agent</code> —
        there's no autonomous pipeline wired up yet, so paste it into a Claude Code session yourself to start work.
      </p>

      {visible.length === 0 && <p className="text-zinc-500">No tickets match these filters.</p>}
      {visible.map((t) => (
        <TicketRow
          key={t.id}
          ticket={t}
          expanded={expandedId === t.id}
          onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
          onStatusChange={(status) => changeStatus(t.id, status)}
          onSendToAgent={() => changeStatus(t.id, 'sent_to_agent')}
        />
      ))}
    </div>
  );
}
