import { usePagesStore } from '../../lib/usePagesStore.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea } from '../../lib/ui/Glass.jsx';

// "Design" bucket: everything that affects how the public rendered site
// looks and feels — theme colors, header/footer, analytics injection.
// Workspace identity settings (name, timezone, domain) live one page over.

export default function DesignSettingsPage() {
  const { pages, globalSettings, setGlobalSettings, save, saving, saveMessage, loading, error } = usePagesStore();

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const updateTheme = (patch) => setGlobalSettings({ ...globalSettings, theme: { ...globalSettings.theme, ...patch } });
  const updateAnalytics = (patch) => setGlobalSettings({ ...globalSettings, analytics: { ...globalSettings.analytics, ...patch } });
  const updateGlobals = (which, patch) => setGlobalSettings({
    ...globalSettings,
    globals: {
      ...(globalSettings.globals || {}),
      [which]: { ...((globalSettings.globals || {})[which] || {}), ...patch },
    },
  });
  const globals = globalSettings.globals || {};
  const handleSave = () => save(pages, globalSettings);

  return (
    <div className="max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Design</h1>
        <GlassButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
      </div>
      {saveMessage && <p className="text-sm text-zinc-400 mb-4">{saveMessage}</p>}

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-3">Theme colors</h2>
        <div className="grid grid-cols-2 gap-3">
          {['primary', 'secondary', 'bg', 'text'].map((key) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={globalSettings.theme?.[key] || '#000000'}
                onChange={(e) => updateTheme({ [key]: e.target.value })}
                className="w-8 h-8 rounded-lg border border-white/20 bg-transparent"
              />
              <div>
                <label className="text-xs text-zinc-400 block capitalize">{key}</label>
                <GlassInput
                  value={globalSettings.theme?.[key] || ''}
                  onChange={(e) => updateTheme({ [key]: e.target.value })}
                  className="w-24 py-1"
                />
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel id="globals" className="p-4 mb-4">
        <h2 className="font-medium mb-1">Global content</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Header and footer HTML that every new page inherits. Pages can opt
          out or override in their own Layout panel.
        </p>
        <label className="text-xs text-zinc-400 block mb-1">Header HTML</label>
        <GlassTextarea
          value={globals.header?.html || ''}
          onChange={(e) => updateGlobals('header', { html: e.target.value })}
          rows={5}
          className="w-full mb-3 font-mono text-xs"
          placeholder="<nav>…</nav>"
        />
        <label className="text-xs text-zinc-400 block mb-1">Footer HTML</label>
        <GlassTextarea
          value={globals.footer?.html || ''}
          onChange={(e) => updateGlobals('footer', { html: e.target.value })}
          rows={5}
          className="w-full font-mono text-xs"
          placeholder="<footer>…</footer>"
        />
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="font-medium mb-1">Analytics snippets</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Injected into every published page's <code>&lt;head&gt;</code> and end-of-body.
          Good spot for GA, PostHog, or Meta pixel.
        </p>
        <label className="text-xs text-zinc-400 block mb-1">Head snippet</label>
        <GlassTextarea
          value={globalSettings.analytics?.headSnippet || ''}
          onChange={(e) => updateAnalytics({ headSnippet: e.target.value })}
          rows={4}
          className="w-full mb-3 font-mono text-xs"
        />
        <label className="text-xs text-zinc-400 block mb-1">Body snippet</label>
        <GlassTextarea
          value={globalSettings.analytics?.bodySnippet || ''}
          onChange={(e) => updateAnalytics({ bodySnippet: e.target.value })}
          rows={4}
          className="w-full font-mono text-xs"
        />
      </GlassPanel>
    </div>
  );
}
