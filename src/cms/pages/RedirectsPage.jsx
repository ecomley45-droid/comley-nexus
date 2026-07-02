import { useEffect, useState } from 'react';
import { getRedirects, addRedirect, deleteRedirect } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect } from '../lib/ui/Glass.jsx';

export default function RedirectsPage() {
  const [redirects, setRedirects] = useState([]);
  const [form, setForm] = useState({ from: '', to: '', type: 302 });
  const [error, setError] = useState('');

  const load = () => getRedirects().then(setRedirects).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await addRedirect(form.from, form.to, Number(form.type));
      setForm({ from: '', to: '', type: 302 });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    await deleteRedirect(id);
    load();
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">Redirects</h1>

      <GlassPanel className="p-4 mb-4">
        <form onSubmit={submit} className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">From</label>
            <GlassInput value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="old-path" required />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">To</label>
            <GlassInput value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="/new-path" required />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Type</label>
            <GlassSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value={302}>302</option>
              <option value={301}>301</option>
            </GlassSelect>
          </div>
          <GlassButton type="submit">Add</GlassButton>
        </form>
        {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
      </GlassPanel>

      <GlassPanel className="p-2">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-zinc-400 border-b border-white/10"><th className="py-2 px-2 font-normal">From</th><th className="font-normal">To</th><th className="font-normal">Type</th><th></th></tr></thead>
          <tbody>
            {redirects.map((r) => (
              <tr key={r.id} className="border-b border-white/5">
                <td className="py-2 px-2 text-zinc-100">/{r.from}</td>
                <td className="text-zinc-300">{r.to}</td>
                <td className="text-zinc-300">{r.type}</td>
                <td className="text-right px-2"><button onClick={() => remove(r.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
