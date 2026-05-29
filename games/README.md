# Games

This folder holds the game cabinets for Javascript Game Factory. Each game should stay self-contained and own its local rules, assets, presentation, and tests.

## Games in this repo

- `battleshits/`: implemented Battleship-style cabinet with online play plus a solo Classic Bot Battle mode (Easy/Medium/Hard); has its own tests and assets
- `bird-duty/`: 1–2 player cabinet being ported from the TurboWarp original (`status: Porting`); has assets, a `.sb3` source, and tests
- `build-buddy/`: design-only co-op platformer concept, currently documented through its GDD
- `circuit-siege/`: active online-authoritative 1v1 route-repair cabinet with shared rules, client/server tests, and a coordinated dependency on `factory-network-server`
- `creature-battle/`: playable 3v3 creature-battler (the `creature-battler/` sub-game) registered on the arcade grid (`creature-battler` slug); 12 creatures, solo training vs AI, and online 1v1 blind-pick, with deep design docs and tuning simulators alongside
- `echo-duel/`: playable 2–6 player online memory duel (lobby-based, server-authoritative) plus a solo survival mode; major UI pass complete
- `illuminauts/`: 2-player online maze race; suit-light fog, Access Chips, Laser Doors, alien patrols, laser hazards; Phase 4 (online via Factory Network) complete
- `juggle-fighter/`: empty placeholder folder (reserved name; no implementation yet — `index.html` is a stub)
- `lovers-lost/`: implemented split-screen reunion runner with its own tests and assets
- `project-draw/`: modular mobile drawing-engine fill prototype (a tech prototype, not a cabinet)
- `questionable-decisions/`: trivia plus penalty mini-game design workspace
- `sumorai/`: samurai-sumo fighting game ported from a TurboWarp build; fully playable and registered on the grid — local 2P, vs CPU (Easy/Medium/Hard), and online casual + ranked (ELO) play with rollback netcode are all complete

## Expected structure

The repo-level instructions treat this as the canonical home for per-game scope:

- entry files such as `index.html`, `style.css`, and `game.js`
- game-specific assets under local subfolders
- tests near the game
- GDD and cabinet-specific notes inside the game folder

## Boundary reminder

Games own cabinet-local rules and presentation. Shared identity, durable profiles, feed records, and social features belong to the shared platform, not to individual game folders.
