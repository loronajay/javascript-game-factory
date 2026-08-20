-- Align durable Yam Bowling progression with the redesigned client ladders.
-- Player Level now owns every account-wide reward; Bowler Mastery contains only
-- bowler-specific identity. Existing entitlements are never revoked, but every
-- account already beyond a moved threshold must receive the current reward.
--
-- Draws were previously collapsed into `matches - wins` by consumers because
-- the XP track had no explicit counter. Historical casual draws cannot be
-- reconstructed safely, so the new column starts at zero and records all future
-- sanctioned draws independently.

alter table game_xp_tracks
  add column if not exists draws integer not null default 0 check (draws >= 0);

insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  profiles.player_id,
  profiles.game_slug,
  reward.entitlement_id,
  reward.kind,
  'player-level',
  'backfill-045'
from game_xp_profiles profiles
join (values
  ('ball-trail:lime-shock', 'ball-trail', 400),
  ('strike-burst:lime-pop', 'strike-burst', 400),
  ('ball-trail:red-neon', 'ball-trail', 950),
  ('strike-burst:red-supernova', 'strike-burst', 950),
  ('title:lane-regular', 'title', 1650),
  ('ball-trail:emerald-glow', 'ball-trail', 2500),
  ('strike-burst:emerald-impact', 'strike-burst', 2500),
  ('ball-trail:orange-flare', 'ball-trail', 3500),
  ('strike-burst:ember', 'strike-burst', 3500),
  ('emote:game-face', 'emote', 4650),
  ('ball-trail:mint-frost', 'ball-trail', 5950),
  ('strike-burst:mint-crackle', 'strike-burst', 5950),
  ('room:fireside-lodge', 'room', 7400),
  ('entrance:spotlight', 'entrance', 9000),
  ('ball-trail:cyan-pulse', 'ball-trail', 10750),
  ('strike-burst:cyan-flash', 'strike-burst', 10750),
  ('ball-trail:sky-blue', 'ball-trail', 12650),
  ('strike-burst:sky-shatter', 'strike-burst', 12650),
  ('title:house-favourite', 'title', 14700),
  ('title:pocket-hunter', 'title', 14700),
  ('ball-trail:electric-blue', 'ball-trail', 16900),
  ('strike-burst:electric-blue', 'strike-burst', 16900),
  ('ball-trail:gold-rush', 'ball-trail', 19250),
  ('strike-burst:gold-star', 'strike-burst', 19250),
  ('room:desert-vista', 'room', 21750),
  ('ball-trail:indigo-drive', 'ball-trail', 24400),
  ('strike-burst:indigo-ring', 'strike-burst', 24400),
  ('ball-trail:rose-gold', 'ball-trail', 27200),
  ('strike-burst:rose-gold', 'strike-burst', 27200),
  ('title:lane-veteran', 'title', 30150),
  ('title:pin-chaser', 'title', 30150),
  ('ball-trail:violet-haze', 'ball-trail', 33250),
  ('strike-burst:violet-bloom', 'strike-burst', 33250),
  ('ball-trail:diamond-white', 'ball-trail', 36500),
  ('strike-burst:diamond-spark', 'strike-burst', 36500),
  ('title:lane-reader', 'title', 39900),
  ('ball-trail:purple-plasma', 'ball-trail', 43450),
  ('strike-burst:purple-nova', 'strike-burst', 43450),
  ('room:deep-sea-suite', 'room', 47150),
  ('entrance:champion', 'entrance', 47150),
  ('ball-trail:magenta-pop', 'ball-trail', 55000),
  ('strike-burst:magenta-blast', 'strike-burst', 55000),
  ('ball-trail:perfect-line', 'ball-trail', 59150),
  ('ball-trail:hot-pink', 'ball-trail', 63450),
  ('strike-burst:hot-pink-pop', 'strike-burst', 63450),
  ('title:shotmaker', 'title', 63450),
  ('ball-trail:eclipse', 'ball-trail', 67900),
  ('strike-burst:eclipse-corona', 'strike-burst', 67900),
  ('title:yam-legend', 'title', 72500)
) as reward(entitlement_id, kind, min_xp)
  on profiles.xp >= reward.min_xp
where profiles.game_slug = 'yam-bowling'
on conflict (player_id, game_slug, entitlement_id) do nothing;

-- Reconcile each bowler independently. Every id contains the track slug, so a
-- qualifying Reina track cannot unlock Daisy's mastery identity.
insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  tracks.player_id,
  tracks.game_slug,
  replace(reward.entitlement_id, '{track}', tracks.track_id),
  reward.kind,
  'bowler-level',
  'backfill-045'
from game_xp_tracks tracks
join (values
  ('profile-icon:{track}:canon', 'profile-icon', 500),
  ('victory-pose:{track}:spotlight', 'victory-pose', 1400),
  ('player-card:{track}:rivalry', 'player-card', 4400),
  ('player-card:{track}:signature', 'player-card', 7700),
  ('victory-pose:{track}:champion', 'victory-pose', 17000),
  ('player-card:{track}:elite', 'player-card', 29900),
  ('title:{track}:nameplate', 'title', 43400),
  ('title:{track}:master', 'title', 46400)
) as reward(entitlement_id, kind, min_xp)
  on tracks.xp >= reward.min_xp
where tracks.game_slug = 'yam-bowling'
on conflict (player_id, game_slug, entitlement_id) do nothing;
