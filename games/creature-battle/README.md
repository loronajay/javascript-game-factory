# Creature Battle

`creature-battle/` contains both the design archive and the active playable implementation.

## What is here

- `creature-battler/`: **active playable game** — open `creature-battler/index.html` to play
- `game-docs/`: design archive for combat rules, progression, creature scope, and simulator docs
- `creature-rpg/`: reserved for future RPG implementation

## creature-battler — current status

**Fully playable 3v3 training battle mode.** Implemented features:

- **Menu flow**: Title → Mode Select → Team Select (player + opponent, 2-phase) → Battle → Results
- **Battle engine**: speed-based turn order, physical/magic damage classes, elemental matchups, crits, defend (halves damage), retargeting on KO
- **Move system**: 18 moves across 5 creatures with `single`, `all_enemies`, `all_allies`, and `self` targeting
- **Multi-target flow**: multi-target moves show a confirm step with all affected creatures highlighted before locking in
- **Input**: keyboard (WASD + arrow keys) and mouse both fully supported across all screens
- **Playback**: each action result pauses for player to advance (Space / Enter / click), with a blinking cue
- **HUD**: live HP/MP bars, KO state, creature portraits per slot
- **Sound**: button-click sound wired to all navigation, selection, and confirmation events

### Pending
- Balance tuning (damage numbers, HP/MP values, MP costs)
- Combo system
- Status effects
- Skills and Items menus (currently disabled in command panel)
- Additional creatures beyond the launch roster

## How to navigate the docs

- Start in `game-docs/README.md` for the document map.
- Use `combat-system/` for shared battle rules and contracts.
- Use `progression-system/` for RPG growth planning.
- Use `creatures/` for creature-specific scope notes and references.
- Use the simulator folders for historical balance reference.

Keep `game-docs/` as a design reference archive. Production code lives in `creature-battler/` only.
