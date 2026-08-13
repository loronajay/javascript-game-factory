-- Per-game social graph: friends, friend requests, blocks, and profile badges.
--
-- Deliberately SEPARATE from the factory-wide relationships/messages tables. Two
-- players can be Tactical Arena friends without being factory friends, and vice
-- versa; nothing here reads or writes player_relationships or direct_messages.
-- The split is enforced by tests/architecture.test.mjs, not just by convention.
--
-- Every table is keyed by game_slug so a second cabinet can adopt this backend
-- without a migration. Only slugs on the db layer's allowlist are accepted.

create table if not exists game_friend_requests (
  id                   bigserial   primary key,
  game_slug            text        not null,
  requester_player_id  text        not null,
  recipient_player_id  text        not null,
  status               text        not null default 'pending'
                         check (status in ('pending','accepted','declined','canceled')),
  created_at           timestamptz not null default now(),
  responded_at         timestamptz,
  check (requester_player_id <> recipient_player_id)
);

-- At most one OUTSTANDING request per ordered pair. Resolved rows stay as history,
-- so this is a partial index rather than a table-level unique constraint.
create unique index if not exists game_friend_requests_pending_idx
  on game_friend_requests (game_slug, requester_player_id, recipient_player_id)
  where status = 'pending';

create index if not exists game_friend_requests_recipient_idx
  on game_friend_requests (game_slug, recipient_player_id, status);

create index if not exists game_friend_requests_requester_idx
  on game_friend_requests (game_slug, requester_player_id, status);

-- A friendship is stored once, with the pair in canonical sorted order
-- (player_id_a < player_id_b), so "are these two friends" is a single lookup and
-- a duplicate row is impossible.
create table if not exists game_friendships (
  game_slug    text        not null,
  player_id_a  text        not null,
  player_id_b  text        not null,
  created_at   timestamptz not null default now(),
  primary key (game_slug, player_id_a, player_id_b),
  check (player_id_a < player_id_b)
);

create index if not exists game_friendships_b_idx
  on game_friendships (game_slug, player_id_b);

-- Blocks are directional: the blocker's row hides and gates the blocked player.
-- Creating one also tears down any friendship/pending request between the two
-- (done in one transaction by the db layer, not by a trigger).
create table if not exists game_friend_blocks (
  game_slug          text        not null,
  blocker_player_id  text        not null,
  blocked_player_id  text        not null,
  created_at         timestamptz not null default now(),
  primary key (game_slug, blocker_player_id, blocked_player_id),
  check (blocker_player_id <> blocked_player_id)
);

create index if not exists game_friend_blocks_blocked_idx
  on game_friend_blocks (game_slug, blocked_player_id);

-- Explicitly AWARDED badges only. Badges that follow from something the account
-- already owns (the Fight Cancer donation badge, for example) are DERIVED at read
-- time from game_entitlements and are never written here -- that keeps them
-- tamper-proof and retroactive for anyone who already bought in.
create table if not exists game_player_badges (
  player_id   text        not null,
  game_slug   text        not null,
  badge_id    text        not null,
  source      text        not null default 'award',
  awarded_at  timestamptz not null default now(),
  primary key (player_id, game_slug, badge_id)
);

create index if not exists game_player_badges_lookup_idx
  on game_player_badges (game_slug, badge_id);
