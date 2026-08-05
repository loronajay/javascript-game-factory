# Tactical Arena — Unit Kit Reference (generated)

> **Generated file. Do not edit by hand.** Regenerate with `node scripts/kit-audit.mjs`.
> Every row is read directly out of `src/core/units/*.js` via `UNIT_TYPES`, so this file
> cannot drift from the engine the way a hand-written table does. Prose analysis lives in
> `BALANCE.md`, `MATCHUPS.md`, and `UNIT_ARCHETYPES.md`; this is the numbers substrate they cite.

Roster: **30 draftable** units (+1 summon-only).

Mechanics columns are flattened straight from the authored `effect`/`targeting`/`resolution`
objects. `acc` is the ART's own range-1 accuracy; base stats here are **unfolded** — auras,
weather, thresholds, and RAGE modifiers are applied live by `getEffectiveStats`.

## Base stat table

| Unit | Class | HP | STR | DEF | Resource | MOVE | RANGE | ARTS |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Angel | ranger | 24 | 3 | 3 | 37 MP | 2 | 5 | 4 |
| Archer | ranger | 24 | 8 | 4 | 22 MP | 2 | 5 | 4 |
| Big Brother | tank | 30 | 2 | 8 | 5 MP | 2 | 3 | 6 |
| Blacksword | melee | 30 | 10 | 6 | 0 MP | 3 | 1 | 5 |
| Clod | tank | 30 | 9 | 8 | 20 MP | 2 | 1 | 4 |
| Fat Bowman | ranger | 30 | 7 | 5 | 25 MP | 2 | 4 | 4 |
| Fat Cleric | support | 30 | 7 | 5 | 35 MP | 2 | 4 | 5 |
| Fat Knight | melee | 30 | 10 | 6 | 20 MP | 2 | 1 | 4 |
| Fat Wizard | mage | 30 | 7 | 4 | 35 MP | 2 | 3 | 5 |
| Father Time | support | 25 | 7 | 3 | 30 MP | 2 | 5 | 4 |
| Gargoyle | tank | 30 | 9 | 7 | 20 MP | 2 | 1 | 5 |
| Juggernaut | tank | 30 | 8 | 7 | 5 MP | 2 | 1 | 4 |
| King | support | 30 | 0 | 0 | 0 MP | 0 | 0 | 5 |
| Little Brother | ranger | 25 | 8 | 6 | 10 MP | 2 | 4 | 4 |
| Magician | mage | 23 | 6 | 3 | 40 MP | 2 | 5 | 4 |
| Miner | ranger | 25 | 8 | 4 | 25 ORE | 2 | 5 | 4 |
| Monk | melee | 26 | 9 | 6 | 25 MP | 2 | 1 | 3 |
| Mother Nature | support | 25 | 7 | 3 | 100 MP | 3 | 6 | 5 |
| Mystic | support | 23 | 5 | 3 | 38 MP | 2 | 5 | 5 |
| Necromancer | mage | 23 | 6 | 3 | 36 MP | 3 | 5 | 4 |
| Nemesis | mage | 25 | 7 | 2 | 45 MP | 3 | 5 | 3 |
| Paladin | melee | 26 | 10 | 5 | 24 MP | 3 | 1 | 2 |
| Riot Cop | tank | 30 | 8 | 7 | 0 MP | 3 | 1 | 6 |
| Ronin | melee | 28 | 10 | 5 | 20 MP | 3 | 1 | 5 |
| Sniper | ranger | 23 | 8 | 3 | 18 MP | 2 | 6 | 3 |
| Summoner | mage | 23 | 6 | 4 | 100 MP | 2 | 5 | 2 |
| Swordsman | melee | 25 | 10 | 5 | 20 MP | 3 | 1 | 4 |
| Treant | tank | 30 | 7 | 6 | 30 MP | 2 | 2 | 7 |
| Virus | mage | 25 | 6 | 3 | 36 MP | 3 | 5 | 5 |
| Witch Doctor | support | 24 | 7 | 3 | 30 MP | 2 | 4 | 7 |

## Roster indexes

- **Access true damage (ignores DEF *and* Defend)** (17): swordsman, archer, paladin, sniper, witch-doctor, father-time, juggernaut, angel, gargoyle, virus, fat-knight, miner, big-brother, little-brother, blacksword, ronin, riot-cop
- **Access magic damage (ignores DEF)** (16): mystic, magician, necromancer, juggernaut, angel, gargoyle, nemesis, virus, clod, fat-knight, fat-wizard, fat-cleric, little-brother, mother-nature, riot-cop, treant
- **Carry a status-immunity effect** (11): archer, mystic, paladin, father-time, king, angel, monk, gargoyle, nemesis, virus, riot-cop
- **Can heal** (10): swordsman, mystic, witch-doctor, king, angel, fat-wizard, fat-cleric, big-brother, mother-nature, treant
- **Can cleanse** (3): mystic, witch-doctor, fat-cleric
- **Project a team/enemy aura** (9): mystic, paladin, necromancer, father-time, nemesis, clod, big-brother, riot-cop, treant
- **Have a bonus-action ART** (2): paladin, witch-doctor
- **Have rage-locked ARTS** (6): magician, witch-doctor, father-time, juggernaut, clod, fat-cleric
- **Can put extra bodies on the board** (2): necromancer, summoner
- **Use a non-MP resource** (1): miner

## Per-unit kits

### Angel `angel`

HP 24 · STR 3 · DEF 3 · MP 37 · MOVE 2 · RANGE 5

class `ranger` · AI role `support` · AI threat 15

- **Passive — Blessed Arrow** `blessedAttack`: Angel's basic attacks deal magic damage. They are more accurate against enemies on white tiles, never miss and gain +5% crit when Angel is also on a white tile. On a critical basic attack, the target is also blinded for 1 turn.
  - mechanics: `type=blessedAttack attackDamageType=magic critStatus.status=blind critStatus.duration=1 tileBasicAttack.affinity=light tileBasicAttack.targetMissReduction=0.05 tileBasicAttack.bothNeverMiss=true tileBasicAttack.bothCritBonus=0.05`
- **Passive — Heaven's Wrath** *(rage-only)* `statModifiers`: At 5 HP or lower, gain +3 STR and +2 MOVE.
  - mechanics: `type=statModifiers stats.strength=3 stats.moveRange=2`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Anoint | 5 MP | rng 5, ally | status=empowered statModifiers.attackRange=1 durationTurns=1 resolution=anoint targeting.shape=ally targeting.range=5 effect.status=empowered effect.statModifiers.attackRange=1 effect.durationTurns=1 | Grant an ally +1 range for 1 turn. Cannot target self. |
| Elevate | 3 MP |  | type=healAllies amount=1 global=true affinity=light effect.type=healAllies effect.amount=1 effect.global=true effect.affinity=light | Restore 1 HP to every ally standing on a white tile anywhere on the board. |
| Inner Strength | free | passive | type=critPerMissingHp per=3 bonus=0.015 effect.type=critPerMissingHp effect.per=3 effect.bonus=0.015 | Angel gains +1.5% critical chance for every 3 HP he is missing. |
| Holy Being | free | passive | type=immunity statuses=[poison, slow, blind, silence, stun] effect.type=immunity effect.statuses=[poison, slow, blind, silence, stun] | Angel is immune to all status effects. |
| Heavenseeker | 5 MP | RAGE, rage-locked, bonus:seeker, self | type=tilePulse affinity=light amount=2 global=true damageType=true heal.amount=2 selfCast=true rageLocked=true bonusActionGroup=seeker effect.type=tilePulse effect.affinity=light effect.amount=2 effect.global=true effect.damageType=true effect.heal.amount=2 | While raging, allies on a white tile anywhere restore 2 HP and enemies on a white tile take 2 true damage. Does not spend Angel's action. |

### Archer `archer`

HP 24 · STR 8 · DEF 4 · MP 22 · MOVE 2 · RANGE 5

class `ranger` · AI role `ranged` · AI threat 12

- **Passive — Close Shot** `proximityDamage`: Gain +2 damage at direct adjacency, or +1 damage within two tiles.
  - mechanics: `type=proximityDamage metric=euclidean bands[0].maxDistance=1 bands[0].bonusDamage=2 bands[1].maxDistance=2 bands[1].bonusDamage=1`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Volley Shot | 5 MP | rng 5, cone, dmg [object Object] | targeting.shape=cone targeting.range=5 | Select a range-5 cone and deal 2 true damage to every enemy in it. Close Shot bonuses apply by target. |
| Poison Arrow | 4 MP | acc 96% | type=status status=poison chance=0.6 duration=permanent turnStartDamage=1 effect.type=status effect.status=poison effect.chance=0.6 effect.duration=permanent effect.turnStartDamage=1 | Attack, then apply permanent poison on a 60% effect check. |
| Leg Shot | 4 MP | acc 96% | type=status status=slow chance=0.6 durationTurns=3 statModifiers.moveRange=-1 effect.type=status effect.status=slow effect.chance=0.6 effect.durationTurns=3 effect.statModifiers.moveRange=-1 | Attack, then apply -1 MOVE Slow for 3 turns on a 60% effect check. |
| Emblem | free | passive | type=immunity statuses=[poison] effect.type=immunity effect.statuses=[poison] | The Archer is immune to poison. |
| RAGE Passive | free | passive, RAGE | type=statModifiers stats.strength=1 stats.attackRange=1 stats.moveRange=1 moveAndUseArts=true effect.type=statModifiers effect.stats.strength=1 effect.stats.attackRange=1 effect.stats.moveRange=1 effect.moveAndUseArts=true combat.neverMiss=true combat.criticalChance=0.5 | At 5 HP or lower, gain +1 STR, +1 range, and +1 MOVE, may move and use ARTS in the same activation, never miss (unless blinded), and gain a 50% critical chance. |

### Big Brother `big-brother`

HP 30 · STR 2 · DEF 8 · MP 5 · MOVE 2 · RANGE 3

class `tank` · AI role `bruiser` · AI threat 15

- **Passive — Super Magnet** `magneticAttack`: Basic attacks must target an enemy on one of the 8 straight rays. Big Brother attacks deal true damage and do not gain crit damage; basic crits pull the target adjacent and stun for 1 turn.
  - mechanics: `type=magneticAttack attackDamageType=true basicAttackRayOnly=true noCriticalDamage=true critPull.status=stun critPull.durationTurns=1`
- **Passive — Rogue Mech** *(rage-only)* `statModifiers`: RAGE: Gain +3 STR and +1 MOVE. Big Brother's ARTS cost no MP.
  - mechanics: `type=statModifiers stats.strength=3 stats.moveRange=1 freeArts=true`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Force Tug | 5 MP | true, rng 3, acc 96% | type=status status=slow chance=0.7 durationTurns=3 resolution=forceTug targeting.range=3 effect.type=status effect.status=slow effect.chance=0.7 effect.durationTurns=3 critEffect.type=status critEffect.status=stun critEffect.chance=0.7 critEffect.durationTurns=1 | Range 3 attack for true damage, then roll to Slow. On a crit, roll to Stun for 1 turn instead. A missed attack stops the ability. |
| Force Push | 5 MP | self, selfAura, r1, dmg [object Object] | resolution=forcePush selfCast=true targeting.shape=selfAura targeting.radius=1 | Push every adjacent unit, ally or enemy, 1 tile away. Blocked units take 2 true damage. |
| Polarity Shift | 5 MP | self | resolution=polarityShift selfCast=true | Toggle a global polarity shift: HP restores become MP restores, and MP restores become HP restores. |
| Recharge | free | self | resolution=recharge selfCast=true restore.mp=5 restore.hpIfFull=1 restore.bypassPolarity=true nextTurnStatus.type=empowered nextTurnStatus.duration=2 nextTurnStatus.statModifiers.moveRange=1 | Restore 5 MP. If already at 5 MP, restore 1 HP instead and gain +1 MOVE on Big Brother's next turn. This restore ignores Polarity Shift. |
| Magnetic Field | free | passive | type=healingLockoutAura radius=1 excludeSelf=true effect.type=healingLockoutAura effect.radius=1 effect.excludeSelf=true | Units standing within 1 tile of Big Brother cannot be healed. Big Brother can still be healed. |
| Pissing Contest | free | passive | type=globalTypePresenceStats requiredTypes=[little-brother] stats.strength=1 effect.type=globalTypePresenceStats effect.requiredTypes=[little-brother] effect.stats.strength=1 | Gain +1 STR while any living Little Brother is in play, on either team. |

### Blacksword `blacksword`

HP 30 · STR 10 · DEF 6 · MP 0 · MOVE 3 · RANGE 1

class `melee` · AI role `bruiser` · AI threat 16

- **Passive — Dark Tread** `darkTread`: Heal 1 HP when damaging an enemy on a dark tile. Deal +1 damage to enemies on dark tiles (+2 if Blacksword is also on one). Takes +1 damage while on a white tile. Immune to Blind.
  - mechanics: `type=darkTread tileAffinityDamage.affinity=dark tileAffinityDamage.targetBonus=1 tileAffinityDamage.bothBonus=2 tileVulnerability.affinity=light tileVulnerability.amount=1 darkTileLifesteal.affinity=dark darkTileLifesteal.amount=1 immuneStatuses=[blind]`
- **Passive — Banisher** *(rage-only)* `statModifiers`: At 5 HP or lower, gain +2 STR and +1 MOVE.
  - mechanics: `type=statModifiers stats.strength=2 stats.moveRange=1`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Dark Rush | 2 HP | rushPath | extraMove=1 targeting.shape=rushPath targeting.straightLine=true contactDamage.light=3 contactDamage.dark=4 contactDamage.type=true | Spend 2 HP to charge MOVE + 1 tiles in a straight orthogonal line, dealing 3 true damage to enemies on light tiles and 4 to enemies on dark tiles you pass through. End on empty ground. |
| Dark Ether | 2 HP | self | selfCast=true resolution=darkEther | Spend 2 HP to make Blacksword's next basic attack a guaranteed critical (it can still miss). |
| Void Gravity | 2 HP | self, self, r3 | selfCast=true targeting.shape=self targeting.radius=3 requiresNearbyEnemy=true | Spend 2 HP to shift every enemy within 3 tiles by 1 random orthogonal tile. Blocked and displacement-immune units stay put. |
| Dark Tick | 1 HP | self, dmg [object Object] | selfCast=true resolution=statusBurst condition.status=blind requiresConditionEnemy=true | Spend 1 HP to deal 3 true damage to every blinded enemy anywhere on the board. |
| Darkspread | free | passive | type=onCritStatus critStatus.status=blind critStatus.duration=1 effect.type=onCritStatus effect.critStatus.status=blind effect.critStatus.duration=1 | Whenever Blacksword lands a critical strike, the target is blinded for 1 turn. |
| Banish | All HP | RAGE, rage-locked, self, dmg [object Object] | rageLocked=true selfCast=true selfKill=true costLabel=All HP resolution=statusBurst condition.affinity=dark requiresConditionEnemy=true | RAGE: Spend all remaining HP to instantly destroy every enemy standing on a dark tile. Blacksword falls. |

### Clod `clod`

HP 30 · STR 9 · DEF 8 · MP 20 · MOVE 2 · RANGE 1

class `tank` · AI role `bruiser` · AI threat 15

- **Passive — Brick House** `allyAura`: Allies within 1 tile gain +1 DEF, and Clod gains +1 STR for each ally sheltered — only while they stay directly beside him.
  - mechanics: `type=allyAura radius=1 stats.defense=1 selfPerAlly.strength=1`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Quake | 5 MP | self, magic, nukeAura, r3, dmg [object Object] | resolution=quake selfCast=true targeting.shape=nukeAura targeting.radius=3 refundTargets=3 edgeFalloff=1 | Slam the ground: every enemy within 3 tiles takes (3 + number of enemies hit) magic damage — 1 less at the farthest edge. If it hits 3 or more enemies, the MP is refunded. |
| Stone Throw | 3 MP | rng 4, acc 96%, dmg [object Object] | resolution=stoneThrow targeting.range=4 onHit.status=slow onHit.durationTurns=1 onHit.statModifiers.moveRange=-1 onCrit.status=stun onCrit.durationTurns=1 | Hurl a boulder at an enemy within 4 for 8 physical damage (scaling with STR), slowing it by 1 for 1 turn. On a critical hit it stuns for 1 turn instead. |
| Rock Hard | free | passive | type=rockHard negatePhysical=true mpOnPhysical=3 effect.type=rockHard effect.negatePhysical=true effect.mpOnPhysical=3 | While defending, Clod negates all physical damage aimed at him completely, and restores 3 MP each time a physical attack strikes him. |
| Thunderous Charge | 7 MP | rage-locked, rng 4, targetedBlast, r2, dmg [object Object] | rageLocked=true resolution=thunderousCharge targeting.shape=targetedBlast targeting.range=4 targeting.radius=2 stun.durationTurns=1 | RAGE: charge a tile within 4 (not one an enemy occupies) and quake a 2-tile radius — 10 physical damage and a 1-turn stun to every enemy caught. |

### Fat Bowman `fat-bowman`

HP 30 · STR 7 · DEF 5 · MP 25 · MOVE 2 · RANGE 4

class `ranger` · AI role `ranged` · AI threat 14

- **Passive — Heavy Handed** `rangeDamageCurve`: Physical shots deal -1 damage adjacent, normal damage at 2 range, +1 at 3 range, +2 at 4 range, and continue scaling with range buffs.
  - mechanics: `type=rangeDamageCurve metric=chebyshev neutralDistance=2 minimumDamage=1`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Curve Shot | 3 MP | single, acc 96% | type=piercingStrike pierceUnits=true targeting.shape=single effect.type=piercingStrike effect.pierceUnits=true | Shoot a normal physical attack that can pass through units. |
| Dragonsbane | 5 MP | single, acc 96% | type=status status=poison chance=0.6 duration=permanent turnStartDamage=1 rolls=2 criticalGuarantees=true targeting.shape=single effect.type=status effect.status=poison effect.chance=0.6 effect.duration=permanent effect.turnStartDamage=1 effect.rolls=2 effect.criticalGuarantees=true | Shoot a normal physical attack at Fat Bowman's attack range, then roll twice to poison. Critical hits guarantee the poison unless the target is immune. |
| Planted | free | passive | type=stationaryStrength amount=1 max=4 effect.type=stationaryStrength effect.amount=1 effect.max=4 | Each turn Fat Bowman starts without having moved builds +1 STR, up to +4. Confirming a move clears the bonus and restarts the climb. |
| Brothers in Arms | free | passive | type=teamCompositionStats requiredTypes=[fat-knight, fat-wizard, fat-cleric] stats.attackRange=1 effect.type=teamCompositionStats effect.requiredTypes=[fat-knight, fat-wizard, fat-cleric] effect.stats.attackRange=1 | Gain +1 RANGE if Fat Knight, Fat Wizard, and Fat Cleric are all on Fat Bowman's team. |
| Desperation Shot | free | passive, RAGE | type=oneShotStatModifiers stats.strength=4 stats.attackRange=1 neverMiss=true skipNextActivation=true effect.type=oneShotStatModifiers effect.stats.strength=4 effect.stats.attackRange=1 effect.neverMiss=true effect.skipNextActivation=true | At 5 HP or lower, Fat Bowman's next basic attack, Curve Shot, or Dragonsbane gains +4 STR and +1 RANGE and cannot miss (BLIND still blocks it). After using it, she skips her next turn. Leaving and re-entering RAGE restores the shot. |

### Fat Cleric `fat-cleric`

HP 30 · STR 7 · DEF 5 · MP 35 · MOVE 2 · RANGE 4

class `support` · AI role `support` · AI threat 14

- **Passive — Snack Break** `defendRestore`: When Fat Cleric defends without having moved that turn, she restores 1 HP and 1 MP.
  - mechanics: `type=defendRestore hp=1 mp=1`
- **Passive — Emergency Snacks** *(rage-only)* `rageRegen`: At 5 HP or lower, Fat Cleric is always defending (incoming damage halved), her basic attacks deal magic damage, and she restores 1 HP at the start of each turn; if that heal lifts her back above 5 HP she also restores 5 MP. The regen happens at most 3 times per battle.
  - mechanics: `type=rageRegen hp=1 exitMp=5 maxProcs=3 attackDamageType=magic defending=true`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Hope | 3 MP | selfAura, r3 | type=healAllies amount=2 radius=3 randomAmount.min=1 randomAmount.max=4 targeting.shape=selfAura targeting.radius=3 effect.type=healAllies effect.amount=2 effect.radius=3 effect.randomAmount.min=1 effect.randomAmount.max=4 | Restore a random 1–4 HP to Fat Cleric and every ally within 3 tiles. |
| Cleanse | 8 MP | rng 5, ally | type=cleanse scope=negative resolution=cleanseAlly targeting.shape=ally targeting.range=5 effect.type=cleanse effect.scope=negative | Remove all negative status effects from one allied unit within 5 tiles. Cannot target self. |
| Focus Prayer | 5 MP | rng 3, ally, acc 96% | resolution=focusPrayer targeting.shape=ally targeting.range=3 targeting.excludeSelf=true heal.amount=5 misfire.durationTurns=1 misfire.pool[0].status=blind misfire.pool[0].weight=3 misfire.pool[1].status=silence misfire.pool[1].weight=3 misfire.pool[2].status=poison misfire.pool[2].weight=3 misfire.pool[3].status=slow misfire.pool[3].weight=3 misfire.pool[4].status=stun misfire.pool[4].weight=1 | Restore 5 HP to an ally within 3 tiles. Roll for it — on a miss the prayer backfires and inflicts a random status on that ally for 1 turn instead. |
| Second Helping | 15 MP | rage-locked, revive, r3 | rageLocked=true resolution=rewind targeting.shape=revive targeting.radius=3 revive.hpFraction=0.5 | RAGE: Bring a fallen ally back onto a tile within 3, restored to 50% HP rounded up with statuses cleared. Their MP is not restored. |
| Brothers in Arms | free | passive | type=teamCompositionStats requiredTypes=[fat-knight, fat-wizard, fat-bowman] stats.moveRange=1 stats.defense=1 effect.type=teamCompositionStats effect.requiredTypes=[fat-knight, fat-wizard, fat-bowman] effect.stats.moveRange=1 effect.stats.defense=1 | While Fat Knight, Fat Wizard, and Fat Bowman are all on her team, Fat Cleric gains +1 MOVE and +1 DEF. |

### Fat Knight `fat-knight`

HP 30 · STR 10 · DEF 6 · MP 20 · MOVE 2 · RANGE 1

class `melee` · AI role `bruiser` · AI threat 14

- **Passive — Battle Trauma** `magicTrauma`: Magic damage deals +1 to Fat Knight, but critical hits do not deal increased damage to him. Whenever he takes magic damage, he gains +1 STR for 1 turn (does not stack).
  - mechanics: `type=magicTrauma magicVulnerability=1 ignoreCriticalDamage=true status.type=battle-trauma status.duration=1 status.statModifiers.strength=1`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Stumble | 3 MP | rushPath | resolution=rushPath targeting.shape=rushPath extraMove=2 contactDamage=3 rageExtraMove=3 | Walk your current MOVE + 2 as unique tiles, passing through enemies for 3 true damage. End on empty ground. During RAGE, range increases by 3 and Trample damage also applies. |
| Fart | 2 MP | self, selfAura, r1, dmg [object Object] | resolution=shoveAura selfCast=true targeting.shape=selfAura targeting.radius=1 | Push every enemy within 1 tile one orthogonal space away. If blocked by a unit, wall, or arena edge, that enemy takes 3 true damage instead. |
| Thick Boi | free | passive | type=statusResistOnce effect.type=statusResistOnce | Once per battle, resist a status effect that would hit Fat Knight. |
| Brothers in Arms | free | passive | type=teamCompositionStats requiredTypes=[fat-wizard, fat-cleric, fat-bowman] stats.strength=1 stats.moveRange=1 effect.type=teamCompositionStats effect.requiredTypes=[fat-wizard, fat-cleric, fat-bowman] effect.stats.strength=1 effect.stats.moveRange=1 | Gain +1 STR and +1 MOVE if Fat Wizard, Fat Cleric, and Fat Bowman are all on Fat Knight's team. |
| Trample | free | passive, RAGE | type=statModifiers stats.defense=2 stats.moveRange=1 trampleDamage=3 effect.type=statModifiers effect.stats.defense=2 effect.stats.moveRange=1 effect.trampleDamage=3 | At 5 HP or lower, gain +2 DEF and +1 MOVE. Fat Knight may move through enemies if he lands on an empty tile; each enemy crossed takes 3 true damage. Stumble gains +3 range and also deals Trample damage. |

### Fat Wizard `fat-wizard`

HP 30 · STR 7 · DEF 4 · MP 35 · MOVE 2 · RANGE 3

class `mage` · AI role `caster` · AI threat 15

- **Passive — Clumsy** `clumsyCast`: When Zap! misses, nearby units around the target take 2 magic damage. Zap! crits splash 3 magic damage instead. Surge splashes 2 HP healing around its target on miss, crit, and during RAGE on hit.
  - mechanics: `type=clumsyCast radius=1 missMagicDamage=2 critMagicDamage=3 surgeHeal=2`
- **Passive — Lazy Cast** *(rage-only)* `statModifiers`: RAGE: basic attacks deal magic damage. Zap! and Surge cost no MP. Zap! gains +3 damage, splashes on hit, and stuns instead of silencing on crit. Surge splashes healing on hit.
  - mechanics: `type=statModifiers freeSelectedArts=[zap, surge] zapDamageBonus=3 zapCritStatus.status=stun zapCritStatus.durationTurns=1 zapSplashOnHit.amount=2 zapSplashOnHit.critAmount=3 surgeSplashOnHit.amount=2 attackDamageType=magic`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Zap! | 5 MP | magic, rng 4, single, acc 96%, dmg [object Object] | type=critStatus status=silence durationTurns=1 resolution=fatWizardZap targeting.shape=single targeting.range=4 effect.type=critStatus effect.status=silence effect.durationTurns=1 | Deal 5 magic damage at range 4. On crit, silence the target for 1 turn. Clumsy splashes nearby units on a miss or crit. |
| Study | free | rng 5, single | type=studyTarget damageBonus=1 magicReward.hp=2 magicReward.mp=2 resolution=studyTarget targeting.shape=single targeting.range=5 effect.type=studyTarget effect.damageBonus=1 effect.magicReward.hp=2 effect.magicReward.mp=2 | Choose one enemy within 5. Fat Wizard deals +1 damage to it, and his magic damage to it restores 2 HP and 2 MP. Unusable until that target falls. |
| Surge | 5 MP | rng 4, ally, acc 96% | resolution=fatWizardSurge targeting.shape=ally targeting.range=4 heal.amount=4 heal.critAmount=5 | Roll to restore 4 HP to one allied unit within 4. On crit, restore 5 HP. Clumsy splashes 2 HP healing around the target on miss, crit, and during RAGE on hit. |
| Relay Power | free | rng 5, ally | type=relayPower hp=2 mp=2 resolution=relayPower targeting.shape=ally targeting.range=5 targeting.excludeSelf=true effect.type=relayPower effect.hp=2 effect.mp=2 | Lose 2 HP and 2 MP to restore 2 HP and 2 MP to an ally within 5. |
| Brothers in Arms | free | passive | type=teamCompositionStats requiredTypes=[fat-knight, fat-cleric, fat-bowman] stats.strength=1 sourceDamage.magic=1 effect.type=teamCompositionStats effect.requiredTypes=[fat-knight, fat-cleric, fat-bowman] effect.stats.strength=1 effect.sourceDamage.magic=1 | Gain +1 magic damage and +1 STR if Fat Knight, Fat Cleric, and Fat Bowman are all on Fat Wizard's team. |

### Father Time `father-time`

HP 25 · STR 7 · DEF 3 · MP 30 · MOVE 2 · RANGE 5

class `support` · AI role `support` · AI threat 16

- **Passive — Time Steal** `damageAura`: Each turn, enemies within 2 tiles take 1 true damage, and Father Time restores 1 MP for every point dealt.
  - mechanics: `type=damageAura radius=2 amount=1 damageType=true refundMpPerDamage=1`
- **Passive — RAGE** *(rage-only)* `—`: At 5 HP or lower, Rewind becomes available.

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Father of Time | free | passive | type=immunity statuses=[stun, slow] effect.type=immunity effect.statuses=[stun, slow] | Father Time is immune to Stun and Slow. |
| Age | 5 MP | rng 4, allyOrEnemy | type=linkedStatMod amount=1 resolution=age targeting.shape=allyOrEnemy targeting.range=4 effect.type=linkedStatMod effect.amount=1 | Grant an ally within 4 +1 STR or +1 DEF, or drain STR or DEF from an enemy within 4 by 1 — lasting until Father Time is defeated. |
| Time Stretch | 5 MP | allyOrEnemy | resolution=timeStretch targeting.shape=allyOrEnemy ally.status=empowered ally.statModifiers.moveRange=1 ally.durationTurns=1 enemy.status=slow enemy.statModifiers.moveRange=-1 enemy.durationTurns=1 | Grant an ally +1 MOVE for 1 turn, or slow an enemy by 1 MOVE for 1 turn. |
| Rewind | 20 MP | rage-locked, revive, r3 | rageLocked=true resolution=rewind targeting.shape=revive targeting.radius=3 | RAGE: Bring a fallen ally back onto a tile within 3, fully healed with statuses cleared. Their MP is not restored. |

### Gargoyle `gargoyle`

HP 30 · STR 9 · DEF 7 · MP 20 · MOVE 2 · RANGE 1

class `tank` · AI role `bruiser` · AI threat 15

- **Passive — Stone Body** `stoneBody`: While defending, a melee attacker takes 1 true damage. The Gargoyle cannot be pulled or knocked back — a displacement ART returns 2 true damage to the offender. A status effect targeted at the Gargoyle is issued to the offender instead.
  - mechanics: `type=stoneBody meleeDefendRetaliation=1 displacementImmune=true displacementRetaliation=2 reflectStatus=true`
- **Passive — Volcanic Rage** *(rage-only)* `statModifiers`: At 5 HP or lower: +2 DEF, always defending (and still acts), Pyroclasm gains +2 range, entering rage erupts a free Pyroclasm immediately, and every 3rd turn after that erupts again before acting.
  - mechanics: `type=statModifiers stats.defense=2 defending=true artRangeBonus=2 freePyroclasm.artId=pyroclasm freePyroclasm.every=3`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Flight | 3 MP | flightMove, dmg [object Object] | resolution=flight targeting.shape=flightMove targeting.moveBonus=1 blastRadius=1 | Fly up to (Move + 1) spaces in any direction (diagonals allowed), then deal 2 true damage to every enemy within 1 tile of where you land. |
| Pyroclasm | 5 MP | self, magic, rng 3, lineBurst, dmg [object Object] | resolution=pyroclasm selfCast=true targeting.shape=lineBurst targeting.range=3 | Erupt lines of fire from all 8 directions: 4 magic damage to every enemy standing on a line within range. (Volcanic Rage: +2 range.) |
| One With The Flames | free | passive | type=fireImmunity fireDamageImmune=true critCreatesFire.kind=fire critCreatesFire.permanent=true weatherRestore.heatwave.hp=1 weatherRestore.heatwave.mp=1 effect.type=fireImmunity effect.fireDamageImmune=true effect.critCreatesFire.kind=fire effect.critCreatesFire.permanent=true effect.weatherRestore.heatwave.hp=1 effect.weatherRestore.heatwave.mp=1 | The Gargoyle takes no damage from fire-based ARTS or fire tiles. During Heatwave, it restores 1 HP and 1 MP each turn cycle. Whenever the Gargoyle crits with a basic attack, the target's tile becomes permanent fire. |
| Heavy | free | passive | type=moveCap maxMoveRange=3 effect.type=moveCap effect.maxMoveRange=3 | The Gargoyle's Move can never exceed 3, regardless of speed buffs. |
| Stone Ward | free | passive | type=immunity statuses=[poison, slow, blind, silence, stun] effect.type=immunity effect.statuses=[poison, slow, blind, silence, stun] | The Gargoyle is immune to all status effects. |

### Juggernaut `juggernaut`

HP 30 · STR 8 · DEF 7 · MP 5 · MOVE 2 · RANGE 1

class `tank` · AI role `bruiser` · AI threat 15

- **Passive — Bruiser Mode** `emptyMpBoost`: While at 0 MP, base Strength becomes 10 and base Move becomes 3, but the Juggernaut takes 1 extra magic damage.
  - mechanics: `type=emptyMpBoost stats.strength=2 stats.moveRange=1 magicVulnerability=1`
- **Passive — Null Zone** *(rage-only)* `statModifiers`: At 5 HP or lower: +2 STR, +2 MOVE, ARTS cost no MP, and all healing on the board is disabled. Self Destruct becomes available.
  - mechanics: `type=statModifiers stats.strength=2 stats.moveRange=2 freeArts=true disableHealing=global`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Tether Grab | 5 MP | magic, rng 4, lineAny, acc 96%, dmg [object Object] | resolution=tetherGrab targeting.shape=lineAny targeting.range=4 | Grab the first ally or enemy in a straight line within 4 and haul them to your side. An enemy also takes 3 magic damage. |
| Rocket Punch | 5 MP | rng 5, lineEnemy, acc 96%, dmg [object Object] | type=status status=stun chance=0.3 durationTurns=1 resolution=rocketPunch targeting.shape=lineEnemy targeting.range=5 effect.type=status effect.status=stun effect.chance=0.3 effect.durationTurns=1 | Fire a piston-fist down a straight line within 5 at the first enemy (allies block the shot): 10 physical damage and a 30% chance to stun for 1 turn. |
| Recharge | free | self | resolution=recharge selfCast=true restore.mp=5 restore.hpIfFull=1 | Vent the reactor: restore 5 MP. If already at full MP, mend 1 HP instead. |
| Self Destruct | free | rage-locked, self, nukeAura, r4, dmg [object Object] | rageLocked=true selfCast=true resolution=selfDestruct targeting.shape=nukeAura targeting.radius=4 selfKill=true | RAGE: Overload the core, dealing 10 true damage to every enemy within 4 tiles — at the cost of the Juggernaut's own life. |

### King `king`

HP 30 · STR 0 · DEF 0 · MP 0 · MOVE 0 · RANGE 0

class `support` · AI role `support` · AI threat 22 · **acts first each turn** · **command-only (never moves/attacks)** · **does not sustain victory**

- **Passive — Dictator / Spectator** `commander`: When an allied unit falls, the King loses 10 HP and every surviving ally heals 5 HP and permanently gains +2 STR. When a fallen ally is revived, the King restores 10 HP.
  - mechanics: `type=commander damagePerAllyFallen=10 healPerAllyRevived=10 allyRallyHeal=5 allyRallyStrength=2`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Royal Detachment | free | passive | type=immunity statuses=[blind, silence, slow, stun, poison] effect.type=immunity effect.statuses=[blind, silence, slow, stun, poison] | The King cannot be blinded, silenced, slowed, stunned, or poisoned. |
| Strike! | free | self, globalAllies | resolution=command selfCast=true targeting.shape=globalAllies command.stats.strength=2 command.prevOverride.pursue.strength=3 | Command: allies gain +2 STR this turn (+3 if your last command was Pursue!). +1 STR more per allied unit in RAGE. |
| Hold! | free | self, globalAllies | resolution=command selfCast=true targeting.shape=globalAllies command.stats.defense=1 command.healBonus=1 | Command: allies gain +1 DEF and +1 to all healing they receive this turn. Both increase by 1 per allied unit in RAGE. |
| Pursue! | free | self, globalAllies | resolution=command selfCast=true targeting.shape=globalAllies command.stats.moveRange=1 | Command: allies gain +1 MOVE this turn. +1 more per allied unit in RAGE. |
| Higher Ground! | free | self, globalAllies | resolution=command selfCast=true targeting.shape=globalAllies command.stats.attackRange=1 command.rangeBonus=1 | Command: allies gain +1 range this turn — attacks AND ARTS, area ARTS included. +1 more per allied unit in RAGE. |

### Little Brother `little-brother`

HP 25 · STR 8 · DEF 6 · MP 10 · MOVE 2 · RANGE 4

class `ranger` · AI role `ranged` · AI threat 14

- **Passive — Splash Fire** `critSplashDamage`: On a critical basic attack, deal 2 true damage to enemies within 1 tile of the original target.
  - mechanics: `type=critSplashDamage trigger=basicCrit damageType=true amount=2 radius=1`
- **Passive — Flamespitter** *(rage-only)* `statModifiers`: RAGE: Gain +2 STR and +5% crit chance. Flamethrower gains +2 range and casts for free after orthogonal basic attacks.
  - mechanics: `type=statModifiers stats.strength=2 basicAttackCone.artId=flamethrower basicAttackCone.orthogonalOnly=true`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Cannon Fire | 5 MP | rng 5, single, acc 96%, dmg [object Object] | targeting.shape=single targeting.range=5 onCrit.status=stun onCrit.durationTurns=1 onCrit.splash.damageType=true onCrit.splash.amount=2 onCrit.splash.radius=1 | Fire a range-5 cannon shot for 10 physical power. Critical hits stun the target for 1 turn and trigger Splash Fire around them. |
| Rechargeable Battery | free | passive | type=magicDamageMpRestore amount=5 effect.type=magicDamageMpRestore effect.amount=5 | Restore 5 MP whenever Little Brother takes magic damage. |
| Pissing Contest | free | passive | type=globalTypePresenceStats requiredTypes=[big-brother] stats.attackRange=1 effect.type=globalTypePresenceStats effect.requiredTypes=[big-brother] effect.stats.attackRange=1 | Gain +1 range while Big Brother is in play on either team. |
| Flamethrower | 5 MP | rng 3, cone, dmg [object Object] | targeting.shape=cone targeting.range=3 rageRangeBonus=2 hitTileObject.kind=fire hitTileObject.permanent=true | Deal 3 true damage to enemies in a range-3 cone, leaving permanent fire under enemies hit. While raging, the cone gains +2 range. |

### Magician `magician`

HP 23 · STR 6 · DEF 3 · MP 40 · MOVE 2 · RANGE 5

class `mage` · AI role `caster` · AI threat 13

- **Passive — Magic Pipe** `mpRegen`: Every 3 activations completed without using Spark or Banish, restore 10 MP.
  - mechanics: `type=mpRegen interval=3 amount=10`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Spark | 4 MP | magic, acc 96% |  | Hurl a bolt of magic at a target in range. Deals magic damage, ignoring DEF. |
| Flee | 5 MP | flee | resolution=flee targeting.shape=flee | Teleport to any empty tile within Move+2 tiles. Spends this unit's activation. |
| Banish | 8 MP | magic, acc 96% | type=status status=silence chance=0.75 durationTurns=1 effect.type=status effect.status=silence effect.chance=0.75 effect.durationTurns=1 | Strike a target with arcane force for magic damage, then silence them for 1 turn on a 75% check. |
| Nuke | 16 MP | rage-locked, self, nukeAura, r3, dmg [object Object] | rageLocked=true selfCast=true targeting.shape=nukeAura targeting.radius=3 | RAGE: Detonate a burst of arcane energy, dealing 12 magic damage to all enemies within 3 tiles. |
| RAGE | free | passive, RAGE | attackDamageType=magic effect.attackDamageType=magic | At 5 HP or lower, basic attacks deal magic damage and the Nuke ART becomes available. |

### Miner `miner`

HP 25 · STR 8 · DEF 4 · ORE 25 · MOVE 2 · RANGE 5

class `ranger` · AI role `ranged` · AI threat 13

- **Passive — Ore Harvester / Pickaxe** `oreHarvester`: Gain 1 ore at the start of each turn and +1% crit chance for every 5 ore harvested. At max ore, gain +1 STR and +1 DEF. Adjacent basic attacks deal +2 damage and destroying a wall within 1 grants +2 ore. Ranged basic attacks cost 1 ore; at 0 ore, range becomes 1.
  - mechanics: `type=oreHarvester resource=mp turnStartResourceGain=1 fullResourceStats.strength=1 fullResourceStats.defense=1 emptyAttackRange=1 adjacentDamageBonus=2 rangedAttackCost=1 wallKillRange=1 wallKillOreReward=2 critPerResource.per=5 critPerResource.bonus=0.01 critPerResource.rageBonus=0.02`
- **Passive — Diamond Harvester** *(rage-only)* `statModifiers`: RAGE: Gain +1 MOVE and +1 STR, basic attacks fire through walls, instantly fill ore to max, and Ore Harvester grants +2% crit chance per 5 ore.
  - mechanics: `type=statModifiers stats.moveRange=1 stats.strength=1 pierceWalls=true rageEntryRestore.mp=25`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Ore Harvest | free | self | resolution=oreHarvest selfCast=true ore.min=2 ore.max=5 ore.table=[2, 3, 3, 3, 3, 4, 4, 4, 4, 5] nextTurnStatus.type=empowered nextTurnStatus.duration=2 nextTurnStatus.statModifiers.moveRange=1 replacedByRageArt=ore-abundance | Gather 2-5 ore, usually 3 or 4. On Miner's next turn, gain +1 MOVE. |
| Headlamp | free | rng 1 | type=status status=blind chance=1 durationTurns=1 resolution=statusCast targeting.range=1 effect.type=status effect.status=blind effect.chance=1 effect.durationTurns=1 | Blind an adjacent enemy for 1 turn. No roll. |
| Shaft Prop | 3 MP | tilePlacement, r3 | targeting.shape=tilePlacement targeting.radius=3 wall.hp=1 | Spend 3 ore to raise a 1-HP wall on an empty tile within 3. |
| Blasting Cap | 2 MP | rng 3, acc 96%, dmg [object Object] | resolution=blastingCap targeting.range=3 splash.radius=1 splash.blockedDamage=2 onCrit.status=stun onCrit.durationTurns=1 | Spend 2 ore and roll to hit an enemy within 3. On hit, deal 3 true damage, then push nearby enemies away from the blast tile; blocked enemies take 2 true damage. May target a wall in range without a roll, destroying that wall for no ore and splashing only units. On crit, stun the initial enemy target for 1 turn. |
| Ore Abundance | free | RAGE, rage-locked, self | rageLocked=true resolution=oreHarvest selfCast=true ore.full=true | RAGE: Gather full ore, always filling Miner to max. |

### Monk `monk`

HP 26 · STR 9 · DEF 6 · MP 25 · MOVE 2 · RANGE 1

class `melee` · AI role `skirmisher` · AI threat 13

- **Passive — Shadow Step** `movementShape`: The Monk can move diagonally (movement uses a radius instead of orthogonal pathing) and may move and use an ART in the same activation.
  - mechanics: `type=movementShape shape=radius moveAndUseArts=true`
- **Passive — Nirvana** *(rage-only)* `statModifiers`: At 5 HP or lower: +2 MOVE, Monk ARTS gain +1 range, Front Kick always knocks back, and Protect restores 2 HP to the ally.
  - mechanics: `type=statModifiers stats.moveRange=2 artRangeBonus=1 frontKickAlwaysKnockback=true protectHeal=2`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Front Kick | 4 MP | rng 1, acc 96%, dmg [object Object] | resolution=frontKick targeting.range=1 knockback.distance=3 knockback.criticalOnly=true | Kick an enemy within 1 for 10 physical damage, scaling with STR. On critical hit, knock the target back up to 3 straight-line spaces. If the route is cut short by the board edge, the target is stunned for 1 turn; if it is cut short by one of the target's allies, that ally is stunned for 1 turn. |
| Protect | 5 MP | rng 3, protectAlly | resolution=protectAlly targeting.shape=protectAlly targeting.range=3 | Move to the near side of an ally within 3 and Defend. The ally also enters Defend, even if they already acted. |
| Heightened Sense | free | passive | type=immunity statuses=[blind] missingHpStat.stat=strength missingHpStat.per=5 missingHpStat.amount=1 effect.type=immunity effect.statuses=[blind] effect.missingHpStat.stat=strength effect.missingHpStat.per=5 effect.missingHpStat.amount=1 | The Monk is immune to Blind and gains +1 STR for every 5 HP missing. |

### Mother Nature `mother-nature`

HP 25 · STR 7 · DEF 3 · MP 100 · MOVE 3 · RANGE 6

class `support` · AI role `support` · AI threat 20 · **acts first each turn**

- **Passive — Mood Swing / Weather Commander** `weatherCommander`: Mother Nature must act first. Her last weather persists globally until a new weather is activated; a new weather charges +1 MOVE for her next turn, and a basic-attack crit restores 10 MP.
  - mechanics: `type=weatherCommander critMpRestore=10 nextWeatherMove=1`
- **Passive — RAGE** *(rage-only)* `—`: At 5 HP or lower, Great Flood becomes available.

- **Weather**: `blizzard.label=Blizzard blizzard.persistent.movementArtRangeBonus=1 spring.label=Spring Shower spring.persistent.restoreBonus=1 spring.persistent.extinguishesFire=true heatwave.label=Heatwave heatwave.persistent.critDamageBonus=1 heatwave.persistent.critCreatesFire.kind=fire heatwave.persistent.critCreatesFire.permanent=true thunderstorm.label=Thunderstorm thunderstorm.persistent.artMpCostReduction=1 thunderstorm.persistent.minArtMpCost=0 thunderstorm.persistent.extinguishesFire=true`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Blizzard | 5 MP | self | resolution=weather selfCast=true weather=blizzard globalStatus.status=slow globalStatus.durationTurns=1 globalStatus.statModifiers.moveRange=-1 | Activate Blizzard: slow every unit by 1 MOVE for their next activation. Persistent: movement ARTS gain +1 range globally. |
| Spring Shower | 5 MP | self | resolution=weather selfCast=true weather=spring globalHeal.amount=2 | Activate Spring Shower: heal every unit for 2 HP and put out every fire on the board. Persistent: all HP and MP restoration is boosted by 1 globally, and no new fire can be lit while it rains. |
| Heatwave | 5 MP | self | resolution=weather selfCast=true weather=heatwave globalStatus.status=empowered globalStatus.durationTurns=1 globalStatus.statModifiers.strength=1 | Activate Heatwave: grant every unit +1 STR for their next activation. Persistent: crits deal +1 damage and ignite permanent fire under the victim. |
| Landscaper | 5 MP | rng 5, dmg [object Object] | resolution=landscaper targeting.range=5 wall.hp=1 | Push an enemy back 1 tile and raise a wall where they stood. If the push is blocked, deal 10 physical damage instead. No roll. |
| Thunderstorm | 5 MP | self | resolution=weather selfCast=true weather=thunderstorm globalStatus.status=weather-magic globalStatus.durationTurns=1 globalStatus.magicDamageBonus=1 | Activate Thunderstorm: every unit's magic damage is +1 for their next activation, and the downpour puts out every fire on the board. Persistent: ARTS cost 1 less MP globally, and no new fire can be lit while it storms. |
| Great Flood | 50 MP | RAGE, self, dmg [object Object] | resolution=greatFlood selfCast=true restore.hp=5 | RAGE: Deal 7 magic damage to every unit, then shuffle all surviving units among their current positions. Mother Nature does not move and restores 5 HP. |

### Mystic `mystic`

HP 23 · STR 5 · DEF 3 · MP 38 · MOVE 2 · RANGE 5

class `support` · AI role `support` · AI threat 14

- **Passive — Anointed** `immunity`: The Mystic is immune to silence.
  - mechanics: `type=immunity statuses=[silence]`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Pray | 4 MP | selfAura, r3 | type=healAllies amount=3 radius=3 targeting.shape=selfAura targeting.radius=3 effect.type=healAllies effect.amount=3 effect.radius=3 | Heal the Mystic and nearby allies within 3 tiles for 3 HP. |
| Wish | 2 MP | globalAllies | type=healAllies amount=1 global=true targeting.shape=globalAllies effect.type=healAllies effect.amount=1 effect.global=true | Heal every living ally for 1 HP, regardless of distance. |
| Silence | 3 MP |  | type=status status=silence chance=0.7 durationTurns=1 resolution=statusCast effect.type=status effect.status=silence effect.chance=0.7 effect.durationTurns=1 | Cast silence at attack range with a 70% effect check. Mystics are immune. |
| Purify | 8 MP | rng 5, ally | type=cleanse resolution=cleanseAlly targeting.shape=ally targeting.range=5 effect.type=cleanse | Remove all status effects from one allied unit within 5 tiles. Cannot target self. |
| Guardian | free | passive | type=teamAura stats.defense=1 effect.type=teamAura effect.stats.defense=1 | While the Mystic lives, friendly units gain +1 DEF. |
| RAGE Passive | free | passive, RAGE | type=statModifiers stats.moveRange=6 defending=true moveAndUseArts=true attackDamageType=magic rageEntryRestore.mp=15 effect.type=statModifiers effect.stats.moveRange=6 effect.defending=true effect.moveAndUseArts=true effect.attackDamageType=magic effect.rageEntryRestore.mp=15 | At 5 HP or lower, restore 15 MP, gain +6 MOVE, basic attacks deal magic damage, may move and use ARTS in the same activation, and passively halve incoming physical and magic damage. |

### Necromancer `necromancer`

HP 23 · STR 6 · DEF 3 · MP 36 · MOVE 3 · RANGE 5

class `mage` · AI role `controller` · AI threat 13

- **Passive — Deathly Aura** `enemyAura`: Enemies within 3 tiles of the Necromancer suffer -1 DEF.
  - mechanics: `type=enemyAura radius=3 stats.defense=-1`
- **Passive — Grave Wrath** *(rage-only)* `statModifiers`: At 5 HP or lower, gain +1 MOVE and the Deathly Aura reaches 1 tile further (radius 4) while also sapping enemies' STR and MOVE by 1 (total -2 DEF, -1 STR, -1 MOVE within 4 tiles). The wider reach extends to your Ghoul too.
  - mechanics: `type=statModifiers stats.moveRange=1 enemyAura.radius=3 enemyAura.stats.defense=-1 enemyAura.stats.strength=-1 enemyAura.stats.moveRange=-1`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Wither | 4 MP | magic, acc 96% | type=status status=slow chance=0.7 durationTurns=3 statModifiers.moveRange=-1 effect.type=status effect.status=slow effect.chance=0.7 effect.durationTurns=3 effect.statModifiers.moveRange=-1 | Curse a target for magic damage, then apply -1 MOVE Slow for 3 turns on a 70% check. Paladins are immune. |
| Dark Bomb | 6 MP | self, nukeAura, r3, dmg [object Object] | selfCast=true targeting.shape=nukeAura targeting.radius=3 targeting.matchAuraRadius=true | Detonate dark energy, dealing 5 magic damage to every enemy within the Necromancer's Deathly Aura. |
| Summon Ghoul | 8 MP | placement, r2 | resolution=summon targeting.shape=placement targeting.radius=2 summon.type=ghoul summon.maxActive=2 | Raise a Ghoul on an empty tile within 2 tiles. It has 10 HP, takes no turns, and carries the Deathly Aura. Up to two Ghouls at a time. |
| Dead Zone | free | passive | type=teamDamageReduction damageType=magic amount=1 effect.type=teamDamageReduction effect.damageType=magic effect.amount=1 | While the Necromancer lives, friendly units take 1 less magic damage from all sources. |

### Nemesis `nemesis`

HP 25 · STR 7 · DEF 2 · MP 45 · MOVE 3 · RANGE 5

class `mage` · AI role `caster` · AI threat 16

- **Passive — Realm of Magic** `teamMagicSupport`: While Nemesis lives, allied magic damage gains +1 and allied MP costs are reduced by 1, to a minimum of 1.
  - mechanics: `type=teamMagicSupport magicDamage=1 mpCostReduction=1 minMpCost=1`
- **Passive — Regenerate** *(rage-only)* `rageEntryRestore`: RAGE: Upon reaching rage status, instantly restore 5 HP and 15 MP.
  - mechanics: `type=rageEntryRestore hp=5 mp=15`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Dark Pulse | 5 MP | self, rng Infinity, darkPulse, dmg [object Object] | resolution=darkPulse selfCast=true targeting.shape=darkPulse targeting.range=Infinity | Scatter dark balls in all 8 straight lines. Each ray hits the first unit contacted: enemies take 5 magic damage and allies heal 1 HP. Refund the MP cost if 4 targets are hit. When Nemesis drops below 20, 15, 10, and 5 HP, Dark Pulse auto-casts for no MP cost. |
| Realm Traversal | free | self | resolution=realmTraversal selfCast=true | Charge the next Nemesis turn: that turn may move and still cast Dark Pulse. Locks until the charged turn ends. |
| Nullify | free | passive | type=immunity statuses=[silence] effect.type=immunity effect.statuses=[silence] | Nemesis is immune to silence. |

### Paladin `paladin`

HP 26 · STR 10 · DEF 5 · MP 24 · MOVE 3 · RANGE 1

class `melee` · AI role `bruiser` · AI threat 12

- **Passive — Hand of Life** `physicalDamageHealAura`: When the Paladin deals physical damage, allies within 2 tiles heal for half the damage dealt, rounded down. The Paladin gains +1 DEF while standing on a white tile.
  - mechanics: `type=physicalDamageHealAura radius=2 fraction=0.5 rounding=floor tileAffinityStats.affinity=light tileAffinityStats.stats.defense=1`
- **Passive — Heaven's Realm** *(rage-only)* `statModifiers`: At 5 HP or lower, gain +2 STR and +1 range. Physical strikes deal +2 damage if the Paladin and target are both on light tiles.
  - mechanics: `type=statModifiers stats.strength=2 stats.attackRange=1 tileStrikeBonus.affinity=light tileStrikeBonus.amount=2`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Lightseeker | 4 MP | bonus:seeker, self | type=tilePulse affinity=light amount=1 range=5 selfCast=true bonusActionGroup=seeker effect.type=tilePulse effect.affinity=light effect.amount=1 effect.range=5 | Deal 1 true damage to every enemy within 5 tiles standing on a light tile. Does not spend the Paladin's action. |
| Chosen | free | passive | type=immunity statuses=[poison, slow, blind, silence, stun] effect.type=immunity effect.statuses=[poison, slow, blind, silence, stun] | The Paladin is immune to poison, slow, blind, silence, and stun. |
| Darkseeker | 4 MP | RAGE, rage-locked, bonus:seeker, self | type=tilePulse affinity=dark amount=2 global=true selfCast=true rageLocked=true bonusActionGroup=seeker effect.type=tilePulse effect.affinity=dark effect.amount=2 effect.global=true | While raging, deal 2 true damage to every enemy on a dark tile anywhere on the board. Does not spend the Paladin's action. |

### Riot Cop `riot-cop`

HP 30 · STR 8 · DEF 7 · MP 0 · MOVE 3 · RANGE 1

class `tank` · AI role `bruiser` · AI threat 15

- **Passive — Utility Belt** `allyAura`: Riot Cop's gear runs on limited charges instead of MP: Stun Gun has 5 uses and Smoke Bomb has 3. A pool that empties must sit dry for one full turn before it recharges to full; reaching RAGE instantly refills every pool.
  - mechanics: `type=allyAura radius=1 stats.defense=1`
- **Passive — Lockdown** *(rage-only)* `statModifiers`: RAGE: gain +1 STR and +1 MOVE, Stun Gun stuns at any range, and reaching rage refreshes all of Riot Cop's ability uses.
  - mechanics: `type=statModifiers stats.strength=1 stats.moveRange=1 stunAtAnyRange=true refreshResources=true`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Stun Gun | 5 uses | true, rng 3, acc 96%, dmg [object Object] | type=status status=slow chance=0.7 durationTurns=1 uses=5 targeting.range=3 effect.type=status effect.status=slow effect.chance=0.7 effect.durationTurns=1 | Fire a stun dart at an enemy within 3 for 3 true damage and slow it 1 turn (roll to hit, roll for status). An adjacent target — or any target while raging — is stunned instead. 5 uses; restores a full turn after running dry. |
| Smoke Bomb | 3 uses | rng 4, targetedBlast, r1, acc 96% | type=status status=blind durationTurns=1 uses=3 targeting.shape=targetedBlast targeting.range=4 targeting.radius=1 effect.type=status effect.status=blind effect.durationTurns=1 | Throw a smoke bomb at an empty tile within 4 (roll for success). If it lands, blind every enemy within 1 tile of it for 1 turn. Deals no damage. 3 uses; restores a full turn after running dry. |
| Shield Bash | free | rng 1, acc 96%, dmg [object Object] | targeting.range=1 blockedDamage=1 | Bash an adjacent enemy for 8 physical damage (roll to hit) and push it one tile back. If it has nowhere to go, it takes 1 extra true damage instead. Unlimited uses. |
| Cover | free | rng 1, ally | targeting.shape=ally targeting.range=1 coverBuff.statModifiers.strength=1 coverBuff.duration=2 | Swap places with an adjacent ally and Defend. If the covered ally is below half HP, Riot Cop gains +1 STR on his next turn. Unlimited uses. |
| Heavy Boots | free | passive | type=immunity statuses=[slow] effect.type=immunity effect.statuses=[slow] | Riot Cop cannot be slowed. |
| Riot Shield | free | passive | type=riotShield rangedBasicReduction=1 magicNullifyWhileDefending=true critMagicVulnerability=1 effect.type=riotShield effect.rangedBasicReduction=1 effect.magicNullifyWhileDefending=true effect.critMagicVulnerability=1 | Allies within 1 tile of Riot Cop's shield wall gain +1 DEF. Riot Cop himself takes 1 less damage from ranged basic attacks, takes 1 extra damage from critical magic hits, and completely nullifies magic damage aimed at him while defending. |
| Lockdown | free | RAGE, rage-locked, self, nukeAura, r3 | durationTurns=1 rageLocked=true firstCommandOnly=true selfCast=true targeting.shape=nukeAura targeting.radius=3 effect.durationTurns=1 | RAGE: crack down on the whole area — every unit within 3 tiles (allies included, not Riot Cop) is slowed to 1 MOVE and loses 2 DEF for 1 turn. Must be your turn's first command. |

### Ronin `ronin`

HP 28 · STR 10 · DEF 5 · MP 20 · MOVE 3 · RANGE 1

class `melee` · AI role `skirmisher` · AI threat 13

- **Passive — Wanderer** `duelist`: Deal +2 damage while no ally stands within 3 of Ronin, +1 versus enemies with no ally within 3, and +1 to any enemy that missed a roll on Ronin last turn. A critical basic strike heals Ronin for half the damage dealt.
  - mechanics: `type=duelist isolationRadius=3 isolatedAttackerBonus=2 isolatedTargetBonus=1 missedMeBonus=1 critLifestealFraction=0.5`
- **Passive — Final Draw** *(rage-only)* `statModifiers`: At 5 HP or lower: +12 STR and +1 MOVE, but Ronin takes damage equal to the damage he deals with an attack unless it defeats the last enemy unit.
  - mechanics: `type=statModifiers stats.strength=12 stats.moveRange=1 attackRecoil=true`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Patient Blade | free | self | resolution=selfBuff selfCast=true selfBuff.defend=true selfBuff.status.type=empowered selfBuff.status.duration=2 selfBuff.status.statModifiers.moveRange=1 | Defend, and gain +1 MOVE on Ronin's next turn. |
| Flashing Steel | 5 MP | rng 1, acc 96% | type=status status=blind chance=0.9 durationTurns=1 targeting.range=1 effect.type=status effect.status=blind effect.chance=0.9 effect.durationTurns=1 | Attack an adjacent enemy with a 90% chance to blind it for 1 turn. |
| Broken Oath | 3 MP | self | resolution=selfBuff selfCast=true selfBuff.status.type=empowered selfBuff.status.duration=2 selfBuff.status.statModifiers.defense=-2 selfBuff.status.statModifiers.moveRange=1 selfBuff.status.statModifiers.strength=1 | Forsake your guard: -2 DEF, but +1 MOVE and +1 STR through Ronin's next turn. |
| Challenge | 4 MP | rng 5 | resolution=challenge targeting.range=5 challenge.bonus=2 challenge.durationTurns=2 | Call out an enemy within 5. Next turn, Ronin deals +2 damage to it and it deals +2 damage to Ronin. |
| Shuriken | 3 MP | true, rng 3, acc 96%, dmg [object Object] | resolution=shuriken targeting.range=3 targeting.bodyBlocked=true | Throw a shuriken at an enemy within 3, rolling to hit for 3 true damage. |

### Sniper `sniper`

HP 23 · STR 8 · DEF 3 · MP 18 · MOVE 2 · RANGE 6

class `ranger` · AI role `ranged` · AI threat 13

- **Passive — Rifle Powered** `riflePowered`: Shots pierce units and walls, and never do less than 2.
  - mechanics: `type=riflePowered pierce=true minimumDamage=2`
- **Passive — RAGE Passive** *(rage-only)* `statModifiers`: At 5 HP or lower, gain +1 STR, +1 range, +2 MOVE, may move and use ARTS in the same activation, and basic attacks damage every enemy in the chosen straight ray.
  - mechanics: `type=statModifiers stats.strength=1 stats.attackRange=1 stats.moveRange=2 moveAndUseArts=true lineAttack.damageType=physical`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Smoke Bomb | 3 MP |  | type=status status=blind chance=0.7 durationTurns=1 resolution=statusCast effect.type=status effect.status=blind effect.chance=0.7 effect.durationTurns=1 | Throw a smoke bomb at one enemy in range: 70% to blind it for 1 turn. No damage. Blocked by walls, not bodies. |
| Build Cover | 3 MP | tilePlacement, r3 | targeting.shape=tilePlacement targeting.radius=3 wall.hp=1 | Raise a 1-HP wall on an empty tile within 3. It blocks movement and line of sight for everyone — except the Sniper's own shots. |
| Throw Cigar | 3 MP | tilePlacement, r4 | targeting.shape=tilePlacement targeting.radius=4 targeting.allowOccupied=true fire.turns=3 | Set a tile within 4 alight. Anyone standing on it takes 1 true damage at each turn rollover for 3 turns. |

### Summoner `summoner`

HP 23 · STR 6 · DEF 4 · MP 100 · MOVE 2 · RANGE 5

class `mage` · AI role `caster` · AI threat 15

- **Passive — Soul Shuffle** `soulShuffle`: Summon and Beckon offer five shuffled non-Summoner units, excluding the last ghost used. A ghost's self-restoration is redirected to the Summoner.
  - mechanics: `type=soulShuffle choices=5 excludeSelf=true excludeLastGhost=true redirectGhostSelfRestore=true`
- **Passive — Disturbed Spirit** *(rage-only)* `statModifiers`: At 5 HP or lower, may move and use one ART in the same activation.
  - mechanics: `type=statModifiers moveAndUseArts=true`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Summon | 5 MP | placement, r3 | resolution=summonGhost targeting.shape=placement targeting.radius=3 | Choose an empty tile within 3, then call one unit from a fresh Soul Shuffle as a ghost. The ghost takes one full turn at full health, then dissipates. |
| Dematerialize | 5 MP | flee | resolution=flee targeting.shape=flee | Teleport to any empty tile within Move+2 tiles. Spends this unit's activation. |
| Beckon | 20 MP | RAGE, rage-locked, placement, r3 | rageLocked=true resolution=summonGhost targeting.shape=placement targeting.radius=3 | RAGE: Choose an empty tile within 3, then call one unit from a fresh Soul Shuffle as a ghost that arrives already RAGING (its RAGE passive and RAGE ART are available). The ghost takes one full turn, then dissipates. |

### Swordsman `swordsman`

HP 25 · STR 10 · DEF 5 · MP 20 · MOVE 3 · RANGE 1

class `melee` · AI role `bruiser` · AI threat 10

- **Passive — Last Stand** `thresholdBoost`: Below 3 HP, gain +3 STR.
  - mechanics: `type=thresholdBoost hpBelow=3 stats.strength=3`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Footwork | 4 MP |  | extraMove=3 | Walk your current MOVE + 3 as unique tiles, passing through enemies for 3 true damage. End on empty ground. |
| Moonstrike | 5 MP | acc 96% | type=status status=blind chance=0.7 durationTurns=1 effect.type=status effect.status=blind effect.chance=0.7 effect.durationTurns=1 | Attack with a 70% chance to blind the target. |
| Mage Killer | 5 MP | acc 96% | type=status status=silence chance=0.7 durationTurns=1 effect.type=status effect.status=silence effect.chance=0.7 effect.durationTurns=1 | Attack with a 70% chance to silence the target. |
| Life Sap | 5 MP | acc 96% | type=heal chance=0.7 amount=halfDamageDealtRounded effect.type=heal effect.chance=0.7 effect.amount=halfDamageDealtRounded | Attack with a 70% chance to restore half the damage dealt, rounded. |
| Quick | free | passive, RAGE | type=statModifiers stats.moveRange=3 stats.strength=1 effect.type=statModifiers effect.stats.moveRange=3 effect.stats.strength=1 | At 5 HP or lower, gain +3 MOVE and +1 STR. |

### Treant `treant`

HP 30 · STR 7 · DEF 6 · MP 30 · MOVE 2 · RANGE 2

class `tank` · AI role `support` · AI threat 14

- **Passive — Enchanted Roots** `weatherAffinity`: Weather-attuned: heals 1 HP per turn in Rain, +1 DEF in Snow, +1 magic damage in Thunderstorm, +2 STR / −1 DEF in Fire. Takes +1 damage from fire abilities and fire tiles. Immune to poison.
  - mechanics: `type=weatherAffinity weathers.spring.restorePerTurn.hp=1 weathers.blizzard.stats.defense=1 weathers.thunderstorm.magicDamage=1 weathers.heatwave.stats.strength=2 weathers.heatwave.stats.defense=-1 fireVulnerability=1 immuneStatuses=[poison]`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Enrich | 2 MP | rng 5, ally | mp=3 hpIfFull=3 targeting.shape=ally targeting.range=5 targeting.excludeSelf=true resolution=enrich effect.mp=3 effect.hpIfFull=3 | Spend 2 MP to restore 3 MP to an ally within 5 (not yourself). If that ally is already at full MP, restore 3 HP instead. |
| Source Shift | 1 MP + 1 HP + 3 uses | self | uses=3 selfCast=true resolution=sourceShift | Spend 1 HP and 1 MP to swap the Treant's current HP and MP values. 3 uses; restores a full turn after running dry. |
| Soul Sap | 2 MP | rng 1, acc 96% | type=heal chance=0.7 amount=halfDamageDealtRounded restore=mp targeting.range=1 effect.type=heal effect.chance=0.7 effect.amount=halfDamageDealtRounded effect.restore=mp | Attack an adjacent enemy with a 70% chance to drain half the damage dealt back as MP. |
| Ether | free | passive | type=mpRecoveryBuff stats.strength=2 effect.type=mpRecoveryBuff effect.stats.strength=2 | Whenever the Treant recovers MP, he gains +2 STR on his next turn. |
| Deep Roots | free | passive | type=positionalDefense enemyStats.defense=1 allyStats.defense=1 effect.type=positionalDefense effect.enemyStats.defense=1 effect.allyStats.defense=1 | +1 DEF while every living enemy is within the Treant's attack range, and +1 DEF while every other living ally is (+2 with both). |
| Grove Ward | free | passive | type=teamDamageReduction damageType=magic amount=1 effect.type=teamDamageReduction effect.damageType=magic effect.amount=1 | While the Treant lives, friendly units take 1 less magic damage from all sources. |
| Verdant Bond | free | passive | type=buffShare radius=2 critStatus.status=slow critStatus.duration=1 critStatus.statModifiers.moveRange=-1 effect.type=buffShare effect.radius=2 effect.critStatus.status=slow effect.critStatus.duration=1 effect.critStatus.statModifiers.moveRange=-1 | When an ally within 2 tiles gains a stat buff, the Treant gains it too. A critical basic attack slows its target by 1 MOVE for 1 turn. |
| Petrify | free | RAGE, rage-locked, self | rageLocked=true selfCast=true resolution=petrify selfProtect=true petrify.turns=2 petrify.radius=2 petrify.selfRestore.hp=1 petrify.selfRestore.mp=1 petrify.allyRestore.hp=1 petrify.allyRestore.mp=1 petrify.enemyDrain.hp=1 petrify.enemyDrain.mp=1 | RAGE: root into an invulnerable statue for 2 turns, taking no actions. Each turn, restore 1 HP + 1 MP to yourself and to allies within 2 tiles, and drain 1 HP + 1 MP from enemies within 2 tiles. |

### Virus `virus`

HP 25 · STR 6 · DEF 3 · MP 36 · MOVE 3 · RANGE 5

class `mage` · AI role `support` · AI threat 14

- **Passive — Spread** `statusSpread`: When an enemy is afflicted with a status effect, its allies within 2 tiles are afflicted too. A critical basic attack from Virus poisons the target.
  - mechanics: `type=statusSpread radius=2 rageRadiusBonus=1 statuses=[poison, blind, silence, slow, stun] critStatus.status=poison critStatus.duration=permanent`
- **Passive — Infectious Affinity** *(rage-only)* `statModifiers`: At 5 HP or lower: Spread reaches 1 tile further, all poison Virus inflicts is guaranteed, and every basic attack poisons the target on hit.
  - mechanics: `type=statModifiers attackStatus.status=poison attackStatus.duration=permanent guaranteedStatuses=[poison]`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Cough | 5 MP | magic, rng 5, acc 96%, dmg [object Object] | type=status status=poison chance=0.6 durationTurns=permanent targeting.range=5 effect.type=status effect.status=poison effect.chance=0.6 effect.durationTurns=permanent | Deal 5 magic damage to a target in range, with a 60% chance to poison. |
| Poison Tick | 2 MP | self, dmg [object Object] | selfCast=true resolution=poisonBurst | Deal 2 true damage to every poisoned enemy anywhere on the board. |
| Smog | 5 MP | self, nukeAura, r2 | type=status status=blind durationTurns=1 selfCast=true resolution=smog targeting.shape=nukeAura targeting.radius=2 effect.type=status effect.status=blind effect.durationTurns=1 | Blind every enemy within 2 tiles of Virus. No roll — the cloud always lands. |
| Gaseous Entity | free | passive | type=immunity statuses=[poison, blind] effect.type=immunity effect.statuses=[poison, blind] | Virus is immune to poison and blind. |
| Growth | free | passive | type=poisonMpRefund amount=2 effect.type=poisonMpRefund effect.amount=2 | Whenever Virus poisons an enemy, it restores 2 MP. |
| Explosion | free | RAGE, rage-locked, self, dmg [object Object] | rageLocked=true selfCast=true selfKill=true requiresPoisonedEnemy=true resolution=poisonBurst splash.amount=5 splash.radius=2 | RAGE: Deal 10 true damage to every poisoned enemy, and 5 true damage to enemies within 2 tiles of a poisoned enemy. Virus is consumed. Unusable if no enemy is poisoned. |

### Witch Doctor `witch-doctor`

HP 24 · STR 7 · DEF 3 · MP 30 · MOVE 2 · RANGE 4

class `support` · AI role `support` · AI threat 15

- **Passive — Dancing Man** `stanceSystem`: The Witch Doctor's passive is the stance of the dance he used most recently — Rain, Fire, Spirit, Misfortune, or Black Death.
  - mechanics: `type=stanceSystem`
- **Passive — RAGE** *(rage-only)* `—`: At 5 HP or lower, the Black Death Dance becomes available.

- **Stances**: `rain.globalHealBonus=1 rain.onAttack.hasteMove=2 fire.stats.strength=1 fire.critBonus=1 spirit.onAttack.allyMp=3 spirit.onAttack.allyMpRadius=2 misfortune.globalStatusChanceMultiplier=2 blackDeath.magicImmune=true blackDeath.globalTrueTick=1`

| ART | Cost | Tags | Mechanics | In-game text |
| --- | --- | --- | --- | --- |
| Rain Dance | 2 MP | bonus:dance, self | type=healAllies amount=1 global=true resolution=witchDance selfCast=true bonusActionGroup=dance stance=rain effect.type=healAllies effect.amount=1 effect.global=true | Heal every ally for 1 HP, then enter Rain Stance: all HP healing is +1 globally, and attacking grants the Witch Doctor +2 MOVE next turn. Does not spend the Witch Doctor's action. |
| Fire Dance | 3 MP | bonus:dance, self | resolution=witchDance selfCast=true bonusActionGroup=dance stance=fire teamBuff.statModifiers.strength=1 teamBuff.durationTurns=1 | Grant every ally +1 STR for 1 turn, then enter Fire Stance: the Witch Doctor's STR becomes 8 and his crits deal +1 damage. Does not spend the Witch Doctor's action. |
| Spirit Dance | free | bonus:dance, self | resolution=witchDance selfCast=true bonusActionGroup=dance stance=spirit teamMp.amount=1 | Restore 1 MP to every ally, then enter Spirit Stance: attacking restores 3 MP to allies within 2 tiles. Does not spend the Witch Doctor's action. |
| Misfortune Dance | 5 MP | bonus:dance, self | resolution=witchDance selfCast=true bonusActionGroup=dance stance=misfortune cleanse.scope=all | Remove every status effect from all units (allies and foes), then enter Misfortune Stance: status effects are twice as likely to land for everyone. Does not spend the Witch Doctor's action. |
| Black Death Dance | 5 MP | rage-locked, bonus:dance, self | rageLocked=true resolution=witchDance selfCast=true bonusActionGroup=dance stance=blackDeath selfBuff.statModifiers.strength=2 selfBuff.statModifiers.defense=1 selfBuff.statModifiers.moveRange=1 selfBuff.durationTurns=1 globalStatus.status=blind globalStatus.durationTurns=1 | RAGE: Gain +2 STR / +1 DEF / +1 MOVE for this turn and blind every unit for 1 turn, then enter Black Death Stance: you are immune to magic, and every unit takes 1 true damage each turn. Does not spend the Witch Doctor's action, so the buff empowers his own move and attack. |
| Coal Walker | free | passive | type=fireImmunity fireDamageImmune=true effect.type=fireImmunity effect.fireDamageImmune=true | The Witch Doctor takes no damage from fire-based ARTS or fire tiles. |
| Hex Strike | free | passive | critStatus.status=silence critStatus.duration=1 tileBasicAttack.affinity=dark tileBasicAttack.bothCritBonus=0.2 darkTileMpRestore.affinity=dark darkTileMpRestore.amount=3 effect.critStatus.status=silence effect.critStatus.duration=1 effect.tileBasicAttack.affinity=dark effect.tileBasicAttack.bothCritBonus=0.2 effect.darkTileMpRestore.affinity=dark effect.darkTileMpRestore.amount=3 | The Witch Doctor's basic attacks silence on a critical hit, gain +20% crit chance against a target on a dark tile while he is on one too, and restore 3 MP to him when he and his target both stand on a dark tile. |

