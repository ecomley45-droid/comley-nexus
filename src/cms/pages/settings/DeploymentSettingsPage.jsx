import { useEffect, useState } from 'react';
import { getSiteStatus, updateSiteSettings } from '../../lib/api.js';
import { GlassPanel, Badge } from '../../lib/ui/Glass.jsx';

// Features that can be badged "Coming soon" (keys match CmsLayout nav items).
const FEATURES = [
  ['pages', 'Pages'], ['blocks', 'Blocks'], ['templates', 'Templates'], ['library', 'Library'],
  ['media', 'Media'], ['events', 'Events'], ['redirects', 'Redirects'], ['forms', 'Forms'],
  ['comments', 'Comments'], ['social', 'Social'], ['newsletter', 'Newsletter'], ['commerce', 'Commerce'],
];

function Toggle({ on, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      className={`relative w-11 h-6 rounded-full transition shrink-0 disabled:opacity-50 ${on ? 'bg-gradient-to-r from-glass-indigo to-glass-fuchsia' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

// Settings for the staging → live workflow and demo presentation controls.
export default function DeploymentSettingsPage() {
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { getSiteStatus().then(setStatus).catch((e) => setError(e.message)); }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2000); };
  const patch = async (body) => {
    setSaving(true); setError('');
    try { const res = await updateSiteSettings(body); setStatus(res.status); flash('Saved'); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  if (error && !status) return <p className="text-red-400">{error}</p>;
  if (!status) return <p className="text-zinc-400">Loading…</p>;

  const comingSoon = new Set(status.comingSoon || []);
  const toggleFeature = (key) => {
    const next = new Set(comingSoon);
    if (next.has(key)) next.delete(key); else next.add(key);
    patch({ comingSoon: [...next] });
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1">Deploy &amp; demo</h1>
      <p className="text-zinc-500 text-sm mb-6">Control how changes reach your public site, and set up presentation mode for demos.</p>
      {toast && <div className="mb-4 text-sm rounded-lg bg-emerald-400/10 border border-emerald-400/30 px-3 py-1.5 text-emerald-200">{toast}</div>}
      {error && <div className="mb-4 text-sm rounded-lg bg-red-400/10 border border-red-400/30 px-3 py-1.5 text-red-200">{error}</div>}

      {/* Staging */}
      <GlassPanel className="p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium text-zinc-100 mb-1">Staging workflow</div>
            <p className="text-sm text-zinc-500">Edit privately, then use the <strong>Deploy</strong> button to push your work live. With this off, published pages go live immediately.</p>
          </div>
          <Toggle on={status.stagingEnabled} disabled={saving} onClick={() => patch({ stagingEnabled: !status.stagingEnabled })} />
        </div>
        {status.stagingEnabled && (
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-sm">
            <Badge tone={status.live ? 'published' : 'draft'}>{status.live ? 'Live' : 'Offline'}</Badge>
            <span className="text-zinc-500">{status.lastDeployedAt ? `Last deployed ${new Date(status.lastDeployedAt).toLocaleString()}` : 'Not deployed yet'}</span>
          </div>
        )}
      </GlassPanel>

      {/* Demo mode */}
      <GlassPanel className="p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium text-zinc-100 mb-1">Demo mode</div>
            <p className="text-sm text-zinc-500">Hides the Deploy button and shows the selected features as “Coming soon” (visible but not usable) — for presenting the roadmap safely.</p>
          </div>
          <Toggle on={status.demoMode} disabled={saving} onClick={() => patch({ demoMode: !status.demoMode })} />
        </div>
      </GlassPanel>

      {/* Coming-soon picker */}
      <GlassPanel className="p-5">
        <div className="font-medium text-zinc-100 mb-1">“Coming soon” features</div>
        <p className="text-sm text-zinc-500 mb-4">Badged in the nav. In demo mode their pages are shown but locked.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FEATURES.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" className="accent-glass-indigo" checked={comingSoon.has(key)} disabled={saving} onChange={() => toggleFeature(key)} />
              {label}
            </label>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
