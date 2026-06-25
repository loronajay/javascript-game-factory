# Legacy TurboWarp reference

Source inspected: `tactical-arena.sb3` (TurboWarp/Scratch project). Its unit
data and mechanics are canonical for this rebuild, except where the user makes
an explicit later refinement.

## Confirmed rebuild canon overrides

These are intentional differences from the legacy project and should not be
"corrected" back to the `.sb3` values without a new balance decision:

- **Archer ART1:** the legacy project used **Rain Shot**. The rebuild uses
  **Volley Shot**, a rescoped cone ability.
- **Footwork:** the legacy project spent 5 MP and moved `Move + 2` steps. The
  rebuild uses 4 MP and `Move + 3`.
- **Moonstrike / Mage Killer:** the legacy project spent 4 MP and used a 60%
  status check. The rebuild uses 5 MP and 70%.
- **Life Sap:** the legacy project appears to heal half damage on a successful
  hit without a separate effect roll. The rebuild keeps the implemented 70%
  heal check for testing.
- **Leg Shot:** the legacy project set the Slow timer to 2. The rebuild uses 3
  affected turns.
- **Combat rolls:** the legacy project effectively missed only on 1/20 and
  crit on 20/20. The rebuild is intentionally testing 10% miss and 15% crit,
  with Archer RAGE never missing and critting at 50%.
- **Close Shot scope:** the rebuild applies Close Shot to Archer basic attacks,
  targeted attack ARTS, and Volley Shot per target.
- **Immunity passives:** the rebuild resolves immunities centrally from unit
  passive data, not from per-ART target lists.

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

The table above is raw `.sb3` roster data. For implemented rebuild behavior,
prefer `GDD.md` and `src/core/unitCatalog.js` when this file explicitly lists a
confirmed override.

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
  enemy in the cone. The rebuild's implemented **Volley Shot** is the new canon
  version of this slot.
- **Poison Arrow:** 4 MP, normal attack plus a 60% poison check. Archer and
  Paladin are immune in the original project. Poison is canonically permanent
  until removed or cleansed by an ability.
- **Leg Shot:** 4 MP, normal attack plus a 60% Slow check. Paladin is immune;
  the legacy script sets Slow's timer to 2. The rebuild intentionally uses 3
  affected turns.
- **Emblem:** passive immunity to poison.

## Passive and RAGE evidence recovered from scripts

- **RAGE trigger:** units enter RAGE at 5 HP or lower.
- **Universal RAGE threshold:** the rebuild keeps 5 HP or lower as the universal
  RAGE trigger.
- **Swordsman RAGE:** +3 Move and +1 STR.
- **Last Stand / RAGE stack:** the rebuild intentionally lets Swordsman's Last
  Stand stack with RAGE.
- **Archer RAGE:** +1 STR, +1 range, cannot miss, and has a higher critical
  chance. The legacy attack script makes Archer RAGE normal-hit on 1-10 and
  crit on 11-20. In the rebuild, the increased crit chance applies to attack
  rolls from ART attacks too, while status effect chances remain unchanged.
- **Paladin RAGE:** +2 STR and +1 range in the legacy script. The boost
  animation label appears to say `MS+`, but the changed stat is attack range.
  Needs another user review before implementation.
- **Mystic RAGE:** tooltip says +6 Move and always defending. Rebuild intent:
  Mystic passively halves incoming damage without spending a defend action.
- **Necromancer RAGE:** tooltip says enemies in Necromancer aura get an extra
  -1 DEF plus -1 STR and -1 Move, while Necromancer gains +1 Move.
- **Close Shot:** implemented as damage bonuses based on proximity. Rebuild
  intent is to apply it to Archer attack ARTS, including Volley Shot.
- **Emblem / Chosen:** Archer resists poison; Paladin is immune to status
  effects in legacy tooltips and several immunity checks. These should be unit
  passives enforced by the engine rather than per-ART target lists.
- **Heaven's Realm:** legacy tooltip says Paladin deals +2 extra attack damage
  if both Paladin and target stand on white tiles.
- **Guardian:** legacy tooltip says Mystic increases the team's DEF by 1. Rebuild
  intent is a global team passive while the host is alive.
- **Dead Zone:** legacy tooltip says Necromancer's team takes 1 less magic
  damage from all sources. Rebuild intent is a global team passive while the host
  is alive.
- **Summon Ghoul interaction:** legacy tooltip says summoned ghouls carry
  Necromancer's aura and take no turns. Rebuild intent is 10 HP for ghouls; the
  legacy tooltip's 1 HP note is not intended canon.
- **Sniper passives:** script hooks exist for `Rifle Powered`,
  `Sniper Extra Damage Check`, and `Sniper Minimum Damage Check`, but their
  exact legacy behavior still needs a focused pass before implementation.

## Not carried over

No old SVG, PNG, font, or sound asset has been copied. The new cabinet will use
fresh SVG/CSS presentation in the Mini-Tactics visual direction.
