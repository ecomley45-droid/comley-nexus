// The media library: upload, convert to WebP, list, edit metadata, delete.
//
// Extracted from server.js, which had grown past 1,500 lines of routing,
// auth, rendering, uploads and CSP in one file. Behaviour is unchanged: the
// handlers below are the same code, moved. Shared helpers arrive through
// `ctx` rather than closing over module scope, which is what makes the move
// possible without threading globals — the same pattern lib/collectionsRoutes.js
// already used.

// Storage buckets are managed directly through the Supabase client rather
// than the tenant-scoped storage layer, so this one module imports db().
import { db } from '../db.js';

export function registerMediaRoutes(app, ctx) {
  const { storage, requireOrg, requirePermission, requireSuperAdmin, auditFor, express } = ctx;


  // Media files live in a public Supabase Storage bucket, one folder per
  // org, with metadata rows in the existing `media` table. The bucket is
  // created lazily on first upload (service-role client can manage
  // buckets), so no manual Supabase setup step is needed.
  const MEDIA_BUCKET = 'media';
  const MEDIA_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  const MEDIA_MIME_ALLOWLIST = new Set([
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml',
    'application/pdf', 'video/mp4', 'video/webm', 'audio/mpeg',
    // 3D models: .glb (binary glTF) and .usdz (iOS AR / Quick Look).
    'model/gltf-binary', 'model/vnd.usdz+zip',
  ]);

  // Models run larger than images and are not re-encoded, so they get their
  // own ceiling. Kept modest on purpose: a web-facing model over this is one
  // nobody's phone will happily download, and the upload route's JSON body
  // limit has to cover the base64 inflation of whatever this allows.
  const MODEL_MIME = new Set(['model/gltf-binary', 'model/vnd.usdz+zip']);
  const MODEL_MAX_BYTES = 30 * 1024 * 1024; // 30 MB

  // Raster formats we transcode to WebP on upload for smaller, faster-loading
  // files. SVG (vector) and non-image types pass through untouched. GIFs are
  // converted with `animated: true` so multi-frame GIFs become animated WebP
  // rather than a single flattened frame. Conversion is best-effort: if sharp
  // is unavailable or a buffer won't decode, we fall back to the original
  // bytes so an upload never hard-fails on the optimization step.
  const WEBP_SOURCE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/avif']);

  // The widths a responsive <img> gets to choose from. Chosen to cover a
  // phone at 2x (400/800), a laptop (1200) and a wide or retina display
  // (1600) without generating a long tail nobody picks.
  const VARIANT_WIDTHS = [400, 800, 1200, 1600];

  async function toWebp(buffer, mimeType, name) {
    if (!WEBP_SOURCE_MIME.has(mimeType)) return null;
    try {
      const { default: sharp } = await import('sharp');
      const animated = mimeType === 'image/gif';
      const img = sharp(buffer, { animated });
      const meta = await img.metadata().catch(() => ({}));
      const out = await sharp(buffer, { animated }).webp({ quality: 82 }).toBuffer();
      const base = String(name).replace(/\.[^.]+$/, '');
      // An animated image's "height" is every frame stacked, so pageHeight is
      // the real one. Without this a 10-frame GIF reports a height 10x too
      // large and any width/height attribute derived from it is nonsense.
      const height = animated ? (meta.pageHeight || meta.height) : meta.height;
      return {
        buffer: out, mimeType: 'image/webp', name: `${base}.webp`,
        width: meta.width || null, height: height || null, animated,
      };
    } catch {
      return null;
    }
  }

  // Downscaled copies of an already-converted image.
  //
  // Only widths strictly below the source: upscaling invents detail and
  // charges bytes for it. Animated images are skipped -- resizing every
  // frame is slow and a decorative GIF is rarely the page's weight problem.
  async function buildVariants(buffer, mimeType, sourceWidth, animated) {
    if (animated || !sourceWidth || !WEBP_SOURCE_MIME.has(mimeType)) return [];
    const wanted = VARIANT_WIDTHS.filter((w) => w < sourceWidth);
    if (wanted.length === 0) return [];
    try {
      const { default: sharp } = await import('sharp');
      const out = [];
      for (const w of wanted) {
        const buf = await sharp(buffer).resize({ width: w }).webp({ quality: 80 }).toBuffer();
        out.push({ w, buffer: buf });
      }
      return out;
    } catch {
      // Best-effort, exactly like the WebP step: a failure here costs a
      // smaller image, never the upload.
      return [];
    }
  }

  let mediaBucketReady = false;
  async function ensureMediaBucket() {
    if (mediaBucketReady) return;
    // createBucket errors if it already exists -- that's fine, both paths
    // leave the bucket present.
    await db().storage.createBucket(MEDIA_BUCKET, { public: true }).catch(() => {});
    mediaBucketReady = true;
  }

  app.get('/api/media', requireOrg, async (req, res, next) => {
    try { res.json(await storage.media.list(req.org.id)); } catch (e) { next(e); }
  });

  app.post('/api/media', express.json({ limit: '44mb' }), requireOrg, requirePermission('media', 'edit'), async (req, res, next) => {
    try {
      const { name, mimeType, dataBase64, altText, description } = req.body || {};
      if (!name || !mimeType || !dataBase64) return res.status(400).json({ error: 'name, mimeType, and dataBase64 are required' });
      if (!MEDIA_MIME_ALLOWLIST.has(mimeType)) return res.status(400).json({ error: `File type ${mimeType} isn't supported.` });
      const buffer = Buffer.from(dataBase64, 'base64');
      if (buffer.length === 0) return res.status(400).json({ error: 'Empty file' });
      const maxBytes = MODEL_MIME.has(mimeType) ? MODEL_MAX_BYTES : MEDIA_MAX_BYTES;
      if (buffer.length > maxBytes) {
        return res.status(400).json({ error: MODEL_MIME.has(mimeType) ? '3D models must be 30 MB or smaller.' : 'Files must be 10 MB or smaller.' });
      }

      // Auto-optimize raster images to WebP before storage. Non-convertible
      // types (SVG, PDF, video, audio) keep their original bytes/name/mime.
      let outName = String(name).slice(0, 200);
      let outMime = mimeType;
      let outBuffer = buffer;
      let outWidth = null;
      let outHeight = null;
      let animated = false;
      const converted = await toWebp(buffer, mimeType, name);
      if (converted) {
        outBuffer = converted.buffer;
        outMime = converted.mimeType;
        outName = String(converted.name).slice(0, 200);
        outWidth = converted.width;
        outHeight = converted.height;
        animated = converted.animated;
      }

      await ensureMediaBucket();
      const id = 'media-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
      const safeName = outName.replace(/[^\w.\-]+/g, '_').slice(0, 120);
      const storagePath = `${req.org.id}/${id}-${safeName}`;

      const { error: uploadError } = await db().storage.from(MEDIA_BUCKET)
        .upload(storagePath, outBuffer, { contentType: outMime, cacheControl: '31536000' });
      if (uploadError) return res.status(500).json({ error: 'Upload failed. Please try again or contact support.' });

      const { data: pub } = db().storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);

      // Variants ride alongside the original under the same id, so deleting
      // the row can find them by prefix. A failed variant upload is dropped
      // rather than retried -- the full-size image is already stored and
      // usable, and a missing srcset entry degrades to the plain src.
      const variants = [];
      for (const v of await buildVariants(buffer, mimeType, outWidth, animated)) {
        const path = `${req.org.id}/${id}-${v.w}w-${safeName}`;
        const { error } = await db().storage.from(MEDIA_BUCKET)
          .upload(path, v.buffer, { contentType: 'image/webp', cacheControl: '31536000' });
        if (error) continue;
        variants.push({ w: v.w, url: db().storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl });
      }

      const entry = await storage.media.add(req.org.id, {
        id, name: outName, filename: storagePath,
        mimeType: outMime, size: outBuffer.length, url: pub.publicUrl,
        variants, width: outWidth, height: outHeight,
        altText: typeof altText === 'string' ? altText.slice(0, 500) : '',
        description: typeof description === 'string' ? description.slice(0, 2000) : '',
      });
      await auditFor(req.org.id, req.viewer)('Uploaded media', `${entry.name} (${(outBuffer.length / 1024).toFixed(0)} KB)`);
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  // Rename / edit metadata (alt text, description). Storage-managed fields
  // (the actual bytes, url, mime, size) are never touched here.
  app.patch('/api/media/:id', express.json({ limit: '64kb' }), requireOrg, requirePermission('media', 'edit'), async (req, res, next) => {
    try {
      const { name, altText, description } = req.body || {};
      const patch = {};
      if (name !== undefined) patch.name = name;
      if (altText !== undefined) patch.altText = altText;
      if (description !== undefined) patch.description = description;
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update' });
      const entry = await storage.media.update(req.org.id, req.params.id, patch);
      if (!entry) return res.status(404).json({ error: 'File not found' });
      await auditFor(req.org.id, req.viewer)('Edited media', entry.name);
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  app.delete('/api/media/:id', requireOrg, requirePermission('media', 'edit', 'delete'), async (req, res, next) => {
    try {
      const removed = await storage.media.remove(req.org.id, req.params.id);
      if (!removed) return res.status(404).json({ error: 'File not found' });
      if (removed.filename) {
        await db().storage.from(MEDIA_BUCKET).remove([removed.filename]).catch(() => {});
      }
      await auditFor(req.org.id, req.viewer)('Deleted media', removed.name || req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // ---- Nexus's own media library (super-admin only) ----
  // Same bucket, WebP conversion, and limits as the per-org routes above, but
  // gated by requireSuperAdmin and stored under a `nexus/` folder with rows in
  // the standalone `nexus_media` table (see lib/nexus.js). No org context.
  app.get('/api/nexus/media', requireSuperAdmin, async (req, res, next) => {
    try { res.json(await nexus.media.list()); } catch (e) { next(e); }
  });

  app.post('/api/nexus/media', express.json({ limit: '44mb' }), requireSuperAdmin, async (req, res, next) => {
    try {
      const { name, mimeType, dataBase64, altText, description } = req.body || {};
      if (!name || !mimeType || !dataBase64) return res.status(400).json({ error: 'name, mimeType, and dataBase64 are required' });
      if (!MEDIA_MIME_ALLOWLIST.has(mimeType)) return res.status(400).json({ error: `File type ${mimeType} isn't supported.` });
      const buffer = Buffer.from(dataBase64, 'base64');
      if (buffer.length === 0) return res.status(400).json({ error: 'Empty file' });
      const maxBytes = MODEL_MIME.has(mimeType) ? MODEL_MAX_BYTES : MEDIA_MAX_BYTES;
      if (buffer.length > maxBytes) {
        return res.status(400).json({ error: MODEL_MIME.has(mimeType) ? '3D models must be 30 MB or smaller.' : 'Files must be 10 MB or smaller.' });
      }

      let outName = String(name).slice(0, 200);
      let outMime = mimeType;
      let outBuffer = buffer;
      let outWidth = null;
      let outHeight = null;
      let animated = false;
      const converted = await toWebp(buffer, mimeType, name);
      if (converted) {
        outBuffer = converted.buffer;
        outMime = converted.mimeType;
        outName = String(converted.name).slice(0, 200);
        outWidth = converted.width;
        outHeight = converted.height;
        animated = converted.animated;
      }

      await ensureMediaBucket();
      const id = 'nmedia-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
      const safeName = outName.replace(/[^\w.\-]+/g, '_').slice(0, 120);
      const storagePath = `nexus/${id}-${safeName}`;

      const { error: uploadError } = await db().storage.from(MEDIA_BUCKET)
        .upload(storagePath, outBuffer, { contentType: outMime, cacheControl: '31536000' });
      if (uploadError) return res.status(500).json({ error: 'Upload failed. Please try again or contact support.' });

      const { data: pub } = db().storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);

      const variants = [];
      for (const v of await buildVariants(buffer, mimeType, outWidth, animated)) {
        const path = `nexus/${id}-${v.w}w-${safeName}`;
        const { error } = await db().storage.from(MEDIA_BUCKET)
          .upload(path, v.buffer, { contentType: 'image/webp', cacheControl: '31536000' });
        if (error) continue;
        variants.push({ w: v.w, url: db().storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl });
      }

      const entry = await nexus.media.add({
        id, name: outName, filename: storagePath,
        mimeType: outMime, size: outBuffer.length, url: pub.publicUrl,
        variants, width: outWidth, height: outHeight,
        altText: typeof altText === 'string' ? altText.slice(0, 500) : '',
        description: typeof description === 'string' ? description.slice(0, 2000) : '',
      });
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  app.patch('/api/nexus/media/:id', express.json({ limit: '64kb' }), requireSuperAdmin, async (req, res, next) => {
    try {
      const { name, altText, description } = req.body || {};
      const patch = {};
      if (name !== undefined) patch.name = name;
      if (altText !== undefined) patch.altText = altText;
      if (description !== undefined) patch.description = description;
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update' });
      const entry = await nexus.media.update(req.params.id, patch);
      if (!entry) return res.status(404).json({ error: 'File not found' });
      res.json({ success: true, entry });
    } catch (e) { next(e); }
  });

  app.delete('/api/nexus/media/:id', requireSuperAdmin, async (req, res, next) => {
    try {
      const removed = await nexus.media.remove(req.params.id);
      if (!removed) return res.status(404).json({ error: 'File not found' });
      if (removed.filename) {
        await db().storage.from(MEDIA_BUCKET).remove([removed.filename]).catch(() => {});
      }
      res.json({ success: true });
    } catch (e) { next(e); }
  });

}
