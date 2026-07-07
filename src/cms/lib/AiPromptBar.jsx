import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { GlassPanel, GlassTextarea, GlassButton } from './ui/Glass.jsx';
import { generateAiSite } from './api.js';
import { useOrgBase } from './useMe.jsx';

// Dashboard AI bar: describe the business, get a complete multi-page site
// generated from the block system (POST /api/ai/generate-site). Pages
// append to the workspace -- existing work is never overwritten -- and on
// a fresh workspace the generated theme applies too.
export default function AiPromptBar() {
  const base = useOrgBase() || '/admin';
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    if (description.trim().length < 10) return;
    setBusy(true); setError('');
    try {
      await generateAiSite(description.trim());
      navigate(`${base}/pages`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <GlassPanel className="p-4 mb-6 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-glass-fuchsia" />
        <h2 className="font-medium text-zinc-200 m-0">Build a site with AI</h2>
        <span className="text-xs text-zinc-500 ml-1">
          Describe your business — get a complete, themed, editable site in seconds.
        </span>
      </div>

      <div className="flex gap-2 items-start">
        <GlassTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate(); }}
          placeholder="e.g. A family-run bakery in Austin known for sourdough and weekend cinnamon rolls. Warm and friendly. We take custom cake orders and ship cookies nationwide."
          disabled={busy}
          rows={2}
          className="text-sm flex-1 !font-sans"
        />
        <GlassButton onClick={generate} disabled={busy || description.trim().length < 10} className="text-sm py-2 shrink-0">
          {busy ? 'Building your site…' : 'Generate site'}
        </GlassButton>
      </div>

      {busy && <p className="text-xs text-zinc-500">Writing copy, picking a theme, and assembling pages — usually 15–30 seconds.</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </GlassPanel>
  );
}
