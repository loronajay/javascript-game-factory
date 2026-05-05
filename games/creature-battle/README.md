# Creature Battle

`creature-battle/` is a design workspace for the broader creature-battle line rather than a single finished cabinet.

## What is here

- `game-docs/`: the main source of truth for combat rules, progression, creature scope, and simulator docs
- `creature-battler/`: reserved cabinet area for the battler implementation
- `creature-rpg/`: reserved cabinet area for the RPG implementation

At the moment, the implemented value is primarily in the documentation and simulator assets under `game-docs/`.

## How to navigate it

- Start in `game-docs/README.md` for the document map.
- Use `combat-system/` for shared battle rules and contracts.
- Use `progression-system/` for RPG growth planning.
- Use `creatures/` for creature-specific scope notes and references.
- Use the simulator folders for balancing and battle scene reference material.

If code work begins in `creature-battler/` or `creature-rpg/`, keep those implementations isolated from the design archive instead of mixing production code into `game-docs/`.
