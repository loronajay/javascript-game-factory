# Creature Battle Docs

This folder is the design archive for the Creature Battle initiative.

## Main areas

- `combat-system/`: shared combat core, rule sets, modes, roster, and data contracts
  - `CLASS_SYSTEM_IMPLEMENTATION_PLAN.md` — historical 4-phase implementation plan for the class system, retained for its file map, data shapes, hook design, and extension rules
  - `CLASS_CUSTOMIZATION_SCREEN_SCOPE.md` — scope for the class customization screen (between team select and battle): level tier → class depth, UX flow, passive equip, information hiding rules
  - `CLASS_SKILLS_AND_PASSIVES_CANON.md` — living canon record of class skills and passives. All five single-stat routes are complete in the live engine; hybrid and prestige routes remain future content.
- `progression-system/`: long-term RPG progression planning
- `creatures/`: per-creature scope docs; `creatures/reference/` holds loose reference art
- `battle-scene/`: battle scene canon package, implementation spec, and reference assets (flattened from original double-nested structure)
- `simulators/battle-tuning-v10/`: browser-based tuning simulator plus balance data and formulas
- `simulators/battle-3v3/`: 3v3 simulator HTML prototype

Note: creature sprites (`.png` files) live in `../shared/creatures/` — accessible from both `creature-battler/` and `creature-rpg/` at the same relative path.

## Implementation status

The playable game is in `../creature-battler/`. Open `../creature-battler/index.html` to run it. The four original implementation phases and all five single-stat routes (Strength, Defense, Intelligence, Spirit, and Speed) are complete. The implementation and `../creature-battler/CLAUDE.md` are authoritative for what is live; use these docs as design input and historical context.

## How to use this folder

- Treat these docs as design inputs, not as a production code module.
- Prefer extending the closest existing document instead of starting parallel design files.
- When implementation diverges from a doc, update the doc to match rather than leaving them out of sync.
