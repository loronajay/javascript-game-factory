# Creature Battle

`creature-battle/` contains both the design archive and the active playable implementation.

## What is here

- `creature-battler/`: **active playable game** — open `creature-battler/index.html` to play
- `creature-rpg/`: reserved for future RPG implementation
- `shared/creatures/`: creature sprites shared by both implementations (`aquaphant/`, `flor/`, `pengun/`, `salamander/`)
- `shared/creature-sheets/`: multi-creature concept-art PNGs; run `python slice_sheets.py` from that folder to extract individuals into `sliced/`
- `docs/`: design archive for combat rules, progression, creature scope, and simulator docs

## creature-battler — current status

**Fully playable 3v3 training battle mode. Registered on the platform grid.**

### Entry points
- **Platform**: `games/creature-battle/index.html` — registered cabinet entry; loads factory identity, publishes match results to activity feed, back-button to arcade grid
- **Standalone dev**: `creature-battler/index.html` — direct entry, no platform integration, all game logic identical

### Menu flow
Title → Mode Select → Battle Config (level tier select) → Team Select (player + opponent, 2-phase) → Battle → Results

- **Battle Config screen**: 7 fixed level tiers (Lv.5 Beginner through Lv.100 Maximum), default Lv.30; both teams build at the chosen level
- **Team Select**: per-creature stats popup (R key) shows resolved stats, Arts, and Skills at the configured level
- **Input**: keyboard (WASD + arrow keys) and mouse fully supported on every screen; Space = universal action key

### Platform integration
- Registered in `js/arcade-catalog.mjs`; `game.json` present; grid preview at `grid-previews/creature-battle.png`
- Factory identity read via `loadFactoryProfile()` — player name shown on title screen if set
- Match results published to activity feed via `publishCreatureBattleMatchActivity` on battle end
- Mobile controls: desktop-only for now; no touch profile wired

### Battle engine
- Speed-based turn order; player wins ties
- Physical and magic damage classes; elemental matchups; crits (5% chance, 1.5× mod)
- Defend halves incoming damage; retargeting on KO
- **Status effects — all 6 live**:
  - `poison` — permanent until cured; ticks 6% max HP at end of each round
  - `burn` — 3-round tick (same 6% HP); drops DEF one stage on application
  - `stun` — creature auto-skipped in the input phase for the duration
  - `blind` — all attacks miss for the duration
  - `slow` — effective speed halved (floor 1) for the duration
  - `silence` — art menu disabled; ART command greyed out in the input phase
  - Status ticks fire end-of-round before duration advance; battle-end checked after ticks
- **HUD status badges**: color-coded per status (purple=poison, red=burn, yellow=stun, grey=blind, teal=slow, indigo=silence, green=buff, red=debuff)
- **Stat modifier stages**: STR/DEF/INT/SPI/SPD/ACC/EVA ±5 stages; stage multiplier table applied to all calculations

### Move system
- 56 creature moves across 4 creatures + 1 shared basic attack (57 total)
  - Flor's `cleanse` (Lv.27) removes all status effects from one ally
- Targeting types: `single`, `all_enemies`, `all_allies`, `self`, `single_ally`
- Multi-target moves show a confirm step with all affected creatures highlighted before locking
- **Art command menu**: 3-column grid layout; tiered abilities grouped into rows with null placeholder cells
- Arts and Skills split in UI; Skills section shows "coming soon" placeholder

### Animation system (`battle-animations.js` + `scripts/animations/`)
- `MOVE_ANIM_REGISTRY` — per-move animation config: `cast`, `hit`, `chargeClass`, `castSound`, `hitSound`, `chargeSound`, `hitDelay`, `lunge`
- Charge → cast → hit sequencing with configurable delays and sound timing
- Lunge animations compute live pixel offsets between actor and target elements
- Multi-hit animations stagger 100ms between targets; `multi_hit` type staggers float texts 140ms apart
- Float text per creature slot: `damage`, `crit`, `heal`, `miss`, `status` kinds
- **All 4 creatures fully animated** — complete CSS + JS passes for every move:
  - Salamander: 13 moves (spark flick tier, ember trail, ash veil, smoke screen, flare bite lunge, cinder burst tier, scorch, magma surge)
  - Aquaphant: 13 moves (bubble shot tier, soak hide, healing wave, tidal bump lunge, hydro skin, undertow, whirlpool, surge crash tier, torrent lunge)
  - Pengun: 15 moves (ice pebble tier, cold feet, glacier wall, snow blind, whiteout, frost nip lunge, shatter chill tier, ice lock, frozen pulse, blizzard, absolute zero lunge)
  - Flor: 15 moves (sprout tap tier, petal mend tier, thorn bind, root snare, verdant guard, toxic spores, bloom surge, cleanse, pollen veil, nature's ward, world tree)

### Sound
- **UI**: button-click on all navigation and confirmation events, invalid sound on disabled commands
- **Battle music**: `battle-theme.mp3` loops during battle, stops on return to menus
- **Combat SFX**: `hit-light`, `hit-heavy`, `fire`, `charge-light`, `beam-light` — wired per move via animation registry

### HUD and playback
- Live HP/MP bars per creature slot (HUD top + target select panel)
- KO state reflected in HUD and field sprites
- Each action result pauses for player to advance (Space / click), with blinking cue
- Float text numbers appear on field sprites at impact frame

### Tests
- `sounds.test.js`, `battle-round.test.js`, `battle-float-text.test.js`, `battle-status.test.js`
- Per-creature animation test files in `scripts/animations/`

### Pending
- Balance tuning (damage numbers, HP/MP values, MP costs, stat stage effects in practice)
- Skills system — universal rental-creature skills; command panel shows "coming soon" placeholder
- Online 1v1 — lobby, matchmaking, server-authoritative round resolution (not yet scoped)
- Combo system
- Items menu (currently disabled)
- Additional creatures beyond the launch roster of 4

## How to navigate the docs

- Start in `docs/README.md` for the document map.
- Use `docs/combat-system/` for shared battle rules and contracts.
- Use `docs/progression-system/` for RPG growth planning.
- Use `docs/creatures/` for creature-specific scope notes and references.
- Use `docs/simulators/` for historical balance reference tools.

Keep `docs/` as a design reference archive. Production code lives in `creature-battler/` only.
