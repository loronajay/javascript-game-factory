-- Catalog redesign metadata. All fields remain nullable: NULL means inherit from
-- games/<slug>/game.json, exactly like the original cabinet override columns.
alter table cabinet_overrides add column if not exists description text;
alter table cabinet_overrides add column if not exists categories jsonb;
alter table cabinet_overrides add column if not exists dimensions jsonb;
alter table cabinet_overrides add column if not exists play_modes jsonb;
alter table cabinet_overrides add column if not exists preview_video text;
