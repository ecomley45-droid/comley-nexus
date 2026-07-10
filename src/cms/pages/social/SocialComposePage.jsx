import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSocialAccounts, getSocialPlatforms, createSocialPost } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassTextarea, GlassInput } from '../../lib/ui/Glass.jsx';
import { platformMeta } from './platformMeta.js';

// Mirror of the server's validateForPlatform so problems show live, before
// submit. The server re-validates authoritatively.
function validate(constraints, { text, media }) {
  const c = constraints;
  if (!c) return [];
  const out = [];
  if (c.maxChars && text.length > c.maxChars) out.push(`${text.length} / ${c.maxChars} characters`);
  if (c.requiresMedia && media.length === 0) out.push(c.videoOnly ? 'needs a video' : 'needs an image or video');
  if (c.maxMedia && media.length > c.maxMedia) out.push(`max ${c.maxMedia} media`);
  return out;
}

export default function SocialComposePage() {
  const { orgSlug } = useParams();
  const [accounts, setAccounts] = useState([]);
  const [constraints, setConstraints] = useState({});
  const [body, setBody] = useState('');
  const [media, setMedia] = useState([]);          // [{ url }]
  const [mediaUrl, setMediaUrl] = useState('');
  const [selected, setSelected] = useState({});     // accountId -> true
  const [overrides, setOverrides] = useState({});   // accountId -> string
  const [openOverride, setOpenOverride] = useState({});
  const [when, setWhen] = useState('');             // datetime-local; '' = now
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getSocialAccounts(), getSocialPlatforms()])
      .then(([a, p]) => { setAccounts(a.accounts); setConstraints(p.platforms); })
      .catch((e) => setError(e.message));
  }, []);

  const chosen = accounts.filter((a) => selected[a.id]);

  const perTarget = useMemo(() => chosen.map((a) => {
    const text = overrides[a.id] != null && overrides[a.id] !== '' ? overrides[a.id] : body;
    const problems = validate(constraints[a.platform]?.constraints, { text, media });
    return { account: a, text, problems };
  }), [chosen, overrides, body, media, constraints]);

  const anyProblem = perTarget.some((t) => t.problems.length);
  const canSubmit = chosen.length > 0 && (body.trim() || media.length) && !anyProblem && !submitting;

  const addMedia = () => {
    const u = mediaUrl.trim();
    if (u) { setMedia((m) => [...m, { url: u }]); setMediaUrl(''); }
  };

  const submit = async (publishNow) => {
    setSubmitting(true); setError(''); setResult(null);
    try {
      const targets = chosen.map((a) => ({
        accountId: a.id,
        overrideBody: overrides[a.id]?.trim() ? overrides[a.id] : undefined,
      }));
      const payload = {
        body, media, targets, publishNow,
        scheduledAt: publishNow ? null : (when ? new Date(when).toISOString() : null),
      };
      const out = await createSocialPost(payload);
      setResult(out);
      if (out.post?.status === 'done' || out.post?.status === 'failed') {
        // published now — keep the result visible; clear the composer
        setBody(''); setMedia([]); setSelected({}); setOverrides({});
      }
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  };

  if (accounts.length === 0) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold mb-2">Compose</h1>
        <GlassPanel className="p-6 text-center">
          <p className="text-zinc-300 mb-1">Connect an account first.</p>
          <Link to={`/${orgSlug}/social/accounts`}><GlassButton className="mt-2">Connect an account</GlassButton></Link>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">Compose</h1>

      {result && (
        <GlassPanel className="p-4 mb-4">
          {result.post?.scheduledAt && result.post?.status === 'scheduled' ? (
            <p className="text-emerald-200 text-sm">Scheduled for {new Date(result.post.scheduledAt).toLocaleString()}.</p>
          ) : (
            <div className="text-sm">
              <p className="text-zinc-200 mb-2">Published — {result.result?.sent || 0} sent, {result.result?.failed || 0} failed.</p>
              {result.post?.targets?.filter((t) => t.status === 'failed').map((t) => (
                <p key={t.accountId} className="text-red-300 text-xs">✕ {t.error}</p>
              ))}
            </div>
          )}
        </GlassPanel>
      )}
      {error && <div className="mb-4 rounded-xl bg-red-400/10 border border-red-400/30 px-4 py-2 text-sm text-red-200">{error}</div>}

      {/* Shared body */}
      <label className="block text-sm text-zinc-400 mb-1">Post</label>
      <GlassTextarea rows={4} className="w-full font-sans text-sm mb-1" placeholder="Write your post…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="text-xs text-zinc-500 mb-4">{body.length} characters · shared across every selected account unless customized below</div>

      {/* Media */}
      <label className="block text-sm text-zinc-400 mb-1">Media</label>
      <div className="flex gap-2 mb-2">
        <GlassInput className="flex-1" placeholder="Paste an image or video URL" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMedia())} />
        <GlassButton variant="secondary" onClick={addMedia}>Add</GlassButton>
      </div>
      {media.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {media.map((m, i) => (
            <span key={i} className="text-xs bg-white/10 border border-white/15 rounded-lg px-2 py-1 flex items-center gap-2 max-w-xs">
              <span className="truncate">{m.url}</span>
              <button className="text-zinc-400 hover:text-red-300" onClick={() => setMedia((arr) => arr.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-zinc-600 mb-6">Media is referenced by URL for now — the Media-library picker is the next iteration.</p>

      {/* Accounts + per-network overrides */}
      <label className="block text-sm text-zinc-400 mb-2">Post to</label>
      <div className="space-y-2 mb-6">
        {accounts.map((a) => {
          const meta = platformMeta(a.platform);
          const on = !!selected[a.id];
          const target = perTarget.find((t) => t.account.id === a.id);
          return (
            <GlassPanel key={a.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer min-w-0">
                  <input type="checkbox" checked={on} onChange={(e) => setSelected((s) => ({ ...s, [a.id]: e.target.checked }))} className="accent-glass-indigo" />
                  <span className="w-7 h-7 rounded-lg grid place-items-center text-xs font-bold text-white shrink-0" style={{ background: meta.color }}>{meta.short}</span>
                  <span className="text-zinc-100 truncate">{a.handle || meta.label}</span>
                </label>
                {on && (
                  <button className="text-xs text-glass-sky hover:underline shrink-0" onClick={() => setOpenOverride((o) => ({ ...o, [a.id]: !o[a.id] }))}>
                    {openOverride[a.id] ? 'Use shared text' : 'Customize'}
                  </button>
                )}
              </div>
              {on && openOverride[a.id] && (
                <GlassTextarea rows={3} className="w-full font-sans text-sm mt-2" placeholder={`Custom ${meta.label} text (blank = shared)`} value={overrides[a.id] || ''} onChange={(e) => setOverrides((o) => ({ ...o, [a.id]: e.target.value }))} />
              )}
              {on && target?.problems.length > 0 && (
                <div className="mt-2 text-xs text-amber-300">{meta.label}: {target.problems.join(' · ')}</div>
              )}
            </GlassPanel>
          );
        })}
      </div>

      {/* Schedule */}
      <label className="block text-sm text-zinc-400 mb-1">Schedule (optional)</label>
      <GlassInput type="datetime-local" className="mb-6 block" value={when} onChange={(e) => setWhen(e.target.value)} />

      <div className="flex gap-2">
        <GlassButton disabled={!canSubmit} onClick={() => submit(true)}>{submitting ? 'Working…' : 'Publish now'}</GlassButton>
        <GlassButton variant="secondary" disabled={!canSubmit || !when} onClick={() => submit(false)}>Schedule</GlassButton>
      </div>
      {anyProblem && <p className="text-xs text-amber-300 mt-2">Fix the highlighted per-network issues first.</p>}
    </div>
  );
}
