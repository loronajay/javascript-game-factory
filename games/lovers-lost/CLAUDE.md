# Claude Code — Lovers Lost

Refer to the root `CLAUDE.md` for general project conventions. This file covers specifics for this game.

## Source of truth

All game design decisions live in `GDD.md`. Before implementing any feature, confirm it is scoped in the GDD. Open questions in the GDD must be resolved before the relevant feature is built.

## Architecture

The game has two logically independent sides that share a clock:

- `game.js` — main loop, state machine, shared clock, mode routing
- `player.js` — player entity (speed, score, chain, distance, assist); instantiated twice (boy + girl)
- `obstacles.js` — obstacle types, wave/warmup generation, timing grade windows, collision
- `scoring.js` — run-end evaluation (outcome, score totaling, leaderboard submission)
- `renderer.js` — all canvas draw calls (no logic here)
- `input.js` — input mapping for single player, local co-op, and online modes
- `online.js` — network layer for online co-op *(built last)*

## TDD rules for this game

- `player.js`, `obstacles.js`, and `scoring.js` must have full test coverage before any rendering code touches them
- Timing grade windows are pure functions — test every boundary
- Collision detection is a pure function — test every edge case
- State transitions (playing → reunion → score screen) must be tested

## Sprite sheets

| File                    | Dimensions | Frame size | Frames | Notes                                      |
|-------------------------|------------|------------|--------|--------------------------------------------|
| images/boy.png          | 96 × 16    | 16 × 16    | 6      |                                            |
| images/girl.png         | 96 × 16    | 16 × 16    | 6      |                                            |
| images/SHORT SWORD.png  | 32 × 32    | 32 × 32    | 1      | Single frame; drawn offset from player during attack state |

- Render scale: 3× (48 × 48 on canvas for characters; 96 × 96 for sword)
- Sword offset: extend in the direction the runner is facing (right for boy, left for girl)
- `ctx.imageSmoothingEnabled = false` always

## State machine

```
menu → mode select → playing → reunion → score screen → menu
                              ↘ game over → score screen → menu
```

## Obstacle types (4)

Each obstacle type maps to exactly one required response. This is the core mechanic — do not add ambiguity.

| Type       | Visual                      | Required response        | Sprite notes                         |
|------------|-----------------------------|--------------------------|------------------------------------- |
| Spikes     | Ground spikes               | Jump                     |                                      |
| Bird       | Low-flying bird             | Crouch                   | Temp: scale sprite down on Y axis, accept stretch until real sprites made |
| Arrow wall | 3 stacked arrows            | Block                    |                                      |
| Goblin     | Goblin (possible pre-attack)| Block → Attack or Attack |                                      |

The goblin is the only two-phase obstacle. See GDD.md for full goblin mechanic spec.

## Online mode

Uses the existing Factory Network server (Railway). Do not introduce a separate backend.

- Server: `factory-network-server` (Express + `ws`)
- Matchmaking: `{ type: "find_match", gameId: "lovers-lost" }`
- Private room: `{ type: "create_room" }` / `{ type: "join_room", roomCode }`
- State sync: `{ type: "room_message", messageType, value }`
- `online.js` wraps all WebSocket logic — no raw WS calls outside this file

## Locked constants

These values are validated by `archetype-model.js` — do not change without re-running the model.

| Constant              | Value       | Description                                          |
|-----------------------|-------------|------------------------------------------------------|
| Run distance          | ~5400       | Units to finish line                                 |
| Hard cutoff           | 90s         | Failure deadline                                     |
| Curve exponent        | 0.2         | `dist_per_frame = (speed / 5) ^ 0.2`                |
| Base / floor speed    | 5           | Starting speed, minimum speed                        |
| Perfect window        | 1 frame     | Timing window for Perfect grade                      |
| Good window           | 4 frames    | Timing window for Good grade                         |
| Perfect speed gain    | +3 × speed_multiplier | Per perfect clear                          |
| Good speed gain       | +1          | Per good clear (after chain break penalty)           |
| Hit penalty           | 15%         | Of current speed, after chain break penalty          |
| Chain break penalty   | `chain × 2.0` | Speed lost on any Good or Miss                     |
| Speed chain k         | 0.25        | `speed_mult = 1 + sqrt(chain) × 0.25 × (faced/104)` |
| Score chain k         | 0.06        | `score_mult = 1 + chain × 0.06 × (faced/104)`       |
| Obstacle repeat cap   | 3           | Max consecutive same obstacle type                   |
| Assist trigger        | proj ≥ 90s  | Projected finish ≥ hard cutoff activates assist      |
| Assist boost          | +60% speed  | Flat addition to current speed per opportunity       |
| Assist opportunities  | 3           | Per trigger window; deactivates on recovery or exhaustion |
| Adaptive diff tier 1  | proj ~54s   | Compresses obstacle intervals for fast runners       |

## Archetype model

`archetype-model.js` — run with `node archetype-model.js` from this directory.
Simulates perfect / competitive / average / casual / struggle / floor archetypes against the locked constants. Re-run whenever a constant changes.

## Build status

| File | Status | Tests |
|------|--------|-------|
| `player.js` | Done | 65 passing |
| `obstacles.js` | Done | 39 passing |
| `scoring.js` | Done | 16 passing |
| `renderer.js` | Done — visually validated via renderer-test.html | — |
| `input.js` | Done | 34 passing |
| `game.js` | Not started (rewrite from scratch) | — |
| `online.js` | Not started (built last) | — |

`game.js`, `index.html`, `style.css` exist from before scope was locked. Treat as throwaway scaffolding — rewrite to fit the architecture above.

`renderer-test.html` — standalone visual test harness. Open in browser to inspect environments, animations, and obstacle art. Not part of the final game.

## Renderer notes

- Canvas: 960×540 (16:9). Set by `createRenderer` — do not set in HTML.
- `createRenderer(canvas, images)` — `images` must have `{ boy, girl, sword }` as `Image` objects.
- `renderer.renderPlay(boyPlayer, girlPlayer, boyObstacles, girlObstacles, boyBoosts, girlBoosts, elapsed)`
- Players are stationary on screen; background scrolls based on `player.distance`
- Split at screen center; boy on left half (runs right), girl on right half (runs left)
- Divider: 2px white line at x=480

### Environments (5 per side, wave-aligned)

| Wave | Distance | Boy | Girl |
|------|----------|-----|------|
| Warmup + 1 | 0–1020 | Cave | Desert ruins |
| 2 | 1020–1770 | Enchanted forest | Frozen tundra |
| 3 | 1770–2720 | Stormy cliffs | Lava fields |
| 4 | 2720–3820 | Sunken ruins | Castle halls |
| 5 | 3820–5400 | Night sky | Night sky |

Transitions: a world-boundary seam travels across the screen at PPU=4 speed (matching obstacle movement). Old terrain scrolls out, new terrain enters from the same side as incoming obstacles.

### Animation

- Walk cycle: frames 3 and 4 only (the two sideways-facing frames)
- All states (running, jumping, hit, attacking, blocking) continue the walk cycle — no frame change on state transition
- Crouch: walk cycle frame, Y-scale 0.5, Y offset to keep feet on ground
- Hit: walk cycle continues, sprite blinks at ~12hz
- Attack: sword (SHORT SWORD.png, rotated ±90° to face forward) thrusts outward and retracts — 3-step animation, ~0.3s
- Block: glowing magic shield rectangle appears in front of character — same 3-step timing as attack
- Both attack and block use `animState.actionTick` (resets on state change) divided by `ACTION_STEP_DUR=6`

### Obstacle visuals (code-drawn placeholders)

| Type | Visual |
|------|--------|
| Spikes | 3 yellow triangles at ground level |
| Bird | Animated flapping bird at standing-head height — crouch to dodge |
| Arrow wall | 3 stacked arrows pointing toward runner |
| Goblin | Green pixel humanoid; arm extended; bow drawn in windup phase |

Obstacle sprites not yet made. Replace `_drawSpikes`, `_drawBird`, `_drawArrowWall`, `_drawGoblin` when real sprites are ready.

### HUD

- Clock: center top, turns red at <20s remaining
- Score + chain (≥2): per side, top corners
- Progress bars: bottom edge, each half — boy fills left→right, girl fills right→left
