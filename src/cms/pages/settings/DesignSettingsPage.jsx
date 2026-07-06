import { useState } from 'react';
import { usePagesStore } from '../../lib/usePagesStore.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea, GlassSelect } from '../../lib/ui/Glass.jsx';
import { FONT_STACKS, FONT_SCALES } from '../../../shared/theme.js';
import { THEME_PRESETS } from '../../../shared/themePresets.js';
import ThemeWizard from '../../lib/theme/ThemeWizard.jsx';

// "Design" bucket: everything that affects how the public rendered site
// looks and feels — theme colors/fonts, header/footer, analytics injection.
// Workspace identity settings (name, timezone, domain) live one page over.

export default function DesignSettingsPage() {
  const { pages, globalSettings, setGlobalSettings, save, saving, saveMessage, loading, error } = usePagesStore();
  const [wizardOpen, setWizardOpen] = useState(false);

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const updateTheme = (patch) => setGlobalSettings({ ...globalSettings, theme: { ...globalSettings.theme, ...patch } });
  const applyPreset = (preset) => setGlobalSettings({ ...globalSettings, theme: { ...preset.theme } });
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
        <div className="flex gap-2">
          <GlassButton variant="secondary" onClick={() => setWizardOpen(true)}>Guided setup</GlassButton>
          <GlassButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
        </div>
      </div>
      {saveMessage && <p className="text-sm text-zinc-400 mb-4">{saveMessage}</p>}

      {wizardOpen && (
        <ThemeWizard
          initialTheme={globalSettings.theme || {}}
          onApply={(theme) => { updateTheme(theme); setWizardOpen(false); }}
          onClose={() => setWizardOpen(false)}
        />
      )}

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-1">Presets</h2>
        <p className="text-xs text-zinc-500 mb-3">
          A starting point -- pick one, then fine-tune anything below. Presets
          never lock you in, they just fill in the fields for you.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="rounded-xl border border-white/10 hover:border-white/30 overflow-hidden text-left transition"
              title={preset.name}
            >
              <div className="h-10 flex">
                <div className="flex-1" style={{ background: preset.theme.primary }} />
                <div className="flex-1" style={{ background: preset.theme.accent }} />
                <div className="flex-1" style={{ background: preset.theme.bg }} />
              </div>
              <div className="px-2 py-1.5 text-[11px] text-zinc-400 truncate">{preset.name}</div>
            </button>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-3">Theme colors</h2>
        <div className="grid grid-cols-2 gap-3">
          {['primary', 'secondary', 'accent', 'link', 'bg', 'text', 'muted'].map((key) => (
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

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-3">Fonts</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Font family</label>
            <GlassSelect
              value={globalSettings.theme?.fontFamily || 'system'}
              onChange={(e) => updateTheme({ fontFamily: e.target.value })}
              className="w-full"
            >
              {Object.entries(FONT_STACKS).map(([key, { label, value }]) => (
                <option key={key} value={key} style={{ fontFamily: value }}>{label}</option>
              ))}
            </GlassSelect>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Sizing</label>
            <GlassSelect
              value={globalSettings.theme?.fontScale || 'comfortable'}
              onChange={(e) => updateTheme({ fontScale: e.target.value })}
              className="w-full"
            >
              {Object.entries(FONT_SCALES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </GlassSelect>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-1">Custom CSS</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Raw CSS injected into every published page's <code>&lt;head&gt;</code>.
          Use this for styling that blocks and theme colors don't cover — plain
          CSS rules only, not Tailwind utility classes (those aren't compiled
          for pasted-in content).
        </p>
        <GlassTextarea
          value={globalSettings.theme?.customCss || ''}
          onChange={(e) => updateTheme({ customCss: e.target.value })}
          rows={8}
          className="w-full font-mono text-xs"
          placeholder=".nx-header { padding: 24px; }"
        />
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
