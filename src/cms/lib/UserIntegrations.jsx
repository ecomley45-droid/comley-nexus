import { useEffect, useState } from 'react';
import { useUser, useReverification } from '@clerk/clerk-react';
import { isReverificationCancelledError } from '@clerk/clerk-react/errors';
import { getPreferences, savePreferences, getApiKeyStatus, removeApiKey } from './api.js';
import { GlassPanel, GlassSelect, GlassTextarea } from './ui/Glass.jsx';
import { AI_PROVIDERS, isAiProvider } from './aiProviders.js';
import ApiKeyModal from './ApiKeyModal.jsx';

// Per-user "connect your own accounts" panel: login accounts (Google/GitHub/
// Slack via Clerk account-linking) and AI keys (Claude/ChatGPT, stored per
// user). Everything here is scoped to the SIGNED-IN user's own email -- no
// one uses anyone else's connections, and this shows none of the platform's
// shared (super-admin env) integrations. Loads its own preferences so it can
// be dropped in anywhere.
const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const OAUTH_STRATEGIES = { google: 'oauth_google', github: 'oauth_github', slack: 'oauth_slack' };
const isOAuthProviderId = (id) => id in OAUTH_STRATEGIES;
const isApiKeyProviderId = (id) => id === 'claude' || id === 'chatgpt';

const INTEGRATIONS = [
  { id: 'google', name: 'Google', note: 'Sign-in identity. Disconnecting signs you out of the app.', signout: true },
  { id: 'github', name: 'GitHub', note: 'Required for the Git Pull page (repos, branches, pulls).' },
  { id: 'slack', name: 'Slack', note: 'Mentions, channel alerts, and notifications.' },
  { id: 'claude', name: 'Claude', note: 'AI assistant for tickets and content.' },
  { id: 'chatgpt', name: 'ChatGPT', note: 'AI assistant for tickets and content.' },
  { id: 'gemini', name: 'Gemini', note: 'Optional Google AI features (rides on the Google connection above).', toggle: true },
];

function AiSettingsPanel({ providerId, value, onChange }) {
  const provider = AI_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return null;
  const model = value?.model || provider.defaultModel;
  const contextWindow = value?.context_window ?? provider.defaultContext;
  const temperature = value?.temperature ?? 0.7;
  const systemPrompt = value?.system_prompt ?? '';
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">Default model</label>
        <GlassSelect value={model} onChange={(e) => onChange({ model: e.target.value })} className="text-sm w-full">
          {provider.models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </GlassSelect>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">Context window ({contextWindow.toLocaleString()} tokens)</label>
        <input type="range" min={8000} max={provider.maxContext} step={8000} value={contextWindow} onChange={(e) => onChange({ context_window: Number(e.target.value) })} className="w-full accent-glass-indigo" />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">Temperature ({temperature.toFixed(2)})</label>
        <input type="range" min={0} max={1} step={0.05} value={temperature} onChange={(e) => onChange({ temperature: Number(e.target.value) })} className="w-full accent-glass-indigo" />
      </div>
      <div className="md:col-span-2">
        <label className="text-[10px] uppercase tracking-wide text-zinc-500 block mb-1">System prompt</label>
        <GlassTextarea value={systemPrompt} onChange={(e) => onChange({ system_prompt: e.target.value })} rows={2} placeholder={`Personality / house style for ${provider.label}…`} className="text-sm w-full" />
      </div>
    </div>
  );
}

export default function UserIntegrations() {
  const [state, setState] = useState({});
  const [aiSettings, setAiSettings] = useState({});
  const [apiKeyStatus, setApiKeyStatus] = useState({});
  const [apiKeyStatusLoaded, setApiKeyStatusLoaded] = useState(false);
  const [modalProvider, setModalProvider] = useState(null);
  const [oauthError, setOauthError] = useState('');

  // clerkConfigured is static for the app's lifetime, so this conditional
  // hook call never toggles at runtime (same pattern as ProfilePage).
  const clerkUser = clerkConfigured ? useUser() : { user: null, isLoaded: true };
  const user = clerkUser.user;
  const createExternalAccount = clerkConfigured
    ? useReverification((args) => user.createExternalAccount(args))
    : async () => { throw new Error('Clerk is not configured.'); };
  const destroyExternalAccount = clerkConfigured
    ? useReverification((account) => account.destroy())
    : async () => { throw new Error('Clerk is not configured.'); };

  useEffect(() => {
    getPreferences().then((p) => { setState(p?.integrations || {}); setAiSettings(p?.ai_settings || {}); }).catch(() => {});
  }, []);
  useEffect(() => {
    getApiKeyStatus().then(setApiKeyStatus).catch(() => {}).finally(() => setApiKeyStatusLoaded(true));
  }, []);

  const statusLoaded = (id) => (isOAuthProviderId(id) ? clerkUser.isLoaded : isApiKeyProviderId(id) ? apiKeyStatusLoaded : true);
  const isConnected = (id) => {
    if (isOAuthProviderId(id)) return !!user?.externalAccounts?.some((a) => a.provider === OAUTH_STRATEGIES[id]);
    if (isApiKeyProviderId(id)) return !!apiKeyStatus[id];
    return !!state[id];
  };
  const setOne = async (id, value) => {
    setState((s) => ({ ...s, [id]: value }));
    savePreferences({ integrations: { [id]: value } }).catch(() => {});
  };
  const patchAiSettings = (providerId, patch) => {
    setAiSettings((s) => ({ ...s, [providerId]: { ...(s[providerId] || {}), ...patch } }));
    savePreferences({ ai_settings: { [providerId]: patch } }).catch(() => {});
  };
  const connectOAuth = async (id) => {
    setOauthError('');
    try {
      const externalAccount = await createExternalAccount({ strategy: OAUTH_STRATEGIES[id], redirectUrl: window.location.href });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) window.location.href = url;
    } catch (e) {
      if (isReverificationCancelledError(e)) { setOauthError('Verification was cancelled.'); return; }
      setOauthError(e?.errors?.[0]?.longMessage || e.message || `Could not start the ${id} connection.`);
    }
  };
  const disconnectOAuth = async (id) => {
    const account = user?.externalAccounts?.find((a) => a.provider === OAUTH_STRATEGIES[id]);
    if (!account) return;
    if (id === 'google' && !window.confirm("Disconnecting Google may sign you out if it's your only sign-in method. Continue?")) return;
    setOauthError('');
    try {
      await destroyExternalAccount(account);
      await user.reload();
    } catch (e) {
      if (isReverificationCancelledError(e)) { setOauthError('Verification was cancelled.'); return; }
      setOauthError(e?.errors?.[0]?.longMessage || e.message || `Could not disconnect ${id}.`);
    }
  };
  const disconnectApiKey = async (id) => {
    try { await removeApiKey(id); setApiKeyStatus((s) => ({ ...s, [id]: false })); }
    catch (e) { setOauthError(e.message); }
  };
  const handleConnect = (id) => { if (isOAuthProviderId(id)) return connectOAuth(id); if (isApiKeyProviderId(id)) return setModalProvider(id); };
  const handleDisconnect = (id) => { if (isOAuthProviderId(id)) return disconnectOAuth(id); if (isApiKeyProviderId(id)) return disconnectApiKey(id); };

  return (
    <GlassPanel className="p-5">
      {oauthError && <p className="text-sm text-red-400 mb-3">{oauthError}</p>}
      <ul className="flex flex-col">
        {INTEGRATIONS.map((int, i) => {
          const loaded = statusLoaded(int.id);
          const connected = loaded && isConnected(int.id);
          const showAi = connected && isAiProvider(int.id);
          const isGemini = int.toggle;
          const geminiLocked = isGemini && !isConnected('google');
          return (
            <li key={int.id} className={`py-3.5 ${i > 0 ? 'border-t border-white/10' : ''}`}>
              <div className="flex items-center gap-4">
                <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-zinc-100">{int.name.slice(0, 2).toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-100">{int.name}</div>
                  {int.note && <div className="text-xs text-zinc-500 mt-0.5">{int.note}</div>}
                  {geminiLocked && <div className="text-xs text-amber-400 mt-0.5">Connect Google first</div>}
                </div>
                {!loaded ? (
                  <span className="text-xs text-zinc-500 px-3 py-1.5 shrink-0">Checking…</span>
                ) : isGemini ? (
                  <button type="button" role="switch" aria-checked={connected} disabled={geminiLocked} onClick={() => setOne(int.id, !connected)}
                    className={`relative inline-block w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${connected ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${connected ? 'translate-x-5' : ''}`} />
                  </button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" disabled={connected} onClick={() => handleConnect(int.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${connected ? 'bg-emerald-500 border-emerald-500 text-white cursor-default' : 'bg-glass-indigo/60 border-glass-indigo text-white hover:bg-glass-indigo/80'}`}>
                      {connected && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" /></svg>}
                      {connected ? 'Connected' : 'Connect'}
                    </button>
                    <button type="button" disabled={!connected} onClick={() => handleDisconnect(int.id)}
                      className={`inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${connected ? 'bg-red-500 border-red-500 text-white hover:bg-red-600' : 'bg-white/[0.03] border-white/10 text-zinc-500 cursor-not-allowed'}`}>Disconnect</button>
                  </div>
                )}
              </div>
              {showAi && <AiSettingsPanel providerId={int.id} value={aiSettings[int.id]} onChange={(patch) => patchAiSettings(int.id, patch)} />}
            </li>
          );
        })}
      </ul>
      {modalProvider && (
        <ApiKeyModal
          provider={modalProvider}
          label={INTEGRATIONS.find((i) => i.id === modalProvider)?.name || modalProvider}
          onClose={() => setModalProvider(null)}
          onConnected={() => { setApiKeyStatus((s) => ({ ...s, [modalProvider]: true })); setModalProvider(null); }}
        />
      )}
    </GlassPanel>
  );
}
