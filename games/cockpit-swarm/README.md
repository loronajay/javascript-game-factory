# Cockpit Swarm

A first-person fixed-shooter viewed from inside a cockpit. Strafe left/right along a rail to dodge incoming fire and shoot down enemy formations advancing from the horizon across 15 stages and 3 boss encounters.

## Run

Open `index.html` from a local server. ES modules require a server — direct file:// open won't work.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Controls

**Desktop:**
- A / Left Arrow — strafe left
- D / Right Arrow — strafe right
- Space / J — fire
- Enter / ESC — menu navigation / back

**Mobile:**
- On-screen LEFT / RIGHT / FIRE buttons (shown on touch devices)

## Campaign structure

15 stages split into three 5-stage blocks. A boss encounter triggers after each block:

| Block | Stages | Boss |
|-------|--------|------|
| 1 | 1–5 | Boss 01 — 3-phase arm/laser fight |
| 2 | 6–10 | Boss 02 — Arbiter |
| 3 | 11–15 | Boss 03 — Eclipsis (5-phase final boss) |

## Modes

- **Campaign** — 15 stages + 3 bosses in sequence
- **Boss Rush** — straight to Boss 01

## File structure

```
js/
  main.mjs                   Boot, canvas setup, game loop
  mobile-gate.mjs            Mobile device detection
  core/
    constants.mjs            STATE enum, TUNING, LANES, button layout
    state.mjs                createGameState() — single source of truth
    math.mjs                 clamp(), lerp(), rand()
  systems/
    input.mjs                Keyboard + touch + mouse; edge-triggered presses
    game.mjs                 Main update router + all game logic
    projection.mjs           project(), projectEnemyBullet(), getPlayerShotWorldX()
    stages.mjs               STAGES array (15 entries), getStage(), hasNextStage()
    wave-behaviors.mjs       Wave AI: behavior selection, telegraph, pending shot queue
    powerup-system.mjs       Powerup spawn, pickup, effects, splash damage
    boss.mjs                 Boss lifecycle, phase transitions, tryDamageBossInShotLane
    boss-dreadmaw.mjs        Boss 01 state machine
    boss-arbiter.mjs         Boss 02 state machine
    boss-eclipsis.mjs        Boss 03 state machine (5-phase)
    runner-system.mjs        Runner spawn, movement, firing, hit detection
    audio.mjs                Sound pools + boss sound wiring
    online.mjs               Relay client for multiplayer (in progress)
    mp-controller.mjs        Host-authoritative multiplayer controller (in progress)
  entities/
    enemy.mjs                ENEMY_TYPES, makeEnemy(), makeFormation(), spawnEnemyBullet()
    boss.mjs                 makeBoss(), arm/mouth factories, phase helpers
    powerups.mjs             POWERUP_TYPES, makePowerup(), isPowerupInShotLane()
    runner.mjs               RUNNER_DEFS, makeRunner()
    particles.mjs            spawnExplosion(), spawnMissSpark()
    stars.mjs                makeStars()
  render/
    scene.mjs                Top-level render router
    background.mjs           Starfield + depth grid
    world.mjs                Enemies, bullets, powerups, particles
    cockpit.mjs              Cockpit frame, reticle, hurt flash
    hud.mjs                  Score, health, stage badge, combo
    menus.mjs                Menu, how-to-play, end screens
    runners.mjs              Runner enemy rendering
    enemies.mjs              Enemy shape drawing
    boss-scene.mjs           Boss render router + shared boss HUD
    boss-dreadmaw.mjs        Boss 01 rendering
    boss-arbiter.mjs         Boss 02 rendering
    boss-eclipsis.mjs        Boss 03 rendering
    boss-fx.mjs              Shared boss effects (explosions, flashes)
    mp-scene.mjs             Multiplayer-specific rendering (in progress)
    quality.mjs              Render quality helpers
css/
  game.css                   Layout — canvas centering, mobile touch zones
assets/
  *.wav                      Sound files
```
