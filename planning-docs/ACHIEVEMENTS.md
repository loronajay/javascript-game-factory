# Platform Achievements

The Javascript Game Factory has a platform-wide achievement system; Lovers Lost is its first registered game (2026-09-17). This is the orientation doc: what lives where, the trust boundary, and how a second cabinet registers.

## Ownership split

| The game owns | The platform owns |
|---|---|
| the gameplay facts (per-run telemetry) | durable ownership (`player_achievements`, migration 048) |
| the conditions (definitions + detector, hosted server-side in a per-game catalog module) | identity — the acting player is always the token's `playerId` |
| any presentation metadata specific to its achievements | idempotency (unique row per player/game/id; per-`runId` verdict replay) |
| | secret masking, the profile read, the unlock toast |

No game stores unlock state. A cabinet ships a run summary and shows what the server says was earned.

## Files

- `platform-api/src/services/achievement-catalog.mts` — the registry. Adding a game = one entry in `GAMES`. Also `presentAchievement` (the ONE place a locked secret is masked) and `evaluateAchievementRun` (runs a detector to a fixed point so cumulative/meta achievements resolve in the same submission).
- `platform-api/src/services/lovers-lost-achievement-catalog.mts` — definitions (23), `normalizeLoversLostRun` (plausibility gate), `detectLoversLostAchievements` (pure), `LOVERS_NEVER_DIE_REQUIRED_IDS` (exact ids, secrets excluded).
- `platform-api/src/db/achievements.mts` — `submitAchievementRun` (advisory-locked per player+game; `on conflict do nothing`; only rows the insert returned are "newly unlocked"; a repeated `runId` replays the stored verdict) and `getPlayerAchievements`.
- `platform-api/src/routes/achievement-routes.mts` — `GET /achievements`, `GET /achievements/:slug`, `POST /achievements/:slug/runs` (auth, self-only), `GET /players/:id/achievements[?game=]` (public). Dispatched before the `/players` family.
- `js/platform/achievements/` — `achievements-api.mts` (client), `unlock-queue.mts` (pure ordering + dedupe by `game:id`), `unlock-toast.mts` (the one platform toast: injected styles, top-centre, queued, auto-dismiss, tap to hurry), `achievements.mts` (`createAchievementReporter().reportRun(slug, run)` — the two-line cabinet integration).
- `achievements/` + `js/achievements-page/` + `css/achievements.css` — the trophy case (`/achievements/?id=<playerId>`), reached from chips on `/me` and `/player`. Tree is read off `parentId`; layout is CSS flex (no pixel positions); secrets locked show `???`.
- `games/lovers-lost/scripts/lane-stats.js` (tallies), `run-telemetry.js` (the run summary), `tests/achievement-contract.test.js` (drives a real run through the sim, then through the server's normalizer + detector).

## Trust boundary (current phase)

A run arrives from a browser; every field is attacker-controlled. Two defences exist and no third:

1. `normalizeRun` refuses the impossible — tallies that do not partition the obstacles, scores above the per-obstacle ceiling, finishes before frame 600 or after the run ended, a game over before the 90-second cutoff, an outcome the lanes contradict. It re-derives outcome and lane ownership from the facts rather than trusting the body.
2. Only `detect` can unlock. There is no "unlock id X" request; the id never appears in a request body.

What it cannot do is prove the run happened — a well-formed invented run passes. That is the same standing as `game_run_records` (stored as a claim, verified later). The upgrade path needs no data-model change: a server-authoritative cabinet (`factory-network-server` match) submits from the server under a shared secret, and a client-sim cabinet ships its input log for deterministic replay; both are a stronger `normalizeRun`.

## Tree semantics

`parentId` is presentation. Every condition evaluates on its own, so a first run past the top score tier unlocks the whole branch. Genuine prerequisites (Both Sides, Lovers Never Die) are written in the detector against `ownedIds`.

## Registering a second game

1. Write `services/<slug>-achievement-catalog.mts` exporting an `AchievementGame`: `definitions`, `normalizeRun`, `detect`. Keep `detect` pure and test it against fixtures; keep `normalizeRun` a plausibility gate, not a skill judgement.
2. Add it to `GAMES` in `achievement-catalog.mts`. Routes, storage, profile page and toast need nothing.
3. In the cabinet: build a run summary at run end and call `createAchievementReporter().reportRun(slug, run)`. Mint the `runId` once per run (at run start) so a retry is a replay, not a second claim.
4. Ids are permanent — they are stored on every ownership row.

## Lovers Lost gameplay changes made for this (see CHANGELOG 2026-09-17)

- Every obstacle resolution goes through `resolveObstacleGrade` (one grade → score, stats, feedback, snapshot).
- Birds are graded off crouch timing (`crouchStartDistance`) — Perfect was previously impossible on a bird.
- Spikes are graded against the latest *safe* jump (`2·distPerFrame − 1.16` units ahead of the spike), not the spike's position — Perfect was previously impossible above ~speed 12.
- Every Perfect window is at least two ticks wide at the player's speed (`PERFECT_MIN_TICKS`).
- A one-jump spike chain inherits the jump's grade.
- `finishFrame` and `stats` ride the player object and the online snapshot.
