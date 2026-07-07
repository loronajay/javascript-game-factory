# Tactical Arena — Strongest Team Comps (balance analysis)

A grounded read of the current roster for balancing. Every claim here is traced to
the actual unit data (`src/core/units/*.js`) and the resolvers
(`rules/combat.js`, `rules/damage.js`, `core/unitCatalog.js`) as of 2026-07-07.
Squads are **4 units**, duplicates allowed in casual/hot-seat, board 13×13 or 15×15,
RAGE auto-triggers at **≤5 HP**.

---

## The math that drives synergy (read first)

- **Physical** = `max(1, STR − DEF)`. Every point of enemy DEF removed (or ally STR
  added) is worth +1 per swing — cheap stat swings matter a lot on 5-damage hits.
- **Magic** = a flat `amount` (or the caster's STR) that **ignores DEF entirely**.
  There is **no DEF-equivalent stat against magic** — the *only* mitigations are
  **Defend (halves it)**, `teamDamageReduction` (Necromancer's Dead Zone, −1),
  and outright magic immunity (Witch Doctor's Black Death stance). This is the
  single most important balance fact in the game.
- **True** = fixed `amount`, bypasses **both DEF and Defend**. This is the great
  equalizer against walls (Volley, Footwork, Time Steal, Fart, Flight, Poison Tick,
  Juggernaut/Virus rage blasts, Clod's charge).
- **Crit** = `ceil(base × 1.5)` before Defend; base 15% / miss 10%.
- **Defend** halves physical *and* magic (round up), so a defending tank is soft
  only to true damage and status.

**Non-stacking rules (so you don't nerf the wrong thing):** team auras dedup by a
`stackKey`, so **doubling a buff unit does nothing**:
- Two Mystics ≠ +2 DEF (Guardian applies once).
- Necromancer + its Ghoul's Deathly Aura do **not** stack the −1 DEF; the Ghoul only
  *extends the coverage area*.
- Duplicate Dead Zone / Realm of Magic / Realm-support don't stack.
This already pushes players toward diverse comps — good. It also means the power of
these auras is entirely in the *first* copy.

---

## Stat reference

| Unit | HP | MP | MOV | RNG | STR | DEF | Class | Role |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Swordsman | 25 | 20 | 3 | 1 | 10 | 5 | melee | bruiser |
| Paladin | 26 | 24 | 3 | 1 | 10 | 5 | melee | bruiser + heal-aura |
| Monk | 26 | 25 | 2 | 1 | 9 | 6 | melee | skirmisher |
| Archer | 24 | 22 | 2 | 5 | 8 | 4 | ranger | ranged |
| Sniper | 23 | 18 | 2 | 6 | 8 | 3 | ranger | ranged/pierce |
| Angel | 24 | 37 | 2 | 5 | 3 | 3 | ranger | support |
| Mystic | 23 | 38 | 2 | 5 | 5 | 3 | support | healer/DEF aura |
| Witch Doctor | 24 | 30 | 2 | 4 | 8 | 3 | support | stance-caster |
| Father Time | 25 | 30 | 2 | 5 | 7 | 3 | support | controller/revive |
| Magician | 23 | 40 | 2 | 5 | 6 | 3 | mage | nuker |
| Necromancer | 23 | 36 | 3 | 5 | 6 | 3 | mage | debuff/summon |
| Nemesis | 25 | 45 | 3 | 5 | 7 | 2 | mage | **magic amplifier** |
| Virus | 25 | 36 | 3 | 5 | 6 | 3 | mage | contagion |
| Juggernaut | 30 | 5 | 2 | 1 | 8 | 7 | tank | bruiser (STR10/MOV3 @0MP) |
| Gargoyle | 30 | 20 | 2 | 1 | 10 | 7 | tank | thorns/immunity |
| Clod | 30 | 20 | 2 | 1 | 9 | 8 | tank | phys-negate |
| King | 30 | 0 | 0 | 0 | 0 | 0 | support | non-combatant commander |
| Fat Knight | 30 | 20 | 2 | 1 | 10 | 6 | melee | bruiser |
| Fat Wizard | 30 | 35 | 2 | 3 | 7 | 4 | mage | splash caster |
| Fat Cleric | 30 | 35 | 2 | 4 | 7 | 5 | support | healer |
| Fat Bowman | 30 | 25 | 2 | 4 | 8 | 5 | ranger | ranged |

---

## Tier S — the comps I'd watch for over-tuning

### 1. "Realm Stack" — all-magic DEF-bypass
**Nemesis + Magician + Fat Wizard + Necromancer** (swap Necromancer↔Virus)

Why it's the scariest comp in the game: it **opts out of the entire DEF axis**.
- **Nemesis / Realm of Magic** gives the whole team **+1 magic damage** and **−1 MP
  cost (min 1)** while it lives. Applies to *every* magic source, AoE included.
- **Necromancer / Dead Zone** gives the team **−1 magic damage taken**, and Deathly
  Aura strips −1 DEF off enemies (irrelevant to your magic, but nice if you dip melee).
- Every hit ignores DEF, so the enemy's tanks (Clod DEF 8, Gargoyle DEF 7, Juggernaut
  DEF 7) provide **zero** value on defense. A 30-HP DEF-8 Clod dies exactly as fast as
  a 23-HP DEF-3 mage.

Real numbers with Nemesis up:
- Fat Wizard **Zap 6** (range 4), splashes on miss/crit via Clumsy.
- Magician **Spark 7**, **Banish 7** + silence, **Nuke 13** AoE r3 (rage).
- Necromancer **Dark Bomb 6** AoE, **Wither** magic + slow.
- MP costs drop (Spark 4→3, Banish 8→7, Nuke 16→15, Zap 5→4), and **Magic Pipe**
  (Magician) + **Growth** (Virus) + **Nemesis Regenerate** (rage: +5 HP/+15 MP) keep
  the tank topped up.

**Balance flag:** this is the clearest evidence that **magic has no counter-stat**.
DEF, tanks, and the whole "wall" archetype are dead weight against it. Counterplay
exists (Defend halves magic; Silence shuts the casters down — but Nemesis is
silence-immune and Mystic is too), it's just thin. Consider: a magic-resist stat or
`teamDamageReduction` on a tank, capping Nemesis's bonus, or making Realm of Magic a
proximity aura rather than team-wide-while-alive.

### 2. "Attrition Wall" — un-killable sustain core
**Mystic + Fat Cleric + Paladin + Gargoyle** (or Clod)

Three stacked healing engines behind a +1-DEF-team wall, and heals have **no global
lockout** (only a raging *enemy* Juggernaut can shut healing off).
- **Mystic / Guardian**: unconditional **+1 DEF to the whole team** while alive, plus
  Pray (3 AoE r3), Wish (1 global), Purify (cleanse), Silence.
- **Paladin / Hand of Life**: every physical hit he lands heals allies within 2 for
  **half the damage** — a lifesteal aura attached to a STR-10 body.
- **Fat Cleric**: **Hope** (1–4 AoE r3, 3 MP), Focus Prayer (5 single), Cleanse,
  Snack Break (+1 HP/+1 MP on a no-move defend), Emergency Snacks rage regen.
- **Gargoyle** (DEF 7 → **8** under Guardian, 30 HP): Stone Body thorns, total
  displacement immunity, **status reflection**, and rage = **always defending +2 DEF**
  (DEF 10, halving everything). Clod alternative negates *all* physical while defending.

Against physical this core is a brick: a STR-10 attacker into a Guardian'd defending
Gargoyle (DEF 7 +1 = 8) does `max(1, 10−8)=2`, halved by Defend to **1** — out-healed
instantly (and a raging Gargoyle at DEF 10 floors it at 1 before the halving).

**Balance flag:** potential stalemate / unwinnable-by-attrition. Guardian being
**unconditional + team-wide** is the load-bearing lever; combined with two more healers
and a tank the opponent needs pure burst or true damage to break it. The intended
counter (true damage, status) should be verified to actually be enough.

### 3. "Contagion Lock" — status soft-lock
**Virus + Witch Doctor + Necromancer + Archer**

Turns single-target control into board-wide lockdown:
- **Witch Doctor / Misfortune Dance** sets a stance that **doubles status-effect
  chance GLOBALLY** (everyone). Poison Arrow 60%, Wither slow 70%, Moonstrike blind
  70%, Cough poison 60%, Leg Shot slow 60% all land dramatically more often.
- **Virus / Spread**: whenever an enemy gets a debuff (from *any* source), it jumps to
  that enemy's allies within 2 tiles. One Wither slows a whole cluster; one Poison
  Arrow poisons three.
- Payoff: **Poison Tick** (2 true to *every* poisoned enemy, 2 MP) and **Explosion**
  (rage: 10 true to every poisoned enemy + 5 splash) convert the spread poison into
  guaranteed, DEF-and-Defend-ignoring burst.

**Balance flag:** the Misfortune ×2-global multiplier stacked with Spread's
single-target→AoE conversion is a genuine soft-lock engine — a team can be kept
perma-blinded/slowed. Note that **Paladin, Angel, Gargoyle, King** are fully
status-immune and hard-counter this, and Mystic/Fat Cleric can cleanse, so it's
answerable — but a comp with no immunity/cleanse gets run over. Watch Misfortune
especially; a global ×2 is a very strong, low-cost switch.

---

## Tier A — strong, more conditional

### 4. "King Rush" — rage-scaling command snowball
**King + Fat Knight + Swordsman + Paladin/Gargoyle**

King's commands are global one-turn team buffs that **scale +1 per allied unit
currently in RAGE**. As your bruisers drop to ≤5 HP (which they *want* to, for their
own rage payoffs), the commands balloon:
- **Strike!** +2 STR base (+3 if last command was Pursue!), **+1 per raging ally** →
  easily +4/+5 STR to the whole team late.
- **Hold!** +1 DEF + +1 healing received (both scale), **Pursue!** +1 MOVE,
  **Higher Ground!** +1 range (attacks *and* area ARTS).
- Rally: every ally that falls heals the rest of the squad +5.

**Balance flag / risk:** the King eats **−10 HP per ally that falls**, must act first
every turn (mis-sequencing can soft-lock), and **doesn't sustain victory alone**. The
command buff getting *stronger the more of your team is dying* is a comeback mechanic
that can read as swingy — a losing King player suddenly hands out +5 STR to everyone.
High skill ceiling, fragile floor. Probably fair, but the rage-scaling is the thing to
model.

### 5. "Fat Squad" — the *designed* synergy (your balance benchmark)
**Fat Knight + Fat Wizard + Fat Cleric + Fat Bowman** (all four required)

This is the intended-synergy comp, so it's the yardstick for whether the others are
over/under-tuned. With **Brothers in Arms** all live:
- Fat Knight +1 STR/+1 MOVE, Fat Wizard +1 STR/+1 magic dmg, Fat Cleric +1 MOVE/+1 DEF,
  Fat Bowman +1 RANGE. Every body is **30 HP**.
- Self-contained kit: Cleric heals (Hope/Focus/Relay-via-Wizard), Wizard splashes
  (Clumsy) + Study + Surge, Knight frontlines + Fart displacement, Bowman pokes with
  Heavy Handed (up to +2 at range 4) and Planted (+1 STR/turn stationary, max +4).

**Assessment:** durable and cohesive, but the synergy payoffs are individually *small*
and you spend **all four slots** to unlock them. Head-to-head it is almost certainly
**weaker than the Realm Stack** (which bypasses the fat squad's whole DEF advantage)
and roughly even with the Attrition Wall. If the "designed" comp is a tier below an
emergent magic pile, that's the balancing signal: either buff Brothers in Arms or rein
in Nemesis-led magic.

### 6. "Rage Snowball" — the balanced baseline
**Magician + Mystic + Swordsman + Paladin** (≈ the default squad)

A clean midline benchmark. Rage unlocks Magician's Nuke, Mystic goes +6 MOVE +
damage-halving, Swordsman +3 MOVE/+1 STR (+3 STR under 3 HP via Last Stand), Paladin
+2 STR/+1 range with light-tile bonus. Mystic's Guardian + Pray sustains. Nothing
degenerate — this is what "fair and strong" should feel like; measure the Tier-S comps
against it.

---

## Individual units worth a second look

- **Mystic** — appears in nearly every top comp. Unconditional team +1 DEF (Guardian)
  + heals + cleanse + silence + a genuinely absurd rage (**+6 MOVE and passively halves
  ALL incoming damage**). The single best support; Guardian is the lever.
- **Nemesis** — the strongest *offensive* team buff in the game and the enabler of the
  DEF-bypass problem. Also a big personal statline (MP 45, MOVE 3, silence-immune,
  Dark Pulse 8-ray with self-heal, Regenerate rage).
- **Clod / Rock Hard** — the *passive* is binary: while defending it negates **all**
  physical damage (+3 MP per hit), so Clod is a hard wall against physical teams and the
  passive is simply inert against magic. The unit itself is not dead weight vs magic
  (Quake AoE, Stone Throw control, Brick House +1-DEF aura / +1 STR per sheltered ally,
  Thunderous Charge) — but the all-or-nothing physical negation is a swingy design lever
  worth watching.
- **Juggernaut / Self Destruct** — 10 true AoE r4, guaranteed, only "cost" is the unit
  itself; a very efficient trade/finisher. Bruiser Mode (STR 10/MOVE 3 at 0 MP) means
  it *wants* to be empty.
- **Witch Doctor / Misfortune** — a global ×2 status multiplier on one cheap dance is
  the strongest status enabler; watch it with any status comp.
- **Angel** — a *specialist*, not a weak ranger (correcting an earlier shallow read).
  Its basic attack deals **magic that scales with effective STR and ignores DEF**, so the
  low base STR (3) is misleading: it *out-damages physical rangers against armor* (3 into
  a DEF-8 Clod, where a STR-8 Swordsman does 1) and it grows with **every** STR source —
  King's Strike, Fire Dance, its own +2 rage, and Nemesis's team +1 magic all stack onto
  it. Pair that with **full status immunity** (Holy Being — a hard anti-Contagion anchor,
  see the counterplay list), Inner Strength ramping crit-and-blind as it drops, and ally
  utility (Anoint +range, Elevate / Heavenseeker white-tile heal+damage). Judge it as
  anti-armor support, not by raw STR — it wasn't tested in the sim and shouldn't be
  flagged for a buff on the "STR 3 = trivial" reasoning.
- **Sniper** — excellent poke (range 6, pierces walls *and* bodies, min-2 floor) but a
  small MP pool (18) and no team synergy; a solo carry rather than a comp piece.

## Counterplay axes (so nerfs target the right thing)

- **True damage** is the universal wall-breaker (ignores DEF *and* Defend): Volley,
  Footwork/Stumble, Time Steal, Fart, Flight, Poison Tick, Juggernaut/Virus rage
  blasts, Clod's Thunderous Charge. If walls feel unbreakable, it's because a comp
  lacks a true-damage source — check that enough units carry one.
- **Silence** neuters ART-dependent comps (the whole Realm Stack) — but Nemesis and
  Mystic are silence-immune, which is exactly why they anchor those comps.
- **Status immunity** (Paladin, Angel, Gargoyle, King, Monk-vs-blind) hard-counters the
  Contagion Lock; **cleanse** (Mystic Purify, Fat Cleric Cleanse) softens it.

---

## Simulation results (empirical backing)

The comps above were run head-to-head through the **real reducer + real CPU** — no
synthetic model. `scripts/comp-sim.mjs` builds each match with `createMatchState` (same
coin flip as a live game) and lets `chooseActivation` drive both sides, replaying every
command through `applyCommand`. Each pairing = **24 seeds × both sides = 48 games** at
**Normal** difficulty on a 13×13 board (seeds played both ways to cancel spawn/first-turn
bias). Reproduce with `node scripts/comp-sim.mjs --seeds 24` (flags: `--difficulty`,
`--size`, `--seeds`).

**Head-to-head — win% for the ROW comp (of *decided* games):**

| | realm | wall | contagion | king | fatsquad | baseline |
|---|---:|---:|---:|---:|---:|---:|
| **realm** | — | 68% | 48% | 93% | 77% | 90% |
| **wall** | 32% | — | 85% | 94% | 58% | 100% |
| **contagion** | 52% | 15% | — | 90% | 67% | 94% |
| **king** | 7% | 6% | 10% | — | 13% | 40% |
| **fatsquad** | 23% | 42% | 33% | 88% | — | 76% |
| **baseline** | 10% | 0% | 6% | 60% | 24% | — |

**Overall (all pairings, decided games):**

| rank | comp | win% | W | L | draws / 240 |
|---:|---|---:|---:|---:|---:|
| 1 | wall | 77.1% | 172 | 51 | 17 |
| 2 | realm | 76.3% | 103 | 32 | **105** |
| 3 | contagion | 64.8% | 138 | 75 | 27 |
| 4 | fatsquad | 55.5% | 116 | 93 | 31 |
| 5 | baseline | 21.0% | 46 | 173 | 21 |
| 6 | king | 15.8% | 35 | 186 | 19 |

### What the sim confirms and refines

- **The Tier-S trio is real.** Wall, Realm, and Contagion are the top three by a wide
  margin, exactly as predicted. The "designed" **Fat Squad lands 4th** — a clear tier
  below the emergent comps, which is the intended-comp-is-underpowered signal called out
  above.
- **Wall is as strong as Realm and far more reliable.** Realm beats Wall *head-to-head*
  (68% of decided games), but Realm **draws 105 of 240 games (44%)** — it wins the damage
  race (DEF-bypass) yet frequently **can't close**, stalling out on MP starvation once its
  casters are dry against a healing wall. Wall only draws 17. So "strongest" depends on
  what you're optimizing: Realm has the highest ceiling, Wall the highest floor.
- **Contagion hard-counters Wall (85%)** — status-lock walks straight through the
  attrition wall's defenses, as expected. Realm ≈ Contagion (roughly even).
- **King is the *worst* comp (15.8%).** Partly piloting, but — importantly — **not only
  piloting.** The instrumentation below shows the CPU *did* land the rage-scaling command
  buff 310 times across its 200 games, so the signature mechanic was online, and King still
  lost ~85% of the time. Its structural problems dominate: a non-combatant eats one of four
  slots, −10 HP per ally that falls means the scaling turns on exactly as the King is being
  chipped out, and acts-first is a liability. A coordinated human would do better, but this
  is closer to "genuinely fragile" than "the AI just can't play it."
- **Rankings are stable across difficulty.** A Hard-CPU run (16 seeds) reproduces the same
  tiers — wall 76.7% ≈ realm 74.3% > contagion 63.3% > fatsquad 52.1% > king 20.9% ≈
  baseline 20.4% — so the ordering isn't a Normal-AI artifact (King ticks up on Hard but
  stays near the bottom).

### The piloting caveat, quantified

You were right to distrust a pure CPU-vs-CPU read: **the CPU never *seeks* rage.** It only
reaches ≤5 HP by taking damage and never sets up the payoffs (baiting its own units into
rage, timing Nuke/Self Destruct, managing Realm's MP curve, ordering the Contagion lock).
The sim now measures exactly how large that blind spot is (20-seed Normal run):

| comp | unit-turns | **raging%** | rage-locked arts fired | King scaled commands |
|---|---:|---:|---:|---:|
| realm | 23,336 | 0.5% | 14 | — |
| wall | 8,667 | 4.1% | 16 | — |
| contagion | 6,657 | 3.9% | 32 | — |
| king | 5,787 | 5.8% | 24 | 310 |
| fatsquad | 7,212 | 4.9% | 0 | — |
| baseline | 6,097 | 6.8% | 47 | — |

- **`raging%`** — units act while raging **0.5%–7% of the time**. So every RAGE *passive*
  (Archer never-miss + 50% crit, Swordsman +3 MOVE/Last Stand, Mystic +6 MOVE + damage-halve,
  Paladin/Angel seekers, Gargoyle Volcanic, the fat squad's Trample/Lazy Cast/Desperation/
  Emergency Snacks, Necromancer's amplified aura) is online in a rounding-error fraction of
  turns. The sim essentially measures these comps **with rage switched off.**
- **rage-locked arts** — the marquee ultimates (Nuke, Self Destruct, Rewind, Black Death
  Dance, Explosion, Thunderous Charge, Heavenseeker, Darkseeker) fire **a few dozen times
  across ~200 games** — i.e. almost never. Realm's whole finisher plan (Nuke) fired 14
  times total.

**So which comps are scored at their FLOOR, not their ceiling?** Any comp whose power lives
in rage or setup: **King** (command scaling), **baseline & any Magician comp** (Nuke),
**Fat Squad** (all four rage payoffs are passive → 0 in the "arts" column but suppressed by
the 4.9% raging rate), **Juggernaut/Clod/Virus/Angel** shells (Self Destruct / Thunderous
Charge / Explosion / Heavenseeker). Comps that win on **always-on** value — Wall's
Guardian + heal auras, Realm's team magic buff — are measured much closer to their true
strength. That asymmetry is the single biggest reason to treat the ladder as *directional*,
not final: the brute always-on comps are flattered, the rage/combo comps are undersold.

### Caveats on reading these numbers
- **Both sides are the same greedy CPU.** No setup sequencing, no rage baiting, limited
  positioning — see the quantified gap above.
- **Draws are excluded from win%.** Realm's 76.3% is over 135 decided games; its 105 draws
  are a finding in their own right (a comp that can't finish is a soft balance problem too).
- **The honest use of this data:** trust it for the *always-on* comparisons (Guardian vs
  Deathly Aura vs Realm, wall durability, DEF-bypass) and the draw/stall diagnostics; treat
  every rage-or-setup verdict as a lower bound. For those, the resolver-level capability
  read in the unit notes above is the better guide until a rage-seeking driver exists.
