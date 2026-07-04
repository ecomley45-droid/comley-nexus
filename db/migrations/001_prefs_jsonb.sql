-- Simplify user_preferences to a single JSONB blob. The ops code stores a
-- dozen identity/schedule/settings fields per user and merging column-by-
-- column here doesn't buy anything the JSONB shallow-merge doesn't already
-- give us. Idempotent — safe to re-run.

alter table user_preferences
  add column if not exists prefs jsonb not null default '{}';

-- Backfill: fold the old columns into `prefs` for any existing rows.
update user_preferences
   set prefs = jsonb_build_object(
     'view_mode', view_mode,
     'detail_mode', detail_mode,
     'schedule_layout', schedule_layout,
     'integrations', integrations,
     'ai_settings', ai_settings
   ) || prefs
 where prefs = '{}'::jsonb;

-- We keep the old columns around for now (removing them requires ensuring
-- no code path still reads them). A follow-up migration can drop them.
