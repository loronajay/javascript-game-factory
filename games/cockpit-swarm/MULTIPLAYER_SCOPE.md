# Cockpit Swarm — Multiplayer Scope (1v1 Dodgeball)

**Status:** Scoped, not started.
**Date:** 2026-05-30
**Mode chosen:** 1v1 Dodgeball (symmetric PvP duel).
**Netcode v1:** Host-authoritative + client prediction over the generic Factory Network relay.
Rollback (sumorai-style) is a deferred upgrade, not v1.

---

## The mode

Two pilots face each other across the rail. Each strafes on their own rail to dodge, and
fires at the **opponent** instead of a swarm. Ships have much higher HP than campaign
(it's a duel of attrition, not a one-shot). First to drop the other's hull to 0 wins.
No PvE enemies in this mode — the opponent *is* the threat.

**Why this mode:** it reuses the most existing tech. The opponent renders as a projected
far-Z entity, and their shots approach you through the **exact** `projectEnemyBullet` path
already used for enemy fire. The single first-person cockpit fiction stays intact.

---

## Two-repo split

| Repo | Work needed for v1 |
|---|---|
| `javascript-games` (this repo) | **Everything** — lobby UI, online controller, host-authoritative sim, opponent rendering, VS state machine, HP tuning, input/state relay, connection lifecycle. |
| `factory-network-server` | **None for v1.** Host-authoritative Dodgeball rides the generic relay: `find_match { gameId: "cockpit-swarm", side: "p1"|"p2" }` + `room_message` broadcast. Only `circuit-siege` is special-cased (`shouldRouteToCircuitSiege`); every other game uses the generic path. The server only enters scope if we later choose server-authoritative validation. |
| `leaderboard-server` | Out of scope for v1 (no ranked). Later: ranked ELO, like sumorai's ranked queue. |

`SIDE_PAIRS` in `server.js` already includes `["p1","p2"]` and `["alpha","beta"]`, so
side-aware matchmaking works out of the box — use it to deterministically assign **p1 =
host authority**.

---

## Netcode architecture (v1: host-authoritative)

- On match, the **p1 client is the authority.** It runs the single simulation: both ships'
  positions, both players' bullets, hit resolution, both HP pools.
- **p2 sends only its input** (rail intent + fire press) to p1 via `room_message`.
- p1 **broadcasts authoritative state** (both ship x, all bullets, both HP, hit/score
  events) at a fixed tick via `room_message`.
- **p2 predicts** its own strafe locally for responsiveness and reconciles to the
  authoritative ship-x on each state packet. Bullets and opponent are render-interpolated.
- Determinism is **not** required (unlike rollback), which is why this is the cheaper v1.
  Trade-off: p2 has input→effect latency on fire; acceptable for a rail duel, and the
  rollback upgrade path exists if it isn't.

### Why not rollback for v1
Rollback (sumorai) demands a fully deterministic, serializable sim and rollback/replay
plumbing — large work against a game not written deterministically. A rail fixed-shooter
is 1D position + bullet list, well-suited to host-authoritative + prediction. Keep rollback
as a later fairness upgrade if competitive play demands it.

---

## Reuse map (existing cockpit-swarm tech that carries over)

| Existing system | Reused as |
|---|---|
| `projection.mjs` (`project`, `projectEnemyBullet`) | Render the opponent ship + their incoming bullets as far-Z entities |
| `renderEnemyBullets` | Opponent's shots approaching you — near-verbatim |
| `renderCockpit` + dashboard/HUD | Unchanged; your cockpit frame stays |
| `input.mjs` (strafe + fire press) | Local input, now also serialized to the relay |
| `damagePlayer` / `hurtFlash` / `shake` | Taking a hit from the opponent |
| `LANES`, `TUNING.playerMaxX`, rail math | Both ships strafe the same rail model |
| Stage background / depth grid / stars | Reused as the duel arena backdrop |

## New systems needed

- **VS mode state machine** — new states alongside campaign: `MP_LOBBY → MP_COUNTDOWN →
  MP_FIGHTING → MP_RESULT`. Respect the existing flash/shake/`clearMenuPresses()` invariant
  on every transition into a menu-like state.
- **Online controller** (`js/systems/online.mjs`) — connect-once relay client, message
  encode/decode, host vs guest role, tick loop. Borrow the lifecycle from
  `games/sumorai/scripts/online.js` + lobby flow from `online-lobby-events.js` /
  `online-match-start.js`.
- **Opponent entity** — a projected ship the local client renders; its x + HP come from
  state packets. Reuse `drawEnemyShape`/a ship descriptor for the silhouette.
- **Bidirectional bullets** — your shots travel *away* (up the rail toward the opponent at
  far Z); theirs approach you. Today only enemy→player bullets exist; add the player→far
  direction and host-side hit resolution against the opponent ship.
- **Duel HP tuning** — much higher hull pool; new constants (e.g. `MP_TUNING`).
- **Lobby UI** — public matchmaking + private room code, side select, connect-once. Mirror
  the reworked lobby pattern noted for illuminauts/lovers-lost (multi-phase, hover, connect
  once).

---

## Relay message contract (over generic `room_message`)

| Direction | `messageType` | Payload (sketch) |
|---|---|---|
| guest → host | `input` | `{ tick, railIntent: -1..1, laser: bool, lob: bool }` |
| host → both | `state` | `{ tick, p1x, p2x, p1hp, p2hp, p1heat, p2heat, p1burn, p2burn, bullets: [...], events: [...] }` |
| host → both | `countdown` | `{ startsAtTick }` |
| host → both | `result` | `{ winner: "p1"|"p2" }` |
| either | `rematch` | `{ ready: bool }` |

(Exact shapes finalized at build time; keep packets small — broadcast every N ticks, not
every frame.)

## Lobby / matchmaking flow (borrow sumorai)

1. MP menu entry → `find_match { gameId: "cockpit-swarm", side }` (or `create_room` /
   `join_room` for private).
2. Server pairs opposite sides into a 2-player room.
3. Both clients receive room join → p1 = authority.
4. p1 emits `countdown` → both run `MP_COUNTDOWN` → `MP_FIGHTING`.
5. On hull 0, host emits `result` → `MP_RESULT` with rematch option.

---

## Locked decisions (v1) — 2026-05-30

- **Aiming: fixed forward-fire (no free aim), CONTINUOUS movement.** Keep the campaign's
  continuous strafe model (`player.x` across ±190) — **no snap-to-lane, no new movement
  model.** You fire straight "forward" up the rail; a shot hits when shooter and target are
  aligned within a hit window (reuse `enemyBulletLaneHitWindow`-style tolerance). Dodge =
  strafe out of alignment. ("Lane-locked" only ever meant fixed forward-fire, not discrete
  lanes.)
- **Format: best-of-N rounds.** Discrete rounds (Bo3/Bo5 — pick at build), first to the
  round majority wins the match. Reuse sumorai's round_end handshake + reset pattern.
- **Stalemate: round timer + tiebreak.** Each round has a clock; on expiry, most remaining
  HP wins (brief sudden-death if tied). Deliberate departure from the Sumorai no-timer rule
  — that rule is specific to a one-hit-kill fighter; a high-HP attrition duel needs a
  backstop while lane-swapping makes whiffs common. The closing-arena / ramping-pressure
  alternative is a possible v2 replacement for the clock.
- **Power-ups: none in v1.** Pure ship-vs-ship. Host-spawned shared pickups (reusing
  `powerup-system.mjs`) are a **v2 pressure layer**, alongside ramping arena pressure.
- **Perspective: mirror** (both ships share one rail, face-to-face) — reuses
  `projection`/`projectEnemyBullet` most directly. (Default applied.)
- **Disconnect: forfeit-to-win on drop** (match creature-battler's handling). (Default applied.)
- **Ranked: later.** Plug into the sumorai-style ELO queue once casual is proven. (Default.)

## Fire model & heat (v1 gameplay) — 2026-05-30

Two weapons on two buttons, governed by a shared **heat / burnout** meter per ship. This is
the core risk/reward axis and doubles as a stalemate pressure valve (overheating opens
windows, synergizing with the round timer).

- **Laser (primary):** a **fast projectile (not hitscan)** up your lane — quick travel with
  a sliver of reaction time (reuses the campaign shot feel). Hard to dodge, **heats fast**.
  Tap-fire, heat-gated (not hold-to-auto in v1). Low per-hit damage (~5–6) — it's chip
  pressure.
- **Lob (secondary):** slow projectile the opponent can dodge by strafing out of alignment.
  **Heats less.** Higher per-hit damage (~22) — it's the skill shot that rewards reading the
  opponent's movement. **It does NOT arc** — it's a slow ball of energy travelling straight
  up the lane (just much slower than the laser), reusing the existing bullet projection. The
  slow travel time IS the dodge window.
- **Heat / burnout meter (per ship, host-authoritative):**
  - `heat` 0..100, decays over time when not firing.
  - Laser adds more heat per shot than lob (starting points: laser ~+18, lob ~+8; tune).
  - At `heat >= 100` → **burnout**: guns locked until heat decays below a lower threshold
    (~35, **hysteresis** to avoid cap-stutter), optionally a short extra sting so overheating
    is a real mistake.
  - **Both players' heat bars are visible** — reading opponent heat ("they're about to
    overheat, push now") is intended tactical info.

**Netcode impact (host-authoritative):** heat is simulated on the host for both ships; the
guest sends which weapon it's attempting (`laser`/`lob` per tick) and the host validates
against heat/burnout. The guest predicts its own heat locally for a responsive HUD and
reconciles to authoritative `state`. Bullets carry a `kind: 'laser'|'lob'`.

**Input mapping (tunable):** laser = Space/J (primary, matches campaign), lob = a second key
(e.g. K / Shift) + right-side touch button; existing fire button becomes laser, add a lob
touch button.

**Deferred:** the mirrored **opponent ship silhouette** (how each player's ship is drawn in
the other's view) is designed at the rendering pass, not now.

## Combat geometry, pacing & edge cases (v1) — 2026-05-30

**Movement:** unchanged from campaign — continuous strafe, `player.x` ±190. Do NOT invent a
new movement model; the current one feels good.

**Round-start positions:** the two ships start at **OPPOSITE ends** of the rail (one far
left, one far right), never both at center — otherwise "go" devolves into a stand-still
midline shootout. Brief countdown, then live.

**Mirror view + hit rule:** the duel is face-to-face. Each client renders the **opponent
mirrored** — if they strafe left on their screen, you see them strafe right on yours (cameras
face opposite directions). No mental flip: you chase the ship you actually see. In world
space a shot hits when shooter and target share rail position within the hit window
(`|shooterX − targetX| ≤ window`); the mirror is purely a render concern, so moving toward
the on-screen opponent naturally lines you up. (Exact world↔screen sign finalized at build.)

**Projectile counterplay:** **none in v1** — you cannot shoot down an incoming lob. (Laser-
destroys-lob is a parked idea for a later pass; it's good, just not now.)

**Pacing (starting numbers, tune in playtest):**
- HP **100** per ship.
- Laser **~5–6** dmg (fast, chip; heats fast). Lob **~22** dmg (slow, dodgeable; heats less).
  → roughly ~17 laser hits or ~5 lob hits to drop a ship; heat caps the spam.
- Round timer **~45s**. Match **best-of-3** for v1 (bump to Bo5 later).
- Heat is **one shared meter** both weapons feed (laser heats more per shot than lob).

**Round resolution / tiebreak:**
- Hull reaches 0 → that round is won by the other player.
- Timer expires with **unequal HP** → most remaining HP wins the round.
- Timer expires **tied**, OR a **simultaneous kill** → **SUDDEN DEATH**: short countdown,
  then both players can **only lob** and it's **one-hit-kill**. (Plain draw-and-replay is the
  fallback alternative if sudden death proves fiddly.)

## Phased plan

1. **Skeleton + relay:** `online.mjs` connect-once, lobby UI, room pairing, side assignment,
   countdown handshake. No gameplay yet — just two clients reaching `MP_FIGHTING`.
2. **Host-authoritative duel core:** host sim of both ships + bidirectional bullets + hit
   resolution + HP; broadcast `state`; guest prediction/reconcile.
3. **Polish:** result/rematch screen, disconnect forfeit, HP/feel tuning, hit feedback.
4. **(Later) Ranked + possible rollback upgrade.**
