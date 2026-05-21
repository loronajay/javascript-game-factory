# Creature Battle Docs

This folder is the design archive for the Creature Battle initiative.

## Main areas

- `combat-system/`: shared combat core, rule sets, modes, roster, and data contracts
- `progression-system/`: long-term RPG progression planning
- `creatures/`: per-creature scope docs; `creatures/reference/` holds loose reference art
- `battle-scene/`: battle scene canon package, implementation spec, and reference assets (flattened from original double-nested structure)
- `simulators/battle-tuning-v10/`: browser-based tuning simulator plus balance data and formulas
- `simulators/battle-3v3/`: 3v3 simulator HTML prototype

Note: creature sprites (`.png` files) live in `../shared/creatures/` — accessible from both `creature-battler/` and `creature-rpg/` at the same relative path.

## Implementation status

The playable game is in `../creature-battler/`. Open `creature-battler/index.html` to run it. That implementation is the authoritative source for what is actually live — use these docs as design input and reference, not as a spec for what is built.

## How to use this folder

- Treat these docs as design inputs, not as a production code module.
- Prefer extending the closest existing document instead of starting parallel design files.
- When implementation diverges from a doc, update the doc to match rather than leaving them out of sync.
