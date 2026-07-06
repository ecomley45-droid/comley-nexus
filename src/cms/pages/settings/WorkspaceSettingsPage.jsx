import { useEffect, useState } from 'react';
import { usePagesStore } from '../../lib/usePagesStore.js';
import { getMe, requestCustomDomain } from '../../lib/api.js';
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

      <CustomDomainPanel me={me} onUpdated={setMe} />

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

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-1">Page editor</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Controls the Structured/Raw HTML toggle every page editor shows.
          Locking it to one option simplifies things for a team that only
          ever uses one -- e.g. Structured-only so no one sees raw HTML.
        </p>
        <label className="text-xs text-zinc-400 block mb-1">Block editing view</label>
        <GlassSelect
          value={globalSettings.editor?.lockBlockView || ''}
          onChange={(e) => update({ editor: { ...(globalSettings.editor || {}), lockBlockView: e.target.value || null } })}
          className="w-full"
        >
          <option value="">Both Structured and Raw HTML (default)</option>
          <option value="structured">Structured only</option>
          <option value="raw">Raw HTML only</option>
        </GlassSelect>
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

function CustomDomainPanel({ me, onUpdated }) {
  const liveDomain = me?.org?.domain || '';
  const requested = me?.org?.feature_flags?.custom_domain_request || '';
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { setValue(requested || liveDomain); }, [requested, liveDomain]);

  const submit = async () => {
    setBusy(true);
    setMessage('');
    try {
      await requestCustomDomain(value.trim());
      onUpdated(await getMe());
      setMessage(value.trim() ? "Requested — we'll follow up with the DNS record to add." : 'Request cleared.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassPanel className="p-4 mb-4">
      <h2 className="font-medium mb-3">Custom domain</h2>
      <p className="text-xs text-zinc-500 mb-3">
        Point your own domain at this workspace instead of using the default
        Nexus URL.
      </p>
      {liveDomain && <p className="text-xs text-emerald-400 mb-3">Live: {liveDomain}</p>}
      {!liveDomain && requested && (
        <p className="text-xs text-amber-400 mb-3">Requested: {requested} — pending setup on our end.</p>
      )}
      <label className="text-xs text-zinc-400 block mb-1">Custom domain (e.g. cms.acmeco.com)</label>
      <div className="flex gap-2">
        <GlassInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="cms.your-brand.com"
          className="w-full"
        />
        <GlassButton onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Request'}</GlassButton>
      </div>
      {message && <p className="text-xs text-zinc-400 mt-2">{message}</p>}
      <p className="text-[11px] text-zinc-500 mt-2">
        Once it's set up on our end, you'll just need to add a CNAME record with
        your DNS provider — we'll send you the exact record to add.
      </p>
    </GlassPanel>
  );
}
