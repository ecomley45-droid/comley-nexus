import { useEffect, useMemo, useState } from 'react';
import { listProducts, listLocations, getSellers, createManualOrder } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect } from '../../../cms/lib/ui/Glass.jsx';

// Record an in-store / manual sale: pick products, quantity, the location it
// sold at, and who sold it. Creates a paid order and draws down that
// location's stock.
export default function ManualSaleModal({ onClose, onCreated }) {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [sellers, setSellers] = useState({ staff: [], teamMembers: [] });
  const [lines, setLines] = useState([]); // { productId, name, price, quantity }
  const [locationId, setLocationId] = useState('');
  const [soldBy, setSoldBy] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [status, setStatus] = useState('paid');
  const [addProductId, setAddProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listProducts(), listLocations(), getSellers()])
      .then(([p, l, s]) => { setProducts(p); setLocations(l); setSellers(s); if (l[0]) setLocationId(l[0].id); })
      .catch((e) => setError(e.message));
  }, []);

  const total = useMemo(() => lines.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0), [lines]);

  const addLine = () => {
    const p = products.find((x) => x.id === addProductId);
    if (!p) return;
    setLines((prev) => prev.some((l) => l.productId === p.id)
      ? prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l))
      : [...prev, { productId: p.id, name: p.name, price: Number(p.price) || 0, quantity: 1 }]);
    setAddProductId('');
  };
  const setLine = (id, patch) => setLines((prev) => prev.map((l) => (l.productId === id ? { ...l, ...patch } : l)));
  const removeLine = (id) => setLines((prev) => prev.filter((l) => l.productId !== id));

  const submit = async () => {
    if (lines.length === 0) { setError('Add at least one product.'); return; }
    setSaving(true); setError('');
    try {
      await createManualOrder({
        items: lines.map((l) => ({ productId: l.productId, name: l.name, price: Number(l.price), quantity: Number(l.quantity) })),
        locationId: locationId || null,
        soldBy: soldBy || null,
        customerEmail: customerEmail.trim() || null,
        status,
      });
      onCreated?.();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-12 p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <GlassPanel className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">New sale</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
          </div>

          <div className="flex gap-2 mb-3">
            <GlassSelect className="flex-1" value={addProductId} onChange={(e) => setAddProductId(e.target.value)}>
              <option value="">Add a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} — ${Number(p.price).toFixed(2)}</option>)}
            </GlassSelect>
            <GlassButton variant="secondary" onClick={addLine} disabled={!addProductId}>Add</GlassButton>
          </div>

          <div className="flex flex-col gap-1.5 mb-3">
            {lines.length === 0 && <p className="text-xs text-zinc-500">No items yet.</p>}
            {lines.map((l) => (
              <div key={l.productId} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-zinc-200 truncate">{l.name}</span>
                <input type="number" min="1" value={l.quantity} onChange={(e) => setLine(l.productId, { quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                  className="w-14 text-center bg-white/[0.04] border border-white/10 rounded-lg px-1 py-1 text-zinc-100" />
                <span className="w-16 text-right text-zinc-400">${(l.price * l.quantity).toFixed(2)}</span>
                <button onClick={() => removeLine(l.productId)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            ))}
            <div className="flex justify-between text-sm font-medium pt-2 border-t border-white/10 mt-1">
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Location</label>
              <GlassSelect className="w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">— none —</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </GlassSelect>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Sold by</label>
              <GlassSelect className="w-full" value={soldBy} onChange={(e) => setSoldBy(e.target.value)}>
                <option value="">— none —</option>
                {sellers.teamMembers?.length > 0 && (
                  <optgroup label="Team">
                    {sellers.teamMembers.map((m) => <option key={`t-${m.id}`} value={m.name}>{m.name}</option>)}
                  </optgroup>
                )}
                {sellers.staff?.length > 0 && (
                  <optgroup label="Staff">
                    {sellers.staff.map((s) => <option key={`s-${s.id}`} value={s.name}>{s.name}</option>)}
                  </optgroup>
                )}
              </GlassSelect>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Customer email (optional)</label>
              <GlassInput className="w-full" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="buyer@example.com" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Status</label>
              <GlassSelect className="w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
                <option value="cancelled">Cancelled</option>
              </GlassSelect>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <GlassButton variant="ghost" onClick={onClose}>Cancel</GlassButton>
            <GlassButton onClick={submit} disabled={saving || lines.length === 0}>{saving ? 'Recording…' : 'Record sale'}</GlassButton>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
