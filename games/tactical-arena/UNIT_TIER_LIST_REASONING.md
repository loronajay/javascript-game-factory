# Tactical Arena - Unit Tier List: Reasoning

This is the reasoning behind `UNIT_TIER_LIST.md`, rewritten for the 2026-07-17
balance state from the live unit definitions in `src/core/units/*.js`, the stat
folds in `src/core/unitCatalog.js`, and the combat rules in `src/rules/combat.js`
and `src/rules/damage.js`.

Scope: 30 draftable units, standard 4-unit custom squads, 1v1 hot-seat/online
play, 13x13 or 15x15 boards, and the normal RAGE threshold of 5 HP or lower.
`Ghoul` is not ranked because it is summon-only.

## Audit rules for this pass

1. **Every kit piece counts.** Each placement accounts for the unit's passive,
   all ARTS, and rage entries, not just the headline combo.
2. **Damage type matters.** DEF checks physical damage only. Magic ignores DEF,
   and true damage ignores DEF and Defend, so magic reduction, status immunity,
   healing denial, and true-damage access are draft-warping.
3. **Action economy beats raw numbers.** Move-and-ART, no-action pulses, free
   casts, full-turn ghosts, and automatic triggers frequently matter more than a
   bigger single hit.
4. **Resource engines decide long games.** MP does not passively regenerate for
   most units, so refunds, charges, ore, weather, stances, and HP-as-fuel change
   how real a kit is after the first exchange.
5. **Conditional value is taxed.** Tile color, weather, exact partners, isolation,
   global rules that help both teams, and rage-only payoffs lower blind-pick value.

## What changed in this pass

The biggest correction is scope. Earlier notes leaned too hard on role labels and
did not name enough of the actual kit text, which made several placements look
less grounded than they should have. This pass audits the full kit for every
draftable unit.

Placement changes still follow the current balance state: Paladin remains S
because Hand of Life, Chosen, white-tile DEF, Lightseeker, Heaven's Realm, and
Darkseeker form a complete blind-pick package. Monk and Little Brother are higher
than older reads because Front Kick has real stun conversion and Flamethrower now
leaves permanent fire while Rechargeable Battery restores 5 MP. Riot Cop stays
strong but not elite because Riot Shield no longer makes critical magic harmless.

---

# S Tier

These units define drafts by being excellent without needing a narrow setup, or by
forcing the opponent to draft specific answers.

### Mystic - best universal support

Mystic is S because her floor is immediate team value. Guardian gives every ally
+1 DEF while she lives, and Anointed means silence cannot turn off her support
job. Pray is local burst healing, Wish is cheap global healing, Purify removes
all statuses from an ally within 5, and Silence gives her a direct caster-control
button at range 5.

Her RAGE Passive is one of the safest in the roster: it restores 15 MP on entry,
adds +6 MOVE, makes basics magic, allows move-and-ART, and passively Defends
while she still acts. The weakness is 23 HP and DEF 3 before rage, but the kit
covers DEF, healing, cleanse, status pressure, and late-game safety without asking
for a specific comp.

### Necromancer - mitigation, DEF shred, and free screens

Necromancer earns S through stacked passive value. Deathly Aura applies -1 DEF to
enemies within 3, and Dead Zone gives allies -1 incoming magic damage, one of the
rarest answers to the damage type that ignores DEF. Wither adds range-5 magic plus
slow, Dark Bomb punishes anything inside the aura, and Summon Ghoul creates up to
two 10-HP blockers that also carry Deathly Aura.

Grave Wrath makes the package even nastier at low HP: +1 MOVE, aura radius 4, and
an added -1 STR/-1 MOVE on top of the DEF shred, including through Ghouls. He is
fragile, but the draft value arrives before he ever reaches rage: mitigation for
caster matchups, aura pressure for physical teams, and board control through
summons.

### Gargoyle - safest tank-carry

Gargoyle's Stone Body answers too many plans at once: melee attackers take true
retaliation while it Defends, displacement fails and returns 2 true damage, and
targeted statuses reflect back to the offender. Stone Ward adds full status
immunity, Heavy caps Move at 3, and One With The Flames gives fire immunity,
Heatwave sustain, and permanent fire on basic crits.

Flight offsets the Move cap with diagonal repositioning and landing true damage,
while Pyroclasm gives eight-line magic AoE. Volcanic Rage is the best defensive
rage profile here: +2 DEF, always Defending while acting, +2 Pyroclasm range, a
free Pyroclasm on rage entry, and another every third turn. Gargoyle is hard to
move, hard to debuff, hard to burst, and still threatens clustered boards.

### Nemesis - offensive aura engine

Realm of Magic is a format-level aura: allied magic damage gains +1, and allied
ART costs are reduced by 1 to a minimum of 1. Because magic ignores DEF and many
strong ARTS are repeatable, Nemesis turns caster squads into resource engines
instead of one-burst shells.

The rest of the kit is not filler. Dark Pulse fires along all eight rays, damages
enemies, heals allies, refunds if it hits four targets, and auto-casts for free as
Nemesis crosses 20, 15, 10, and 5 HP. Realm Traversal charges a move-plus-Dark
Pulse turn, Nullify gives silence immunity, and Regenerate restores 5 HP and 15
MP on rage entry. DEF 2 is the tax, but the payoff is strong enough to draft
around.

### Paladin - all-purpose anchor

Paladin belongs in S because his kit is now complete instead of merely sturdy.
Hand of Life converts physical damage into nearby ally healing and also gives
+1 DEF on white tiles. Chosen grants immunity to poison, slow, blind, silence, and
stun, so common control plans do not meaningfully tax him.

Lightseeker is no-action true chip against enemies on light tiles within 5, while
Heaven's Realm adds +2 STR, +1 range, and +2 extra damage when both Paladin and the
target stand on light tiles. Darkseeker gives no-action global true damage against
enemies on dark tiles while raging. Physical mitigation can still shrink his
healing, but a status-proof sustain bruiser with tile-based true chip is elite.

---

# A Tier

These units are frequently first-pickable, but they have clearer counters,
positioning demands, or matchup dependencies than S-tier anchors.

### Clod - physical damage veto

Clod is the best anti-physical wall. Brick House gives adjacent allies +1 DEF and
gives Clod +1 STR for each sheltered ally, so compact squads get both protection
and counterpunch. Rock Hard is the core reason to draft him: while Defending, he
negates all physical damage and restores 3 MP whenever a physical attack hits.

His offense is more real now. Quake deals magic damage in radius 3, scales with
the number of enemies hit, and refunds if it hits at least 3 enemies. Stone Throw
adds range-4 physical damage with slow, or stun on crit. Thunderous Charge is the
rage payoff: a range-4 charge into radius-2 physical damage and stun. Clod is A
because magic and true damage bypass the main gimmick, but physical squads have
to solve him.

### Treant - magic ward sustain tank

Treant is not just a weather toy. Grove Ward gives the whole team -1 incoming
magic damage while Treant lives, attached to a 30-HP, DEF-6 body. Enchanted Roots
adds weather bonuses, poison immunity, and fire vulnerability: HP regen in
Spring Shower, +1 DEF in Blizzard, +1 magic damage in Thunderstorm, and +2 STR/-1
DEF in Heatwave.

His active economy is broad. Enrich turns 2 MP into 3 ally MP, or 3 HP if that
ally is full. Source Shift swaps HP and MP at an HP/MP cost, Soul Sap can drain
half damage as MP, Ether converts MP recovery into +2 STR next turn, Deep Roots
can add up to +2 DEF based on ally/enemy positioning, and Verdant Bond copies
nearby ally stat buffs while crits slow. Petrify makes him invulnerable for 2
turns, trading actions for area HP/MP restore and enemy HP/MP drain. The fire
vulnerability and setup needs keep him below S, but the magic ward is premium.

### Monk - action-economy skirmisher

Monk's Shadow Step is a structural advantage: radius movement instead of normal
orthogonal pathing, plus move-and-ART from turn one. Front Kick is now serious
control: it hits for STR-scaling physical damage and, on crit, knocks back up to
3 spaces; if the board edge cuts the path short the target is stunned, and if an
ally blocks it that ally is stunned.

Protect lets Monk jump to an ally within 3, Defend, and put that ally into Defend
even if the ally already acted. Heightened Sense grants blind immunity and +1 STR
per 5 missing HP. Nirvana adds +2 MOVE, +1 ART range, guaranteed Front Kick
knockback, and 2 HP healing on Protect. He is range-1 and not a pure damage
carry, but the movement rules and bodyguard action make him a top skirmisher.

### Father Time - permanent stat swings and revive

Father Time is valuable because Time Steal creates passive radius-2 true damage
and refunds 1 MP per damage dealt. Father of Time gives stun and slow immunity,
so common peel tools do not easily stop his control role. Age is the centerpiece:
within range 4, it gives an ally permanent +1 STR or +1 DEF, or drains an enemy's
STR or DEF by 1 until Father Time dies.

Time Stretch gives temporary +1 MOVE to an ally or -1 MOVE to an enemy. Rewind is
rage-locked but enormous: a fallen ally returns within 3 at full HP with statuses
cleared, though MP is not restored. His RAGE entry only unlocks Rewind, so the
ceiling depends on reaching low HP with a corpse available, but permanent stat
swings plus true attrition make him a strong A.

### Magician - armor solvent

Magician's job is simple and essential: Spark is range-5 magic damage, and magic
ignores DEF. That makes him one of the cleanest answers to Clod, Gargoyle, Riot
Cop, and other armor-first boards. Banish adds magic damage with a 75% silence
check, while Flee teleports him to an empty tile within Move+2 to preserve the
fragile DEF-3 body.

Magic Pipe restores 10 MP after every 3 completed activations without Spark or
Banish, so he can recover if the game slows down. RAGE makes his basics magic and
unlocks Nuke, a 12-magic radius-3 detonation. The frailty and rage dependence for
Nuke keep him out of S, but every real tier list has to price his anti-armor role
highly.

### Fat Wizard - durable caster with sustain

Fat Wizard brings a caster role on a 30-HP body. Clumsy means Zap! misses still
splash 2 magic around the target, crits splash 3, and Surge has splash-heal
insurance. Zap! is range-4 magic with silence on crit. Study marks one enemy,
adding +1 damage and causing his magic damage to that target to restore 2 HP and
2 MP. Surge heals an ally, and Relay Power converts 2 HP and 2 MP from Fat Wizard
into 2 HP and 2 MP for an ally within 5.

Brothers in Arms adds +1 STR and +1 magic damage if Fat Knight, Fat Cleric, and
Fat Bowman are all on his team. Lazy Cast is the rage payoff: basics become
magic, Zap! and Surge are free, Zap! gains +3 damage, Zap! splashes on hit, and
crit control changes from silence to stun. He lacks a broad team aura, but the
self-contained sustain and rage mode are strong.

### Virus - status win condition

Virus can take over games that lack immunity or cleanse. Spread propagates poison,
blind, silence, slow, and stun to nearby allies when an enemy is afflicted, with
basic crits adding poison. Cough is range-5 magic plus poison chance, Smog is
no-roll radius-2 blind, Poison Tick deals 2 true damage to every poisoned enemy,
Gaseous Entity grants poison/blind immunity, and Growth refunds 2 MP whenever
Virus poisons an enemy.

Infectious Affinity extends Spread by 1, guarantees poison inflicted by Virus, and
makes every landed basic poison. Explosion is the rage finisher: 10 true damage to
poisoned enemies and 5 true splash near poisoned enemies, at the cost of Virus.
Status immunity and cleanse are common enough to keep him A rather than S, but
into unprepared drafts he plays like a top unit.

### Juggernaut - anti-heal clock

Juggernaut is a brutal timing unit. Bruiser Mode makes 0 MP a power state: +2 STR
and +1 MOVE, with +1 incoming magic damage as the cost. Recharge restores 5 MP, or
1 HP if already full, so he can choose between loaded ARTS and empty-MP stats.
Tether Grab pulls the first unit in a line within 4 and deals 3 magic to enemies;
Rocket Punch is a range-5 line shot for 10 physical damage with stun chance.

Null Zone is why he ranks this high: at rage, +2 STR, +2 MOVE, free ARTS, and all
healing on the board disabled. Self Destruct then threatens 10 true damage to
every enemy within 4 while killing Juggernaut. He is slow before the window and
magic-vulnerable in Bruiser Mode, but no-healing rage changes matchups by itself.

### Mother Nature - weather commander

Mother Nature is a first-acting rules editor. Mood Swing / Weather Commander
makes her act first, persists the last weather globally, gives +1 MOVE next turn
after setting new weather, and restores 10 MP on a basic crit. Blizzard slows
every unit for a turn and then globally increases movement ART range.
Spring Shower heals every unit and then boosts all HP/MP restoration by 1. Heatwave
temporarily grants +1 STR and then makes crits stronger while creating permanent
fire under victims. Thunderstorm temporarily gives +1 magic damage and then
reduces ART costs by 1 globally.

Landscaper is the non-weather control button: no-roll push plus wall, or 10
physical damage if blocked. Her RAGE unlocks Great Flood, which deals 7 magic to
every unit, shuffles surviving positions, and heals Mother Nature for 5. She is A
because the effects are global and must be drafted around, but the player who
breaks parity better gets enormous value.

### Little Brother - upgraded artillery

Little Brother is much more than a basic ranged unit now. Splash Fire turns basic
crits into 2 true splash around the target. Cannon Fire is a range-5, 10-power
physical shot that stuns on crit and triggers Splash Fire. Rechargeable Battery
restores 5 MP whenever he takes magic damage, which can quickly reload his
10-MP pool. Pissing Contest adds +1 range while any Big Brother is in play.

Flamethrower is the main upgrade: 3 true damage in a range-3 cone, leaving
permanent fire under enemies hit. Flamespitter adds +2 STR and crit chance, gives
Flamethrower +2 range, and fires it for free after orthogonal basic attacks. He
still likes crit support and can be resource-gated, but permanent fire plus true
cone pressure is a real artillery plan.

---

# B Tier

These units are good and draftable, often excellent in the right shell, but less
automatic than A-tier picks.

### Fat Cleric - durable main healer

Fat Cleric is a reliable grind piece. Snack Break restores 1 HP and 1 MP when she
Defends without moving. Hope is a cheap radius-3 random heal for her and allies,
Cleanse removes negative statuses from an ally within 5, and Focus Prayer can
restore 5 HP within 3, with the miss risk of backfiring into a random status.

Second Helping is a rage revive for a fallen ally at 50% HP, statuses cleared, no
MP restored. Brothers in Arms adds +1 MOVE and +1 DEF beside Fat Knight, Fat
Wizard, and Fat Bowman. Emergency Snacks makes basics magic while raging and can
heal 1 HP at turn start up to 3 times, with 5 MP restored if it exits rage. She is
good, but Mystic's Guardian/Purify and the Necromancer/Treant mitigation auras
are more draft-warping than raw healing.

### Angel - status-immune magic support

Angel's Blessed Arrow makes basics magic, adds light-tile accuracy/crit rules, and
blinds on basic crits. Holy Being grants full status immunity, and Inner Strength
adds crit chance as HP drops. That gives Angel a clean role into armor and status
teams even with only STR 3.

Anoint gives an ally +1 range for a turn, which is excellent with Sniper,
Paladin, Mystic, and other ranged threats. Elevate heals allies standing on light
tiles anywhere. Heaven's Wrath adds +3 STR and +2 MOVE at rage, and Heavenseeker
is a no-action global light-tile pulse that heals allies for 2 and deals 2 true
damage to enemies. Angel can play above B in tile/range shells, but as a blind
pick he is more specialist support than centerpiece.

### Witch Doctor - stance rules-editor

Witch Doctor's Dancing Man means the last dance sets his ongoing stance, and the
stances are powerful but dangerous because several rewrite rules for everyone.
Rain Dance heals allies globally and enters Rain Stance, making all HP healing +1
globally and giving Witch Doctor +2 MOVE next turn after attacking. Fire Dance
gives allies +1 STR for a turn and enters Fire Stance, where Witch Doctor gains
STR and better crits. Spirit Dance restores 1 MP to every ally and enters Spirit
Stance, letting attacks restore 3 MP to nearby allies.

Misfortune Dance cleanses every unit, ally and foe, then doubles status chances
for everyone. Coal Walker gives fire immunity. Hex Strike makes his basic attacks
silence on a crit and, on dark ground with his target, gain +20% crit chance and
refund him 3 MP — rewarding him for fighting on dark tiles. RAGE unlocks Black Death Dance,
which gives temporary stats, blinds every unit, and enters Black Death Stance:
magic immunity for Witch Doctor and 1 true damage to every unit each turn. He is
powerful, but the global and timing-sensitive nature of the stances makes him a
planned-shell unit rather than a universal pick.

### Sniper - anti-turtle specialist

Sniper's Rifle Powered gives range 6, unit/wall piercing, and a minimum of 2
damage. That is an unusually clean answer to cover, screens, and low-HP backline
pieces. Build Cover is better for Sniper than anyone else because his shots pierce
walls. Smoke Bomb gives range blind control, and Throw Cigar creates a fire tile
that ticks true damage for 3 turns.

His RAGE Passive adds +1 STR, +1 range, +2 MOVE, move-and-ART, and a straight-ray
basic attack that damages every enemy in the chosen line. He is B because his MP
pool is small and the team utility is narrow, but against slow screens and
fortified boards he is the exact specialist you want.

### Blacksword - dark-tile duelist

Blacksword has one of the most coherent self-fueled kits. Dark Tread gives blind
immunity, dark-tile lifesteal, +1/+2 damage into enemies on dark tiles, and +1
damage taken while standing on light tiles. Dark Rush spends HP to charge through
tiles for true damage, hitting harder on dark tiles. Dark Ether spends HP to make
the next basic a guaranteed crit attempt, and Darkspread blinds on any landed
crit.

Void Gravity spends HP to randomly shift nearby enemies, and Dark Tick spends HP
to deal 3 true damage to every blinded enemy. Banisher adds +2 STR and +1 MOVE at
rage, while Banish spends all remaining HP to destroy every enemy on dark tiles,
killing Blacksword. The ceiling is scary, but dark-tile dependence and HP fuel
make him less stable as a blind pick.

### Fat Knight - sturdy anti-crit bruiser

Fat Knight is a dependable frontline body with useful brawler tech. Battle Trauma
makes magic deal +1 to him, but cancels bonus critical damage and gives +1 STR
for a turn after taking magic. Stumble lets him path through enemies for 3 true
damage, while Fart pushes nearby enemies and deals 3 true damage instead when the
push is blocked.

Thick Boi resists one incoming status per battle. Brothers in Arms gives +1 STR
and +1 MOVE with Fat Wizard, Fat Cleric, and Fat Bowman. Trample adds +2 DEF and
+1 MOVE at rage, lets him move through enemies, and adds true damage to crossed
enemies; Stumble also gains +3 range and Trample damage. He is solid, but the
frontline slot is crowded by Clod, Gargoyle, Paladin, Monk, and Juggernaut.

### Riot Cop - peeler with charge economy

Riot Cop brings a lot of protection and control. Utility Belt runs Stun Gun and
Smoke Bomb on finite charges that refill after a dry turn, and rage refills them
immediately. The same passive also grants the adjacent +1 DEF aura. Stun Gun is
range-3 true damage plus slow, stunning adjacent targets or any target while
raging. Smoke Bomb blinds enemies around an empty tile. Shield Bash is an
unlimited physical shove with true chip if blocked, and Cover swaps with an ally,
Defends, and can grant next-turn STR when covering a wounded ally.

Heavy Boots gives slow immunity. Riot Shield reduces ranged basic damage, nullifies
magic aimed at Riot Cop while Defending, but takes +1 from critical magic hits.
Lockdown adds +1 STR/MOVE, upgrades Stun Gun, refreshes charges, and the rage ART
slows nearby units to 1 MOVE while dropping DEF by 2, allies included. He is a
premium peeler, but the damage clock is modest and critical magic still leaks.

### Summoner - variable action economy

Summoner has the highest variance in the roster. Soul Shuffle offers five shuffled
non-Summoner, non-commander choices, excludes the last ghost, and redirects ghost
self-restoration to Summoner. Summon then calls one of those ghosts to an empty
tile within 3; it arrives at full health, takes a complete turn, then disappears.

Dematerialize gives Summoner a teleport escape. Disturbed Spirit allows move-and-
ART while raging, and Beckon is the ceiling: a 20-MP rage summon that brings the
chosen ghost in already raging. The action economy is absurd when the roll and
position line up, but the Summoner's own 23-HP body is fragile and the output is
intentionally not deterministic.

### Fat Bowman - planted turret

Fat Bowman is strong when allowed to hold ground. Heavy Handed creates a range
damage curve: weak adjacent, normal at 2, stronger at 3+, scaling with range
buffs. Curve Shot pierces units, Dragonsbane attacks at range then rolls twice for
permanent poison with crits guaranteeing it, and Planted stacks +1 STR per turn
without moving up to +4.

Brothers in Arms gives +1 range with Fat Knight, Fat Wizard, and Fat Cleric.
Desperation Shot is a one-shot rage spike: +4 STR and +1 range on the next basic,
Curve Shot, or Dragonsbane, followed by a skipped turn. She can dominate lanes,
but forced movement, cover-piercing counters, and the skipped-turn rage tax keep
her in B.

---

# C Tier

These units have real tools, but their blind-draft value is narrower or their
floor is unusually punishing.

### Swordsman - fair baseline

Swordsman is the honest benchmark. Last Stand gives +3 STR below 3 HP, Footwork
walks current MOVE + 3 through enemies for 3 true damage, Moonstrike can blind,
Mage Killer can silence, and Life Sap can heal for half damage dealt. Quick adds
+3 MOVE and +1 STR at rage.

None of that is bad. The problem is comparative value: newer melee pieces bring
team auras, full immunities, bodyguarding, magic/true damage pressure, or stronger
rage conversions. Swordsman is playable and flexible, but he rarely forces the
opponent's draft.

### Miner - self-throttled ranger

Miner has a full alternate economy. Ore Harvester / Pickaxe starts him at 0 ore:
range drops to 1 with no ore, ranged basics spend 1 ore, adjacent basics deal +2,
max ore gives +1 STR/+1 DEF, wall kills can grant ore, and crit chance scales with
ore. Ore Harvest gathers 2-5 ore and grants next-turn MOVE, so one harvest turns
him into a real range-5 threat.

Headlamp is no-roll adjacent blind, Shaft Prop spends ore to build a wall,
Blasting Cap spends ore for true damage, push, blocked true damage, wall removal,
and stun on crit. Diamond Harvester fills ore on rage and improves crit scaling,
while Ore Abundance refills to max. The issue is that ore is ammo, setup, crit
scaling, stats, and utility all at once, so sustained pressure repeatedly pauses
for mining.

### Big Brother - narrow anti-heal tech

Big Brother is a counter-pick more than a blind staple. Super Magnet makes basics
true damage along straight rays, removes critical damage, and makes basic crits
pull the target adjacent and stun. Force Tug adds range-3 true damage with slow or
crit stun. Force Push displaces all adjacent units and deals true damage when
blocked. Magnetic Field prevents healing within 1, except on Big Brother himself.

Polarity Shift globally swaps HP and MP restoration, while Recharge restores 5 MP
or 1 HP/+1 next-turn MOVE and ignores Polarity Shift. Pissing Contest grants +1
STR while any Little Brother is in play. Rogue Mech adds +3 STR/+1 MOVE and free
ARTS at rage. Into healing teams he can be excellent; into teams that do not care
about healing, STR 2 and short-range control are easier to ignore.

### Ronin - awkward isolated duelist

Ronin can win the duel he asks for. Wanderer gives +2 damage when no ally is
within 3, +1 against isolated enemies, +1 against enemies that missed him last
turn, and crit lifesteal. Patient Blade Defends and grants next-turn MOVE.
Flashing Steel is a high-chance blind attack, Broken Oath trades -2 DEF for +1
MOVE/+1 STR, Challenge creates a mutual +2 damage duel next turn, and Shuriken is
range-3 true poke.

Final Draw is terrifying: +12 STR and +1 MOVE while raging, with recoil equal to
attack damage unless it defeats the last enemy. The problem is team structure.
Most 4-unit squads want clustering for auras, heals, Defend chains, and bodyguards,
while Ronin wants isolation and accepts recoil risk.

### King - ceiling/floor split

King has a high human-piloted ceiling but the worst structural floor. Dictator / Spectator
damages the King for 10 when an allied unit falls, heals other allies
for 5 when that happens, and restores 10 HP to King when an ally is revived.
Royal Detachment makes him immune to blind, silence, slow, stun, and poison.

His commands can be enormous: Strike! gives allies STR, Hold! gives DEF and
healing bonus, Pursue! gives MOVE, and Higher Ground! gives range to attacks and
ARTS. Each scales by +1 per allied unit in RAGE, and Strike! gets a bonus if it
follows Pursue!. The tax is that King cannot move, attack, Defend, or sustain
victory alone, and he must act first. Drafting him means playing three fighters
plus a command engine, so his blind-draft floor stays C.

---

# D Tier

### Archer - outpaced legacy ranger

Archer still has real utility. Close Shot gives bonus damage at short distance,
Volley Shot is a range-5 cone for 2 true damage per enemy, Poison Arrow applies
permanent poison on a 60% check, Leg Shot applies a 3-turn -1 MOVE slow, and
Emblem grants poison immunity. Her RAGE Passive adds +1 STR, +1 range,
move-and-ART, perfect accuracy, and 50% crit chance.

The problem is not that Archer does nothing. It is that several other units cover
her jobs with more pressure or better defenses: Sniper pierces units and walls
from longer range, Angel attacks armor with magic and full status immunity, Little
Brother brings true cone damage and permanent fire, Fat Bowman scales harder when
planted, and Virus turns poison/status into an actual win condition. Archer is
playable, but she is the easiest ranged/status slot to upgrade.

---

## Final read

The roster is closer than a simple S-to-D ladder suggests. Most C and D units have
matchups where they matter, and many B units become A-level in the right shell.
The main strategic truth is that defense is not just DEF stacking anymore: the
best squads combine DEF, Defend, healing, status immunity, magic reduction, and
true-damage access. That is why Mystic, Necromancer, Gargoyle, Nemesis, Paladin,
Clod, Treant, and Monk sit so high, and why narrow kits get taxed even when their
best turn is explosive.
