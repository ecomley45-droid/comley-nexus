-- Responsive image variants.
--
-- Uploads were already transcoded to WebP, which cuts bytes but not
-- dimensions: a 3000px photo from a phone camera was served at 3000px to a
-- 390px phone screen. The browser downloads every one of those pixels and
-- then throws most of them away. On a listing page with a dozen photos that
-- is the single largest thing on the wire.
--
-- So the upload now also writes downscaled copies, and the row records them.
-- `variants` is [{ "w": 400, "url": "..." }, ...] ascending, covering only
-- widths smaller than the original -- upscaling invents detail and costs
-- bytes to do it.
--
-- width/height are the intrinsic pixel dimensions of the stored image. They
-- exist so an <img> can carry width/height attributes and reserve its space
-- before the bytes arrive, which is what stops a page shifting under the
-- reader as images load.
--
-- All nullable: rows that predate this, and files with no dimensions to
-- speak of (SVG, PDF, audio, video), simply have none and fall back to a
-- plain src.

alter table media
  add column if not exists variants jsonb not null default '[]'::jsonb,
  add column if not exists width  integer,
  add column if not exists height integer;

-- Nexus's own media table mirrors the workspace one.
alter table nexus_media
  add column if not exists variants jsonb not null default '[]'::jsonb,
  add column if not exists width  integer,
  add column if not exists height integer;
