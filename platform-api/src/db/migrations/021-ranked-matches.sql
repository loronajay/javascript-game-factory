-- Server-brokered ranked matchmaking + match brokering + result attestation.
--
-- Ranked integrity model (Level 2): the server owns matchmaking, issues the match
-- token, and only accepts a result for a match it brokered, from a real member of
-- that match. ELO is applied only when BOTH members attest and their reports agree
-- (or one side self-concedes a loss, or a forfeit grace window elapses). This
-- replaces the older self-reported model where a single client could fabricate a
-- win. Actual ratings still live in game_ratings (migration 018).

-- One waiting/matched entry per player per ranked game.
create table if not exists ranked_queue (
  player_id    text        not null,
  game_slug    text        not null,
  rating       int         not null default 1200,
  status       text        not null default 'waiting', -- waiting | matched | cancelled
  match_id     text,
  enqueued_at  timestamptz not null default now(),
  primary key (player_id, game_slug)
);

-- One row per brokered ranked match. This is also the anti-cheat audit surface:
-- ratings before/after, attestations, flags, and pairing frequency are all derivable.
create table if not exists ranked_matches (
  match_id         text        not null,
  game_slug        text        not null,
  player_a         text        not null,
  player_b         text        not null,
  rating_a_before  int         not null,
  rating_b_before  int         not null,
  board            text        not null default '13x13',
  seed             text        not null,
  token            text        not null,
  lobby_code       text,                            -- relay room code, set by seat 1 so seat 2 can join (rendezvous)
  ban_first        text        not null,           -- player_id who bans first (gives up first pick)
  status           text        not null default 'active', -- active | pending_forfeit | resolved | disputed | voided
  report_a         text,                            -- a's attested outcome, a-perspective: win|loss|draw
  report_b         text,                            -- b's attested outcome, b-perspective
  outcome_a        text,                            -- resolved result, a-perspective
  rating_a_after   int,
  rating_b_after   int,
  flags            text,                            -- comma-separated anti-cheat flags
  forfeit_deadline timestamptz,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  primary key (match_id, game_slug)
);

create index if not exists ranked_queue_matchmaking
  on ranked_queue (game_slug, status, enqueued_at);

create index if not exists ranked_matches_pair
  on ranked_matches (game_slug, player_a, player_b, resolved_at);

create index if not exists ranked_matches_pending
  on ranked_matches (game_slug, status, forfeit_deadline);
