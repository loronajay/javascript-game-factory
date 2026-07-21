# Ranked Feature Plan — Making Ranked a Legit Feature

Scope: turn the current thin ranked mode into a full competitive feature with a
**server-authoritative** ranked identity, per-unit stats, a viewable profile card,
and social wiring. No local-first state as source of truth — the local ranked-name
hack is retired in Phase 1.

Sources of truth for as-built behavior remain the code and tests; this doc is the
build plan and the durable design decisions behind it.

## Design decisions (locked)

1. **Server-authoritative, not local-first.** Ranked identity (name/title, avatar,
   stats) lives on the server keyed on the factory `playerId` + game slug.
   `localStorage` may be a read cache/offline fallback only, never the source of
   truth. This retires `rankedNameModel.js`'s local-only name.
2. **Both-sides-agree trust for per-unit stats.** Ranked matches are deterministic
   lockstep where both clients agree on a state hash, so the final board — who died,
   who dealt the killing blow — is mutually observable. Per-unit stats are credited
   **only when both members' reports agree**, mirroring the existing outcome
   attestation state machine. No blind self-report.
3. **Tactical Arena gets its own in-game ranked card**, with a link out to the
   player's factory `/player` profile. The card is game-owned and fast (no context
   switch); the factory profile stays the canonical identity one layer up.
4. **Reuse the factory social layer.** Friends and chat already exist as
   server-backed platform features (relationships/friendships + direct messages).
   Ranked *surfaces* and links into them — it does not build parallel game-local
   friends/chat systems.

## Current state (as-built)

- `game_ratings` (migration 018): `rating, wins, losses, draws, last_match_at` per
  `(player_id, game_slug)`. This is the rating authority.
- `ranked_matches` (migration 021): one row per brokered match — players, ratings
  before/after, board, seed, token, `ban_first`, status, `report_a/report_b`,
  `outcome_a`, flags, forfeit deadline. The anti-cheat audit surface. **No squad
  composition is stored, and the report carries only `win|loss|draw`.**
- Backend: `platform-api/src/db/ranked.mjs` (queue/pair/report/standing/lobby),
  `ranked-elo.mjs` (pure ELO + `decideReport` trust state machine),
  `routes/ranked-routes.mjs`. `getRankedStanding` is **me-only** (keyed on the
  caller's auth token); there is no "read another player's standing" path.
- Client: `js/platform/api/platform-api.mjs` exposes `enqueueRankedMatch`,
  `pollRankedMatch`, `cancelRankedMatch`, `reportRankedResult`, `setRankedLobby`,
  `fetchRankedStanding` — plus the full social surface already:
  `loadPlayerProfile`, `savePlayerProfile`, `loadPlayerRelationships`,
  `createFriendshipBetweenPlayers`, `removeFriend`, `searchPlayers` (DMs live in the
  separate platform messages client).
- Game UI: `src/ui/rankedProfile.js` (me-only modal: pilot name + local ranked name
  + server standing), `src/online/rankedFlow.js` (matchmaking loop),
  `src/ui/rankedNameModel.js` (local-only cosmetic name — **to be retired**).
- Avatar material already on disk: a portrait per unit at `assets/units/*.webp`, a
  `src/ui/portraits.js` helper, the Skins system (`skinModel.js`/`skinManifest`), and
  `src/progression/unlocks.js` as the owned-units/owned-skins authority.

---

## Phase 1 — Server-backed ranked identity (retire the local name)

**Status: shipped (code-complete + tests green). Remaining: live signed-in browser
QA of the title/avatar save round-trip against a running API.**

As-built notes (where the build refined the plan below):
- **Migration registry gap fixed.** `021-ranked-matches.sql` existed on disk but was
  never registered in `MIGRATION_FILES` (the whole ranked backend had only ever been
  applied to Railway by hand). Registered both `021` and the new `022` so a fresh
  migrate creates the ranked tables; both use `create table if not exists`, so
  re-running against the live DB is a no-op.
- **In-match name kept working via a write-through cache.** The old local ranked name
  also fed `onlineFlow.js`'s synchronous in-match name override. Rather than regress
  that to the pilot name before the Phase 3 nameplate lands, the server title is now
  authoritative and `rankedNameModel.js` is demoted to a synchronous local *cache*:
  saving a title mirrors it down via `saveRankedName`, and `onlineFlow.js` reads that
  cache unchanged. The proper in-band avatar+title nameplate exchange is still Phase 3.
- Avatar ownership is client-gated (v1): the picker only lists owned units (via
  `unlocks.js`) that have portrait art, plus each unit's owned skins. The server
  sanitizes ids but does not verify ownership.

Goal: name/title + avatar are stored server-side and readable by others. This alone
kills the local-hybrid mess and unblocks the "view profile after a match" card.

**Migration `022-ranked-identity.sql`**
```sql
create table if not exists ranked_profiles (
  player_id    text not null,
  game_slug    text not null,
  title        text,           -- "commander line" / tagline, ranked-specific
  avatar_unit  text,           -- unit type id, e.g. 'necromancer'
  avatar_skin  text,           -- optional skin id; null = base portrait
  updated_at   timestamptz not null default now(),
  primary key (player_id, game_slug)
);
```

**Backend**
- `db/ranked.mjs`: `getRankedProfile(pool, {playerId, gameSlug})`,
  `saveRankedProfile(pool, {playerId, gameSlug, title, avatarUnit, avatarSkin})`
  (validate/sanitize title length; avatar ids are opaque strings — ownership is a
  client concern, but reject absurd lengths server-side).
- Fold the profile fields into `getRankedStanding` so the me-view is one call.
- New public read: `getPublicRankedCard(pool, {playerId, gameSlug})` = standing
  (rating/tier/record) + profile (title/avatar), **without** leaking the live-match
  token or anything private.
- `routes/ranked-routes.mjs`:
  - `PUT /ranked/:slug/profile` → save my title/avatar (auth = me).
  - `GET /ranked/:slug/card/:playerId` → public card read.
  - `GET /ranked/:slug/standing` → now includes my profile fields.

**Client (`platform-api.mjs`)**: `saveRankedProfile(gameSlug, patch)`,
`fetchRankedCard(gameSlug, playerId)`; extend `fetchRankedStanding` shape.

**Game UI**
- Replace the local ranked-name field in `rankedProfile.js` with a server-backed
  **title** field (save via `saveRankedProfile`).
- Add an **avatar picker**: choose from owned units (`unlocks.js`) and their owned
  skins, rendered via `portraits.js`. Selection persists server-side.
- One-time migration: on first open, if a legacy local ranked name exists and no
  server title is set, push it up, then stop reading local.
- Retire `rankedNameModel.js` as a source of truth (keep only as a thin fallback for
  the offline/not-signed-in preview, or delete once the card handles that state).

**Tests**: `tests/ranked-profile-db` (save/read/sanitize), route-level card read
hides private fields, standing includes profile.

---

## Phase 2 — Per-unit stats + match history (both-sides-agree)

**Status: shipped (code-complete + tests green). Remaining: live two-client browser
verification that both clients derive an identical board (agreement credits, disagreement
flags) end-to-end.**

As-built notes:
- Migration `023-ranked-unit-stats.sql` (registered) adds `ranked_unit_stats` +
  `squad_a/squad_b/unit_report_a/unit_report_b` jsonb columns on `ranked_matches`.
- Pure agreement/aggregation logic lives in `db/ranked-unit-stats.mjs`
  (`normalizeUnitResults`, `unitReportsAgree`, `unitStatDeltas`, `normalizeSquad`) so
  it is fully headless-testable. The report is canonicalized (sorted by unit id) so
  agreement is order-independent, and both clients produce the identical board.
- Crediting is a side effect of the existing resolve path only: on resolve, if both
  `unit_report_*` are present AND agree → aggregate for both players (seat 1 = player_a);
  if present but disagree → credit nothing and flag `unit_report_conflict`; ELO is
  unchanged either way. A legacy client that omits the report still resolves normally.
- The `unitResults` contract (v1) is `{ units: [{ id, seat, type, alive, kills? }] }`
  derived on the client from authoritative final state via `buildRankedUnitReport` in
  `matchBuilder.js` (summoned Ghouls excluded). Per-unit `kills` defaults to 0 — the
  table + pipeline carry it, but killer attribution is deferred (open question below).
- New public reads: `GET /ranked/:slug/units/:playerId` and
  `GET /ranked/:slug/matches/:playerId`; clients `fetchRankedUnitStats` /
  `fetchRankedMatches`. Match rows are shaped to the caller's perspective (my outcome /
  rating delta / my vs opponent squad). The ranked-profile card now renders a unit-record
  grid + recent-match list.
- The report is sent from `matchOutcomeController` at victory alongside the existing
  win/loss attestation; it is NOT part of the online state hash (determinism preserved).

Goal: real, trustworthy per-unit records and a recent-match list.

**Migration `023-ranked-unit-stats.sql`**
```sql
create table if not exists ranked_unit_stats (
  player_id  text not null,
  game_slug  text not null,
  unit_type  text not null,
  games      int not null default 0,
  wins       int not null default 0,
  kills      int not null default 0,
  survivals  int not null default 0,   -- unit alive at match end
  primary key (player_id, game_slug, unit_type)
);
-- squads + per-unit results for history + agreement verification
alter table ranked_matches add column if not exists squad_a       jsonb;
alter table ranked_matches add column if not exists squad_b       jsonb;
alter table ranked_matches add column if not exists unit_report_a  jsonb;
alter table ranked_matches add column if not exists unit_report_b  jsonb;
```

**Extended report payload.** `reportRankedResult` gains an optional
`{ squad, unitResults }` where `unitResults` describes the shared final board (both
squads' per-unit alive/killer facts — both clients see everything in lockstep).
Backend stores each side's `unit_report_*`. When the match resolves *and* both
`unit_report_a`/`unit_report_b` are present and **agree**, aggregate into
`ranked_unit_stats` for both players; on disagreement, skip stat crediting and flag
the row (`unit_report_conflict`). ELO resolution is unchanged — unit-stat crediting
is a side effect of the existing `resolve` action only.

**Match history**: `GET /ranked/:slug/matches/:playerId` → recent resolved matches
(opponent, squads, outcome, rating delta, date). Client: `fetchRankedMatches`.

**Game UI**: unit-stats grid (portrait + games/win%/kills) and a recent-match list
on the ranked card.

**Tests**: agreement credits both, disagreement credits neither + flags; history
shape; determinism (unit report derived from authoritative state, never hashed).

---

## Phase 3 — Social wiring (reuse the platform)

**Status: post-match opponent card + activity-feed publish shipped (code-complete +
tests green). Remaining sub-item: the in-match nameplate (in-band avatar+title
exchange) — deferred as invasive + needing a live two-tab playtest to verify.**

As-built notes:
- **Post-match opponent card** (`src/ui/resultsOpponentCard.js`, extracted so
  `resultsScreen.js` stays under its architecture budget): a resolved online ranked
  duel now shows the opponent's ranked card via `fetchRankedCard` (title + tier +
  rating + record) with **View Profile** (`../../player/index.html?id=`), **Add Friend**
  (`createFriendshipBetweenPlayers`), and **Message** (`../../messages/index.html?player=`).
  Deep-links are built by `src/platform/factoryLinks.js` (pure, unit-tested). Actions
  disable gracefully for signed-out/offline players. (Rematch/re-queue was left to the
  existing menu flow rather than added to the card.)
- **Activity feed**: `buildTacticalArenaMatchActivity` + `publishTacticalArenaMatchActivity`
  added to the shared `js/platform/activity` layer (+ a `tactical-arena` shared-session
  branch, mirroring sumorai/battleshits). Published fire-and-forget from
  `matchOutcomeController` via a bound `publishActivity` on the ranked handoff (identity +
  opponent resolved in `onlineFlow`). Ranked handoff now also carries `opponentPlayerId`.
- **In-match nameplate (remaining)**: showing the opponent's ranked avatar + title in
  the battle HUD via an in-band exchange at match start (same channel as nicknames,
  kept out of the authoritative hash). Deferred: it touches online setup sync + HUD
  rendering and can only be trusted after a live two-client playtest.

Goal: ranked becomes social at the moments that matter, using existing platform APIs.

- **Post-match results screen** (`src/ui/resultsScreen.js` /
  `matchOutcomeController.js`): opponent ranked card (via `fetchRankedCard`) with
  **View Factory Profile** (deep-link `/player?id=…`), **Add Friend**
  (`createFriendshipBetweenPlayers`), **Message** (deep-link platform messages), and
  **Rematch**.
- **In-match nameplate**: show the opponent's ranked avatar + title. Exchange these
  in-band at match start the same way nicknames are already synced — **cosmetic,
  kept out of the authoritative state hash** (see determinism note).
- **Activity feed**: publish ranked results via `saveActivityItem` for discovery.

No new backend beyond what Phases 1–2 add; friends/DMs are platform-owned.

---

## Phase 4 — Longevity (legit ladder)

- **Leaderboard**: `GET /ranked/:slug/leaderboard` (top N by rating) + a screen.
- **Seasons**: soft rating reset, placement matches, optional decay. Needs a season
  key on ratings/matches and a reset job.
- **Reconnect/resume** for a dropped ranked match (today a drop is conceded).

These are independent and can be scheduled after 1–3 land.

---

## Cross-cutting invariants

- **Determinism**: avatar/title/stats are cosmetic and derived. They must never enter
  the online state hash or authoritative battle state. Sync cosmetics explicitly
  in-band, exactly like nicknames (see `src/ui/nicknameModel.js` + online setup sync).
- **Trust**: only the server may write ratings and unit stats; both come from
  mutually-attested results. The client never declares its own rating or credits its
  own unaudited stats.
- **Factory identity first**: the ranked card is a game-owned view over server data
  and links out to `/player`; it does not fork canonical profile ownership into the
  game.
- **Reuse before rebuild**: friends and chat are platform features. Ranked links into
  them; it does not reimplement them.

## Open questions (not blocking Phase 1)

- Avatar ownership enforcement: purely client-gated (pick only owned units/skins), or
  also validated server-side against progression? Leaning client-gated for v1.
- `kills` attribution granularity in `unitResults` — killer per death, or just
  alive/dead per unit for v1? Alive/dead is enough for games/win%/survival; add
  killer attribution when the UI needs it.
- Season model shape — defer to Phase 4.

## Build order

Phase 1 → 2 → 3 → 4. Phase 1 is the keystone: it retires the local name and unblocks
the viewable card. Each phase ships behind its own tests and `npm test` green.
