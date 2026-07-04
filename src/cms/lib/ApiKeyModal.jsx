import { useState } from 'react';
import { setApiKey } from './api.js';
import { GlassPanel, GlassButton, GlassInput } from './ui/Glass.jsx';

// "Connect" flow for key-based services (Claude, ChatGPT) that have no
// OAuth login screen -- see IntegrationsSection in ProfilePage.jsx for the
// Google/GitHub/Slack counterpart, which uses Clerk account-linking
// instead. The key is validated with a real test call server-side
// (lib/ai.js's testAnthropicKey / lib/openai.js's testOpenAIKey) before
// ever being stored, and is never sent back to the browser afterward.
export default function ApiKeyModal({ provider, label, onClose, onConnected }) {
  const [apiKey, setApiKeyValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setBusy(true);
    setError('');
    try {
      await setApiKey(provider, apiKey.trim());
      onConnected();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-24 p-4" onClick={onClose}>
      <div className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <GlassPanel className="p-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-zinc-100">Connect {label}</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            {label} doesn't have a sign-in screen -- paste an API key instead.
            It's tested against {label}'s API before being saved, and is
            never shown again once stored.
          </p>
          <form onSubmit={submit}>
            <GlassInput
              type="password"
              value={apiKey}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder={`${label} API key`}
              className="w-full mb-2"
              autoFocus
            />
            {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
            <div className="flex justify-end gap-2 mt-2">
              <GlassButton type="button" variant="secondary" onClick={onClose}>Cancel</GlassButton>
              <GlassButton type="submit" disabled={busy || !apiKey.trim()}>
                {busy ? 'Testing…' : 'Test & connect'}
              </GlassButton>
            </div>
          </form>
        </GlassPanel>
      </div>
    </div>
  );
}
