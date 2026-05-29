# Cockpit Swarm Modular V1

This is the modularized version of the working V1.3 prototype.

The goal of this build is not to add features yet. The goal is to make future passes cheaper by splitting the prototype into focused files.

## Run

Open `index.html` from a local server.

Because this uses ES modules, some browsers block it when opened directly from disk.

Recommended quick server from the folder:

```bash
python -m http.server 8000
```

Then open:

```txt
http://localhost:8000
```

## Controls

Desktop:
- A / Left Arrow: strafe left
- D / Right Arrow: strafe right
- Space / J: fire
- R / Enter: restart after clear/game over

Mobile:
- On-screen LEFT / RIGHT / FIRE buttons appear on coarse pointer devices.

## Current gameplay model

This version keeps the lane-locked model that made V1.3 feel good.

Shooting:
```js
Math.abs(enemy.x - player.x) <= TUNING.enemyBulletLaneHitWindow
```

Enemy projectile collision:
```js
Math.abs(enemyBullet.x - player.x) <= TUNING.enemyBulletLaneHitWindow
```

Enemy/projectile Y is visual only.

## File structure

```txt
cockpit_swarm_modular_v1/
  index.html
  css/
    game.css
  js/
    main.mjs
    core/
      constants.mjs
      math.mjs
      state.mjs
    entities/
      enemy.mjs
      particles.mjs
      stars.mjs
    systems/
      game.mjs
      input.mjs
      projection.mjs
    render/
      scene.mjs
```

## Best next patch: 25-enemy formation

The next logical patch should modify only:

```txt
js/entities/enemy.mjs
```

Replace `makeFiveEnemyLineup()` with a 5-column x 5-row formation generator.

Do not change shooting or projectile collision yet. The correct model is already lane-based. The 25-enemy pass should prove whether the visual formation can scale without breaking readability.

## Hard warning

Do not add enemy diving, powerups, or multiple weapon types until the 25-enemy formation is readable. The current success came from keeping the collision model simple.
