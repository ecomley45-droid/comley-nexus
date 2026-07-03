import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { getPreferences } from './api.js';
import { GlassPanel, GlassInput, GlassSelect, GlassButton } from './ui/Glass.jsx';
import { connectedAiProviders } from './aiProviders.js';

// Prompt bar mounted at the top of the CMS Dashboard. Only shown when at
// least one AI provider is marked as "connected" in the viewer's profile.
// Sending isn't wired to a real backend yet — clicking "Send" surfaces a
// placeholder response so the shape of the interaction is visible.
export default function AiPromptBar() {
  const [providers, setProviders] = useState(null);
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');

  useEffect(() => {
    getPreferences()
      .then((p) => {
        const list = connectedAiProviders(p.integrations || {}, p.ai_settings || {});
        setProviders(list);
        if (list.length > 0) {
          setProviderId(list[0].id);
          setModelId(list[0].activeModel);
        }
      })
      .catch(() => setProviders([]));
  }, []);

  if (providers == null) return null;

  if (providers.length === 0) {
    return (
      <GlassPanel className="p-4 mb-6 flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-glass-fuchsia" />
        <p className="text-sm text-zinc-400 flex-1">
          Connect an AI provider on your profile to prompt it from the dashboard.
        </p>
        <Link
          to="/admin/ops/profile"
          className="text-sm font-semibold text-glass-indigo hover:underline"
        >
          Manage integrations →
        </Link>
      </GlassPanel>
    );
  }

  const active = providers.find((p) => p.id === providerId) || providers[0];

  const changeProvider = (id) => {
    setProviderId(id);
    const next = providers.find((p) => p.id === id);
    if (next) setModelId(next.activeModel);
  };

  const send = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setReply('');
    // Real AI call would go here (server route or client SDK). For now, echo
    // the config so the shape of the interaction is obvious.
    await new Promise((r) => setTimeout(r, 400));
    setReply(
      `[${active.label} · ${modelId}] Real AI call not wired yet. Once ${active.label} is connected server-side, this would send: "${prompt.trim()}"`,
    );
    setBusy(false);
  };

  return (
    <GlassPanel className="p-4 mb-6 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-glass-fuchsia" />
        <h2 className="font-medium text-zinc-200 m-0">Ask your AI</h2>
        <span className="text-xs text-zinc-500 ml-1">
          Prompt one of your connected providers directly from here.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[10rem_10rem_1fr_auto] gap-2 items-start">
        <GlassSelect value={providerId} onChange={(e) => changeProvider(e.target.value)} className="text-sm">
          {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </GlassSelect>
        <GlassSelect value={modelId} onChange={(e) => setModelId(e.target.value)} className="text-sm">
          {active.models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </GlassSelect>
        <GlassInput
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); }}
          placeholder={`Ask ${active.label}…`}
          disabled={busy}
          className="text-sm"
        />
        <GlassButton onClick={send} disabled={busy || !prompt.trim()} className="text-sm py-2">
          {busy ? 'Sending…' : 'Send'}
        </GlassButton>
      </div>

      {reply && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">{reply}</p>
        </div>
      )}
    </GlassPanel>
  );
}
