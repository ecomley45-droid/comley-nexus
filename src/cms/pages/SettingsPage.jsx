import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePagesStore } from '../lib/usePagesStore.js';
import { getMedia } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea, GlassSelect } from '../lib/ui/Glass.jsx';

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London'];

export default function SettingsPage() {
  const { pages, globalSettings, setGlobalSettings, save, saving, saveMessage, loading, error } = usePagesStore();
  const [media, setMedia] = useState([]);

  useEffect(() => { getMedia().then(setMedia).catch(() => {}); }, []);

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const update = (patch) => setGlobalSettings({ ...globalSettings, ...patch });
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
  const images = media.filter((m) => m.mimeType?.startsWith('image/'));

  return (
    <div className="max-w-xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Site settings</h1>
        <GlassButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
      </div>
      {saveMessage && <p className="text-sm text-zinc-400 mb-4">{saveMessage}</p>}
      <p className="text-xs text-zinc-500 mb-4">Requires the "admin" role — the server drops these changes otherwise (page content in the same request still saves).</p>

      <GlassPanel className="p-4 mb-4">
        <label className="text-xs text-zinc-400 block mb-1">Site name</label>
        <GlassInput value={globalSettings.siteName} onChange={(e) => update({ siteName: e.target.value })} className="w-full" />
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-3">Theme</h2>
        <div className="grid grid-cols-2 gap-3">
          {['primary', 'secondary', 'bg', 'text'].map((key) => (
            <div key={key} className="flex items-center gap-2">
              <input type="color" value={globalSettings.theme[key]} onChange={(e) => updateTheme({ [key]: e.target.value })} className="w-8 h-8 rounded-lg border border-white/20 bg-transparent" />
              <div>
                <label className="text-xs text-zinc-400 block capitalize">{key}</label>
                <GlassInput value={globalSettings.theme[key]} onChange={(e) => updateTheme({ [key]: e.target.value })} className="w-24 py-1" />
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-1">Global content</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Header and footer HTML that every new page inherits. Pages can opt out
          or override in their own Layout panel.
        </p>
        <label className="text-xs text-zinc-400 block mb-1">Header HTML</label>
        <GlassTextarea
          value={globals.header?.html || ''}
          onChange={(e) => updateGlobals('header', { html: e.target.value })}
          rows={4}
          className="w-full mb-3 font-mono text-xs"
          placeholder="<nav>…</nav>"
        />
        <label className="text-xs text-zinc-400 block mb-1">Footer HTML</label>
        <GlassTextarea
          value={globals.footer?.html || ''}
          onChange={(e) => updateGlobals('footer', { html: e.target.value })}
          rows={4}
          className="w-full font-mono text-xs"
          placeholder="<footer>…</footer>"
        />
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-3">Global analytics snippets</h2>
        <label className="text-xs text-zinc-400 block mb-1">Head snippet</label>
        <GlassTextarea value={globalSettings.analytics?.headSnippet || ''} onChange={(e) => updateAnalytics({ headSnippet: e.target.value })} rows={3} className="w-full mb-2" />
        <label className="text-xs text-zinc-400 block mb-1">Body snippet</label>
        <GlassTextarea value={globalSettings.analytics?.bodySnippet || ''} onChange={(e) => updateAnalytics({ bodySnippet: e.target.value })} rows={3} className="w-full" />
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-3">Branding &amp; SEO defaults</h2>
        <label className="text-xs text-zinc-400 block mb-1">Favicon</label>
        <div className="flex gap-2 mb-2">
          <GlassInput value={globalSettings.favicon || ''} onChange={(e) => update({ favicon: e.target.value })} placeholder="/media/favicon.png" className="flex-1" />
          {images.length > 0 && (
            <GlassSelect onChange={(e) => e.target.value && update({ favicon: e.target.value })} defaultValue="" className="w-40 text-xs">
              <option value="">Pick from media…</option>
              {images.map((m) => <option key={m.id} value={m.url}>{m.name}</option>)}
            </GlassSelect>
          )}
        </div>
        <label className="text-xs text-zinc-400 block mb-1">Default OG image</label>
        <div className="flex gap-2">
          <GlassInput value={globalSettings.defaultOgImage || ''} onChange={(e) => update({ defaultOgImage: e.target.value })} placeholder="/media/og-default.png" className="flex-1" />
          {images.length > 0 && (
            <GlassSelect onChange={(e) => e.target.value && update({ defaultOgImage: e.target.value })} defaultValue="" className="w-40 text-xs">
              <option value="">Pick from media…</option>
              {images.map((m) => <option key={m.id} value={m.url}>{m.name}</option>)}
            </GlassSelect>
          )}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="font-medium mb-3">General</h2>
        <label className="text-xs text-zinc-400 block mb-1">Timezone</label>
        <GlassSelect value={globalSettings.timezone || 'UTC'} onChange={(e) => update({ timezone: e.target.value })} className="w-full mb-3">
          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </GlassSelect>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={!!globalSettings.maintenanceMode} onChange={(e) => update({ maintenanceMode: e.target.checked })} className="w-4 h-4" />
          Maintenance mode
        </label>
        <p className="text-xs text-zinc-500 mt-1">
          A flag for the site's rendering logic to check — doesn't yet gate `server.js`'s public routes.
        </p>
      </GlassPanel>

      <GlassPanel className="p-4 mt-4">
        <h2 className="font-medium mb-1">Bulk data</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Import or export CSV files for pages, library templates, redirects, comments, team, products,
          orders, customers, and discounts.
        </p>
        <Link to="/admin/import-export">
          <GlassButton variant="secondary">Go to Import / Export</GlassButton>
        </Link>
      </GlassPanel>

      <GlassPanel className="p-4 mt-4">
        <h2 className="font-medium mb-3">More settings</h2>
        <div className="flex flex-col gap-2">
          <Link to="/admin/connections" className="flex justify-between items-center px-3 py-2 rounded-xl text-sm text-zinc-200 hover:bg-white/10 transition">
            <span>Connections</span>
            <span className="text-zinc-500 text-xs">Integration status & test</span>
          </Link>
          <Link to="/admin/team" className="flex justify-between items-center px-3 py-2 rounded-xl text-sm text-zinc-200 hover:bg-white/10 transition">
            <span>Team &amp; Permissions</span>
            <span className="text-zinc-500 text-xs">Roster & role reference</span>
          </Link>
          <Link to="/admin/audit" className="flex justify-between items-center px-3 py-2 rounded-xl text-sm text-zinc-200 hover:bg-white/10 transition">
            <span>Audit Log</span>
            <span className="text-zinc-500 text-xs">Activity history</span>
          </Link>
        </div>
      </GlassPanel>
    </div>
  );
}
