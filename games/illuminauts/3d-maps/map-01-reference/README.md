# Illuminauts first-person 3D map proof

This is an isolated proof-of-concept for converting the existing authored Illuminauts map diagrams into deterministic first-person 3D worlds.

## Drop-in location

Copy this folder to:

`games/illuminauts/fp3d-prototype/`

Then serve `games/illuminauts/` over HTTP and open `/fp3d-prototype/` from that server. In that layout the prototype loads `../maps/map-01.txt` directly, so the production map remains the source of truth.

The JavaScript also contains a bundled snapshot of the map-01 raw grid purely as a portable fallback. That lets this folder run by itself without changing how it behaves when installed in the repository.

## What it proves

- Loads `../maps/map-01.txt` at runtime when installed in the repo; there is no separately designed 3D maze.
- Uses the existing 35×27 ASCII grid as the canonical layout.
- `#` becomes a fixed wall tile.
- `S` becomes the player spawn.
- `A` becomes an Access Chip.
- `P` becomes a Power Cell / suit-light overcharge.
- `D` becomes a closed Laser Door. Walking into it consumes one Access Chip and opens it, matching production behavior.
- The 5×5 `B` region becomes the Beacon Core goal.
- Uses a fixed 60 Hz movement step and grid-derived collision.
- Desktop: WASD + mouse, Shift sprint, M minimap, R reset.
- Mobile: left virtual stick, right-side drag look, sprint button.
- The minimap renders the same source grid beside the 3D world so correspondence can be visually checked.
- Facility dressing uses coordinate hashing only; there is no runtime randomness, so the same map produces the same decorative light placement as well.

## Validation performed

- JavaScript syntax check passes with Node.
- Map snapshot is rectangular at 35×27.
- Beacon Core has exactly 25 cells.
- Map contains 4 Access Chips, 8 Power Cells, and 3 Laser Doors.
- A state-aware BFS that models chip pickup/door consumption reaches the Beacon Core from the authored spawn in 136 grid steps.

## Deliberately excluded from this first proof

Aliens, laser gates, turrets, online synchronization, damage, stamina, audio, and production UI are not ported yet. The point of this proof is to validate deterministic map extrusion and first-person traversal before multiplying scope.

## Run standalone

Windows: double-click `play.bat`.

macOS/Linux: run `./play.sh` and open `http://localhost:8080/`.

The prototype imports Three.js 0.185.1 from jsDelivr, so the browser needs network access to that CDN.
