# Claude Code — Lovers Lost

Refer to the root `CLAUDE.md` for general project conventions. This file covers specifics for this game.

## Source of truth

All game design decisions live in `GDD.md`. Before implementing any feature, confirm it is scoped in the GDD. Open questions in the GDD must be resolved before the relevant feature is built.

## Current Project Status

- **Obstacle collision validation pass is complete.** All 4 obstacle types (spikes, birds, arrow walls, goblins) have validated hitboxes and are locked for the active build.
- Contact rules for the live build:
  - visible player hurtbox touches visible spike hitbox = miss
  - player fully passes spikes without contact = clear
  - spike jump timing only grades that clean clear as perfect or good; it must not override the hitbox-based clear / miss decision (**enforced in code** — `spikeClearGrade` never returns `'miss'`)
  - visible player hurtbox touches visible bird hitbox = miss
  - player fully ducks under and passes bird without contact = clear
  - visible shield hitbox touches visible arrow hitbox = clear
  - visible player hurtbox touches visible arrow hitbox before shield contact = miss
  - visible sword hitbox touches visible goblin hitbox = clear
  - visible player hurtbox touches visible goblin hitbox before sword contact = miss
- Debug collision mode is part of the working workflow:
  - `F3` toggles debug hitboxes
  - `?debug=1` enables debug mode from the URL
  - `?debugObstacle=spikes|birds|arrows|goblins` swaps the run to one obstacle type for practice
  - debug panel also shows the front obstacle timing grade (`perfect` / `good` / `miss` / `n/a`)
  - cyan = player hurtbox, yellow/orange = obstacle hitbox, green = perfect window or shield, magenta = sword, red = body overlap/contact
- Wave generation is now feasibility-aware:
  - adjacent pairs must be clearable with the live mechanics
  - mixed-action pairs must resolve in sequence
  - spike chains must be either same-jump close or full-reset far
- Remaining validation work is mainly tuning and feel, not missing contact geometry.
- **Input is gated on finish state**: `handleSideInput` returns immediately if `player.state === 'finished'` — no input (including held crouch) can overwrite the finished state or cause the backdrop to scroll after a side reaches the goal.

## Spike Timing Notes

- Spikes remain hitbox-first: visible overlap is still the only way to get hit.
- A spike is only cleared once it is fully passed without overlap.
- Jump timing now grades that clean clear as `perfect` or `good`; it must not turn a clean physical clear into a miss. This is enforced — `spikeClearGrade` returns only `'perfect'` or `'good'`, never `'miss'`.
- Debug mode can show a green spike perfect window, but that highlight is informational and does not replace the overlap/pass rules.

## Architecture

The game has two logically independent sides that share a clock:

- `game.js` — main loop, state machine, shared clock, mode routing
- `player.js` — player entity (speed, score, chain, distance, assist); instantiated twice (boy + girl)
- `obstacles.js` — obstacle types, wave/warmup generation, timing grade windows, collision
- `scoring.js` — run-end evaluation (outcome, score totaling, leaderboard submission)
- `renderer.js` — all canvas draw calls (no logic here)
- `input.js` — input mapping for single player, local co-op, and online modes
- `online.js` — network layer for online co-op *(built last)*

## Browser shell

- `index.html` is the shipped entry point and wraps the canvas in the Factory cabinet shell with a back link to `../../grid.html`.
- `renderer.js` owns canvas sizing and currently renders at **960×540**.
- `game.js` now boots the full browser path: menu → play → reunion/game over hold → score screen → menu.
- `sounds.js` is wired into the browser loop for action / hit / run outcome SFX, plus looping background music.
- The browser build currently supports debug startup params:
  - `?debug=1`
  - `?debugObstacle=spikes|birds|arrows|goblins`


## TDD rules for this game

- `player.js`, `obstacles.js`, and `scoring.js` must have full test coverage before any rendering code touches them
- Timing grade windows are pure functions — test every boundary
- Collision detection is a pure function — test every edge case
- State transitions (playing → reunion → score screen) must be tested

## Sprite sheets

Collision tuning rule: the gameplay decision must match the debug hitboxes shown on screen.

| File                    | Dimensions | Frame size | Frames | Notes                                      |
|-------------------------|------------|------------|--------|--------------------------------------------|
| images/boy.png          | 96 × 16    | 16 × 16    | 6      |                                            |
| images/girl.png         | 96 × 16    | 16 × 16    | 6      |                                            |
| images/SHORT SWORD.png  | 65 × 20    | 65 × 20    | 1      | Single frame; drawn offset from player during attack state |

- Render scale: 3× (48 × 48 on canvas for characters; 65 × 20 for sword at 1×)
- Sword offset: extend in the direction the runner is facing (right for boy, left for girl)
- `ctx.imageSmoothingEnabled = false` always

## State machine

```
menu → playing → reunion → score screen → menu
              ↘ game over → score screen → menu
```

- `menu` phase: title screen with clickable "Local Multiplayer" button (hover highlight active). No keyboard shortcut — button click only.
- `score_screen` phase: any action key returns to `menu` (not directly to `playing`).

## Obstacle types (4)

Each obstacle type maps to exactly one required response. This is the core mechanic — do not add ambiguity.

| Type       | Visual                      | Required response        | Sprite notes                         |
|------------|-----------------------------|--------------------------|------------------------------------- |
| Spikes     | Ground spikes               | Jump                     |                                      |
| Bird       | Low-flying bird             | Crouch                   | Real sprite; visible hitbox pass completed |
| Arrow wall | 3 stacked arrows            | Block                    | Visible shield-vs-arrow contact drives resolution |
| Goblin     | Goblin                      | Attack                   | Visible sword-vs-goblin contact drives resolution |

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
| Dist curve            | sqrt        | `dist_per_frame = sqrt(speed / 10)`                  |
| Starting speed        | 10          | Speed at run start; characters begin at 1.0 dist/frame |
| Floor speed           | 5           | Minimum speed (punishment); gives ~0.707 dist/frame  |
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

## Module system

All `.js` files use ES modules (`import`/`export`). `package.json` sets `"type": "module"` so Node runs them natively.

**Running in browser requires a local server** — Chrome blocks ES module imports on `file://`. Use:
```
npx http-server . -p 8080 -c-1
```
Then open `http://localhost:8080/demo.html` or `http://localhost:8080/index.html`.

## Build status

| File | Status | Tests |
|------|--------|-------|
| `player.js` | Done | 67 passing |
| `obstacles.js` | Done — `WAVE_SPACING_MIN 35→44`, `WAVE_SPACING_MAX 55→64` (warmup unaffected) | 45 passing |
| `scoring.js` | Done | 16 passing |
| `renderer.js` | Done — all environments, HUD, debug overlay, outcome effects | — |
| `input.js` | Done | 34 passing |
| `game.js` | Done — contact-validated obstacle flow, debug practice filters, browser loop wired, reunion animation | 107 passing |
| `index.html` | Entry point wired | — |
| `online.js` | Not started (built last) | — |

`renderer-test.html` — standalone visual test harness. Open in browser to inspect environments, animations, and obstacle art. Not part of the final game.

Latest local verification:
- `renderer.js` also owns the menu, game-over, and score-screen rendering paths.
- `game.js` now handles phase holds before the score screen and drives sound effects via `sounds.js`.
- `index.html` is the factory-shell entry point, not just a bare canvas mount.
- `game.json` should be updated whenever the public card copy or release status changes.
- `obstacles.js` currently has 37 passing tests (two-phase goblin removed)
- `game.js` currently has 107 passing tests

## Music

`sounds.js` exposes three music methods alongside the SFX API:

- `sounds.playMusic(name)` — starts a looping track; idempotent (won't restart if already playing). Stores the name as `pendingMusicName` if the browser rejects autoplay.
- `sounds.stopMusic()` — pauses and resets the current track; clears pending.
- `sounds.retryPendingMusic()` — call inside any user-interaction handler to unblock a track rejected by the browser's autoplay policy. Called in the `keydown` and `canvas click` handlers in `game.js`.

| Phase | Music |
|-------|-------|
| `menu` | `sounds/bg-music-menu.wav` (loops) |
| `playing` | `sounds/bg-music-game.wav` (loops) |
| `reunion` / `gameover` | silence — `stopMusic()` called; outcome SFX plays instead |
| `score_screen` | silence (inherited) |

## HUD

- Score, speed (`spd X.X`), and chain (`chain ×N`) shown per side — top corners
- Chain dim at 0/1, gold at 2+
- Clock center top, turns red at <20s
- Progress bars bottom edge
- On obstacle clear: floating "PERFECT" (gold) or "GOOD" (white) text (~0.7s)
- On obstacle miss: floating "MISS" text (red, ~0.7s)

## Two-phase goblin

Removed. Goblins are single-phase (attack only). Do not re-introduce.

## Hitbox / collision notes

- `playerBottomAtLocalX` mirrors the body profile for the girl via `profileX = 15 - sourceX`. The girl's body in screen-local coords is at x=6–35 (not 12–41 like the boy).
- `buildDebugCollisionSnapshot` iterates x=0–47 and relies on `playerBottomAtLocalX` returning null for non-body columns — do not change this back to fixed 12/41 constants.
- outcome `feedback` values: `'perfect'` / `'good'` / `'hit'` (not `'clear'` — that string is gone).
- Arrow walls do not resolve from raw `block` input; they resolve from visible shield-vs-arrow contact or body contact.
- Goblins do not resolve from raw `attack` input; they resolve from visible sword-vs-goblin contact or body contact.

## Input — CRITICAL design rule

**All 4 actions are one-shot keypresses. There is no held state for any action.**

- Jump: one-shot
- Crouch: one-shot
- Attack: one-shot
- Block: one-shot

`inp.isHeld()` is only used by `online.js` internals and should NOT drive any game state in the main loop. Only `inp.isPressed()` should be checked when processing player actions. Any code that calls `inp.isHeld(side, 'crouch')` or `inp.isHeld(side, 'block')` to sustain player state is wrong and must be removed.

## input.js notes

- `keyToAction(key)` — pure function; normalises single-char keys to lowercase; returns `{ side, action }` or `null`.
- `createInput()` — factory; call `inp.keydown(e.key)` / `inp.keyup(e.key)` from window event listeners in game.js.
- `inp.tick()` — call once per frame to clear `pressed` state.
- `inp.isHeld(side, action)` — true while key is physically held.
- `inp.isPressed(side, action)` — true for exactly one frame on initial keydown (not browser key-repeat).
- `inp.injectAction(side, action)` / `inp.clearAction(side, action)` — online mode: remote player's input.
- No DOM wiring in input.js itself — attach listeners in game.js.

| Key | Side | Action |
|-----|------|--------|
| W | boy | jump |
| S | boy | crouch |
| D | boy | attack |
| A | boy | block |
| ArrowUp | girl | jump |
| ArrowDown | girl | crouch |
| ArrowLeft | girl | attack |
| ArrowRight | girl | block |

## Renderer notes

Current contract additions:
- The live image contract also includes `goblinIdle`, `goblinAttack`, `goblinTakeHit`, `goblinDeath`, and `arrows`.
- `renderer.renderMenu(debugState, btnHovered)` — `btnHovered` drives the gold glow highlight on the "Local Multiplayer" button.
- `renderer.renderGameOver(boyPlayer, girlPlayer, runSummary)` and `renderer.renderScore(boyPlayer, girlPlayer, runSummary)` are part of the live contract.
- `getDebugOverlayGeometry(...)` is the shared source for debug collision overlay placement and game-side collision assertions.

- Canvas: 960×540 (16:9). Set by `createRenderer` — do not set in HTML.
- `createRenderer(canvas, images)` — `images` must have `{ boy, girl, sword, birds: [Image, Image, Image] }`.
- Bird frames: `images.birds[0]` = red1.png, `[1]` = red2.png, `[2]` = red3.png (38px wide, heights 20/24/18).
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

### animState contract

The renderer does not read `player.state` directly. Callers must pass a player object that has been augmented with an `animState` field:

```js
const boyPlayer = { ...gs.boy, animState: boyAnim };
// where boyAnim = { state: 'running' | 'jumping' | 'crouch' | 'attack' | 'block' | 'hit', actionTick: number }
```

`actionTick` increments each frame while state is `attack` or `hit`, resets to 0 on state change. The renderer uses it to drive the thrust/shield animation steps.

### Animation

- Walk cycle: sprite sheet frames **2 and 3** (0-indexed) — the two sideways-facing run frames. User calls these "frames 3 and 4" (1-indexed). Frames 0–1 are front/back-facing; do not use.
- All states continue the walk cycle — no frame change on state transition
- Crouch: walk cycle frame, Y-scale 0.5, Y offset to keep feet on ground
- Hit: walk cycle continues, sprite blinks at ~12hz
- Jump: renderer reads `player.jumpY` (pixels above ground, positive = up); game.js drives this via `startJump` / `tickJumpArc`
- Attack: sword drawn **behind** the player sprite, thrusts outward and retracts — 3-step animation, ~0.3s
- Block: glowing magic shield rectangle appears in front of character — same 3-step timing as attack
- Both attack and block use `animState.actionTick` divided by `ACTION_STEP_DUR=6`

### Obstacle visuals

| Type | Visual | Status |
|------|--------|--------|
| Spikes | 3 yellow triangles at ground level | Code-drawn placeholder |
| Bird | `red1/2/3.png` animated sprite (38px wide, 3-frame flap cycle) | **Real sprite — done** |
| Arrow wall | `arrows.png` — 3 stacked arrows pointing toward runner | **Real sprite — done** |
| Goblin | `goblin-idle.png` / `goblin-attack.png` / `goblin-take-hit.png` / `goblin-death.png` | **Real sprites — done** |

Bird faces RIGHT in source sprites. `_drawBird` flips for boy's side (bird faces left toward him), draws as-is for girl's side.
`_drawSpikes` remains code-drawn for now. Arrow wall and goblin rendering already use the shipped sprite assets.

### Sword

- Sprite: `SHORT SWORD.png` — 65×20px, blade points RIGHT
- Rendered at 1× (65×20). No rotation needed — boy draws as-is, girl uses `scale(-1,1)` to flip.
- Handle anchored at ~55% across sprite width (overlaps character torso); drawn **behind** the player sprite.
- Thrust animation: 3-step (OFFSETS = [4, 12, 4] px outward)
- Debug collision uses a dedicated **sword hitbox** aligned to the visible attack pose.

### Shield

- Shield is a dedicated visible hitbox, not just a timing state.
- Debug collision uses a dedicated **shield hitbox** aligned to the visible block pose.

### HUD

- Clock: center top, turns red at <20s remaining
- Score + chain (≥2): per side, top corners
- Progress bars: bottom edge, each half — boy fills left→right, girl fills right→left
