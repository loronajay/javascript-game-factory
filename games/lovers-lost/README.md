# Lovers Lost

`lovers-lost/` is an implemented runner cabinet where two mirrored runners try to survive hazards and reunite before the round timer expires.

## What is here

- `index.html`, `style.css`, `game.js`: cabinet entry files
- `scripts/`: gameplay modules for input, ticking, collision, rendering, scoring, online play, and assets
- `images/` and `sounds/`: cabinet-local art and audio
- `tests/`: Node-based gameplay tests
- `docs/` and `dev/`: supporting notes and development material
- `game.json`: catalog metadata for the arcade shell

## Test commands

From `games/lovers-lost/`:

```txt
npm test
```

The package also exposes focused test scripts for structure and gameplay.

## Ownership notes

- Obstacle rules, scoring, runner state, and cabinet presentation live here.
- Shared player identity and durable profile behavior remain platform-owned.
