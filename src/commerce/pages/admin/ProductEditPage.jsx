import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getProduct, createProduct, updateProduct } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassTextarea, GlassSelect } from '../../../cms/lib/ui/Glass.jsx';
import { useCommerceBase } from '../../lib/useCommerceBase.js';

const EMPTY = { name: '', sku: '', price: '', wholesale_price: '', description: '', inventory: 0, status: 'active', image_url: '' };

export default function ProductEditPage() {
  const base = useCommerceBase();
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    getProduct(id)
      .then((p) => setForm({ ...EMPTY, ...p, price: String(p.price), wholesale_price: p.wholesale_price != null ? String(p.wholesale_price) : '' }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      price: Number(form.price),
      wholesale_price: form.wholesale_price ? Number(form.wholesale_price) : null,
      inventory: Number(form.inventory) || 0,
    };
    try {
      if (isNew) {
        const { product } = await createProduct(payload);
        navigate(`${base}/products/${product.id}`);
      } else {
        await updateProduct(id, payload);
        navigate(`${base}/products`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-xl">
      <Link to={`${base}/products`} className="text-sm text-zinc-400 hover:text-white">← Products</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-4">{isNew ? 'New product' : 'Edit product'}</h1>
      {error && <p className="text-red-400 mb-2">{error}</p>}
      <GlassPanel className="p-4">
        <form onSubmit={submit} className="space-y-2">
          <GlassInput required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" />
          <GlassInput required placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full" />
          <div className="grid grid-cols-2 gap-2">
            <GlassInput required type="number" step="0.01" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <GlassInput type="number" step="0.01" placeholder="Wholesale price" value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <GlassInput type="number" placeholder="Inventory" value={form.inventory} onChange={(e) => setForm({ ...form, inventory: e.target.value })} />
            <GlassSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </GlassSelect>
          </div>
          <GlassInput placeholder="Image URL" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="w-full" />
          <GlassTextarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full" rows={4} />
          <GlassButton type="submit" disabled={saving}>{saving ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}</GlassButton>
        </form>
      </GlassPanel>
    </div>
  );
}
