import { useEffect, useRef, useState } from 'react';
import { segmentPage } from './segment.js';
import { renderBlock } from './blockRenderers.js';
import { classifyBlock } from '../api.js';
import { GlassPanel, GlassButton, GlassTextarea, GlassSelect } from '../ui/Glass.jsx';

// "Paste in" import: paste HTML copied from elsewhere, render it in a
// hidden sandboxed iframe (so any scripts it depends on actually run --
// segment.js needs a post-JS document, not the raw paste), segment it into
// top-level blocks, classify each one, and let the user review/override
// before appending chosen blocks as new sections on the current page.
//
// The iframe is sandboxed with `allow-scripts` only (no `allow-same-origin`)
// so pasted markup can never read cookies/storage or reach the parent page --
// it can only mutate its own throwaway document, which is exactly what
// segment.js's runtime-injection detection is built to still capture.

const TYPE_OPTIONS = [
  'header', 'navigation', 'hero', 'card-grid', 'scrolling-cards', 'list',
  'feature', 'cta', 'form', 'content', 'footer', 'unknown',
];

const CONFIDENCE_THRESHOLD = 0.5;

const titleCase = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// "unknown" is more than a classifier miss -- it's the deliberate escape
// hatch for keeping a block's original markup verbatim. Every other type
// re-skins the block via blockRenderers.js (fields only, no classes/styles);
// picking this one imports b.el.outerHTML as-is instead (see confirmImport),
// classes/inline styles/<style> tags and all.
const typeLabel = (t) => (t === 'unknown' ? 'Custom (keep original HTML)' : titleCase(t));

function wrapIfFragment(html) {
  return /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

export default function PasteInModal({ onClose, onImport }) {
  const [step, setStep] = useState('paste'); // paste | segmenting | reviewing
  const [rawHtml, setRawHtml] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [blocks, setBlocks] = useState([]); // { key, blockType, confidence, reason, flags, fields, el, include, classifying }
  const [error, setError] = useState('');
  const iframeRef = useRef(null);

  useEffect(() => () => {
    // Cleanup: detach the offscreen iframe if the modal closes mid-flow.
    // block.el references stay usable (detached DOM nodes still respond
    // to outerHTML/querySelector) so this doesn't affect review/import.
    if (iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }
  }, []);

  const runSegmentation = async () => {
    if (!rawHtml.trim()) return;
    setError('');
    setStep('segmenting');
    try {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:1280px; height:2000px; opacity:0; pointer-events:none;';
      document.body.appendChild(iframe);
      iframeRef.current = iframe;

      await new Promise((resolve, reject) => {
        iframe.addEventListener('load', resolve, { once: true });
        iframe.addEventListener('error', () => reject(new Error('Failed to render pasted HTML')), { once: true });
        iframe.srcdoc = wrapIfFragment(rawHtml);
      });
      // Let any scripts in the paste finish mutating the DOM before we read it.
      await new Promise((r) => setTimeout(r, 300));

      const doc = iframe.contentDocument;
      if (!doc) throw new Error('Could not access the rendered document (sandboxed iframe blocked access).');

      const result = segmentPage(doc);
      setWarnings(result.warnings);

      // Detach the iframe now -- block.el nodes stay fully usable (outerHTML,
      // querySelector, textContent) once detached, they just lose live layout
      // info, which segmentPage() already consumed synchronously above.
      iframe.remove();
      iframeRef.current = null;

      const initial = result.blocks.map((b, i) => ({
        key: `block-${i}`,
        blockType: b.type.name,
        confidence: b.confidence,
        reason: '',
        flags: b.confidence === 0 ? ['low-confidence'] : [],
        fields: b.fields,
        el: b.el,
        include: b.type.name !== 'navigation', // nav is usually already covered by the header
        classifying: b.confidence < CONFIDENCE_THRESHOLD,
      }));
      setBlocks(initial);
      setStep('reviewing');

      // Kick off AI classification in the background for low-confidence blocks
      // -- doesn't block showing the review list for everything else.
      initial.filter((b) => b.classifying).forEach((b) => classifyLowConfidenceBlock(b.key, b.el));
    } catch (e) {
      setError(e.message);
      setStep('paste');
    }
  };

  const classifyLowConfidenceBlock = async (key, el) => {
    try {
      const result = await classifyBlock(el.outerHTML);
      setBlocks((prev) => prev.map((b) => (b.key !== key ? b : {
        ...b,
        blockType: result.type,
        confidence: result.confidence,
        reason: result.reason,
        flags: result.flags || [],
        // AI-supplied fields win when present; fall back to the deterministic
        // extraction (headings/text/images/links) so nothing is lost.
        fields: { ...b.fields, ...result.fields },
        classifying: false,
      })));
    } catch (e) {
      setBlocks((prev) => prev.map((b) => (b.key !== key ? b : { ...b, classifying: false, reason: e.message, flags: [...b.flags, 'api-error'] })));
    }
  };

  const updateBlock = (key, patch) => setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const confirmImport = () => {
    const sections = blocks
      .filter((b) => b.include)
      .map((b, i) => {
        const html = renderBlock(b.blockType, b.fields) || b.el.outerHTML;
        return {
          id: `sec-${Date.now()}-${i}`,
          name: titleCase(b.blockType === 'unknown' ? 'content' : b.blockType),
          blockType: b.blockType === 'unknown' ? undefined : b.blockType,
          fields: b.blockType === 'unknown' ? undefined : b.fields,
          html,
        };
      });
    onImport(sections);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-12 p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
        <GlassPanel className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-zinc-100">Paste in</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
          </div>

          {step === 'paste' && (
            <>
              <p className="text-xs text-zinc-500 mb-3">
                Paste HTML copied from another page. It's rendered offscreen in a
                sandboxed frame (no access to this app or your cookies) so
                scripts that fill in content can run before we segment it.
              </p>
              <GlassTextarea
                value={rawHtml}
                onChange={(e) => setRawHtml(e.target.value)}
                rows={12}
                placeholder="<header>...</header><section>...</section>..."
                className="w-full mb-3"
              />
              {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
              <div className="flex justify-end gap-2">
                <GlassButton variant="secondary" onClick={onClose}>Cancel</GlassButton>
                <GlassButton onClick={runSegmentation} disabled={!rawHtml.trim()}>Segment</GlassButton>
              </div>
            </>
          )}

          {step === 'segmenting' && (
            <p className="text-sm text-zinc-400 py-8 text-center">Rendering and segmenting…</p>
          )}

          {step === 'reviewing' && (
            <>
              {warnings.length > 0 && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 mb-3 text-xs text-amber-300 space-y-1">
                  {warnings.map((w, i) => <p key={i}>⚠ {w.msg}</p>)}
                </div>
              )}
              <p className="text-xs text-zinc-500 mb-3">
                {blocks.length} block{blocks.length === 1 ? '' : 's'} found. Uncheck any you don't want, override
                the guessed type if needed, then import. Classified blocks get re-skinned in
                Nexus's own plain CSS — pick "Custom (keep original HTML)" on a block to
                import its original markup as-is instead. Either way, add plain CSS rules
                after import via a block's Custom CSS field or Design &gt; Custom CSS —
                Tailwind utility classes from the source page won't render here since
                Tailwind isn't compiled for pasted-in content.
              </p>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto mb-4">
                {blocks.map((b) => (
                  <GlassPanel key={b.key} className="p-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={b.include}
                        onChange={(e) => updateBlock(b.key, { include: e.target.checked })}
                        className="mt-1.5 w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <GlassSelect
                            value={b.blockType}
                            onChange={(e) => updateBlock(b.key, { blockType: e.target.value })}
                            className="text-xs py-1"
                          >
                            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
                          </GlassSelect>
                          {b.classifying && <span className="text-xs text-zinc-500">Classifying…</span>}
                          {!b.classifying && b.confidence < CONFIDENCE_THRESHOLD && (
                            <span className="text-xs text-amber-400">low confidence{b.reason ? `: ${b.reason}` : ''}</span>
                          )}
                          {b.flags?.includes('empty-container') && <span className="text-xs text-red-400">empty container</span>}
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-2">
                          {(b.fields.headings || []).join(' · ') || (b.fields.text || [])[0] || '(no text found)'}
                        </p>
                      </div>
                    </div>
                  </GlassPanel>
                ))}
              </div>
              <div className="flex justify-between items-center">
                <GlassButton variant="secondary" onClick={() => setStep('paste')}>Back</GlassButton>
                <div className="flex gap-2">
                  <GlassButton variant="secondary" onClick={onClose}>Cancel</GlassButton>
                  <GlassButton onClick={confirmImport} disabled={!blocks.some((b) => b.include)}>
                    Import {blocks.filter((b) => b.include).length} block{blocks.filter((b) => b.include).length === 1 ? '' : 's'}
                  </GlassButton>
                </div>
              </div>
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
