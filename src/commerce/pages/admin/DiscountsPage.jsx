import { useEffect, useState } from 'react';
import { listCampaigns, createCampaign, updateCampaign, deleteCampaign } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect, Badge } from '../../../cms/lib/ui/Glass.jsx';

const EMPTY = { code: '', discount_type: 'percent', discount_value: '', usage_limit: '' };

export default function DiscountsPage() {
  const [campaigns, setCampaigns] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const load = () => listCampaigns().then(setCampaigns).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createCampaign({
        code: form.code.toUpperCase().trim(),
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      });
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (c) => {
    await updateCampaign(c.code, { active: !c.active });
    load();
  };

  const remove = async (code) => {
    if (!confirm(`Delete discount code "${code}"?`)) return;
    await deleteCampaign(code);
    load();
  };

  if (!campaigns) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">Discounts</h1>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-2 text-zinc-300">New discount code</h2>
        <form onSubmit={submit} className="flex gap-2 flex-wrap items-end">
          <GlassInput required placeholder="CODE" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <GlassSelect value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed amount off</option>
          </GlassSelect>
          <GlassInput required type="number" step="0.01" placeholder="Value" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} className="w-24" />
          <GlassInput type="number" placeholder="Usage limit (optional)" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} className="w-40" />
          <GlassButton type="submit">Add</GlassButton>
        </form>
        {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
      </GlassPanel>

      {campaigns.length === 0 && <p className="text-zinc-500">No discount codes yet.</p>}
      <GlassPanel className="p-2">
        <div className="overflow-x-auto"><table className="w-full min-w-lg text-sm">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-white/10">
              <th className="py-2 px-2 font-normal">Code</th>
              <th className="font-normal">Discount</th>
              <th className="font-normal">Used</th>
              <th className="font-normal">Revenue attributed</th>
              <th className="font-normal">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.code} className="border-b border-white/5">
                <td className="py-2 px-2 text-zinc-100 font-mono">{c.code}</td>
                <td className="text-zinc-300">{c.discount_type === 'percent' ? `${c.discount_value}%` : `$${c.discount_value}`}</td>
                <td className="text-zinc-400">{c.usage_count}{c.usage_limit != null ? ` / ${c.usage_limit}` : ''}</td>
                <td className="text-zinc-300">${Number(c.revenue_attributed || 0).toFixed(2)}</td>
                <td>
                  <button onClick={() => toggleActive(c)}>
                    <Badge tone={c.active ? 'published' : 'draft'}>{c.active ? 'active' : 'inactive'}</Badge>
                  </button>
                </td>
                <td className="text-right px-2"><button onClick={() => remove(c.code)} className="text-red-400 hover:text-red-300 text-xs">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </GlassPanel>
    </div>
  );
}
