import { useEffect, useState } from 'react';
import { getMedia, uploadMedia, deleteMedia } from '../lib/api.js';
import { GlassPanel } from '../lib/ui/Glass.jsx';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function MediaPage() {
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = () => getMedia().then(setMedia).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      await uploadMedia(file.name, file.type, dataBase64);
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
    await deleteMedia(id);
    load();
  };

  const copyUrl = (url) => {
    navigator.clipboard?.writeText(window.location.origin + url);
    setCopied(url);
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Media library</h1>
        <label className="inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition active:scale-95 px-4 py-2 text-white bg-gradient-to-tr from-glass-indigo to-glass-fuchsia shadow-lg shadow-glass-fuchsia/20 hover:brightness-110 cursor-pointer">
          {uploading ? 'Uploading…' : 'Upload file'}
          <input type="file" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>
      {error && <p className="text-red-400 mb-2">{error}</p>}
      {media.length === 0 && <p className="text-zinc-500">No media uploaded yet.</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {media.map((item) => (
          <GlassPanel key={item.id} className="p-2">
            {item.mimeType?.startsWith('image/') ? (
              <img src={item.url} alt={item.name} className="w-full h-24 object-cover rounded-xl mb-2" />
            ) : (
              <div className="w-full h-24 bg-white/5 rounded-xl mb-2 flex items-center justify-center text-xs text-zinc-400">
                {item.mimeType}
              </div>
            )}
            <p className="text-xs truncate text-zinc-300" title={item.name}>{item.name}</p>
            <div className="flex justify-between mt-1">
              <button onClick={() => copyUrl(item.url)} className="text-xs text-glass-sky hover:underline">
                {copied === item.url ? 'Copied!' : 'Copy URL'}
              </button>
              <button onClick={() => remove(item.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
