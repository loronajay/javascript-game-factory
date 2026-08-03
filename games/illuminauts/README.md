# Illuminauts

Illuminauts is a dark-facility maze game built around suit-generated light, Access Chips, Laser Doors, patrols, hazards, and a race to the Beacon Core.

## Current status

- The production cabinet is shipped on the arcade grid.
- Online mode is a playtested 2-player race through the six-map catalog.
- Solo Sprint mode is a time attack to the exit; Solo Sweep adds Data Core collection before escape.
- Maps carry authored solo names and par times and participate in the online rotation.
- Phase 5 procedural generation remains the next planned workstream; generated layouts are currently refined and shipped as authored maps.

The nested `illuminauts_modular_demo/` folder is a historical offline debug scaffold, not the production entry point.

## Structure

- `index.html`, `style.css`, and `game.js`: production cabinet entry and orchestration
- `scripts/state.js`: canonical local/online match state
- `scripts/online.js`: the only raw WebSocket client
- `scripts/online-identity.js`: factory identity adapter
- `scripts/`: map, player, hazard, rendering, audio, input, and session modules
- `maps/`: production map catalog
- `map-editor-v2.html`: current map authoring/import/export tool
- `tests/`: shell, mobile, state, session, identity, renderer, audio, and asset checks
- `ILLUMINAUTS_GDD.md`: design source of truth
- `CLAUDE.md`: current implementation status and architecture contracts

## Run locally

Serve the cabinet over HTTP:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Tests

From `games/illuminauts/`:

```bash
npm test
```

Focused scripts are available in `package.json` for each covered subsystem.
