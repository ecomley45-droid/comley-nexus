import { useEffect, useMemo, useState } from 'react';
import { listProducts, listLocations, listInventory, setInventory } from '../../lib/api.js';
import { GlassPanel } from '../../../cms/lib/ui/Glass.jsx';

// Per-location inventory manager: a product x location grid with an editable
// quantity in each cell and a per-product total (sum across locations).
const key = (p, l) => `${p}|${l}`;

export default function InventoryPage() {
  const [products, setProducts] = useState(null);
  const [locations, setLocations] = useState(null);
  const [qty, setQty] = useState({}); // `${productId}|${locationId}` -> quantity
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    Promise.all([listProducts(), listLocations(), listInventory()])
      .then(([p, l, inv]) => {
        setProducts(p); setLocations(l);
        const map = {};
        for (const r of inv) map[key(r.product_id, r.location_id)] = r.quantity;
        setQty(map);
      })
      .catch((e) => setError(e.message));
  }, []);

  const totals = useMemo(() => {
    const t = {};
    for (const [k, v] of Object.entries(qty)) { const pid = k.split('|')[0]; t[pid] = (t[pid] || 0) + Number(v || 0); }
    return t;
  }, [qty]);

  const save = async (productId, locationId, value) => {
    const q = Math.max(0, Math.round(Number(value) || 0));
    setQty((m) => ({ ...m, [key(productId, locationId)]: q }));
    setSaving(key(productId, locationId));
    try { await setInventory(productId, locationId, q); } catch (e) { setError(e.message); } finally { setSaving(''); }
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!products || !locations) return <p className="text-zinc-400">Loading…</p>;

  if (locations.length === 0) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold mb-2">Inventory</h1>
        <GlassPanel className="p-6 text-sm text-zinc-400">Add a location first (Locations tab) — stock is tracked per location.</GlassPanel>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold mb-1">Inventory</h1>
      <p className="text-sm text-zinc-400 mb-5">Stock per location. The total is the sum across all locations. Edit a cell and tab out to save.</p>
      <GlassPanel className="p-0 overflow-x-auto">
        <table className="w-full min-w-lg text-sm">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-white/10">
              <th className="p-3 font-medium">Product</th>
              {locations.map((l) => <th key={l.id} className="p-3 font-medium text-center whitespace-nowrap">{l.name}</th>)}
              <th className="p-3 font-medium text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-white/5 last:border-0">
                <td className="p-3">
                  <div className="text-zinc-100">{p.name}</div>
                  <div className="text-[11px] text-zinc-500">{p.sku}</div>
                </td>
                {locations.map((l) => {
                  const q = qty[key(p.id, l.id)] ?? 0;
                  return (
                    <td key={l.id} className="p-2 text-center">
                      <input
                        type="number" min="0"
                        defaultValue={q}
                        onBlur={(e) => { if (String(q) !== e.target.value) save(p.id, l.id, e.target.value); }}
                        className={`w-16 text-center bg-white/[0.04] border rounded-lg px-1 py-1 text-zinc-100 outline-none focus:border-glass-indigo ${q === 0 ? 'border-amber-500/30' : 'border-white/10'} ${saving === key(p.id, l.id) ? 'opacity-50' : ''}`}
                      />
                    </td>
                  );
                })}
                <td className="p-3 text-center font-semibold text-zinc-100">{totals[p.id] || 0}</td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={locations.length + 2} className="p-4 text-zinc-500">No products yet.</td></tr>}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
