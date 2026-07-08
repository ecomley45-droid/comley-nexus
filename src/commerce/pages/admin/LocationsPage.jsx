import { useEffect, useState } from 'react';
import {
  listLocations, createLocation, updateLocation, deleteLocation,
  listStaff, createStaff, deleteStaff,
} from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput } from '../../../cms/lib/ui/Glass.jsx';

// Physical store locations (used for per-location inventory + manual sales)
// and the name-only floor-staff list (sellers on manual orders).
export default function LocationsPage() {
  const [locations, setLocations] = useState(null);
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ name: '', address: '', phone: '', notes: '' });
  const [staffName, setStaffName] = useState('');

  const loadLocations = () => listLocations().then(setLocations).catch((e) => setError(e.message));
  const loadStaff = () => listStaff().then(setStaff).catch((e) => setError(e.message));
  useEffect(() => { loadLocations(); loadStaff(); }, []);

  const addLocation = async () => {
    if (!draft.name.trim()) return;
    try { await createLocation(draft); setDraft({ name: '', address: '', phone: '', notes: '' }); await loadLocations(); }
    catch (e) { setError(e.message); }
  };
  const editField = async (loc, patch) => {
    try { await updateLocation(loc.id, patch); await loadLocations(); } catch (e) { setError(e.message); }
  };
  const removeLocation = async (loc) => {
    if (!confirm(`Delete "${loc.name}"? Its inventory rows are removed too.`)) return;
    try { await deleteLocation(loc.id); await loadLocations(); } catch (e) { setError(e.message); }
  };
  const addStaff = async () => {
    if (!staffName.trim()) return;
    try { await createStaff({ name: staffName.trim() }); setStaffName(''); await loadStaff(); } catch (e) { setError(e.message); }
  };
  const removeStaff = async (s) => {
    try { await deleteStaff(s.id); await loadStaff(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-1">Locations &amp; staff</h1>
      <p className="text-sm text-zinc-400 mb-6">Physical stores stock inventory and appear on manual sales. Staff are the sellers you can attribute a sale to.</p>
      {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Locations</h2>
          {!locations ? <p className="text-zinc-400">Loading…</p> : (
            <div className="flex flex-col gap-2 mb-4">
              {locations.map((l) => (
                <GlassPanel key={l.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <input className="bg-transparent font-medium text-zinc-100 outline-none border-b border-transparent hover:border-white/20 focus:border-glass-indigo"
                      defaultValue={l.name} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && editField(l, { name: e.target.value.trim() })} />
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-zinc-400 flex items-center gap-1">
                        <input type="checkbox" checked={l.active} onChange={(e) => editField(l, { active: e.target.checked })} /> Active
                      </label>
                      <button onClick={() => removeLocation(l)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-sm text-zinc-200" placeholder="Address"
                      defaultValue={l.address} onBlur={(e) => e.target.value !== l.address && editField(l, { address: e.target.value })} />
                    <input className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-sm text-zinc-200" placeholder="Phone"
                      defaultValue={l.phone} onBlur={(e) => e.target.value !== l.phone && editField(l, { phone: e.target.value })} />
                  </div>
                </GlassPanel>
              ))}
              {locations.length === 0 && <p className="text-zinc-500 text-sm">No locations yet.</p>}
            </div>
          )}
          <GlassPanel className="p-4">
            <div className="text-sm font-medium mb-2">Add location</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <GlassInput placeholder="Name (e.g. Main Street)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <GlassInput placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>
            <GlassInput className="w-full mb-2" placeholder="Address" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            <GlassButton onClick={addLocation}>Add location</GlassButton>
          </GlassPanel>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Staff / sellers</h2>
          <GlassPanel className="p-4">
            {!staff ? <p className="text-zinc-400">Loading…</p> : (
              <div className="flex flex-col gap-1.5 mb-3">
                {staff.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-200">{s.name}</span>
                    <button onClick={() => removeStaff(s)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                  </div>
                ))}
                {staff.length === 0 && <p className="text-zinc-500 text-sm">No staff yet.</p>}
              </div>
            )}
            <div className="flex gap-2">
              <GlassInput className="flex-1 text-sm py-1.5" placeholder="Add seller…" value={staffName} onChange={(e) => setStaffName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStaff()} />
              <GlassButton variant="secondary" onClick={addStaff}>Add</GlassButton>
            </div>
            <p className="text-[11px] text-zinc-500 mt-2">Your Team members are also selectable as sellers on a sale.</p>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
