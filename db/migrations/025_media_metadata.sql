-- Media metadata: alt text + long description, editable from the Media
-- library and surfaced (optionally) as captions when a piece of media is
-- placed in a page block. Both nullable/default '' so existing rows and
-- older uploads keep working with no backfill.
alter table media add column if not exists alt_text text not null default '';
alter table media add column if not exists description text not null default '';
