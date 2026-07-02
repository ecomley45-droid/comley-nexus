import { usePagesStore } from '../../../cms/lib/usePagesStore.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect } from '../../../cms/lib/ui/Glass.jsx';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
const DEFAULT_COMMERCE_SETTINGS = { currency: 'USD', regions: ['United States'] };

// Intentionally modest: a single default currency + a flat region list, not
// full multi-site/multi-market branding (that was explicitly out of scope).
export default function MarketsPage() {
  const { pages, globalSettings, setGlobalSettings, save, saving, saveMessage, loading, error } = usePagesStore();

  if (loading) return <p className="text-zinc-400">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const commerce = { ...DEFAULT_COMMERCE_SETTINGS, ...globalSettings.commerce };
  const updateCommerce = (patch) => setGlobalSettings({ ...globalSettings, commerce: { ...commerce, ...patch } });

  const addRegion = () => {
    const region = prompt('Region name');
    if (!region?.trim()) return;
    updateCommerce({ regions: [...commerce.regions, region.trim()] });
  };
  const removeRegion = (region) => updateCommerce({ regions: commerce.regions.filter((r) => r !== region) });

  const handleSave = () => save(pages, globalSettings);

  return (
    <div className="max-w-xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Markets</h1>
        <GlassButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
      </div>
      {saveMessage && <p className="text-sm text-zinc-400 mb-4">{saveMessage}</p>}

      <GlassPanel className="p-4 mb-4">
        <label className="text-xs text-zinc-400 block mb-1">Default currency</label>
        <GlassSelect value={commerce.currency} onChange={(e) => updateCommerce({ currency: e.target.value })} className="w-40">
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </GlassSelect>
      </GlassPanel>

      <GlassPanel className="p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-medium text-zinc-300">Selling regions</h2>
          <button onClick={addRegion} className="text-xs text-glass-sky hover:underline">Add region</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {commerce.regions.map((r) => (
            <span key={r} className="px-3 py-1 rounded-full bg-white/10 border border-white/15 text-sm text-zinc-200 flex items-center gap-2">
              {r}
              <button onClick={() => removeRegion(r)} className="text-zinc-500 hover:text-red-400">×</button>
            </span>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
