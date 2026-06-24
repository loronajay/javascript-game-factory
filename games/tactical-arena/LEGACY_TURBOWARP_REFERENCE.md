# Legacy TurboWarp reference

Source inspected: `tactical-arena.sb3` (TurboWarp/Scratch project). This is a
design reference only. Its rules and numbers are **not** canonical where they
conflict with `GDD.md` or later design decisions.

## Recovered roster data

| Unit | HP | Move | Range | STR | DEF | MP | Passive | ART slots |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Swordsman | 25 | 3 | 1 | 10 | 5 | 20 | Final Strike | Footwork; Moonstrike; Mage Killer; Life Sap |
| Archer | 24 | 2 | 5 | 8 | 4 | 22 | Close Shot | Rain Shot; Poison Arrow; Leg Shot; Emblem (passive) |
| Magician | 23 | 2 | 5 | 6 | 3 | 40 | Magic Pipe | Spark; Flee; Banish |
| Mystic | 23 | 2 | 5 | 5 | 3 | 38 | Anointed | Pray; Wish; Silence; Guardian (passive) |
| Necromancer | 23 | 3 | 5 | 6 | 3 | 36 | Deathly Aura | Summon Ghoul; Dark Bomb; Wither; Dead Zone (passive) |
| Paladin | 26 | 3 | 1 | 10 | 5 | 24 | Hand of Life | Lightseeker; Heaven's Realm (passive); Chosen (passive) |
| Sniper | 23 | 2 | 6 | 8 | 3 | 18 | Rifle Powered | Smoke Bomb; Build Cover; Throw Cigar |

The new Swordsman numbers already supersede the legacy values: 26 HP and 15 MP
are authoritative in the new cabinet. The legacy project calls the Swordsman
passive **Final Strike**; its old behavior still needs confirmation before that
name is adopted in the new source of truth.

## Engine evidence worth carrying forward

- **Status effects:** poison, stun, slow, blind, and silence all had explicit
  lifecycle/UI hooks.
- **Placement and summon effects:** fire tiles, wall tiles, targeted-tile
  overlays, and Ghoul units were present.
- **Targeting patterns:** ordinary range plus line, cone, and area selection
  were implemented as distinct board-highlighting modes.
- **Stat modifications:** the project had STR, DEF, move-speed, and range
  boosts/debuffs. The new runtime `statModifiers` seam deliberately supports
  this direction.

## Not carried over

No old SVG, PNG, font, or sound asset has been copied. The new cabinet will use
fresh SVG/CSS presentation in the Mini-Tactics visual direction.
