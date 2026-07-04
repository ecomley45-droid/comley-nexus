import { useEffect, useState } from 'react';
import { usePagesStore } from '../../lib/usePagesStore.js';
import { getMe } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect } from '../../lib/ui/Glass.jsx';

// "Workspace" bucket: the identity + operational settings for the org
// itself. Everything on this page is per-org and admin-editable — theme
// and content globals live on the Design page next door.

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London'];

export default function WorkspaceSettingsPage() {
  const { pages, globalSettings, setGlobalSettings, save, saving, saveMessage, loading, error } = usePagesStore();
  const [me, setMe] = useState(null);

  useEffect(() => { getMe().then(setMe).catch(() => {}); }, []);

  if (loading) return <p className="text-zinc-300">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const update = (patch) => setGlobalSettings({ ...globalSettings, ...patch });
  const handleSave = () => save(pages, globalSettings);

  return (
    <div className="max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Workspace</h1>
        <GlassButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
      </div>
      {saveMessage && <p className="text-sm text-zinc-400 mb-4">{saveMessage}</p>}

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-3">Identity</h2>
        <label className="text-xs text-zinc-400 block mb-1">Workspace name</label>
        <GlassInput
          value={globalSettings.siteName || ''}
          onChange={(e) => update({ siteName: e.target.value })}
          className="w-full mb-4"
        />
        <label className="text-xs text-zinc-400 block mb-1">Timezone</label>
        <GlassSelect value={globalSettings.timezone || 'UTC'} onChange={(e) => update({ timezone: e.target.value })} className="w-full">
          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </GlassSelect>
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-3">Custom domain</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Point your own domain at this workspace instead of using the default
          Nexus URL. Ask us to help wire the DNS records.
        </p>
        <label className="text-xs text-zinc-400 block mb-1">Custom domain (e.g. cms.acmeco.com)</label>
        <GlassInput
          value={me?.org?.feature_flags?.custom_domain || ''}
          onChange={() => {}}
          placeholder="cms.your-brand.com"
          className="w-full"
          disabled
        />
        <p className="text-[11px] text-zinc-500 mt-2">
          Custom domains are added on the Vercel project and require a CNAME record.
          Contact hello@comleycreative.com to schedule the switch.
        </p>
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
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

      <GlassPanel className="p-4">
        <h2 className="font-medium mb-3">Maintenance</h2>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={!!globalSettings.maintenanceMode}
            onChange={(e) => update({ maintenanceMode: e.target.checked })}
            className="w-4 h-4"
          />
          Maintenance mode
        </label>
        <p className="text-xs text-zinc-500 mt-1">
          Flips a flag your public pages can check to show a "we're down for
          maintenance" banner. Doesn't gate the admin console.
        </p>
      </GlassPanel>
    </div>
  );
}
