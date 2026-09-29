# Lovers Lost

`lovers-lost/` is a two-mode co-op cabinet. The original mirrored runner asks two lovers to survive hazards and reunite before the timer expires; Puzzle Campaign asks them to solve split-lane platforming stages by opening the way for each other.

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

The package runs the complete cabinet suite and also exposes focused scripts for structure and gameplay checks. Avoid recording a fixed test total here; the suite grows as cabinet seams are extracted.

## Ownership notes

- Obstacle rules, scoring, runner state, and cabinet presentation live here.
- Shared player identity and durable profile behavior remain platform-owned.
- Puzzle stages are authored as expandable packs in `scripts/puzzle-stage-packs.js`; simulation, progress, rendering, and platform ticket reporting stay behind separate modules.

## Puzzle Campaign controls

- Boy: `W` jump, `A/D` move
- Girl: `ArrowUp` jump, `ArrowLeft/ArrowRight` move
- One-player mode uses both control sets; two-player mode splits them between local players.
- Press `R` to reset a stage or `Esc` to return to the campaign menu.
