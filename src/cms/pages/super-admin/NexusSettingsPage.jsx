import { usePagesStore } from '../../lib/usePagesStore.js';
import { getNexusPages, saveNexusPages } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput } from '../../lib/ui/Glass.jsx';

// Minimal settings for Nexus's own site — just enough to name it and set
// SEO/branding defaults. Not the full per-org Workspace/Design surface;
// Nexus's site is a small marketing/docs surface, not a client's whole CMS.
export default function NexusSettingsPage() {
  const { pages, globalSettings, setGlobalSettings, save, saving, saveMessage, loading, error } = usePagesStore({
    fetchPages: getNexusPages, savePages: saveNexusPages,
  });

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const update = (patch) => setGlobalSettings({ ...globalSettings, ...patch });
  const handleSave = () => save(pages, globalSettings);

  return (
    <div className="max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Nexus settings</h1>
        <GlassButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
      </div>
      {saveMessage && <p className="text-sm text-zinc-400 mb-4">{saveMessage}</p>}

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-3">Identity</h2>
        <label className="text-xs text-zinc-400 block mb-1">Site name</label>
        <GlassInput
          value={globalSettings.siteName || ''}
          onChange={(e) => update({ siteName: e.target.value })}
          className="w-full"
        />
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="font-medium mb-3">Branding &amp; SEO defaults</h2>
        <label className="text-xs text-zinc-400 block mb-1">Favicon URL</label>
        <GlassInput
          value={globalSettings.favicon || ''}
          onChange={(e) => update({ favicon: e.target.value })}
          placeholder="/media/favicon.png"
          className="w-full mb-3"
        />
        <label className="text-xs text-zinc-400 block mb-1">Default OG image URL</label>
        <GlassInput
          value={globalSettings.defaultOgImage || ''}
          onChange={(e) => update({ defaultOgImage: e.target.value })}
          placeholder="/media/og-default.png"
          className="w-full"
        />
      </GlassPanel>
    </div>
  );
}
