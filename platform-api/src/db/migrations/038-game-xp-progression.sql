-- Per-game experience and mastery progression.
--
-- NOT the same thing as 019-game-progression.sql despite the name collision.
-- That one owns *entitlements* — spendable Valor, owned items, campaign clears.
-- This one owns *earned advancement*: XP totals and the per-track counters a
-- mastery level is derived from. Keeping them apart is deliberate: an
-- entitlement is granted and then spent, an XP total only ever accumulates, and
-- one table doing both would need every reader to know which of its rows mean
-- which. `game_xp_*` is the prefix for this half.
--
-- Generic on game_slug, exactly like game_loadouts (035) and game_run_records
-- (036). A cabinet onboards by adding an entry to services/progression-catalog,
-- not by touching schema or route code. `track_id` is deliberately not called
-- `character_id` — for Yam Bowling a track is a bowler, but for another cabinet
-- it is a car or a unit, and the table has no reason to care.
--
-- A LEVEL IS NOT STORED, ANYWHERE. It is derived from `xp` through the curve in
-- the catalog. A stored level disagrees with the curve the moment the curve is
-- retuned, and nothing afterwards can tell which of the two is wrong.

-- The account-wide track: overall participation in one cabinet.
create table if not exists game_xp_profiles (
  player_id  text        not null,
  game_slug  text        not null,
  -- bigint rather than int: a total that only ever accumulates has no ceiling
  -- the way a rating or a balance does, and a wrap here would be silent.
  xp         bigint      not null default 0 check (xp >= 0),
  matches    int         not null default 0 check (matches >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, game_slug)
);

-- The per-track record: mastery of one bowler/car/unit.
create table if not exists game_xp_tracks (
  player_id  text        not null,
  game_slug  text        not null,
  track_id   text        not null,
  xp         bigint      not null default 0 check (xp >= 0),
  matches    int         not null default 0 check (matches >= 0),
  wins       int         not null default 0 check (wins >= 0),
  -- Per-game extras (Yam Bowling: strikes, highGame). jsonb rather than columns
  -- because the set differs per cabinet and nothing queries inside it — these are
  -- read whole to render a mastery panel. How each key merges on a grant (sum vs
  -- max) is declared in the catalog's `trackStats`, which is also the only place
  -- that knows a high game is a high-water mark rather than a running total.
  stats      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, game_slug, track_id)
);

-- The grant ledger: what was awarded, once, for which authoritative event.
--
-- PER PLAYER, not per match. game_rating_sessions (018) is keyed by session
-- alone because an ELO update settles BOTH players in one transaction — it must
-- happen exactly once no matter who reports it. XP is the opposite: each player
-- earns their own, from their own bowler, and files their own report. Keying
-- this by (player, game, grant) is what lets the second reporter of a match
-- still be paid while neither can be paid twice.
--
-- It is also the audit trail. `xp` and `source` are stored as granted so a later
-- economy retune can be reasoned about against what was actually paid, rather
-- than recomputed from curves that have since moved.
create table if not exists game_xp_grants (
  player_id  text        not null,
  game_slug  text        not null,
  -- The authoritative event id. For an online match this is the same session id
  -- game_rating_sessions dedups on, which is why a rematch is automatically a
  -- new grant and a reconnect is not.
  grant_id   text        not null,
  track_id   text        not null,
  xp         int         not null check (xp >= 0),
  -- 'online-match' today; campaign clears land here later under their own value.
  source     text        not null,
  granted_at timestamptz not null default now(),
  primary key (player_id, game_slug, grant_id)
);

-- Serves the "recent grants" tail the client reads to settle its pending queue.
-- The primary key leads on player_id but cannot order by time, and the client
-- wants the newest N rather than all of them.
create index if not exists game_xp_grants_recent_idx
  on game_xp_grants (player_id, game_slug, granted_at desc);

-- WHAT THE SERVER CAN AND CANNOT CHECK, recorded here because it decides how far
-- these numbers can be trusted.
--
-- The server derives every XP amount from the catalog; a client never names one.
-- What a client does report is which mode it played, which bowler it used, and a
-- performance count. Of those:
--
--   mode_id      CHECKABLE, and checked. Stamped on the rating session by the
--                first reporter. When a later reporter claims a different mode
--                for the same session, both are paid the LESSER of the two
--                payouts rather than the claim being refused. Refusing would
--                have handed a griefer a way to deny an honest opponent's XP by
--                reporting an inflated mode first; clamping instead means the
--                honest player is paid what they actually played and the
--                inflated claim earns nothing extra. One honest participant is
--                therefore enough to make mode inflation pointless.
--   track_id     Unchecked, and low stakes: it decides which bowler receives the
--                XP, not how much of it there is.
--   performance  Unchecked, but hard-capped by the catalog, so the whole exposure
--                is maxPerformanceXp on a match that really was played.
--
-- The unchecked residue is a player self-reporting a match against a real signed-in
-- opponent — the same trust the ELO report at POST /ratings/:slug already carries.
-- Closing it needs factory-network-server to attest results over a shared secret,
-- which is a scoped upgrade this schema does not have to change for: the attester
-- would write these same rows with the same grant ids.
alter table game_rating_sessions add column if not exists mode_id text;
