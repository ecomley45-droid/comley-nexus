import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { domToPng } from 'modern-screenshot';
import { MessageSquarePlus, X } from 'lucide-react';
import { submitFeedback, getViewer } from './api.js';
import { GlassPanel, GlassButton, GlassTextarea, GlassSelect } from './ui/Glass.jsx';

const TYPES = [
  { value: 'bug', label: 'Bug' },
  { value: 'non_functioning', label: 'Non-functioning' },
  { value: 'critical', label: 'Critical error' },
  { value: 'feature_request', label: 'Feature request' },
];

const EMPTY_FORM = { type: 'bug', description: '', expectedBehavior: '', currentBehavior: '', urgent: false };

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Mounted once in CmsLayout and CommerceLayout so it persists across every
// nested route in both admin areas. `area` distinguishes which admin the
// report came from (see server.js's /api/feedback).
export default function FeedbackWidget({ area }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // The form opens immediately — screenshot capture runs in the background
  // and never blocks it. modern-screenshot renders via an SVG <foreignObject>
  // and lets the browser's own engine rasterize it, rather than html2canvas's
  // approach of re-implementing CSS parsing/painting from scratch — the
  // latter predates (and can't parse) Tailwind v4's oklch() color palette,
  // which is why the first version of this used a hard timeout as a
  // safety net. Kept here too, since any capture library can still stall.
  const openWidget = () => {
    setOpen(true);
    setError('');
    setCapturing(true);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 6000));
    Promise.race([domToPng(document.body), timeout])
      .then((dataUrl) => setScreenshot(dataUrl))
      .catch((err) => {
        console.warn('Feedback screenshot capture failed:', err);
        setScreenshot(null); // best-effort — submission still works without it
      })
      .finally(() => setCapturing(false));
  };

  // Auto-dismiss 3s after a successful submit — the countdown bar in the
  // JSX below is a pure-CSS animation (`animate-countdown`) timed to match.
  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(closeWidget, 3000);
    return () => clearTimeout(timer);
  }, [submitted]);

  const closeWidget = () => {
    setOpen(false);
    setSubmitted(false);
    setForm(EMPTY_FORM);
    setImages([]);
    setScreenshot(null);
  };

  const addImages = async (e) => {
    const files = Array.from(e.target.files || []);
    const encoded = await Promise.all(files.map(async (f) => ({ mimeType: f.type, dataBase64: await fileToBase64(f) })));
    setImages((prev) => [...prev, ...encoded]);
    e.target.value = '';
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await submitFeedback({
        ...form,
        area,
        path: location.pathname,
        screenshotBase64: screenshot ? screenshot.split(',')[1] : null,
        images,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={openWidget}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white bg-gradient-to-tr from-glass-indigo to-glass-fuchsia shadow-lg shadow-glass-fuchsia/30 hover:brightness-110 active:scale-95 transition"
      >
        <MessageSquarePlus className="w-4 h-4" />
        Feedback
      </button>
    );
  }

  return (
    <GlassPanel className="fixed bottom-6 right-4 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-96 max-h-[80vh] overflow-auto p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium text-zinc-100">{submitted ? 'Thanks!' : 'Report an issue'}</h3>
        <button onClick={closeWidget} className="text-zinc-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {submitted ? (
        <>
          <p className="text-sm text-zinc-400">Your report was filed as a ticket in Feedback for the team to triage.</p>
          <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-glass-indigo to-glass-fuchsia animate-countdown" />
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {screenshot && (
            <img src={screenshot} alt="Auto-captured screenshot" className="w-full rounded-lg border border-white/10" />
          )}
          <p className="text-xs text-zinc-500">
            {capturing
              ? 'Capturing screenshot in the background…'
              : screenshot
                ? 'Screenshot auto-captured ✓'
                : "Couldn't auto-capture a screenshot — you can still submit, or attach your own below."}
          </p>

          <label className="text-xs text-zinc-400 block">Type</label>
          <GlassSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full">
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </GlassSelect>

          <label className="text-xs text-zinc-400 block">Description</label>
          <GlassTextarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full" />

          <label className="text-xs text-zinc-400 block">Expected behavior</label>
          <GlassTextarea value={form.expectedBehavior} onChange={(e) => setForm({ ...form, expectedBehavior: e.target.value })} rows={2} className="w-full" />

          <label className="text-xs text-zinc-400 block">Current behavior</label>
          <GlassTextarea value={form.currentBehavior} onChange={(e) => setForm({ ...form, currentBehavior: e.target.value })} rows={2} className="w-full" />

          <label className="text-xs text-zinc-400 block">Additional images</label>
          <input type="file" accept="image/*" multiple onChange={addImages} className="text-xs text-zinc-400" />
          {images.length > 0 && <p className="text-xs text-zinc-500">{images.length} image(s) attached</p>}

          <label className="flex items-center gap-2 text-sm text-zinc-300 pt-1">
            <input type="checkbox" checked={form.urgent} onChange={(e) => setForm({ ...form, urgent: e.target.checked })} className="w-4 h-4" />
            Mark as urgent
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
          <GlassButton type="submit" disabled={submitting} className="w-full">{submitting ? 'Submitting…' : 'Submit report'}</GlassButton>
          <p className="text-[10px] text-zinc-600">Filed as {getViewer().email || 'anonymous'} from {location.pathname}</p>
        </form>
      )}
    </GlassPanel>
  );
}
