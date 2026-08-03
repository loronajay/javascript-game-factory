# Illuminauts Modular Debug Demo

This is a historical, intentionally offline debug scaffold for testing the early Illuminauts core loop. It is not the current production cabinet. See `../README.md` for the shipped game, online modes, solo modes, map catalog, and test commands.

## What is wired

- Two-pane debug layout:
  - Left: canon limited-vision player view.
  - Right: full-map debug view.
- Classic tile movement with one-tile-wide corridors.
- Wall collision.
- Access Chip pickup count.
- Laser Doors that consume one Access Chip and stay disabled.
- Power Cells that expand suit light for 15 seconds.
- Alien Patrols on fixed routes.
- Laser Gates with warning/active/cooldown timing.
- Laser Turrets with warning/active/cooldown hallway beams.
- 3-heart damage system.
- Respawn at start when hearts reach 0.
- Death keeps Access Chips and opened Laser Doors, but cancels active Power Cell boost.
- Sprint with stamina drain/recovery.
- HUD wired to actual player state.

## Controls

- Move: WASD or arrow keys.
- Sprint: hold Shift while moving.
- Activate Power Cell: stand on a Power Cell and press E.

## File structure

```text
index.html
styles.css
src/
  config.js
  hazards.js
  hud.js
  input.js
  main.js
  map.js
  player.js
  renderer.js
  state.js
```

## Architecture notes

This demo intentionally keeps networking out of the local prototype. The production cabinet has since shipped its Factory Network integration; the list below records the authority boundary this scaffold was designed around:

- map seed/generated layout
- player positions
- pickup state
- Laser Door state
- hazard timers/routes
- damage and respawn events
- win detection

The current local modules are placeholders for that authority boundary, not final online architecture.
