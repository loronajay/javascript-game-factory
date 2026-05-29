# Creature Battle

`creature-battle/` contains both the design archive and the active playable implementation.

## What is here

- `creature-battler/`: **active playable game** — open `creature-battler/index.html` to play
- `creature-rpg/`: reserved for future RPG implementation
- `shared/creatures/`: creature sprites shared by both implementations (12 creatures: `aquaphant/`, `clod/`, `emberjaw/`, `flor/`, `galeon/`, `gravemoss/`, `lumora/`, `nocthorn/`, `pengun/`, `salamander/`, `tidecalf/`, `voltwing/`)
- `shared/creature-sheets/`: multi-creature concept-art PNGs; run `python slice_sheets.py` from that folder to extract individuals into `sliced/`
- `docs/`: design archive for combat rules, progression, creature scope, and simulator docs

## creature-battler — current status

**Fully playable 3v3 training battle mode and online 1v1 blind pick. Registered on the platform grid.**

### Entry points
- **Platform**: `games/creature-battle/index.html` — registered cabinet entry; loads factory identity, publishes match results to activity feed, back-button to arcade grid
- **Standalone dev**: `creature-battler/index.html` — direct entry, no platform integration, all game logic identical

### Menu flow
Title → Mode Select → Battle Config (level tier select) → Team Select → Class Customization → Battle → Results

Online: Title → Mode Select → Online Lobby (settings + matchmaking/rooms) → Blind Pick → Class Customization → Battle → Results

- **Battle Config screen**: 7 fixed level tiers (Lv.5 Beginner through Lv.100 Maximum), default Lv.30; both teams build at the chosen level
- **Team Select**: per-creature stats popup (R key) shows resolved stats, Arts, and Skills at the configured level; element guide overlay (I key) shows 8×8 matchup chart and status reference
- **Class Customization**: browse 16 class routes, equip 3 passives per creature, lock in before battle; auto-allocate button for quick random assignment; synced to opponent in online matches
- **Input**: keyboard (WASD + arrow keys) and mouse fully supported on every screen; Space = universal action key

### Platform integration
- Registered in `js/arcade-catalog.mjs` with slug `creature-battler`; `game.json` present
- Factory identity read via `loadFactoryProfile()` — player name shown on title screen if set
- Match results published to activity feed via `publishCreatureBattleMatchActivity` on battle end
- Mobile controls: desktop-only for now; no touch profile wired

### Battle engine
- Speed-based turn order; player wins ties
- Physical (STR vs DEF) and magic (INT vs SPI) damage classes; elemental matchups with full opposition table and sub-interactions; crits (5% chance, 1.5× mod)
- Defend halves incoming damage; retargeting on KO; multi-hit arts distribute level scaling evenly across hits
- **Status effects — all 6 live**: `poison` (permanent, 6% HP/round), `burn` (3 rounds, 6% HP + DEF-1), `stun` (skip turn), `blind` (all attacks miss), `slow` (SPD halved), `silence` (arts disabled)
- **Stat modifier stages**: STR/DEF/INT/SPI/SPD/ACC/EVA ±5 stages; stage multiplier table applied to all calculations
- **Seeded RNG**: online matches use a shared mulberry32 seed from the server so both clients produce identical results

### Move system
- 180 creature moves across 12 creatures + 1 shared basic attack
- Targeting types: `single`, `all_enemies`, `all_allies`, `self`, `single_ally`
- Multi-target moves show a confirm step before locking; multi-hit single-target moves (hitCount 2–3) deal distributed total damage across all hits
- **Art command menu**: 3-column grid layout; tiered arts grouped into rows
- **Skills command menu**: class skills available per creature based on equipped route and level tier; `canUse()` checks enforced before display

### Class system (all 5 single-stat routes complete)
- 16 class routes total; 5 fully implemented (all single-stat routes); 11 remaining (10 hybrid + no_allocation prestige)
- Each route has 5 tiers, 5 skills + 5 passives per tier; tiers unlock by level band
- 3 passive slots equipped before battle; all learned skills available with no slot limit
- **Strength route** (Apprentice → Squire → Knight → Hero → Kingslayer): 25 skills + 25 passives; full engine coverage including Brace + Counter Strike reaction and Courage Strike 2-turn wind-up
- **Defense route** (Beefcake → Brolic → Garrison → Vigorous → Aegis): 25 skills + 3 pseudo-skills + 25 passives; full engine coverage including Barrier HP, Damage Store, Absorb intercept, Shield Wall, Total Defense, Aegis Shield, Counter Stance → Counter Surge chain, Retaliation, Taunt, Meditate, Stand Firm
- **Intelligence route** (Adept → Magician → Wizard → Sorcerer → Warlock): 25 skills + 25 passives; magic offense/burst focus
- **Spirit route** (Tactician → Strategist → Rulebender → Rulebreaker → Mastermind): 25 skills + 25 passives; support/utility/sustain focus
- **Speed route** (Scout → Strider → Acrobat → Phantom → Timebreaker): 25 skills + 25 passives; evasion/priority/tempo focus

### Online 1v1
- WebSocket relay via factory-network-server; `find_match` / `create_room` / `join_room` matchmaking
- Server-side symmetric side assignment; shared RNG seed passed at `match_ready`
- **Blind pick**: both players pick simultaneously from full roster; coordinator sends `match_settings` and collects both `team_locked` messages before broadcasting `match_start`
- Round sync: each player sends `player_actions`; second arrival triggers resolution; RNG advances identically on both clients
- Disconnect overlays on all three online screens (lobby, blind-pick, battle)
- Class configs synced via `class_ready` message before blind pick locks in

### Animation system
- Timeline-based engine (`runAnimTimeline` in `animation-engine.js`); 81 named presets (9 per element × 9 elements)
- All 12 creatures fully animated — 15 moves each, covering projectile, beam, lunge, AoE, and ultimate tiers
- Scale-corrected projectile positioning via `_getCanvasScale()` — fixes offset on opponent-side projectiles under CSS `scale()` transforms
- Float text per creature slot: `damage`, `crit`, `heal`, `miss`, `status` kinds

### Sound
- **UI**: button-click on all navigation and confirmation events, invalid sound on disabled commands
- **Music**: menu music on title/mode-select, battle theme loops during battle, results music on match end
- **Combat SFX**: hit variants, element-specific cast sounds, charge sounds — wired per move via animation registry

### HUD and playback
- Live HP/MP bars per creature slot; KO state reflected in HUD and field sprites
- In-battle stats panel accessible during battle for all 12 creatures
- Each action result pauses for player to advance (Space / click), with blinking cue
- Float text numbers appear on field sprites at impact frame

### Tests
- `sounds.test.js`, `battle-round.test.js`, `battle-float-text.test.js`, `battle-status.test.js`
- Per-creature animation test files in `scripts/animations/`

### Pending
- Defense route playtest pass (Taunt, Retaliation, Damage Store, Counter Stance → Counter Surge, Shield Wall, Resilient regen, Unassailable status block)
- Draft pick mode (roster at 12 — threshold met, not yet implemented)
- Additional class routes (14 remaining)
- Items menu (currently disabled)
- Grid-preview image (`grid-previews/creature-battler.png`)
- Mobile touch controls

## How to navigate the docs

- Start in `docs/README.md` for the document map.
- Use `docs/combat-system/` for shared battle rules and contracts.
- Use `docs/progression-system/` for RPG growth planning.
- Use `docs/creatures/` for creature-specific scope notes and references.
- Use `docs/simulators/` for historical balance reference tools.

Keep `docs/` as a design reference archive. Production code lives in `creature-battler/` only.
