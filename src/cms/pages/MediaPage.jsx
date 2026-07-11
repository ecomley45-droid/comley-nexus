import { useEffect, useState } from 'react';
import {
  getMedia, uploadMedia, updateMedia, deleteMedia,
  getNexusMedia, uploadNexusMedia, updateNexusMedia, deleteNexusMedia,
} from '../lib/api.js';
import { GlassPanel, GlassInput, GlassTextarea, GlassButton } from '../lib/ui/Glass.jsx';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Full-screen editor for a single media item: rename + alt text +
// description. These three fields are what the page-block renderers can
// optionally surface as a caption, so this is where a user sets the
// defaults that carry over when the media is placed on a page.
// The per-workspace and Nexus (super-admin) media libraries are identical
// surfaces over different, scope-appropriate endpoints. `nexus` picks the
// endpoint set; everything else about the page is shared.
const ORG_API = { list: getMedia, upload: uploadMedia, update: updateMedia, remove: deleteMedia };
const NEXUS_API = { list: getNexusMedia, upload: uploadNexusMedia, update: updateNexusMedia, remove: deleteNexusMedia };

function MediaEditModal({ item, onClose, onSaved, api }) {
  const [name, setName] = useState(item.name || '');
  const [altText, setAltText] = useState(item.altText || '');
  const [description, setDescription] = useState(item.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { entry } = await api.update(item.id, { name, altText, description });
      onSaved(entry);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <GlassPanel className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-3">Edit media</h2>
        {item.mimeType?.startsWith('image/') && (
          <img src={item.url} alt={item.altText || item.name} className="w-full h-40 object-contain rounded-xl mb-3 bg-white/5" />
        )}
        <label className="block text-xs text-zinc-400 mb-1">Name</label>
        <GlassInput value={name} onChange={(e) => setName(e.target.value)} className="w-full mb-3" placeholder="File name" />

        <label className="block text-xs text-zinc-400 mb-1">Alt text</label>
        <GlassInput value={altText} onChange={(e) => setAltText(e.target.value)} className="w-full mb-1" placeholder="Describe the image for screen readers & SEO" />
        <p className="text-[11px] text-zinc-600 mb-3">Read by screen readers and search engines. Keep it short and descriptive.</p>

        <label className="block text-xs text-zinc-400 mb-1">Description</label>
        <GlassTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full mb-3" placeholder="Longer caption shown under the media on a page (optional)" />

        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <GlassButton variant="ghost" onClick={onClose} disabled={saving}>Cancel</GlassButton>
          <GlassButton onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</GlassButton>
        </div>
      </GlassPanel>
    </div>
  );
}

export default function MediaPage({ nexus = false }) {
  const api = nexus ? NEXUS_API : ORG_API;
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () => api.list().then(setMedia).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      // Server auto-converts raster images to WebP; the list refresh below
      // reflects the final stored name/type.
      await api.upload(file.name, file.type, dataBase64);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this file?')) return;
    await api.remove(id);
    load();
  };

  const copyUrl = (url) => {
    // Supabase Storage URLs are already absolute; only prefix legacy
    // relative paths from the pre-Storage era.
    navigator.clipboard?.writeText(/^https?:\/\//.test(url) ? url : window.location.origin + url);
    setCopied(url);
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h1 className="text-2xl font-semibold">Media library</h1>
        <label className="inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition active:scale-95 px-4 py-2 text-white bg-gradient-to-tr from-glass-indigo to-glass-fuchsia shadow-lg shadow-glass-fuchsia/20 hover:brightness-110 cursor-pointer">
          {uploading ? 'Uploading…' : 'Upload file'}
          <input type="file" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>
      <p className="text-xs text-zinc-500 mb-4">Images are automatically optimized to WebP on upload.</p>
      {error && <p className="text-red-400 mb-2">{error}</p>}
      {media.length === 0 && <p className="text-zinc-500">No media uploaded yet.</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {media.map((item) => (
          <GlassPanel key={item.id} className="p-2">
            {item.mimeType?.startsWith('image/') ? (
              <img src={item.url} alt={item.altText || item.name} className="w-full h-24 object-cover rounded-xl mb-2" />
            ) : (
              <div className="w-full h-24 bg-white/5 rounded-xl mb-2 flex items-center justify-center text-xs text-zinc-400">
                {item.mimeType}
              </div>
            )}
            <p className="text-xs truncate text-zinc-300" title={item.name}>{item.name}</p>
            {item.altText
              ? <p className="text-[11px] truncate text-zinc-500" title={item.altText}>{item.altText}</p>
              : <p className="text-[11px] text-amber-500/80">No alt text</p>}
            <div className="flex justify-between mt-1 gap-1">
              <button onClick={() => copyUrl(item.url)} className="text-xs text-glass-sky hover:underline">
                {copied === item.url ? 'Copied!' : 'Copy URL'}
              </button>
              <button onClick={() => setEditing(item)} className="text-xs text-zinc-300 hover:text-white">Edit</button>
              <button onClick={() => remove(item.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          </GlassPanel>
        ))}
      </div>

      {editing && (
        <MediaEditModal
          item={editing}
          api={api}
          onClose={() => setEditing(null)}
          onSaved={(entry) => {
            setMedia((prev) => prev.map((m) => (m.id === entry.id ? entry : m)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
