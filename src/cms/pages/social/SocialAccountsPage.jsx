import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSocialStatus, getSocialAccounts, startSocialConnect, disconnectSocialAccount } from '../../lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../../lib/ui/Glass.jsx';
import { PLATFORM_ORDER, platformMeta } from './platformMeta.js';

// Connect / disconnect a workspace's social accounts. Connecting kicks off
// the OAuth round trip (or, in sandbox, a loop straight back to the callback
// which lands here again with ?connected=1).
export default function SocialAccountsPage() {
  const [status, setStatus] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [params, setParams] = useSearchParams();

  const load = () => Promise.all([getSocialStatus(), getSocialAccounts()])
    .then(([s, a]) => { setStatus(s); setAccounts(a.accounts); })
    .catch(() => {})
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  // Surface the callback's ?connected / ?error, then strip them from the URL.
  const connected = params.get('connected');
  const error = params.get('error');
  useEffect(() => {
    if (connected || error) {
      const t = setTimeout(() => setParams({}, { replace: true }), 4000);
      return () => clearTimeout(t);
    }
  }, [connected, error, setParams]);

  const modeFor = (id) => status?.platforms?.find((p) => p.id === id)?.mode;

  const disconnect = async (id) => {
    setBusy(id);
    try { await disconnectSocialAccount(id); await load(); } finally { setBusy(''); }
  };

  if (loading) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Social accounts</h1>
      <p className="text-zinc-500 text-sm mb-4">
        Connect the accounts this workspace posts from. {status?.sandbox && (
          <span className="text-amber-300">Sandbox mode is on — connections are simulated so you can try the full flow.</span>
        )}
      </p>

      {connected && (
        <div className="mb-4 rounded-xl bg-emerald-400/10 border border-emerald-400/30 px-4 py-2 text-sm text-emerald-200">
          {platformMeta(params.get('platform')).label} connected.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl bg-red-400/10 border border-red-400/30 px-4 py-2 text-sm text-red-200">{error}</div>
      )}

      {/* Connect buttons, one per platform */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        {PLATFORM_ORDER.map((id) => {
          const meta = platformMeta(id);
          const mode = modeFor(id);
          return (
            <GlassPanel key={id} className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg grid place-items-center text-xs font-bold text-white shrink-0" style={{ background: meta.color }}>{meta.short}</span>
                <span className="font-medium text-zinc-100">{meta.label}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge tone={mode === 'live' ? 'published' : 'draft'}>{mode === 'live' ? 'Live API' : 'Sandbox'}</Badge>
                <GlassButton variant="secondary" className="text-xs py-1" onClick={() => startSocialConnect(id)}>Connect</GlassButton>
              </div>
            </GlassPanel>
          );
        })}
      </div>

      <h2 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wide">Connected</h2>
      {accounts.length === 0 ? (
        <p className="text-zinc-500 text-sm">No accounts connected yet.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => {
            const meta = platformMeta(a.platform);
            return (
              <GlassPanel key={a.id} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-lg grid place-items-center text-xs font-bold text-white shrink-0" style={{ background: meta.color }}>{meta.short}</span>
                  <div className="min-w-0">
                    <div className="text-zinc-100 font-medium truncate">{a.handle || meta.label}</div>
                    <div className="text-xs text-zinc-500">{meta.label}{a.sandbox ? ' · sandbox' : ''}</div>
                  </div>
                </div>
                <GlassButton variant="danger" className="text-xs" disabled={busy === a.id} onClick={() => disconnect(a.id)}>
                  {busy === a.id ? 'Removing…' : 'Disconnect'}
                </GlassButton>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
