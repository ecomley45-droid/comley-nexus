import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getEmailTemplates, deleteEmailTemplate, aiGenerateEmail, getEmailStatus } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassTextarea, Badge } from '../../lib/ui/Glass.jsx';

// Template gallery: built-in starters + the workspace's saved templates, plus
// an AI "describe your email" generator. Opening any template hands its
// document to the builder via router state.
export default function EmailTemplatesPage() {
  const { orgSlug } = useParams();
  const nav = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [status, setStatus] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const load = () => getEmailTemplates().then((d) => setTemplates(d.templates)).catch((e) => setError(e.message));
  useEffect(() => { load(); getEmailStatus().then(setStatus).catch(() => {}); }, []);

  const openBuilder = (document, templateId) => nav(`/${orgSlug}/email/build`, { state: { document, templateId } });

  const generate = async () => {
    if (prompt.trim().length < 8) return;
    setGenerating(true); setError('');
    try { const { document } = await aiGenerateEmail(prompt.trim()); openBuilder(document); }
    catch (e) { setError(e.message); } finally { setGenerating(false); }
  };

  const remove = async (id) => { await deleteEmailTemplate(id); load(); };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Email templates</h1>
        <GlassButton onClick={() => openBuilder({ settings: {}, rows: [] })}>Start from blank</GlassButton>
      </div>

      {/* AI generate */}
      <GlassPanel className="p-4 mb-6">
        <div className="text-sm font-medium text-zinc-200 mb-1">Generate with AI</div>
        <p className="text-xs text-zinc-500 mb-2">Describe the email — audience, offer, tone — and we’ll build an editable draft.{status && !status.aiConfigured && <span className="text-amber-300"> (AI isn’t configured on this deployment.)</span>}</p>
        <GlassTextarea rows={2} className="w-full font-sans text-sm mb-2" placeholder="A summer sale email for a bakery, warm and playful, 25% off, ends Sunday" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <GlassButton onClick={generate} disabled={generating || (status && !status.aiConfigured)}>{generating ? 'Generating…' : 'Generate draft'}</GlassButton>
      </GlassPanel>

      {error && <div className="mb-4 rounded-xl bg-red-400/10 border border-red-400/30 px-4 py-2 text-sm text-red-200">{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {templates.map((t) => (
          <GlassPanel key={t.id} className="p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-medium text-zinc-100">{t.name}</span>
              {t.builtin ? <Badge>Starter</Badge> : <Badge tone="published">Saved</Badge>}
            </div>
            <span className="text-xs text-zinc-500 mb-3">{t.category} · {t.document?.rows?.length || 0} rows</span>
            <div className="mt-auto flex gap-2">
              <GlassButton variant="secondary" className="text-xs" onClick={() => openBuilder(t.document, t.id)}>Open</GlassButton>
              {!t.builtin && <GlassButton variant="danger" className="text-xs" onClick={() => remove(t.id)}>Delete</GlassButton>}
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
