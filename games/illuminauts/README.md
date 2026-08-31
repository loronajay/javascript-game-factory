# Illuminauts

Illuminauts is a first-person 3D facility maze built around weak suit light, battery pickups, Access Chips, Laser Doors, patrols, and a race to the Beacon Core.

## Current status

- The production cabinet is shipped on the arcade grid.
- All six authored maps now use one reusable Three.js scene builder, with continuous movement and grid-derived collision.
- First-person controls: WASD move/strafe, mouse look (click to capture), arrow keys move/turn, Shift sprint, Escape quit. Drag-look works without pointer lock; mobile uses the existing D-pad/run controls plus drag-look.
- No minimap or in-game layout reveal. Suits begin on a weak reserve charge; Power Cells are batteries that boost light for 15 seconds. Death cancels the boost.
- Patrol creatures, laser gates, and wall-mounted turrets have simple 3D models; warning/active/cooldown phases, damage, invulnerability, and respawn are live.
- Online retains the existing Factory Network client and identity ownership. Fractional poses and shared-time hazard sampling are integrated; live two-device 3D playtesting is still needed.
- Solo Sprint mode is a time attack to the exit; Solo Sweep adds Data Core collection before escape.
- 3D personal bests use a separate storage namespace. Old 2D times remain untouched; 3D par times await tuning.
- Phase 5 procedural generation remains the next planned workstream; generated layouts are currently refined and shipped as authored maps.

The nested `illuminauts_modular_demo/` folder is a historical offline debug scaffold, not the production entry point.

## Structure

- `index.html`, `style.css`, and `game.js`: production cabinet entry and orchestration
- `scripts/state.js`: canonical local/online match state
- `scripts/online.js`: the only raw WebSocket client
- `scripts/online-identity.js`: factory identity adapter
- `scripts/`: map, player, hazard, rendering, audio, input, and session modules
- `scripts/maps.js`: runtime source of truth for all six map layouts and authored hazards
- `scripts/map-3d.js`, `scene-3d.js`, `scene-hazards.js`, `renderer-3d.js`: grid-to-world conversion, GPU resources, hazard models, camera/rendering
- `scripts/player.js`, `player-interactions.js`, `player-damage.js`: movement, pickups/doors/win, damage/respawn
- `scripts/lighting.js`: reserve-charge and battery-boost lighting profiles
- `maps/`: authoring/import files (not automatically the runtime catalog)
- `MAP_AUTHORING.md`: how to add maps, validate routes, and tune their presentation
- `map-editor-v2.html`: current map authoring/import/export tool
- `tests/`: shell, mobile, state, session, identity, renderer, audio, and asset checks
- `ILLUMINAUTS_GDD.md`: design source of truth
- `CLAUDE.md`: current implementation status and architecture contracts

## Run locally

From this folder, serve the factory root (needed by shared mobile/identity modules):

```bash
npm run dev
```

Then open `http://127.0.0.1:8766/games/illuminauts/`.
The local server disables caching during development. No install or build step is needed; Three.js r179 and its MIT license are vendored locally, matching the existing Hide and Seek cabinet.

## Tests

From `games/illuminauts/`:

```bash
npm test
npm run validate:maps
```

Focused scripts are available in `package.json` for each covered subsystem.
