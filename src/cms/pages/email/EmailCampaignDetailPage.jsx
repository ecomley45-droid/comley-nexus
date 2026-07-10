import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getEmailCampaign, saveEmailCampaign, previewEmail, previewAudienceCount, sendEmailCampaign, testEmailCampaign, getEmailStatus } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, Badge } from '../../lib/ui/Glass.jsx';

const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;

// Campaign detail: subject/preheader, audience selection with a live count,
// schedule, test + send, and engagement stats once sent.
export default function EmailCampaignDetailPage() {
  const { orgSlug, id } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState(null);
  const [status, setStatus] = useState(null);
  const [html, setHtml] = useState('');
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const sources = c?.audience?.sources || ['newsletter'];

  const load = () => getEmailCampaign(id).then((data) => { setC(data); previewEmail(data.document).then((r) => setHtml(r.html)).catch(() => {}); }).catch((e) => setError(e.message));
  useEffect(() => { load(); getEmailStatus().then(setStatus).catch(() => {}); /* eslint-disable-next-line */ }, [id]);

  // Recompute audience size whenever the source selection changes.
  useEffect(() => { if (c) previewAudienceCount({ sources }).then((r) => setCount(r.count)).catch(() => {}); /* eslint-disable-next-line */ }, [JSON.stringify(sources), !!c]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const patch = (p) => setC((prev) => ({ ...prev, ...p }));

  const save = async (extra = {}) => {
    const payload = { id: c.id, name: c.name, subject: c.subject, preheader: c.preheader, document: c.document, audience: { sources }, scheduledAt: c.scheduledAt, ...extra };
    const saved = await saveEmailCampaign(payload);
    setC((prev) => ({ ...prev, ...saved }));
    return saved;
  };

  const toggleSource = async (src) => {
    const next = sources.includes(src) ? sources.filter((s) => s !== src) : [...sources, src];
    patch({ audience: { sources: next } });
  };

  const doSave = async () => { setBusy('save'); try { await save(); flash('Saved'); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const doTest = async () => { setBusy('test'); try { await save(); const r = await testEmailCampaign(c.id); flash(r.sandbox ? 'Test logged (sandbox)' : `Test sent to ${r.to}`); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const doSend = async () => {
    if (!c.subject?.trim()) return setError('Add a subject line first.');
    if (!confirm(c.scheduledAt ? 'Schedule this campaign?' : `Send now to ${count ?? '…'} recipients?`)) return;
    setBusy('send');
    try { await save(); const r = await sendEmailCampaign(c.id); flash(r.scheduled ? 'Scheduled' : `Sent to ${r.delivered}/${r.recipients}${r.sandbox ? ' (sandbox)' : ''}`); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  if (error && !c) return <p className="text-red-400">{error}</p>;
  if (!c) return <p className="text-zinc-400">Loading…</p>;

  const sent = c.status === 'sent';
  const s = c.liveStats || {};

  return (
    <div className="max-w-5xl">
      <button className="text-sm text-zinc-400 hover:text-white mb-2" onClick={() => nav(`/${orgSlug}/email/campaigns`)}>← Campaigns</button>
      <div className="flex items-center justify-between gap-3 mb-4">
        <input className="text-2xl font-semibold bg-transparent outline-none text-zinc-100 min-w-0" value={c.name} onChange={(e) => patch({ name: e.target.value })} />
        <Badge tone={sent ? 'published' : 'draft'}>{c.status}</Badge>
      </div>
      {toast && <div className="mb-3 text-sm rounded-lg bg-emerald-400/10 border border-emerald-400/30 px-3 py-1.5 text-emerald-200">{toast}</div>}
      {error && <div className="mb-3 text-sm rounded-lg bg-red-400/10 border border-red-400/30 px-3 py-1.5 text-red-200">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          {/* Details */}
          <GlassPanel className="p-4 mb-4">
            <label className="text-xs text-zinc-400 block mb-1">Subject line</label>
            <GlassInput className="w-full mb-3" value={c.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder="What lands in the inbox" disabled={sent} />
            <label className="text-xs text-zinc-400 block mb-1">Preheader</label>
            <GlassInput className="w-full" value={c.preheader} onChange={(e) => patch({ preheader: e.target.value })} placeholder="Preview text after the subject" disabled={sent} />
          </GlassPanel>

          {/* Audience */}
          <GlassPanel className="p-4 mb-4">
            <div className="text-sm font-medium text-zinc-200 mb-2">Audience</div>
            <label className="flex items-center gap-2 text-sm text-zinc-300 mb-1">
              <input type="checkbox" className="accent-glass-indigo" checked={sources.includes('newsletter')} onChange={() => toggleSource('newsletter')} disabled={sent} /> Newsletter &amp; form signups
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" className="accent-glass-indigo" checked={sources.includes('customers')} onChange={() => toggleSource('customers')} disabled={sent} /> Commerce customers
            </label>
            <p className="text-sm text-zinc-400 mt-2 tabular-nums">{count == null ? 'Counting…' : `${count} recipients`}</p>
          </GlassPanel>

          {/* Schedule + actions */}
          {!sent && (
            <GlassPanel className="p-4 mb-4">
              <label className="text-xs text-zinc-400 block mb-1">Schedule (optional)</label>
              <GlassInput type="datetime-local" className="mb-3 block" value={c.scheduledAt ? c.scheduledAt.slice(0, 16) : ''} onChange={(e) => patch({ scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              <div className="flex gap-2 flex-wrap">
                <GlassButton variant="secondary" onClick={doSave} disabled={busy}>Save draft</GlassButton>
                <GlassButton variant="secondary" onClick={doTest} disabled={busy}>Send test</GlassButton>
                <GlassButton onClick={doSend} disabled={busy}>{c.scheduledAt ? 'Schedule' : 'Send now'}</GlassButton>
              </div>
              {status?.sendSandbox && <p className="text-xs text-amber-300 mt-2">Sending runs in sandbox — recipients are logged, not emailed.</p>}
            </GlassPanel>
          )}

          {/* Stats */}
          {sent && (
            <GlassPanel className="p-4 mb-4">
              <div className="text-sm font-medium text-zinc-200 mb-3">Performance</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className="text-2xl font-semibold tabular-nums">{s.delivered || 0}</div><div className="text-xs text-zinc-500">Delivered</div></div>
                <div><div className="text-2xl font-semibold tabular-nums">{s.opens || 0}</div><div className="text-xs text-zinc-500">Opens · {pct(s.openRate)}</div></div>
                <div><div className="text-2xl font-semibold tabular-nums">{s.clicks || 0}</div><div className="text-xs text-zinc-500">Clicks · {pct(s.clickRate)}</div></div>
              </div>
            </GlassPanel>
          )}
        </div>

        {/* Preview */}
        <div>
          <div className="text-xs text-zinc-500 mb-2">Preview</div>
          <iframe title="Campaign preview" srcDoc={html} className="w-full h-[560px] rounded-xl border border-white/10 bg-white" />
        </div>
      </div>
    </div>
  );
}
