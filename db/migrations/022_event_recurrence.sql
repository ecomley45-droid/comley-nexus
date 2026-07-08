-- Recurring events. `recurrence` is 'none' | 'daily' | 'weekly' | 'monthly';
-- `recurrence_until` optionally bounds it. Occurrences are expanded at
-- display/feed time (see src/shared/eventsMap.js expandRecurring) and emitted
-- as RRULE in the iCal feed, so the base row stays a single editable rule.
--
-- Safe to re-run: IF NOT EXISTS.

alter table events add column if not exists recurrence text not null default 'none';
alter table events add column if not exists recurrence_until date;
