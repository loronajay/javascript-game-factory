# Legacy TurboWarp reference

Source inspected: `tactical-arena.sb3` (TurboWarp/Scratch project). Its unit
data and mechanics are canonical for this rebuild, except where the user makes
an explicit later refinement.

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

The Swordsman's legacy 25 HP and 20 MP are authoritative in the new cabinet.
The original passive name was **Final Strike**, but the canonical new name is
**Last Stand**.

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

## Archer behavior recovered from scripts

- **Close Shot:** adds 1 damage within two tiles and 2 damage at adjacent
  range (the original uses pixel distance, so diagonal-edge behavior will be
  normalized explicitly when implemented).
- **Rain Shot:** 5 MP, target a range-5 cone, and deal 2 direct damage to each
  enemy in the cone.
- **Poison Arrow:** 4 MP, normal attack plus a 60% poison check. Archer and
  Paladin are immune in the original project. Poison is canonically permanent
  until removed or cleansed by an ability.
- **Leg Shot:** 4 MP, normal attack plus a 60% Slow check. Paladin is immune;
  Slow has a two-turn timer measured on the affected unit's own turns.
- **Emblem:** passive immunity to poison.

## Not carried over

No old SVG, PNG, font, or sound asset has been copied. The new cabinet will use
fresh SVG/CSS presentation in the Mini-Tactics visual direction.
