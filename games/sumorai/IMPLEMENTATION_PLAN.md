# Sumorai - Implementation Plan

## Architecture Principle

The game update loop is a pure function: `update(gameState, p1Inputs, p2Inputs) → newGameState`. No game logic reads the DOM, no DOM manipulation happens inside the update. This is the online-readiness constraint and keeps every module testable in isolation.

`requestAnimationFrame` drives rendering only. A fixed-timestep accumulator calls `update` at 60 Hz independent of display refresh rate.

---

## Module Map

```
game.js                     ← orchestrator: boot, loop, phase routing
scripts/
  assets.js                 ← load and cache all SVG images + audio
  input.js                  ← key state → input snapshot per tick
  controls.js               ← key binding config, local-2P vs solo/online profiles
  physics.js                ← gravity, friction, movement, platform/floor/blastzone collision
  player.js                 ← player state shape, animation state machine, stamina
  combat.js                 ← attack resolution, hitstun, gridlock detection, shield knockback
  gridlock.js               ← mash minigame state + resolution (win/tie/knockback result)
  projectile.js             ← projectile movement, one-active-per-player rule, clash detection
  camera.js                 ← smooth follow, lerp, distance-based zoom
  round.js                  ← round/match state machine, timer, win tracking
  renderer.js               ← all canvas draw calls (world + characters)
  hud.js                    ← HUD draw calls (stamina, meter, timer, banners) — separate coordinate reset
  effects.js                ← blood particles, death explosion, screen flash, dash color, spotlight
  audio.js                  ← SFX controller, ambient loop
  bot.js                    ← CPU input generator (Phase 4 — reads gameState, returns input snapshot)
  online.js                 ← Factory Network relay, tick-sync input exchange (Phase 5)
index.html
style.css
```

---

## State Shape

All mutable state lives in one serializable object. No module stores its own private game state.

```js
{
  phase: 'menu' | 'setup' | 'countdown' | 'active' | 'round_end' | 'match_end',
  round: { current, p1Wins, p2Wins, target, timer, suddenDeath },
  p1: PlayerState,
  p2: PlayerState,
  p1Projectile: ProjectileState | null,
  p2Projectile: ProjectileState | null,
  gridlock: GridlockState | null,   // null when not in clash
  camera: { x, y, zoom },
  effects: EffectState[],           // blood, explosions, flashes — ephemeral, render-only
}

PlayerState {
  x, y,
  speedX, speedY,
  facing,           // 1 = right, -1 = left
  grounded,
  onPlatform,
  animState,        // 'idle' | 'run' | 'attack' | 'dash' | 'hurt' | 'gridlock' | 'death'
  animFrame,
  animTimer,
  stamina,          // 0–10
  hitstun,          // frames remaining
  attacking,        // frames remaining in attack window
  blocking,         // bool: down held
  dead,
  wins,
}

GridlockState {
  p1MashProgress,   // 0.0–1.0
  p2MashProgress,
  resolved,         // false until one bar fills
  winner,           // 'p1' | 'p2' | 'tie' | null
}
```

---

## Input Snapshot

Each tick, `input.js` produces a snapshot — a plain object, not a live event reference:

```js
{
  left, right, up, down,   // booleans
  attack,                  // bool
  dash,                    // bool
  projectile,              // bool
  attackJustPressed,       // true only on the tick the key went down (for mash detection)
}
```

`controls.js` maps physical keys → snapshot fields according to the active binding profile. The update function receives two snapshots: one per player. Online play sends these snapshots to the opponent; the CPU bot generates them synthetically.

---

## Phase Plan

### Phase 1 — Engine Foundation
Goal: players on screen, moving, jumping, standing on platforms. No combat.

- [ ] `assets.js` — preload all SVGs and audio; expose `getImage(spriteName, costumeName)` and `getSound(name)`
- [ ] `index.html` + `style.css` — canvas setup, scaleFactor, factory nav back button
- [ ] `game.js` — RAF loop, fixed timestep accumulator, phase router stub
- [ ] `input.js` — keydown/keyup tracking → snapshot builder
- [ ] `controls.js` — default local-2P binding profile; placeholder for solo/online profile
- [ ] `physics.js` — `applyPhysics(player, stage)`: gravity, friction, floor collision, platform pass-through/land, blast zone detection
- [ ] `player.js` — `createPlayer(side)`, animation state machine (idle/run/jump transitions), `stepAnimation(player)`
- [ ] `camera.js` — `updateCamera(camera, p1, p2)`: lerp follow, distance zoom
- [ ] `renderer.js` — draw stage background, floor, platform, both players (correct facing via canvas flip), shadows
- [ ] `stage.js` — stage layout constants: floor Y, platform rect, blast zone bounds

Milestone: two fighters walk, jump, and land. Camera follows them. No combat.

---

### Phase 2 — Combat System
Goal: all four moves work correctly with stamina and hitstun.

- [ ] `combat.js`
  - `checkAttackHit(attacker, defender)` — hitbox overlap during attack window
  - `applyHit(defender)` — hitstun frames, stamina drain on blocker
  - `checkGridlock(p1, p2)` — simultaneous attack detection
  - `applyShieldKnockback(blocker, attacker)` — speedX impulse + 3 stamina drain
  - `resolveGridlockKnockback(winner, p1, p2)` — speedX impulse direction by winner; tie = both
- [ ] `gridlock.js`
  - `createGridlockState()`, `tickGridlock(state, p1Inputs, p2Inputs)` — increment mash progress on `attackJustPressed`
  - Returns resolved state when either bar hits 1.0
- [ ] `projectile.js`
  - `createProjectile(owner, x, y, facing)`, `tickProjectile(proj)` — move per tick
  - `checkProjectileHit(proj, player)` — hit an unblocked player: hitstun, minimal knockback
  - `checkProjectileBlock(proj, blocker)` — destroy proj, apply block knockback, drain stamina
  - `checkProjectileClash(p1Proj, p2Proj)` — cancel both, trigger clash effect at midpoint
- [ ] Stamina regeneration in `player.js` — one point per N ticks while not attacking
- [ ] Animation states wired to combat: attack frames, hurt, gridlock, death

Milestone: full combat loop works. Stamina drains and regenerates. Gridlock mash resolves. Players can be killed (ring-out).

---

### Phase 3 — Round System + HUD
Goal: full match flow, win tracking, timer, result screen.

- [ ] `round.js`
  - State machine: `countdown → active → round_end → [next round | match_end]`
  - Round timer countdown at 60 Hz; sudden death flag on expiry
  - Stamina tiebreak on timeout
  - `startRound()`, `endRound(winner)`, `endMatch(winner)`
- [ ] `hud.js`
  - Stamina meter (s0–s10 sprite per player)
  - Round win meter (p1_frame/p2_frame sprites)
  - Countdown timer text
  - Round banner overlay: "Round N", "FIGHT!", "P1/P2 Wins", "GAME OVER", tie/sudden death
  - Gridlock mash bars (visible only during gridlock phase)
- [ ] Pre-match setup screen in `game.js`: BO3 / BO5 picker before first round
- [ ] Match result screen: winner display, rematch / back to menu

Milestone: complete playable match from setup through result screen.

---

### Phase 4 — Polish + Factory Integration
Goal: all effects, audio, control remapping, factory wiring.

- [ ] `effects.js`
  - Blood splash particles (8-frame, positional, pooled)
  - Death explosion at blast zone exit
  - Screen flash on ching (hit confirm)
  - Dash color flash on player sprite
  - Spotlight behind each fighter
  - Round transition character fade
  - Projectile clash visual at midpoint
- [ ] `audio.js` — wire all sounds to combat/round events; woods ambient loop during match
- [ ] `controls.js` — control remapping UI; save to localStorage; separate local-2P and solo/online profiles
- [ ] Factory integration in `game.js`
  - `loadFactoryProfile()` for P1 identity
  - Publish match result activity on match end
  - Back-to-factory nav

Milestone: shippable v1. Full visual and audio experience, factory-connected.

---

### Phase 5 — CPU Opponent (Post-v1)
Goal: playable vs computer without touching game logic.

- [ ] `bot.js` — `createBotInputs(gameState, side, difficulty)` returns a standard input snapshot
  - Easy: random legal inputs
  - Medium: reactive (attack when in range, dodge projectiles)
  - Hard: reads stamina + positioning, punishes openings
- [ ] Wire in `game.js`: replace one player's `input.js` snapshot with `bot.js` output in single-player mode
- No changes to `physics.js`, `combat.js`, `round.js`, or `renderer.js`

---

### Phase 6 — Online Play (Post-v1)
Goal: 1v1 over Factory Network relay.

- [ ] `online.js` — WebSocket relay, `gameId: 'sumorai'`, sides `'alpha'`/`'beta'`
- [ ] Tick-sync protocol: each tick, send local input snapshot; receive opponent snapshot; both sides run same `update()`
- [ ] Lobby / matchmaking screen (public + private room, matching Lovers Lost / Battleshits pattern)
- No changes to game logic layer

---

## File Checklist (v1 scope)

```
games/sumorai/
  index.html
  style.css
  game.js
  scripts/
    assets.js
    input.js
    controls.js
    physics.js
    player.js
    combat.js
    gridlock.js
    projectile.js
    camera.js
    stage.js
    round.js
    renderer.js
    hud.js
    effects.js
    audio.js
  assets/
    sprites/   ← already extracted
    sounds/    ← already extracted
  tests/
    physics.test.js
    combat.test.js
    gridlock.test.js
    projectile.test.js
    round.test.js
  GDD.md
  IMPLEMENTATION_PLAN.md
  reference/
    sumorai.sb3
```

## Test Coverage Targets

| Module         | What to test                                                     |
|----------------|------------------------------------------------------------------|
| physics.js     | Gravity accumulation, friction, floor land, platform pass/land, blast zone detection |
| combat.js      | Hit detection overlap, hitstun application, shield knockback impulse, gridlock trigger condition |
| gridlock.js    | Mash progress increments, win condition, tie condition, knockback direction |
| projectile.js  | Movement per tick, hit detection, block destroy, clash cancel at midpoint |
| round.js       | Timer countdown, win threshold, tiebreak logic, state transitions |
