-- Bulletin attachments: one image per announcement (a tournament flyer, a patch banner).
--
-- Same shape as 012-thought-image.sql — a plain URL column with an empty-string default,
-- not a join to player_photos. A bulletin image is platform-authored content that belongs
-- to the announcement, not to anyone's gallery, and giving it its own table would mean a
-- second lifecycle to keep in sync for no gain. Empty string means "no attachment", which
-- keeps every existing row valid without a backfill.
alter table bulletins add column if not exists image_url text not null default '';
