# Tactical Arena — Unit Archetypes

A canonical read of what each unit is *for*: the role it plays, the plan it wants to
execute, and how its kit interacts with the turn structure. This is a design-reading
document, not a rules reference — the code and tests are authoritative for numbers.
This pass is scoped against the live unit definitions in `src/core/units/`, including
passives stored in ART lists, rage-only basic attack damage types, resource economies,
and threshold reactions.

Roster: 30 draftable units plus the summon-only Ghoul. Descriptions assume the classic
turn mode (Tempo Battle re-times the same kits against readiness gauges).

---

## Read this first: the rules that create the archetypes

A unit's archetype in this game is not really decided by its stat block. It's decided by
what it does with an **activation**, and how it pays for it.

**The turn structure.** Every living unit on a side activates once per turn, in whatever
order the player chooses. The turn passes when all of them are spent. There is no
initiative roll and no speed stat — so "action economy" here means *how much a single
activation buys*, and anything that grants an extra action is a genuine advantage rather
than a tempo nicety.

**The activation itself.** One move plus one primary (attack, Defend, or an ART). Move
then attack, or attack then move — both are legal. But **an ART normally consumes the
whole activation**: no move, no attack, nothing else. This is the central tension in the
game and the thing most unit designs are organized around. Every ART is implicitly
competing against "just walk up and hit them," and it has to be worth more than a swing
*plus* the repositioning you gave up.

That makes three exception classes disproportionately powerful, and you can see the
designer leaning on them deliberately:

- **Move-and-ART.** The Monk has it permanently (Shadow Step). The Archer, Mystic,
  Sniper, and Summoner get it only in RAGE. Nemesis buys it for one turn with Realm
  Traversal. These units effectively get a bigger turn than everyone else.
- **Bonus actions.** The Paladin's Lightseeker/Darkseeker and the Angel's Heavenseeker
  are tagged `bonusActionGroup` — they fire *without spending the action*, but they still
  pay MP and each bonus-action group can be used only once in the activation. That is
  free action economy, not free resource economy.
- **Extra bodies.** The Necromancer's Ghoul is a permanent unit that never activates but
  bites every rollover. The Summoner literally converts his activation into somebody
  else's activation.

**MP does not regenerate.** There is no natural mana tick. A 38-MP Mystic has a fixed
budget of casts for the entire match. This is why so many units carry a private economy
instead — Magic Pipe, Recharge, Growth, Rock Hard, Ore, Soul Sap, Study, ability USES —
and why "how does this unit refuel" is often more defining than "how much damage does it
do."

**Damage types decide who can hurt whom.**

- *Physical* is `max(1, STR − DEF)`. Against a DEF 7–8 tank, a STR 10 melee unit deals
  2–3. Defend then halves it. Physical damage falls off a cliff into armor.
- *Magic* ignores DEF entirely (Defend still halves it). This is why casters exist: they
  are the answer to the armor wall, and it's why magic-damage-taken riders (Juggernaut at
  0 MP, Fat Knight) and team magic reduction (Necromancer, Treant) are such loaded stats.
- *True* bypasses DEF **and** Defend. It is the game's universal solvent, and it's
  deliberately handed out in small amounts (1–3) or on rage ultimates.

**Rolls.** Basic attacks: 96% accuracy at range 1, then -1% per range tile; 15% crit.
Attacking ARTs declare their own range-1 base accuracy (usually 96%) and roll the same crit. Crits are ×1.5 before Defend. A surprising number of
kits are built entirely on top of the crit roll (Angel, Blacksword, Little Brother, Big
Brother, Miner, Treant), which makes crit-chance modifiers quietly one of the strongest
stats in the game.

**Line of sight.** A physical ranged shot is blocked by *any* body in between, friend or
foe — so screening your own casters is real, and body-blocking is a legitimate defensive
play. Magic ARTs and pure status casts ignore bodies entirely. Walls block everything
(the Sniper alone shoots through both).

**Tiles.** The board is a fixed light/dark checkerboard (`(x+y) % 2`). Tile-affinity units
therefore always have exactly half the board working for them — their kit is conditional
but never dead, and the condition is *where the enemy chose to stand*.

**RAGE.** At 5 HP or less, a unit flips into its second form. This is not a death spiral
mechanic, it's a reward: rage kits are often the strongest thing the unit does. Which
creates the game's best recurring decision — *do you heal your raging ally, and turn off
his best mode?* (And why a raging Juggernaut, who shuts off all healing on the board,
is such a nasty piece of design.)

**Victory** goes to the last team with a living, turn-taking, non-summon, non-command-only
unit. A lone Ghoul or a lone King is a loss. Temporary Summoner ghosts take a turn, but do
not sustain victory.

### Archetype vocabulary used below

| Term | Means |
| --- | --- |
| Bruiser | Melee, high STR/HP, wins by walking into people |
| Duelist | Melee that scales with isolation or a single-target commitment |
| Skirmisher | Mobile melee that trades position for tempo |
| Anchor tank | Low mobility, holds a tile, punishes attackers |
| Control tank | Tanky, but wins by moving/locking enemies rather than damage |
| Artillery | Ranged, single-target burst |
| Zoner | Wins by making tiles unattractive or unusable |
| Attrition caster | Wins slowly through unavoidable recurring damage |
| Enabler | Its value is what it does to *your other units'* numbers |
| Economy unit | Its kit is primarily about generating a resource |

---

## Frontline melee

### Swordsman — Baseline Bruiser (utility-melee)

`HP 25 · MP 20 · STR 10 · DEF 5 · MOVE 3 · RNG 1`

The reference unit — everything else is legible as a deviation from him. STR 10 with 3
MOVE means he closes and hits, and Footwork (MOVE+3, walking *through* enemies for 3 true
damage each) gives him a genuine engage tool that turns a 3-tile walk into a 6-tile one.

His real identity is that his three attack ARTs are **riders on a normal swing**:
Moonstrike blinds (70%), Mage Killer silences (70%), Life Sap has a 70% rider to heal him
for half the damage dealt. Each is an attack that does one extra thing — but because an ART eats the whole
activation, using one means giving up his move. So the Swordsman is constantly asking a
clean question: *is this blind worth not repositioning?* Standing still next to the enemy
mage and silencing him for 5 MP is usually yes; doing it from open ground usually isn't.

Last Stand (+3 STR below 3 HP) and Quick (+3 MOVE, +1 STR in rage) make him nastiest when
nearly dead. A Swordsman at 4 HP with 6 MOVE and 11 STR is a real threat, not a corpse.

### Paladin — Lifelink Frontliner (sustain bruiser)

`HP 26 · MP 24 · STR 10 · DEF 5 · MOVE 3 · RNG 1`

A Swordsman body whose damage is also his team's healing. Hand of Life converts every
point of physical damage he deals into healing (half, floored) for **other allies within 2
tiles**, and gives the Paladin **+1 DEF while he stands on a white tile**. That
single passive rewrites how you position an entire squad: the Paladin is not a lone
frontliner, he's a mobile healing station whose fuel is aggression. You want your wounded
units *hugging him* while he swings, preferably while he is braced on his color.

Chosen makes him immune to poison, slow, blind, silence, and stun — he simply cannot be
controlled, which makes him the natural answer to a status-lock composition.

Mechanically his most important line is Lightseeker: a 4-MP **bonus-action** tile pulse that
deals 1 true damage to every enemy within 5 standing on a light tile *without spending his
action*. While the MP lasts, he can move, attack, heal his team, and also chip half the
enemy board in one activation.

Heaven's Realm (rage) gives him **+2 STR and +1 range**, plus **+2 physical strike damage**
when both Paladin and target stand on light tiles. That turns his rage into a real dueling
mode, not just a Darkseeker unlock. Darkseeker itself
adds the other half: 4 MP for 2 true damage, board-wide, on dark tiles (the two seeker
pulses share a bonus-action group, so it's one pulse per activation, not both). Recurring
off-action damage on a unit that already wants to be swinging is the strongest kind of
value in this engine, and the Paladin is the cleanest example of it.

### Monk — Skirmisher / Bodyguard (the action-economy unit)

`HP 26 · MP 25 · STR 9 · DEF 6 · MOVE 2 · RNG 1`

Shadow Step is the most quietly overpowered passive in the game and it should be read
carefully: he moves on a **radius** rather than a path — diagonals allowed, and intervening
bodies and walls don't block him, because only the destination tile is checked — *and* he
may **move and use an ART in the same activation, always**. Every other unit that gets that
has to be at 5 HP first. The Monk has it from turn one.

That turns both his ARTs from expensive commitments into ordinary plays. Front Kick is a
10-power STR-scaling strike that knocks the target back 3 tiles on a crit, with a built-in
stun payoff: if the board edge stops that shove, the target is stunned; if one of the
target's allies stops it, that ally is stunned instead. He can walk into those angles first,
so Front Kick functions as both displacement and impact-stun control. Protect is the bodyguard
button: he steps to the near side of an ally within 3 and *both* of them Defend, even if
that ally already acted. That's a
genuinely rare thing in this game — a reaction, purchased on your own turn.

Heightened Sense (blind immunity, +1 STR per 5 missing HP) and Nirvana (rage: +2 MOVE, +1
ART range, Front Kick *always* knocks back, Protect heals 2) make him scale into the late
game. Because Nirvana removes the crit requirement from the shove, those edge/body-block
stuns become something he can deliberately threaten every kick. He's the unit you draft
when you want to protect a squishy caster and still get value every turn.

### Fat Knight — Anti-Crit Frontline Bruiser

`HP 30 · MP 20 · STR 10 · DEF 6 · MOVE 2 · RNG 1`

The wall of the fat squad. Battle Trauma is a deliberate trade: he takes +1 magic damage,
but **critical hits deal him no bonus damage at all** — every crit against him is just a
normal hit. Against the many crit-fishing kits in this roster, he's a brick. And when he
*is* hit with magic he gains +1 STR for a turn, so the mage that softens him also arms him.
Brothers in Arms adds +1 STR and +1 MOVE when Fat Wizard, Fat Cleric, and Fat Bowman all
live on his team.

Stumble (MOVE+2, walk through enemies for 3 true) is his engage; in RAGE its path grows by
another 3 and the Trample contact damage is added too. Fart pushes every adjacent
enemy away and deals 3 true to anyone with nowhere to go — a genuine "get off me" button
that also punishes people who bracket him against a wall. Thick Boi eats one status effect
per battle for free.

Trample (rage) is the payoff: +2 DEF, +1 MOVE, and he may **walk through enemies during a
normal move**, dealing 3 true to each one crossed. Because the reducer locks in trample
paths once they deal damage, this is not a cancellable scouting move. A raging Fat Knight
walking a line through a clustered squad is one of the better damage plays in the game —
and it costs no MP and no ART.

### Blacksword — Dark-Tile Assassin (HP-as-resource duelist)

`HP 30 · MP 0 · STR 10 · DEF 6 · MOVE 3 · RNG 1`

He has **no MP at all**. Every ART is paid for in his own HP. That inverts the usual
resource question: he isn't rationing mana, he's spending his life bar toward the RAGE
threshold he actually wants to reach.

Dark Tread is a full positional identity: +1 damage against enemies on dark tiles (+2 if
he's also on one), he **heals 1 HP** for each enemy he damages on a dark tile, and he takes
+1 damage while he himself stands on a white tile. So half the board is his and half the
board hurts him, and he's constantly making footing decisions that matter.

His kit self-chains beautifully: Dark Rush spends 2 HP for a straight-line charge that
hits enemies crossed for 3 true on light tiles or 4 on dark; Void Gravity spends 2 HP to
randomly shove nearby enemies; Darkspread blinds anything he crits; Dark Ether (2 HP)
guarantees his next landed basic attack crits, though it can still miss; Dark Tick (1 HP)
then deals 3 true damage to *every blinded enemy on the board*. Ether → crit → blind →
Tick is a real combo, and with Virus on the team the blind spreads first.

Banisher (rage) gives him +2 STR and +1 MOVE before the all-in button ever gets pressed.
Banish is one of the most dramatic ultimates in the game: at rage, spend **all remaining
HP** to instantly kill every enemy standing on a dark tile. He dies doing it. Half the board
is dark. Play around that.

### Ronin — Lone-Wolf Duelist (isolation scaler)

`HP 28 · MP 20 · STR 10 · DEF 5 · MOVE 3 · RNG 1`

The anti-team unit. Wanderer pays him for fighting alone: +2 damage while no ally stands
within 3 tiles of *him*, +1 more against a target with no ally within 3 of *it*, and +1
against any enemy that missed a roll on him last turn. A critical basic strike heals him
for half the damage dealt. Every one of those wants the same thing — Ronin, off on his own,
cutting an isolated enemy out of the herd.

That makes him structurally strange in a 4-unit squad, and that's the point: he's a flanker
who is *rewarded* for the position that would get any other melee unit killed. Patient
Blade (Defend + 1 MOVE next turn) and Broken Oath (−2 DEF for +1 STR/+1 MOVE) let him
manage the risk. Flashing Steel is the direct duelist button: an adjacent attack with a
90% blind rider. Challenge is a mutual grudge — he and the target each deal +2 to the
other — which is a duel invitation with real teeth. Shuriken is a 3-tile true-damage
finisher for chip.

Final Draw (rage) is a glass cannon in the truest sense: **+12 STR**, but every attack
recoils its full damage back onto him unless it ends the fight. A raging Ronin is a
one-swing threat to almost anything on the board, and that swing may well kill him too.

---

## Ranged

### Archer — Close-Range Attrition Ranger

`HP 24 · MP 22 · STR 8 · DEF 4 · MOVE 2 · RNG 5`

Deliberately paradoxical. She has range 5, but Close Shot pays her +2 damage at adjacency
and +1 within two tiles — so the "correct" way to play a 5-range archer is to walk into the
enemy's face. Her low MOVE (2) means she commits to that decision slowly, and DEF 4 / HP 24
means being wrong is fatal.

Her ARTs are all *permanent problems* rather than burst: Poison Arrow applies **permanent**
poison (1 damage at the start of each poisoned activation, curable only by a cleanse), Leg Shot applies a 3-turn
slow, Volley Shot rains 2 true damage over a range-5 cone (and Close Shot still applies per
target, based on where she stands when the cone fires). She's an attrition unit, not an
assassin — she wants the fight to go long and be
full of unremovable problems. Emblem makes her immune to poison in return.

Her rage is one of the biggest power spikes in the game: **never miss, 50% crit chance**,
+1 STR, +1 range, and move-and-ART. A raging Archer at 5 HP is a guaranteed crit machine,
which is exactly the kind of thing you have to decide whether to heal.

### Sniper — Siege Marksman / Terrain Engineer

`HP 23 · MP 18 · STR 8 · DEF 3 · MOVE 2 · RNG 6`

The longest range in the roster and the only unit that ignores the board's central
line-of-sight rule. Rifle Powered means his shots **pierce bodies *and* walls** — screening
does not work against him, and his damage never falls below 2 no matter how much DEF the
target stacks. He is, precisely, the anti-turtle unit.

The rest of his kit is board construction, and it's the reason he plays like siege rather
than like a carry. Build Cover raises a 1-HP wall that blocks movement and line of sight
**for everyone except him** — so he can build his own firing lane, cut a melee unit's
approach in half, or wall off an ally. Throw Cigar sets a tile on fire for 3 rollovers,
dealing 1 true damage to whoever stands there. Smoke Bomb is a pure status cast: 3 MP,
single target, 70% blind, blocked by walls but not by bodies. He shapes where the fight can
happen, and then shoots into it from six tiles away with an 18-MP budget that runs out.

Rage gives him +1 STR, +1 range, +2 MOVE, move-and-ART, and a line attack — his basic shot
damages every enemy on the chosen ray. It turns the anti-turtle specialist into a temporary
lane sweeper.

### Fat Bowman — Stationary Turret

`HP 30 · MP 25 · STR 7 · DEF 5 · MOVE 2 · RNG 4`

The unit that is punished for moving, on purpose. Heavy Handed inverts the Archer: her
shots deal **more damage the further away the target is** (−1 adjacent, baseline at 2, +1
at 3, +2 at 4, continuing to scale with range buffs). Planted then stacks +1 STR for every
turn she *starts without having moved*, up to +4 — and confirming a move wipes the counter
back to zero. Brothers in Arms adds +1 range when Fat Knight, Fat Wizard, and Fat Cleric
are all on her team.

So her ideal game is: find a tile on turn one, never leave it, and become a 11-STR
long-range gun that hits harder the further out you stand. She has 30 HP and DEF 5 to
survive being found. Curve Shot pierces bodies (so a screen doesn't save the caster behind
it) and Dragonsbane rolls poison twice, guaranteed on a crit.

Desperation Shot (rage) is a beautiful one-shot: her next attack gains +4 STR and +1 range —
and then she **skips her next turn entirely**. One enormous shot for a full activation.

### Little Brother — Splash Artillery

`HP 25 · MP 10 · STR 8 · DEF 6 · MOVE 2 · RNG 4`

A short-budget, high-impact gun. Only 10 MP total, so realistically two ARTs a match unless
magic damage recharges him — but both are big. Cannon Fire is a fixed 10-power physical
shot at range 5 that stuns on a crit and triggers his splash; Flamethrower is a
3-true-damage cone that leaves permanent fire under every enemy it hits.

Splash Fire is the passive that defines him: a **critical basic attack** deals 2 true damage
to everything within 1 tile of the target. He's a crit-fishing area unit — the ideal target
is an enemy standing in a clump, and every basic attack is a 15% lottery ticket for a
mini-AoE. Rechargeable Battery (+5 MP whenever he takes magic damage) means enemy casters
actively refill him. If Big Brother is alive on either team, Pissing Contest also gives
Little Brother +1 range, so the sibling gimmick matters even across enemy rosters.

Flamespitter (rage) is his blowout: +2 STR, +5% crit, and **Flamethrower fires for free
after every orthogonal basic attack**. That's an attack *and* a cone, in one activation,
with no MP — the action-economy break that makes his rage worth reaching.

### Miner — Resource-Economy Ranger

`HP 25 · Ore 25 (starts at 0!) · STR 8 · DEF 4 · MOVE 2 · RNG 5`

The most unusual economy in the game and worth understanding carefully, because he begins
the match **unable to do his job**. His resource is Ore, not MP, and he starts with none.
Ore Harvester / Pickaxe is the whole economy: at 0 ore his attack range collapses from 5
to **1** — a ranged unit with no ammunition is a melee unit. Every ranged basic attack
costs 1 ore.

So his first turn is spent mining — uncontested, since both squads spawn a corner apart and
no enemy is anywhere near range. Ore Harvest (free) gathers 2–5 ore and grants +1 MOVE next
turn; destroying a wall next to him grants 2 more. One harvest already lifts him off 0 and
restores his full range 5, so the "unable to do his job" window is a single, safe turn. Once
stocked, he converts: +1% crit per 5 ore held, and at **max ore** he gains +1 STR and +1 DEF
outright. His ore
total is simultaneously his ammo, his crit chance, and his stat line — a genuinely elegant
piece of design where hoarding and spending are in direct tension.

Adjacent basics deal +2 (his pickaxe), Headlamp blinds an adjacent enemy with no roll, Shaft
Prop spends 3 ore to build a wall, and Blasting Cap spends 2 ore for a 3-true-damage blast
that pushes and can stun; it can also target and destroy a wall without a hit roll or ore
cost. In rage, Diamond Harvester gives +1 MOVE and +1 STR, instantly fills him to max ore,
and doubles the crit conversion. Ore Abundance can refill him to max again while raging.
He is a slow-scaling, snowballing engine — but the slow part is nearly free (he mines in his
corner while the enemy is still crossing the board); the real, ongoing tension is that every
shot spends the ore that is simultaneously his ammo, his crit chance, and his stat line.

---

## Casters

### Magician — Artillery Mage (armor solvent)

`HP 23 · MP 40 · STR 6 · DEF 3 · MOVE 2 · RNG 5`

The purest expression of "magic ignores DEF." His STR is only 6, but Spark deals that as
magic damage from 5 tiles — against a DEF 8 Clod, a STR 10 Swordsman does 1–2 while the
Magician does 6. He is the answer to armor, and he's the reason armor isn't oppressive.

Magic Pipe is his economy: every 3 activations he completes *without* casting Spark or
Banish, he restores 10 MP. That's an explicit rhythm — cast, cast, then patiently basic
attack for three turns to refill. It also means an idle Magician is not a wasted Magician,
which is unusual and good.

Banish adds a 75% silence to the magic damage (shutting off an enemy caster's ARTs
entirely). Flee is a 5-MP escape to any empty tile within MOVE+2 — his only defense with 23
HP and DEF 3.

His basic attack matters in two different forms. While healthy, it is still an ordinary
physical ranged attack, so DEF can reduce that STR 6 shot to almost nothing. In RAGE, his
basic attacks become **magic damage**, so even the refill turns become armor-piercing
pressure instead of weak chip.

Nuke (rage) is the payoff: 12 magic damage to **every enemy within 3 tiles**, centered on
him. A dying Magician who has been allowed to walk into the middle of a clustered squad is
a board wipe.

### Nemesis — Magic-Team Enabler / Threshold Caster

`HP 25 · MP 45 · STR 7 · DEF 2 · MOVE 3 · RNG 5`

His passive is worth more than his ARTs, and that's what makes him an enabler rather than a
carry. Realm of Magic gives **every ally** +1 magic damage and **−1 MP on every ART**
(minimum 1) for as long as he lives. In a squad of casters that is a compounding discount
across dozens of casts — he is the keystone of any magic-heavy composition, and the first
unit the opponent should be killing (DEF 2 makes that plausible). Nullify makes him immune
to silence, so the enemy has to kill or displace the aura rather than simply muting it.

Dark Pulse scatters magic along all 8 straight rays, hitting the first thing each ray
touches: 5 magic damage to enemies, **1 HP of healing to allies**, and the MP is refunded
outright if it connects with 4 targets. It's an AoE that rewards being surrounded — which
is normally the worst place a caster can be, and that inversion is the fun of him.

The signature is the threshold reaction: whenever Nemesis drops below **20, 15, 10, and 5
HP**, Dark Pulse auto-casts for free. Damaging him is dangerous. He punishes chip damage,
punishes being focused, and Regenerate (rage: +5 HP, +15 MP) means the last threshold also
refuels him.

Realm Traversal is the action-economy tool: spend a turn to charge, and next turn he may
move *and* cast Dark Pulse.

### Necromancer — Zone-Control Debuff Summoner

`HP 23 · MP 36 · STR 6 · DEF 3 · MOVE 3 · RNG 5`

He doesn't kill you, he makes the tiles around him bad. Deathly Aura is a permanent −1 DEF
to every enemy within 3 tiles — which quietly buffs *his entire team's* physical damage
against anyone standing in it. Dead Zone gives his whole team −1 magic damage taken.

Summon Ghoul is the structural piece: up to two Ghouls, each a real 10-HP body that blocks
movement, soaks attacks, **carries the same −1 DEF aura**, and bites a random adjacent enemy
for 1 true damage every rollover — all without ever taking a turn. Summoning is how he
extends his debuff zone across the board and buys his squishy body a wall.

Grave Wrath (rage) is his best mode by a distance: the aura widens to radius 4 and deepens
to **−2 DEF, −1 STR, −1 MOVE**, and the widened radius applies to his Ghouls too. A raging
Necromancer with two Ghouls placed well can cover most of a 13×13 board in a debuff field.

Dark Bomb detonates 5 magic damage across exactly that aura, and Wither adds a 3-turn slow.

### Virus — Contagion Controller (the status win-condition)

`HP 25 · MP 36 · STR 6 · DEF 3 · MOVE 3 · RNG 5`

The most systemically dangerous unit in the roster, because he doesn't have a status
ability — he has a status *multiplier*. Spread means that whenever an enemy receives **any**
debuff, from **any** source, that enemy's allies within 2 tiles catch it too. Every blind
your Swordsman lands, every slow your Archer lands, every stun, every poison — Virus
doubles or triples it for free, from across the board, at no action cost.

His own kit then feeds the engine. Cough poisons (60%). A critical basic attack poisons.
Smog blinds every enemy within 2 tiles with **no roll at all**. Gaseous Entity makes Virus
immune to poison and blind, so mirror-status plans have to go through silence, slow, or raw
damage. Growth refunds him 2 MP every single time he poisons someone, so a Virus poisoning three units via Spread is
*making* MP. Poison Tick is then the harvest: 2 true damage to every poisoned enemy
anywhere on the board, for 2 MP.

Infectious Affinity (rage) removes the randomness entirely: spread radius 3, **every basic
attack poisons on hit**, and every poison he rolls for is guaranteed. Explosion is the
finisher — consume himself to deal 10 true to every poisoned enemy plus 5 splash around
each. A Virus who has been allowed to poison a whole squad ends the game by dying.

### Fat Wizard — Battle-Mage (durable hybrid caster/healer)

`HP 30 · MP 35 · STR 7 · DEF 4 · MOVE 2 · RNG 3`

A caster with a tank's HP bar. 30 HP and DEF 4 at range 3 means he can stand in the second
rank rather than hiding in a corner, which is what lets him use a kit that wants to be near
the fight.
Brothers in Arms adds +1 magic damage and +1 STR when the whole fat squad is present.

Clumsy turns his misses into value: a missed Zap! still splashes 2 magic damage around the
target, and a crit splashes 3 — so he's never fully whiffed. Study is his setup and it's
free: mark one enemy, gain +1 damage against it, and each magic-damage event he lands on it
restores 2 HP and 2 MP to him. He cannot re-target it until that enemy dies, which turns
Study into a commitment — pick the target you actually intend to kill.

He also heals: Surge restores 4 HP to an ally (5 on a crit, and Clumsy splashes the healing
on a miss). Relay Power is a 0-MP-cost transfer, not a free one — lose 2 HP and 2 MP to give
an ally 2 HP and 2 MP.

Lazy Cast (rage) is a monster: his basic attacks become **magic damage**, Zap and Surge
become **free**, Zap gains +3 damage, splashes on every hit, and **stuns instead of
silencing** on a crit. Surge also splashes healing on normal rage hits, not only on the
miss/crit Clumsy cases. A raging Fat Wizard with no MP cost casting a splashing, stunning
8-damage nuke every turn is a win condition.

### Summoner — Tempo Engine (action-economy caster)

`HP 23 · MP 100 · STR 6 · DEF 4 · MOVE 2 · RNG 5`

Read this one purely through the action-economy lens and it snaps into focus. Summon costs
5 MP and his activation — and in exchange, a **chosen ghost from a five-unit Soul Shuffle
appears at full health and immediately takes one complete turn** (move + attack or ART),
then dissipates.

He is not summoning a pet. He is trading his own mediocre activation for somebody else's
good one. A Summoner who calls up a Gargoyle gets a Pyroclasm; one who calls a Magician gets
a Spark. Soul Shuffle offers five shuffled choices, excluding summons, commanders, the
Summoner type itself, and the last ghost used, so King/Mother Nature/Ghoul cannot appear
and there is real decision-making rather than pure randomness. With a 100-MP pool he can do
this roughly every turn of the match.

The ghost's self-healing is redirected to the Summoner, which is a lovely detail — call up a
healer and *he* gets the HP. Dematerialize is his escape.

Beckon (rage, 20 MP) calls a ghost that **arrives already raging**, with its RAGE passive
and RAGE ART live. That means summoning a unit directly into its ultimate — a Beckoned
Magician arrives able to Nuke. Disturbed Spirit (rage) also lets him move and cast in the
same turn.

---

## Support

### Mystic — Dedicated Healer / Team Armor

`HP 23 · MP 38 · STR 5 · DEF 3 · MOVE 2 · RNG 5`

The purest support in the game and the most straightforward. Guardian gives the **entire
team +1 DEF** permanently — which, in a game where physical damage is `STR − DEF`, is a
flat damage reduction across every attack the enemy makes for the whole match. That passive
alone justifies drafting her.

The rest is a clean healing kit with an unusually good MP curve: Pray heals 3 to herself and
allies within 3 tiles for 4 MP; **Wish heals every living ally for 1 HP, board-wide, for
only 2 MP**. With 38 MP she can Wish nearly twenty times. Purify strips *all* statuses from
another ally — the hard answer to a poison lock or a stun chain, but not a self-cleanse.
Silence shuts down an enemy caster, and Anointed makes her immune to silence herself.

Her rage is dramatic and defensive: +15 MP restored on entry, +6 MOVE, magic basic attacks,
move-and-ART, and she is **permanently treated as Defending** — halving all incoming
physical and magic damage. A raging Mystic is remarkably hard to finish off, which is the
point: the healer who won't die.

### Fat Cleric — Durable Main Healer

`HP 30 · MP 35 · STR 7 · DEF 5 · MOVE 2 · RNG 4`

Where the Mystic is a glass healer with a team aura, the Fat Cleric is a healer you have to
work to kill: 30 HP, DEF 5, and a passive that rewards turtling. Snack Break restores 1 HP
and 1 MP whenever she Defends **without having moved** — so a turn spent doing nothing is a
turn spent refueling, and she can meaningfully sustain herself across a long match.
Brothers in Arms adds +1 MOVE and +1 DEF when the rest of the fat squad is alive with her.

Hope heals a random 1–4 to her and every ally within 3 tiles for 3 MP. Cleanse strips negative
statuses (leaving buffs intact — a nice distinction from the Mystic's total Purify). Focus
Prayer is the interesting one: 5 HP to an ally, but it **rolls**, and on a miss the prayer
backfires and inflicts a random negative status on that same ally. A heal that can blind
your own Swordsman is a real gamble, and the weighted table makes stun the rare disaster.

Second Helping (rage) is a **revive** — bring a fallen ally back at 50% HP, with statuses
cleared but without restoring MP. And Emergency Snacks means rage isn't a death sentence for her:
her basic attacks become magic, she gains
+1 HP at the start of each raging turn, and if that nibble lifts her back over the threshold
she gulps 5 MP too (up to 3 times a battle). She's the healer designed to survive her own
rage.

### Angel — White-Tile Support Ranger

`HP 24 · MP 37 · STR 3 · DEF 3 · MOVE 2 · RNG 5`

That STR 3 is not a typo and it's the key to reading him: he is **not a damage unit**, and
his basic attack is 3 magic damage that ignores DEF. What makes those shots matter is the
rider stack — Blessed Arrow blinds on a crit, Inner Strength gives him +1.5% crit for every
3 HP he's missing, and standing on a white tile makes him more accurate (and if *both* he
and the target are on white, he **literally cannot miss** and gains bonus crit).

So he's a board-state unit. He wants to be on white tiles, shooting enemies on white tiles,
fishing for crit-blinds, and he gets *better as he gets hurt*. Holy Being makes him immune to
every status effect in the game.

His support is where the value is: Anoint grants an ally **+1 attack range for a turn** —
handed to an Archer or a Sniper, that's a free extra tile of threat. Elevate heals 1 HP to
every ally standing on a white tile, anywhere.

Heaven's Wrath (rage) gives him +3 STR and +2 MOVE, so his "support" shots suddenly become
meaningful magic damage. Heavenseeker is the payoff ART and it's a 5-MP **bonus action** —
it does not spend his turn. While the MP lasts, board-wide: allies on white tiles heal 2,
enemies on white tiles take 2 true damage. Recurring half-the-board damage *and* healing,
while he still moves and shoots, is why the resource gate matters.

### Witch Doctor — Stance-Dancer (global field caster)

`HP 24 · MP 30 · STR 8 · DEF 3 · MOVE 2 · RNG 4`

His passive is *whichever dance he did last* — Dancing Man means he has no fixed identity,
he has a mode switch, and every dance both fires a one-shot effect and changes what he
permanently is. That makes him a support who re-tunes the entire battlefield's rules rather
than one who heals numbers.

- **Rain Dance** — heal every ally 1, then all HP healing *anywhere* (yours and theirs) is +1, and
  his attacks charge +2 MOVE for his next turn.
- **Fire Dance** — +1 STR to every ally for a turn, then he gains +1 STR and his crits deal +1.
- **Spirit Dance** — free (0 MP); restores 1 MP to every ally, then every basic attack he makes
  restores **3 MP to allies within 2 tiles**. This is the only meaningful MP battery in the
  game, and in a caster squad it's enormous.
- **Misfortune Dance** — cleanse everything from everyone, then **all status rolls on the board
  land at double chance** — for both teams. A battlefield-wide curse, not a team buff. Pair
  it with Archer/Virus/Swordsman and their 60–70% checks become near-certainties.
- **Black Death Dance** (rage) — blind every unit, buff himself, then become immune to magic while
  **every unit on the board takes 1 true damage per rollover, including him**. A doomsday
  clock you set when you're already dying.

Coal Walker makes him immune to fire damage throughout. The skill in him is knowing which
global rule you want live, and accepting that the enemy plays under it too.

### Father Time — Attrition Aura Controller

`HP 25 · MP 30 · STR 7 · DEF 3 · MOVE 2 · RNG 5`

A support who wins by simply *existing near you*. Time Steal deals 1 true damage every turn
to every enemy within 2 tiles — unavoidable, undefendable, DEF-ignoring — and refunds him 1
MP for every point dealt. Standing next to Father Time is a slow death that pays for his
spells. He is an attrition zone with legs, and against a melee squad that has to close on
him, he's free damage forever.

Age is a permanent commitment: +1 STR or DEF to an ally within 4, or **−1 to an enemy**
within 4, lasting until Father Time himself is defeated. Stack a few of those and you've
quietly rewritten the stat lines of the whole fight — which makes him a high-priority kill,
and makes killing him *undo* his work, which is a satisfying loop.

Time Stretch hastes an ally or slows an enemy. Father of Time makes him immune to stun and
slow.

Rewind (rage, 20 MP) is a **full revive** — a fallen ally returns at full HP with statuses
cleared, but their MP is not restored. It's expensive and rage-locked, but bringing a dead
unit back is the single biggest swing available to any unit in the game.

### King — Non-Combatant Commander (global buff engine, and a liability)

`HP 30 · MP 0 · STR 0 · DEF 0 · MOVE 0 · RNG 0`

Unique, and structurally unlike anything else. The King **cannot move, cannot attack, and
cannot Defend**. Royal Detachment makes him immune to every negative status anyway. He does
exactly one thing: every turn, before any other unit of yours may act, he issues one of four
global commands (all free):

- **Strike!** — allies +2 STR this turn (+3 if the previous command was Pursue!)
- **Hold!** — allies +1 DEF and +1 to all healing they receive
- **Pursue!** — allies +1 MOVE
- **Higher Ground!** — allies +1 range, on attacks *and* ARTs, area ARTs included

Every one of those scales by **+1 per allied unit in RAGE**. That's the design: as
your squad gets shredded down toward 5 HP, the King's commands get proportionally stronger.
A King commanding three raging units is handing out +5 STR to the whole team. He's a
comeback engine. The command buffs do not affect the King himself, so Pursue never makes the
immobile commander mobile.

The cost is real and it's brutal. Dictator / Spectator takes **10 damage off the King every
time an ally falls** (though the rest of the squad rallies for 5) — with 30 HP, losing three
units kills him outright. And he does not sustain victory: a team of nothing but a King has
already lost. He's a fifth unit's worth of buff attached to a body you must protect while
your other units die, which is a genuinely uncomfortable and interesting bargain.

### Mother Nature — Weather Commander (global board-state support)

`HP 25 · MP 100 · STR 7 · DEF 3 · MOVE 3 · RNG 6`

Like the King, she **must act first** every turn. Unlike the King, she fights. Mood Swing /
Weather Commander is the engine rule: her last weather persists globally until she changes
it, each weather activation charges +1 MOVE for her next turn, and a basic-attack crit restores 10
MP. Crucially, **weather affects both teams**. She isn't a buff-bot, she's a rules-editor,
and you draft her by building a squad that abuses the weather she'll be running.

- **Blizzard** — slow everyone who is not immune for a turn; persistently, movement ARTs gain +1 range
- **Spring Shower** — heal everyone who can be healed for 2; persistently, **all HP and MP restoration is +1**
  (an enormous multiplier on any healer)
- **Heatwave** — +1 STR to everyone a turn; persistently, crits deal +1 and **ignite
  permanent fire under the victim**
- **Thunderstorm** — +1 magic damage to everyone a turn; persistently, **every ART costs 1
  less MP** (stack with Nemesis for near-free casting)

Her 100-MP pool means she can swap the world's rules almost every turn. Landscaper pushes an
enemy back a tile and raises a wall where they stood (or 10 physical damage if the push is
blocked) — a clean, roll-free control tool. A basic-attack crit refunds her 10 MP.

Great Flood (rage, 50 MP) is chaos: 7 magic damage to **every unit on the board**, then all
survivors **except Mother Nature** are shuffled among each other's positions. She restores 5
HP and doesn't move.
It's a reset button for a losing board.

---

## Tanks

### Juggernaut — Heavy Mech Bruiser / Anti-Heal Denier

`HP 30 · MP 5 · STR 8 · DEF 7 · MOVE 2 · RNG 1`

Only 5 MP, which is the whole design: his mana bar is a **toggle**, not a budget. Bruiser
Mode means that while he sits at **0 MP** he's stronger — +2 STR and +1 MOVE — but takes +1
magic damage. So "empty" is his combat form, and Recharge (free, +5 MP) deliberately turns
that form *off* in exchange for one ART's worth of fuel. Venting the reactor makes him
weaker but able to cast; running dry makes him a monster who can't.

Tether Grab hauls the first unit on a straight ray to his side (an ally to safety, or an
enemy out of their back line and into his fists, for 3 magic damage). Rocket Punch is a
10-power line strike with a 30% stun. Both are, functionally, *tools for making melee happen
on his terms* — a 2-MOVE melee unit needs help closing, and he brings the enemy to him.

Null Zone (rage) is one of the nastiest passives in the game: +2 STR, +2 MOVE, his **ARTS
cost no MP**, and **all healing on the board is disabled** — for everyone, everywhere. He
stays in rage because healing cannot pull him above the threshold, and nobody else can be
saved either. He turns the
endgame into a race with the healers switched off.

Self Destruct (rage) is the exit: 10 true damage to every enemy within 4 tiles, killing him.

### Gargoyle — Immovable Stone Tank / AoE Turret

`HP 30 · MP 20 · STR 9 · DEF 7 · MOVE 2 (hard cap 3) · RNG 1`

The unit that refuses to be manipulated. Stone Body makes him **immune to displacement** —
no pull, no knockback, ever — and the ART that tries takes 2 true damage for its trouble.
Any status **targeted** at him is **reflected back onto the caster**. Stone Ward makes him
immune to every status anyway, and Heavy caps his MOVE at 3 no matter what buffs him. While
Defending, a melee attacker takes 1 true damage just for hitting him.

He is, in short, unmovable, uncontrollable, and unpleasant to touch. The counterplay is to
simply walk around him — which is exactly why he has Flight: move (MOVE+1, diagonals
allowed) and deal 2 true damage to every enemy within 1 tile of the landing. It's his answer
to being ignored.

Pyroclasm is the real gun: 4 magic damage to **every enemy standing on any of the 8 straight
rays** within range — and unlike other line abilities the rays burn *through* bodies, so
screening doesn't work.

Volcanic Rage is the best rage in the roster to reach: +2 DEF, **permanently Defending while
still taking full turns**, Pyroclasm gains +2 range, a **free Pyroclasm the moment he
enters rage**, and another free one every 3rd turn thereafter before he acts. One With The
Flames makes him immune to fire, turns his crits into permanent fire tiles, and restores 1
HP and 1 MP each Heatwave turn cycle.

### Clod — Anchor Tank / Phalanx Pivot

`HP 30 · MP 20 · STR 9 · DEF 8 · MOVE 2 · RNG 1`

The highest DEF in the game and a passive that asks your whole squad to stand next to him.
Brick House gives allies within 1 tile +1 DEF, and gives **Clod +1 STR for every ally
sheltered** — so a fully formed phalanx is a 12-STR Clod behind a wall of armored friends.
Both halves read live positions, so it evaporates the instant people scatter. He's a
formation piece, and he makes "clump up" — normally a mistake against AoE — into a plan.

Rock Hard is the reason he's an anchor rather than a bruiser: while **Defending**, he
**negates physical damage entirely** (not halves — zero), and restores 3 MP every time a
physical attack hits him. A braced Clod is literally invulnerable to the entire physical
half of the game, and the enemy melee squad *refuels him* by attacking. The only way through
is magic — which is precisely why he's paired with a Mystic or a Necromancer in practice.

Quake deals `3 + (number of enemies hit)` magic damage in a 3-tile radius and **refunds its
own MP if it catches 3 or more enemies**. Stone Throw hurls a boulder within 4 for 8
physical, scales above his base STR, and applies a guaranteed slow on hit (or a stun on a
crit). Thunderous Charge (rage) targets a tile within 4 that an enemy is not occupying,
then detonates a 2-radius blast for 10 physical and a mass stun.

### Riot Cop — Crowd-Control Tank / Peel Bodyguard

`HP 30 · MP 0 · STR 8 · DEF 7 · MOVE 3 · RNG 1`

No MP at all — his gear runs on **finite USES**, which is the only cooldown-style economy in
the game. Stun Gun has 5 charges, Smoke Bomb has 3; when a pool empties it must sit dry for
one full turn, then refills completely. So he's not rationing across a whole match like
everyone else; he's managing a rhythm, and he's always able to do *something*.

Riot Shield is a hard counter to two entire damage categories: he takes 1 less from every
ranged basic attack, and while **Defending he nullifies magic damage aimed at him
completely**. Critical magic has a +1 vulnerability when it is not being nullified, but
Defend wins that check. Combined with Heavy Boots (slow immunity) and DEF 7, he's one of
the hardest units in the game to remove with focused fire. Utility Belt gives adjacent
allies +1 DEF.

His job is peeling. Stun Gun does 3 true and slows (or **stuns** if the target is adjacent,
or if Riot Cop is raging); walls block it, bodies do not. Shield Bash does 8 physical and
shoves the target back a tile, or adds 1 true if the shove is blocked. Cover **swaps places
with an adjacent ally** and Defends — pulling a dying caster out of melee and standing in
their place, with +1 STR next turn if the covered ally is below half HP. Smoke Bomb targets
an empty tile, rolls to land, then blinds enemies in a 1-tile radius with immunity respected.

Lockdown (rage) gives him +1 STR and +1 MOVE, refills every charge, makes Stun Gun stun at
*any* range, and the ART clamps **every unit within 3 tiles — allies included, Riot Cop
excluded** — to 1 MOVE and −2 DEF for a turn. The ART must be his side's first command of
the turn.

### Big Brother — Control Tank (displacement / anti-heal)

`HP 30 · MP 5 · STR 2 · DEF 8 · MOVE 2 · RNG 3`

STR **2**. He is explicitly not a damage dealer, and the whole unit is built around that
admission. Super Magnet makes his basic attacks deal **true damage** — so his pathetic 2 STR
bypasses DEF and Defend entirely, hitting for a reliable, unpreventable 2 against literally
anything, including a braced Clod. He can only attack along the 8 straight rays, and he gains
no bonus damage from crits — but a crit **pulls the target adjacent and stuns it for a turn**.

His kit is pure manipulation. Force Tug does true damage and slows (stun on a crit). Force
Push shoves **every adjacent unit — ally or enemy — one tile away**, dealing 2 true to
anyone who has nowhere to go. Magnetic Field means **other units standing within 1 tile of
him cannot be healed**; Big Brother himself can still receive healing. That turns his body
into a no-heal zone you can walk onto an enemy healer.
Polarity Shift is the strangest button in the game: globally swap HP restores and MP
restores, so every heal on the board becomes mana and vice versa — a hard counter to a
healing composition, and a real hazard for your own. Recharge is the exception clause: it
restores his own 5 MP through Polarity Shift, or if already full, restores 1 HP and gives
him +1 MOVE on his next turn.

Pissing Contest gives him +1 STR while any Little Brother lives **on either team** (and
Little Brother gets +1 range in return) — a piece of pure flavor that rewards drafting the
feuding pair together.

Rogue Mech (rage): +3 STR, +1 MOVE, and **free ARTs**.

### Treant — Rooted Weather Tank / Sustain Anchor

`HP 30 · MP 30 · STR 7 · DEF 6 · MOVE 2 · RNG 2`

A tank whose stat line is written by the sky. Enchanted Roots retunes him per weather: **+1
HP every turn in Rain, +1 DEF in Snow, +1 magic damage in Thunderstorm, +2 STR / −1 DEF in
Fire** — and he takes +1 damage from all fire abilities and fire tiles. He is the obvious
partner for Mother Nature, and the obvious victim of a Gargoyle. Immune to poison.

His defense is positional and clever. Deep Roots grants +1 DEF while **every living enemy**
sits inside his (short, 2-tile) attack range, and another +1 while every living ally does —
so he's rewarded for being at the *center* of a compact fight, not for hiding. Grove Ward
gives his whole team −1 magic damage taken. Verdant Bond shares any stat buff landed on a
nearby ally onto him too, and slows anything he crits.

His economy is a closed HP/MP loop, which is unusual and fun: Soul Sap drains half the
damage he deals back as **MP**; Ether then converts *any* MP gain into +2 STR next turn; and
Source Shift (3 uses) pays 1 HP and 1 MP, then **swaps his current HP and MP values** — an
emergency button that turns a 25-MP reserve into a 25-HP heal, or dumps a full HP bar into a
full mana bar. Enrich passes 3 MP to an ally, or 3 HP instead if that ally is already full
on MP.

Petrify (rage) is a superb ultimate: become an **invulnerable statue for 2 turns**, taking
no actions and *no damage of any kind*, while each of those turns restores 1 HP and 1 MP to
himself and every ally within 2 tiles, and **drains 1 HP and 1 MP from every enemy within
2**. He turns off, becomes untouchable, and the fight around him bleeds.

---

## Summons

### Ghoul — Zone Anchor (summon-only)

`HP 10 · DEF 2 · MOVE 1 · no turns`

Not draftable — raised by the Necromancer (two at a time). It never activates, which is
exactly what makes it good: it costs the Necromancer one activation and then provides value
forever at no further action cost.

It does three jobs at once. It is a **body** — it blocks movement and, critically, blocks
physical line of sight, so it screens the Necromancer. It is an **aura extender** — it
carries Aura Carrier, the full Deathly Aura (−1 DEF to enemies within 3, widened to the raging
Necromancer's −2 DEF / −1 STR / −1 MOVE at radius 4 when its summoner rages), letting the
debuff field be projected somewhere the fragile Necromancer would never survive. And it
**bites** through Ghoul Bite: 1 true damage to a random adjacent enemy at every turn
rollover, for free.

It cannot win the game — a player left with only Ghouls has lost.
