# Tactical Arena — Strongest Team Comps (balance analysis)

A grounded read of the current roster for balancing. Every claim here is traced to
the actual unit data (`src/core/units/*.js`) and the resolvers
(`rules/combat.js`, `rules/damage.js`, `core/unitCatalog.js`) as of 2026-07-17.
Squads are **4 units**, duplicates allowed in casual/hot-seat, board 13×13 or 15×15,
RAGE auto-triggers at **≤5 HP**.

## Balance changelog

- **2026-07-17 — post-doc unit tuning pass:** **Paladin** now gains +1 DEF while standing
  on white tiles, making Lightseeker footing defensive as well as offensive. **Monk's
  Front Kick** now converts blocked crit knockback into stuns (edge stuns the target; an
  allied body blocking the shove stuns that ally). **Little Brother** got a stronger
  Rechargeable Battery (`+3 → +5` MP from magic damage) and Flamethrower now leaves
  permanent fire under enemies it hits. **Clod's Quake** refunds on 3+ targets instead of
  requiring the whole enemy team. **Father Time's Age** is now explicitly range 4.
  **Riot Cop** still blanks non-critical magic while defending, but critical magic now gets
  +1 damage through.
- **2026-07-07 — first true-damage nudge (anti-wall):** **Footwork** (Swordsman)
  `2 → 3` true and **Fart** (Fat Knight) `2 → 3` true. Motivated by the sim finding that
  the dedicated true-damage comp couldn't out-pace stacked healers. More true-damage
  sources are planned; the Nemesis passive→aura change is still under consideration.
  **The simulation tables below predate this buff and the later July 17 tuning** — they
  need a re-run to reflect it.
- **King left as-is (by design):** an earlier note floated reducing the King's −10-HP-per-
  ally-fallen. That was reverted — **it is intentional**: the King is a non-combatant whose
  HP *is* a readout of squad cohesion (30 HP ≈ 3 allies × 10). His fragility is the cost of
  the command engine, not a bug to patch. Any King buff should come from elsewhere (base
  HP, command strength, or a small always-on aura), not from softening the fall penalty.

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
| Archer | 24 | 22 | 2 | 5 | 8 | 4 | ranger | ranged |
| Mystic | 23 | 38 | 2 | 5 | 5 | 3 | support | healer/DEF aura |
| Magician | 23 | 40 | 2 | 5 | 6 | 3 | mage | nuker |
| Paladin | 26 | 24 | 3 | 1 | 10 | 5 | melee | bruiser + heal-aura (DEF 6 on white) |
| Necromancer | 23 | 36 | 3 | 5 | 6 | 3 | mage | debuff/summon |
| Sniper | 23 | 18 | 2 | 6 | 8 | 3 | ranger | ranged/pierce |
| Witch Doctor | 24 | 30 | 2 | 4 | 8 | 3 | support | stance-caster |
| Father Time | 25 | 30 | 2 | 5 | 7 | 3 | support | controller/revive |
| Juggernaut | 30 | 5 | 2 | 1 | 8 | 7 | tank | bruiser (STR10/MOV4 @0MP) |
| King | 30 | 0 | 0 | 0 | 0 | 0 | support | non-combatant commander |
| Angel | 24 | 37 | 2 | 5 | 3 | 3 | ranger | support |
| Monk | 26 | 25 | 2 | 1 | 9 | 6 | melee | skirmisher |
| Gargoyle | 30 | 20 | 2 | 1 | 9 | 7 | tank | thorns/immunity |
| Nemesis | 25 | 45 | 3 | 5 | 7 | 2 | mage | **magic amplifier** |
| Virus | 25 | 36 | 3 | 5 | 6 | 3 | mage | contagion |
| Clod | 30 | 20 | 2 | 1 | 9 | 8 | tank | phys-negate |
| Fat Knight | 30 | 20 | 2 | 1 | 10 | 6 | melee | bruiser |
| Fat Wizard | 30 | 35 | 2 | 3 | 7 | 4 | mage | splash caster |
| Fat Cleric | 30 | 35 | 2 | 4 | 7 | 5 | support | healer |
| Fat Bowman | 30 | 25 | 2 | 4 | 7 | 5 | ranger | ranged |
| Miner | 25 | 25 | 2 | 5 | 8 | 4 | ranger | ore economy |
| Big Brother | 30 | 5 | 2 | 3 | 2 | 8 | tank | anti-heal/control |
| Little Brother | 25 | 10 | 2 | 4 | 8 | 6 | ranger | splash/fire artillery |
| Blacksword | 30 | 0 | 3 | 1 | 10 | 6 | melee | dark-tile duelist |
| Ronin | 28 | 20 | 3 | 1 | 10 | 5 | melee | isolation duelist |
| Mother Nature | 25 | 100 | 3 | 6 | 7 | 3 | support | weather commander |
| Summoner | 23 | 100 | 2 | 5 | 6 | 4 | support | ghost tempo |
| Riot Cop | 30 | 0 | 3 | 1 | 8 | 7 | tank | peel/control |
| Treant | 30 | 30 | 2 | 2 | 7 | 6 | tank | sustain/magic ward |

---

## Tier S — the comps I'd watch for over-tuning

> **Added after simulation:** a comp not in my original list — **"Fortress"
> (Gargoyle + Clod + Necromancer + Fat Cleric)** — topped the whole field at **94%** and
> beats all three comps below (Wall 91%, Realm 62%, Contagion 100%). It's a *durable
> magic-reduction grind*: two 30-HP Defend tanks (Clod's Rock Hard negates physical
> outright) behind **Dead Zone (−1 team magic)**, the **Deathly Aura (−1 enemy DEF)**, and
> a healer. The lesson is that the single strongest lever in the roster right now is
> **stacked damage mitigation**, not damage output — DEF-bypass magic (Realm) and
> attrition heals (Wall) both lose to a core that simply refuses to die *and* dampens the
> one thing (magic) that ignores its armor. See the simulation section for the numbers.

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
  **half the damage** — a lifesteal aura attached to a STR-10 body, with +1 DEF while he
  stands on a white tile.
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

**By design, not a flag:** the King eats **−10 HP per ally that falls** — this is
*intentional*, his HP is a readout of squad cohesion (he's a non-combatant, 30 HP ≈ 3
allies). He also must act first every turn (mis-sequencing can soft-lock) and **doesn't
sustain victory alone**. The command buff getting *stronger the more of your team is dying*
is a deliberate comeback mechanic. High skill ceiling, fragile floor — if he's buffed, it
should come from base HP / command strength / an always-on aura, **not** from softening the
fall penalty (that's the whole identity). The rage-scaling is still the thing to model for
balance.

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
+2 STR/+1 range with light-tile bonus and +1 DEF on white tiles. Mystic's Guardian + Pray
sustains. Nothing
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
  (Quake AoE with refund on 3+ targets, Stone Throw control, Brick House +1-DEF aura /
  +1 STR per sheltered ally, Thunderous Charge) — but the all-or-nothing physical negation
  is a swingy design lever worth watching.
- **Juggernaut / Self Destruct** — 10 true AoE r4, guaranteed, only "cost" is the unit
  itself; a very efficient trade/finisher. Bruiser Mode (STR 10/MOVE 4 at 0 MP) means
  it *wants* to be empty.
- **Witch Doctor / Misfortune** — a global ×2 status multiplier on one cheap dance is
  the strongest status enabler; watch it with any status comp.
- **Angel** — a *specialist*, not a weak ranger (correcting an earlier shallow read).
  Its basic attack deals **magic that scales with effective STR and ignores DEF**, so the
  low base STR (3) is misleading: it *out-damages physical rangers against armor* (3 into
  a DEF-8 Clod, where a STR-8 Swordsman does 1) and it grows with **every** STR source —
  King's Strike, Fire Dance, its own +3 rage, and Nemesis's team +1 magic all stack onto
  it. Pair that with **full status immunity** (Holy Being — a hard anti-Contagion anchor,
  see the counterplay list), Inner Strength ramping crit-and-blind as it drops, and ally
  utility (Anoint +range, Elevate / Heavenseeker white-tile heal+damage). Judge it as
  anti-armor support, not by raw STR — it wasn't tested in the sim and shouldn't be
  flagged for a buff on the "STR 3 = trivial" reasoning.
- **Monk** — Front Kick now has real impact control: a crit knockback that hits the board
  edge stuns the target, and a shove blocked by one of the target's allies stuns that ally.
  That makes his permanent move-and-ART more threatening because he can choose the angle
  before kicking.
- **Little Brother** — Rechargeable Battery now restores **5 MP per magic hit**, enough to
  pay for Cannon Fire or Flamethrower immediately. Flamethrower also leaves permanent fire,
  so his cone is now terrain pressure as well as true damage.
- **Riot Cop** — still a premium peeler, but Riot Shield is no longer absolute against
  critical magic while defending: non-critical magic is blanked, critical magic gets +1
  through. The ranged-basic reduction also no longer floors damage at 0.
- **Sniper** — excellent poke (range 6, pierces walls *and* bodies, min-2 floor) but a
  small MP pool (18) and no team synergy; a solo carry rather than a comp piece.

## Counterplay axes (so nerfs target the right thing)

- **True damage** ignores DEF *and* Defend (Volley, Footwork/Stumble, Time Steal, Fart,
  Flight, Flamethrower, Poison Tick, Juggernaut/Virus rage blasts, Clod's Thunderous
  Charge) — the theoretical answer to a wall. **But the sim showed the theory doesn't carry:** the
  dedicated true-damage comp (`truedmg`) lost to Wall **96%**, because the *throughput* of
  the CPU-usable true sources is far below what three stacked healers repair each turn. The
  practical wall-breaker turned out to be **out-tanking + magic reduction** (Fortress),
  not chip true damage. **First nudge applied (2026-07-07): Footwork and Fart both `2 → 3`
  true** — a small down-payment on this; more true-damage sources are planned. Re-sim to
  see whether it moves `truedmg` vs Wall.
- **Silence** neuters ART-dependent comps (the whole Realm Stack) — but Nemesis and
  Mystic are silence-immune, which is exactly why they anchor those comps.
- **Status immunity** (Paladin, Angel, Gargoyle, King, Monk-vs-blind) hard-counters the
  Contagion Lock; **cleanse** (Mystic Purify, Fat Cleric Cleanse) softens it.

---

## Simulation results (empirical backing)

> ⚠ **These tables predate the 2026-07-07 Footwork/Fart buff and the 2026-07-17 post-doc
> tuning pass** (see the changelog up top). The comps that use those arts — `classic`,
> `baseline`, `king`, `truedmg`, `fatsquad`, and Little Brother / Paladin shells — should
> now perform somewhat differently than shown; re-run `node scripts/comp-sim.mjs --seeds 12`
> to refresh before drawing new conclusions.

The comps below were run head-to-head through the **real reducer + real CPU** — no
synthetic model. `scripts/comp-sim.mjs` builds each match with `createMatchState` (same
coin flip as a live game) and lets `chooseActivation` drive both sides, replaying every
command through `applyCommand`. **13 comps, full round-robin, 12 seeds × both sides = 24
games/pairing (264 games per comp)** at Normal difficulty on 13×13 (seeds played both ways
to cancel spawn/first-turn bias). Reproduce with `node scripts/comp-sim.mjs --seeds 12`.

**The comps** (the field was deliberately widened past the original five to include the
true default squad and several purpose-built counters):

| comp | squad | intent |
|---|---|---|
| realm | nemesis, magician, fat-wizard, necromancer | all-magic DEF-bypass |
| wall | mystic, fat-cleric, paladin, gargoyle | attrition + heals |
| contagion | virus, witch-doctor, necromancer, archer | status lock |
| fatsquad | fat-knight/wizard/cleric/bowman | designed synergy |
| king | king, fat-knight, swordsman, paladin | rage-scaling commands |
| **classic** | swordsman, archer, mystic, magician | the true default squad |
| baseline | magician, mystic, swordsman, paladin | near-classic (archer→paladin) |
| immune | paladin, angel, gargoyle, mystic | status-immune → anti-contagion |
| truedmg | father-time, swordsman, fat-knight, paladin | true damage → anti-wall |
| fortress | gargoyle, clod, necromancer, fat-cleric | Dead-Zone tanks → anti-realm grind |
| poke | sniper, fat-bowman, angel, mystic | long-range kite |
| hybrid | nemesis, mystic, father-time, paladin | stack team multipliers on one carry |

**Overall ranking (decided games; 264 games/comp):**

| rank | comp | win% | W | L | draws |
|---:|---|---:|---:|---:|---:|
| 1 | **fortress** | **94.0%** | 235 | 15 | 14 |
| 2 | realm | 83.1% | 133 | 27 | **104** |
| 3 | hybrid | 76.7% | 132 | 40 | **92** |
| 4 | wall | 74.6% | 182 | 62 | 20 |
| 5 | fatsquad | 60.6% | 146 | 95 | 23 |
| 6 | contagion | 57.4% | 140 | 104 | 20 |
| 7 | immune | 52.0% | 117 | 108 | 39 |
| 8 | truedmg | 34.2% | 83 | 160 | 21 |
| 9 | baseline | 30.4% | 75 | 172 | 17 |
| 10 | king | 25.4% | 64 | 188 | 12 |
| 11 | poke | 22.9% | 53 | 178 | 33 |
| 12 | **classic** | **8.0%** | 20 | 231 | 13 |

**Vs the supers — win% for the ROW comp against each (>50% = beats it; draws in parens):**

| comp | vs wall | vs realm | vs contagion |
|---|---:|---:|---:|
| fortress | **91%** | **62%** (11d) | **100%** |
| hybrid | **82%** | 20% (14d) | **65%** |
| realm | **71%** | — | **55%** (13d) |
| immune | 5% | 0% | **82%** |
| fatsquad | 50% | 23% | 22% |
| truedmg | 4% | 6% | 17% |
| poke | 0% | 15% | 25% |
| king | 4% | 6% | 8% |
| baseline | 0% | 0% | 4% |
| classic | 0% | 0% | 4% |

### Headline findings from the wider pool

- **Widening the pool found a comp that beats all three "supers": `fortress` (94%).**
  Two 30-HP Defend tanks (Gargoyle DEF 7 + Clod DEF 8, Rock Hard negating physical) behind
  **Dead Zone (−1 team magic)**, the **Deathly Aura (−1 enemy DEF)**, and a Fat Cleric
  healer. It beats Wall **91%** (out-walls the wall), Realm **62%** (Dead Zone + Defend
  halve the magic while the tanks refuse to die and Realm stalls on MP), and Contagion
  **100%**. The original "supers" were an artifact of a shallow pool — the real apex is a
  *durable magic-reduction grind*, and it says the strongest lever in the game is stacked
  **damage mitigation**, not damage output.
- **Correction to my earlier writeup: Wall BEATS Contagion (~100%), not the reverse.** I
  had this inverted. The reason is decisive and mechanical: the wall is **stuffed with
  status counters** — Paladin and Gargoyle are fully status-immune, Mystic (Purify) and Fat
  Cleric (Cleanse) strip what lands. The contagion lock does almost nothing to it. The
  general rule holds (**status immunity + cleanse hard-counter Contagion**) — I just
  attributed the 85% to the wrong side.
- **The true default squad `classic` is DEAD LAST (8%).** Swordsman/Archer/Mystic/Magician
  beats almost nothing in the current roster (0% vs wall/realm/fortress, 4% vs contagion).
  This is a stark **power-creep** signal: the rebuild-original units have outrun the legacy
  four. And it is *not* a piloting excuse (see below) — classic had the **highest** rage
  usage of any comp and still lost 92% of its games.
- **Realm is #2 but still can't close** — 104 draws of 264 (39%). `hybrid` (a leaner
  Nemesis buff-stack) is #3 and inherits the same problem (92 draws). Both win the damage
  race and stall out; Nemesis comps are boom-or-draw.
- **The purpose-built counters split:** `immune` worked as designed **vs Contagion (82%)**
  but is a narrow specialist (loses to everything durable). `truedmg` **failed as an
  anti-wall (4%)** — true damage breaks walls *in theory*, but the actual CPU-usable
  true-damage throughput (Footwork, Fart, Time Steal aura) is far too low to out-pace three
  healers. `poke` (kite) is simply too low-HP-throughput (23%). *(Follow-up: Footwork/Fart
  buffed `2 → 3` on 2026-07-07 as a first step — this table predates it.)*

### The piloting caveat, quantified (still applies)

The CPU **never seeks rage** — it only reaches ≤5 HP by taking damage and never sets up the
payoffs. The sim measures how large that blind spot is (this 12-seed run):

| comp | unit-turns | **raging%** | rage-locked arts fired | King scaled cmds |
|---|---:|---:|---:|---:|
| classic | 8,064 | **7.9%** | 47 | — |
| baseline | 8,805 | 6.3% | 69 | — |
| truedmg | 7,994 | 6.5% | 103 | — |
| immune | 10,643 | 5.9% | 97 | — |
| king | 7,926 | 5.2% | 32 | 388 |
| wall | 12,617 | 4.5% | 16 | — |
| fatsquad | 9,958 | 4.3% | 0 | — |
| contagion | 9,529 | 3.9% | 37 | — |
| fortress | 11,130 | **2.9%** | 13 | — |
| hybrid | 17,500 | 0.7% | 27 | — |
| realm | 30,459 | 0.4% | 23 | — |

Units act while raging **0.4%–8% of the time**, and rage-locked ultimates (Nuke, Self
Destruct, Explosion, …) fire a few dozen times across hundreds of games — i.e. the sim
scores every rage-dependent comp near its **floor**. Two readings that matter for trust:

- **`classic` being worst is a *genuine* power gap, not a floor artifact** — it had the
  *most* rage online of any comp and still finished last. Same for `truedmg`/`baseline`,
  which fire the most rage-arts and still sit near the bottom.
- **`fortress`'s dominance is trustworthy, not inflated** — it has the *lowest* rage usage
  (2.9%, tanks rarely dip to 5 HP) yet tops the ladder. It wins purely on **always-on**
  value (tank DEF + Dead Zone + Deathly Aura + heals), so 94% is close to its real strength,
  not a number propped up by rage the CPU can't reach.

The comps still undersold by the CPU are the rage/setup ones: King (structural problems
aside), any Magician/Nuke shell, and the Juggernaut/Clod/Virus/Angel finisher units. Read
those as lower bounds; read the always-on comps (fortress, wall, realm) as close to true.

### Caveats
- **Both sides are the same greedy CPU** — no setup sequencing, no rage baiting, limited
  positioning. Rankings are stable across Normal/Hard, but the rage floor applies to both.
- **Draws are excluded from win%** — Realm's and hybrid's high draw counts are themselves a
  finding (comps that can't finish are a soft balance problem too).
- **Head-to-head cells are 24 games** (±~10%); trust the overall column and the clear gaps,
  not 1–2 point differences.
