# Tactical Arena — Team Comps to Try

A hand-picked list of four-unit squads worth playing, inferred from how the engine
actually resolves — not from a simulator. Every comp below is built on a mechanic I
traced through the code (`src/core/unitCatalog.js`, `src/core/combatEffects.js`,
`src/core/weather.js`, `src/rules/combat.js`) and the archetype reading in
`UNIT_ARCHETYPES.md`. Numbers and edge cases live in the code and tests; this is a
"what to draft and why" guide.

## How to read this doc (and why it isn't a tier list)

Squads are **4 units**. Duplicates are legal in casual/hot-seat, but **team auras
dedup by `stackKey`** — a second Mystic, Nemesis, or Necromancer adds *nothing* to the
aura it already applied. Diversity is mechanically rewarded, so every comp here is four
distinct units.

**This is a human-play guide, not the sim ladder.** The old `TEAM_COMP_ANALYSIS.md`
numbers come from a CPU-vs-CPU round robin where *neither side ever seeks rage* and
nobody sequences a setup. That scores every rage/combo comp near its floor (rage was
online 0.4%–8% of unit-turns) and flatters the always-on grind comps. In real hot-seat
or online play you *can* bait rage, hold a heal to keep an ally in his best form, and set
up a combo across turns — so several comps that looked weak in the sim (King, Nuke
shells, status locks, poke) are genuinely strong when piloted. I call out which comps
depend on you actually playing them.

### The four levers every comp pulls on

1. **Damage type.** Physical is `max(1, STR−DEF)` and dies into armor; **magic ignores
   DEF** (Defend still halves it); **true** ignores DEF *and* Defend. A comp's real
   question is "can the enemy's defensive stat even apply to us?"
2. **Action economy.** An activation is one move + one primary, and an ART normally eats
   the whole thing. Anything that breaks that — move-and-ART, bonus actions, extra bodies
   — is worth more than raw stats.
3. **Resource.** MP never regenerates. A comp either rations a fixed pool, or it drafts a
   private economy (Magic Pipe, Growth, Spirit Dance, ore, HP-as-fuel, Snack Break).
4. **Global rules editors.** A handful of units rewrite the board for *both* teams —
   King commands, Mother Nature weather, Witch Doctor stances, Big Brother polarity. You
   build the rest of the squad to abuse the rule and make sure the enemy can't.

---

## Magic / armor-bypass comps

### 1. Realm Stack — the DEF axis doesn't exist
**Nemesis · Magician · Fat Wizard · Necromancer**

The scariest "just works" comp. Every point of damage is magic, so enemy DEF — Clod's 8,
Gargoyle's 7, Juggernaut's 7 — is worthless on defense. A 30-HP armored Clod dies as fast
as a 23-HP mage.

- **Nemesis / Realm of Magic** hands the whole team **+1 magic damage and −1 MP per ART**
  (min 1) while he lives. That discount applies to every cast, AoE included, across the
  entire match — it compounds into dozens of free MP.
- **Necromancer / Dead Zone** gives your side **−1 magic damage taken** (your only defense
  in a mirror), and Deathly Aura's **−1 enemy DEF** matters the moment you throw a basic.
- **Fat Wizard** is the durable body (30 HP at range 3) that never fully whiffs — Clumsy
  splashes on misses and crits — and **Study** refuels him (HP+MP back per magic hit on
  his mark).

**Pilot line:** kill order is *their* Nemesis/Mystic first if they have one, else just
focus. Keep Nemesis alive at all costs — he's the whole engine and DEF 2 makes him
fragile; body-block him with the Fat Wizard. Save Magician's **Nuke** (rage, 12 magic in
r3) for a cluster.
**Beaten by:** Defend (halves magic) plus stacked mitigation — the Fortress comp below is
its natural predator. Also soft to silence, but Nemesis is silence-immune, so they have to
reach the others.

### 2. Storm Coven — near-free casting under a permanent storm  *(needs piloting)*
**Mother Nature · Nemesis · Magician · Gargoyle**

The upgrade to Realm Stack for a player who'll manage weather. Mother Nature parks
**Thunderstorm**, whose persistent rule is **−1 MP on every ART** — and the engine
*subtracts that on top of Nemesis's −1* (`getArtMpCost`: `base − support − weather`). So a
caster's ARTs run at **−2 MP** (floored at 1), and Thunderstorm also throws **+1 magic
damage to everyone each turn**. Two team-wide magic amplifiers on one board.

- The catch is honest: **weather hits both teams**, so only run this if *you* are the
  caster side. That's why the fourth slot is **Gargoyle**, not a fifth mage — his
  **Pyroclasm** is magic that burns through bodies, he's immovable and status-immune, and
  he doesn't care that the enemy also gets +1 magic (he has no casters to feed and DEF 7).
- Mother Nature's own 100-MP pool plus the discount means she can Landscaper-wall and still
  reset the storm every turn if someone dispels it.

**Pilot line:** set Thunderstorm turn one and leave it. Screen Nemesis and Mother Nature
(both squishy) behind the Gargoyle. This is a glass cannon — you win the damage race or you
stall, so play for tempo, not attrition.
**Beaten by:** a faster clock, or an enemy who also brought magic (they share your storm).
Don't run this into Fortress.

---

## Durable mitigation comps

### 3. Fortress — refuse to die, dampen the one thing that ignores armor
**Gargoyle · Clod · Necromancer · Fat Cleric**

The proven apex of the CPU sim (94%), and it doesn't even need rage to work — its value is
all always-on, which is why it's trustworthy. Two 30-HP Defend tanks in front of a
magic-reduction healer core:

- **Clod / Rock Hard** while Defending **negates physical damage entirely** (not halves —
  zero) and refunds 3 MP per hit, so the enemy melee squad literally refuels him by
  swinging. **Gargoyle** brings thorns, total displacement immunity, and status reflection.
- **Necromancer / Dead Zone** gives the team **−1 magic damage taken** — the patch over the
  tanks' one weakness (magic bypasses their DEF) — while Deathly Aura's −1 enemy DEF juices
  the tanks' own hits.
- **Fat Cleric** out-sustains the trickle that gets through and revives a fallen tank
  (Second Helping, rage).

**Pilot line:** turtle. Brace Clod against the physical squad and let them feed him; use
Gargoyle's Pyroclasm and Quake for the actual damage. You're not racing anyone — you're
outlasting them.
**Beaten by:** it has no fast clock, so anything that can *finish* before attrition —
a piloted Nuke/Explosion burst, or a status lock it can't cleanse fast enough. But it
counters the Realm Stack and hard-counters Contagion.

### 4. Spring Garden — a sustain wall that also grows  *(weather comp)*
**Mother Nature · Treant · Fat Cleric · Paladin**

A different way to be unkillable: instead of dampening damage, you out-heal it with a
**global restoration multiplier**. Mother Nature runs **Spring Shower**, whose persistent
rule adds **+1 to every HP and MP restore on the board** (verified: `restoreBonus` is added
inside `restoreHp`/`restoreMp`, so it lands on *every* heal — Wish, Hope, Snack Break,
Relay Power, all of it).

- **Treant** is the payoff unit: Spring Shower is his Rain affinity, so he heals **+1 HP a
  turn from Enchanted Roots** — and the weather bonus stacks on top, so he's ticking **+2**
  while also running a −1-team-magic Grove Ward. His Petrify (rage) becomes an invulnerable
  2-turn heal-pulse for the whole cluster.
- **Fat Cleric + Paladin** are two more heal engines; every one of their numbers is +1 from
  the weather. Paladin's Hand of Life turns his aggression into team healing, now amplified.

**Pilot line:** set Spring Shower and keep it up; the enemy healing +1 too rarely matters
because you brought three healers and they didn't. Hug the Paladin with your wounded units.
**Beaten by:** the two hard anti-heal answers in the roster — a raging **Juggernaut**
(Null Zone disables all healing, everywhere) or **Big Brother** (Magnetic Field / Polarity
Shift). Against those, this comp folds; against everyone else it's a brick.

---

## Status / contagion comps

### 5. Contagion Lock — turn one debuff into a board-wide one  *(needs piloting)*
**Virus · Witch Doctor · Blacksword · Archer**

A soft-lock engine. **Virus / Spread** means any debuff on any enemy jumps to that enemy's
neighbors within 2 tiles — so single-target control becomes AoE control for free. **Witch
Doctor / Misfortune** stance then makes **every status roll on the board land at double
chance**, turning 60–70% checks into near-certainties.

- **Archer** supplies *permanent* poison and a 3-turn slow at range; **Blacksword** is the
  new engine piece — Darkspread blinds anything he crits, and **Dark Tick** deals 3 true to
  *every blinded enemy on the board*. Virus spreads his blind first, so one crit becomes a
  board of blinded targets, then Dark Tick harvests all of them.
- Virus's own **Poison Tick** (2 true to every poisoned enemy) and **Explosion** (rage: 10
  true to all poisoned + splash) are the finishers — DEF- and Defend-ignoring burst off the
  spread you built.

**Pilot line:** Misfortune first, then land *any* debuff into a cluster and let Spread do
the work. Sequence poison → Poison Tick, or Blacksword crit-blind → Dark Tick. Accept that
Misfortune curses you too — don't stand your own units in a poison cloud.
**Beaten by:** status immunity (Paladin, Angel, Gargoyle, King, Monk-vs-blind) and cleanse
(Mystic Purify, Fat Cleric Cleanse). A squad stuffed with immunity walks through this; a
squad with none gets perma-locked. Scout for immunity before you commit.

### 6. Light Brigade — free chip on half the board, immune to your own medicine
**Paladin · Angel · Mystic · Sniper**

Built on the two cleanest **bonus actions** in the game — pulses that fire *without
spending the unit's activation*, so you get them on top of a normal move-and-attack every
single turn.

- **Paladin / Lightseeker** chips 1 true to every enemy on a **light** tile within 5;
  **Angel / Heavenseeker** (rage) does 2 true to enemies on **white** tiles board-wide and
  heals your units on them. Half the board is always working for you, for free.
- **Angel** is a magic-damage support that ignores DEF and gets better as he's hurt; his
  **Anoint** hands the **Sniper +1 range**, pushing an already-6-range pierce gun to 7.
- **Mystic** anchors it: unconditional **+1 team DEF**, board-wide Wish healing, and Purify.
  Crucially, **Paladin and Angel are both fully status-immune**, so this comp laughs at the
  Contagion Lock while chipping it to death from range.

**Pilot line:** fight on light/white tiles, poke with the Sniper (who ignores line of
sight and walls), and let the seeker pulses do free work. Anoint the Sniper before a big
shot. Bait Angel toward rage — Heavenseeker at 2 true board-wide is the win condition.
**Beaten by:** a fast bruiser rush that closes before chip adds up, and dark-tile units
(Blacksword) who'd rather you were fighting on the other color.

---

## Command / tempo comps

### 7. King Rush — the comeback engine  *(needs piloting; high skill ceiling)*
**King · Fat Knight · Swordsman · Paladin**

The most piloting-dependent comp in the game and badly undersold by any sim, because its
whole identity is a mechanic the CPU can't use: **every King command scales +1 per allied
unit currently in RAGE.** Your bruisers *want* to be at ≤5 HP for their own rage payoffs,
and as they get there the King's team-wide buffs balloon.

- **Strike!** is +2 STR base, +1 per raging ally — a King behind three raging bruisers is
  handing the whole team +5 STR. **Hold!/Pursue!/Higher Ground!** scale the same way.
- **Fat Knight** (Trample rage — walk through a line for 3 true each) and **Swordsman**
  (Last Stand +3 STR under 3 HP) are exactly the units that get scarier as they drop.
  **Paladin** heals the squad off his own aggression and is status-immune.

**Pilot line:** this is the comp where you *don't* top your units off — you ride them at
low HP to keep the rage-scaling live, and you sequence the King's command each turn to the
threat (Strike into a kill, Hold to survive a swing, Higher Ground to reach). Protect the
King: he loses 10 HP per ally that falls and can't win alone, so he's a 30-HP body you must
shield while your team deliberately flirts with death.
**Beaten by:** burst that removes the King early (before rage-scaling comes online), and
any comp that punishes a clustered low-HP squad (Magician Nuke, Virus Explosion).

### 8. Summoner Tempo — borrow four extra activations  *(needs piloting)*
**Summoner · Nemesis · Mystic · Gargoyle**

An action-economy comp. **Summoner / Summon** trades his own mediocre turn for a
**random roster unit that arrives at full HP and immediately takes a complete turn**, then
vanishes — and with a 100-MP pool he does it almost every turn. **Beckon** (rage) calls a
ghost that arrives *already raging*, i.e. you can summon a Magician straight into a Nuke.

- **Nemesis** discounts the Summoner's ARTs *and* buffs any magic ghost he calls (+1 magic
  while Nemesis lives). **Mystic** keeps the fragile casters alive and gives +1 team DEF.
  **Gargoyle** is the immovable screen the two squishies hide behind.
- Soul Shuffle offers five shuffled picks (never a repeat, never himself), so there's real
  choice — call the ghost that answers the board (a Gargoyle for Pyroclasm, a healer whose
  self-heal is redirected to *you*).

**Pilot line:** protect the Summoner and cast every turn — a borrowed good activation beats
his own weak one almost always. Hold Beckon for a moment you can summon a raging finisher
into a cluster.
**Beaten by:** it's high-variance (you don't control the draw) and dies if the Summoner is
focused. A disciplined burst comp that ignores the ghosts and kills the caller shuts it off.

---

## Control / tech comps

### 9. Magnet Lockdown — shut off healing, drag out the back line  *(tech pick)*
**Big Brother · Little Brother · Juggernaut · Mystic**

A hard tech comp aimed straight at the sustain wall of the roster (Fortress, Spring Garden,
any triple-healer). It attacks the *rules of healing*, not the HP bars.

- **Big Brother** is STR 2 but **Super Magnet** makes his basics **true damage** — a
  reliable 2 through any DEF or Defend, even a braced Clod. **Magnetic Field** means nothing
  within 1 tile of him can be healed, and **Polarity Shift** globally swaps HP↔MP restores
  (verified: a heal reroutes to `restoreMp`) — a hard counter to a healing composition.
- **Juggernaut**'s Null Zone (rage) **disables all healing on the board** and gives him free
  ARTs; **Tether Grab** hauls an enemy healer out of their back line and into your fists.
- **Pissing Contest** rewards the brother pair (Big Brother +1 STR, Little Brother +1 range
  while both live). **Little Brother** adds crit splash artillery; **Mystic** is your own
  +1-DEF anchor and cleanse.

**Pilot line:** identify the enemy healer and make healing illegal around it — walk Big
Brother onto it, Tether it out, or flip Polarity right as they try to top up. Against a
non-healing comp this is weaker, so it's a counter-pick, not a ladder default.
**Beaten by:** comps that don't rely on healing at all (Realm Stack, a pure bruiser rush) —
you've spent slots on tech they don't care about.

### 10. Siege Line — out-range everything  *(needs positioning)*
**Sniper · Fat Bowman · Angel · Mystic**

Pure range denial. **Sniper** (range 6) ignores line of sight and walls and never drops
below 2 damage, so armor and screening both fail against him; **Fat Bowman** (Heavy Handed)
hits *harder the farther out the target is* and stacks +1 STR per turn she holds still
(Planted, to +4). **Angel** Anoints either of them for +1 range and chips from white tiles;
**Mystic** heals and gives +1 team DEF.

**Pilot line:** claim a corner, plant the Bowman and never move her, and kite. Anoint the
Sniper before a pierce shot into their back line. You're trading the whole match for range
advantage, so terrain and spacing are the entire game — don't get closed on.
**Beaten by:** a fast rush that collapses the distance (Monk Shadow Step, Juggernaut Tether,
anything that closes before you've chipped enough). This is the comp most punished by bad
positioning and most rewarded by good.

---

## Benchmark comps (measure the others against these)

### 11. Fat Squad — the designed synergy
**Fat Knight · Fat Wizard · Fat Cleric · Fat Bowman** *(all four required)*

The one intended-synergy comp, so it's the yardstick. **Brothers in Arms** only comes
online with all four alive: Knight +1 STR/MOVE, Wizard +1 STR/magic, Cleric +1 MOVE/DEF,
Bowman +1 range — and every body is 30 HP. It's fully self-contained (heals, splash, a
frontline, and a turret) and very durable, but the synergy bonuses are individually small
and cost you all four slots. If a comp above can't clearly beat the Fat Squad, it isn't
actually good; if it stomps the Fat Squad, take that as a power-creep signal.

### 12. Rage Snowball — the "fair and strong" midline
**Magician · Mystic · Swordsman · Paladin**

The clean benchmark for what balanced-but-strong should feel like. Magician answers armor,
Mystic sustains and gives +1 team DEF, Swordsman and Paladin bruise and heal. Nothing
degenerate, good rage payoffs (Nuke, +6-MOVE damage-halving Mystic, Last Stand). If you're
new to the roster, start here and learn what each lever feels like before drafting the
spicier comps.

> Note: the legacy "classic" squad (Swordsman/Archer/Mystic/Magician) is a trap now — it
> finished dead last in the sim (8%) because the rebuild-original units have outrun the
> original four. Swap the Archer for a Paladin (→ Rage Snowball) and it's a real comp again.

---

## Quick counter-matrix

Rough directional read, not a guarantee — piloting swings all of these.

| If they bring... | Try... | Because |
|---|---|---|
| A magic pile (Realm/Storm) | **Fortress** | Dead Zone + Defend halve the magic; the tanks won't die |
| A sustain wall (Fortress/Spring Garden) | **Magnet Lockdown** | Turn healing off (Null Zone, Magnetic Field, Polarity) |
| A status lock (Contagion) | **Light Brigade** / **Fortress** | Stacked status immunity + cleanse make it inert |
| A bruiser rush | **Siege Line** / **Fortress** | Out-range it or wall it before it lands blows |
| A turtle/poke comp | **King Rush** / **Storm Coven** | A scaling clock that turtles can't outlast |
| Anything, first time out | **Rage Snowball** | Balanced kit that teaches every lever |

## Drafting principles (the transferable part)

- **Pick your damage type against theirs.** If they stacked DEF, bring magic or true. If
  they brought a caster pile, Defend and Dead Zone matter more than armor.
- **One rules-editor per comp, and build around it.** King, Mother Nature, and Witch Doctor
  each rewrite the board — pair them with units that abuse the rule, and make sure the
  enemy can't share it (weather especially cuts both ways).
- **Don't double an aura.** Two Mystics is one +1 DEF and a wasted slot. Spend the slot on
  a second lever instead.
- **A comp needs an economy.** Four MP-hungry casters with no Magic Pipe / Spirit Dance /
  Nemesis discount runs dry mid-match. Check that your casts are actually payable for 15+
  turns.
- **Decide your clock.** Grind comps (Fortress, Spring Garden) win late and lose to a
  finisher; burst/scaling comps (Storm Coven, King Rush) win the race and lose if they
  stall. Know which one you are and play the tempo that suits it.
