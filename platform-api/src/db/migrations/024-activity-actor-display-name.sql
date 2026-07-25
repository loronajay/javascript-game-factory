-- The activity write/read code has always selected and inserted
-- `actor_display_name`, but no migration ever created the column, so every
-- insert fell into the legacy-schema fallback and the feed stayed empty.
alter table activity_items
  add column if not exists actor_display_name text not null default '';
