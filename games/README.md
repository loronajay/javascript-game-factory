# Games

This folder holds the game cabinets for Javascript Game Factory. Each game should stay self-contained and own its local rules, assets, presentation, and tests.

## Games in this repo

- `battleshits/`: implemented online Battleship-style cabinet with its own tests and assets
- `build-buddy/`: design-only co-op platformer concept, currently documented through its GDD
- `circuit-siege/`: active online-authoritative 1v1 route-repair cabinet with shared rules, client/server tests, and a coordinated dependency on `factory-network-server`
- `creature-battle/`: creature battler and RPG planning workspace with deep design docs and simulators
- `echo-duel/`: documented online memory duel prototype
- `lovers-lost/`: implemented split-screen reunion runner with its own tests and assets
- `questionable-decisions/`: trivia plus penalty mini-game design workspace

## Expected structure

The repo-level instructions treat this as the canonical home for per-game scope:

- entry files such as `index.html`, `style.css`, and `game.js`
- game-specific assets under local subfolders
- tests near the game
- GDD and cabinet-specific notes inside the game folder

## Boundary reminder

Games own cabinet-local rules and presentation. Shared identity, durable profiles, feed records, and social features belong to the shared platform, not to individual game folders.
