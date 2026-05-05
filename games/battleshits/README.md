# Battleshits

`battleshits/` is an implemented 1v1 online Battleship-style cabinet with a toilet-theme presentation layer over standard Battleship rules.

## What is here

- `index.html`, `style.css`, `game.js`: cabinet entry files
- `scripts/`: gameplay, matchmaking, battle flow, board logic, presentation, and audio modules
- `css/`: screen-specific styling for placement, battle, menus, panels, and responsive behavior
- `images/`: ship art, emoji art, and reference images
- `sounds/`: SFX and battle/menu music
- `tests/`: Node-based tests for structure, board rules, online flow, audio, emojis, and presentation helpers
- `GDD.md` and `phase-1-scope.md`: cabinet scope and implementation notes

## Test commands

From `games/battleshits/`:

```txt
npm test
```

Available package scripts cover focused test runs as well.

## Ownership notes

- Standard Battleship rules live here.
- Matchmaking and live room behavior integrate with the platform network server, but long-term player identity still belongs to the factory shell.
