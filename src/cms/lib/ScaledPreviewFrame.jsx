import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Shared "device-accurate" preview. Every preview in the app used to set the
// iframe to width:100%, so a 500px-wide preview panel rendered the site AT
// 500px -- responsive breakpoints collapsed grids, columns stacked, and the
// thumbnail lied about what the real (desktop) site looks like.
//
// Instead this renders the content into an iframe sized to a fixed logical
// viewport (`baseWidth`, default 1440 -- a real desktop width) and then
// CSS-scales the whole iframe down to fit the container. What you see is a
// true-to-pixel miniature of the 1440px render, never a reflowed narrow one.
//
// Two height modes:
//   - crop (default): fixed display `height`; shows the top of the render.
//     Used for cards/thumbnails and sandboxed previews.
//   - autoHeight: measures the rendered content height (same-origin srcDoc
//     only) and sizes to the full scaled page. Used for the big detail/editor
//     previews. Falls back to `height` if measurement isn't possible.
//
// Scale is capped at 1 (never upscales -- a 390px mobile preview in a wide
// panel shows at real size, centered, not blurrily enlarged).
export default function ScaledPreviewFrame({
  srcDoc,
  baseWidth = 1440,
  height = 200,
  autoHeight = false,
  sandbox,
  interactive = false,
  center = true,
  bg = '#070a13',
  className = '',
}) {
  const wrapRef = useRef(null);
  const iframeRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-measure whenever the document changes.
  useEffect(() => { setContentHeight(null); }, [srcDoc]);

  const measure = () => {
    if (!autoHeight) return;
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) setContentHeight(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight));
    } catch { /* sandboxed / cross-origin -- keep the fixed-height fallback */ }
  };

  const scale = containerWidth ? Math.min(1, containerWidth / baseWidth) : 0;
  const scaledWidth = baseWidth * scale;
  const offsetX = center ? Math.max(0, (containerWidth - scaledWidth) / 2) : 0;

  // logical (pre-scale) iframe height, and the height the wrapper reserves.
  const logicalHeight = autoHeight && contentHeight
    ? contentHeight
    : Math.round(height / (scale || 1));
  const displayHeight = autoHeight && contentHeight
    ? Math.round(contentHeight * scale)
    : height;

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ width: '100%', height: displayHeight, overflow: 'hidden', position: 'relative', background: bg }}
    >
      {scale > 0 && (
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          sandbox={sandbox}
          onLoad={measure}
          title="preview"
          style={{
            width: baseWidth,
            height: logicalHeight,
            border: 0,
            transform: `translateX(${offsetX}px) scale(${scale})`,
            transformOrigin: '0 0',
            pointerEvents: interactive ? 'auto' : 'none',
          }}
          tabIndex={-1}
        />
      )}
    </div>
  );
}
