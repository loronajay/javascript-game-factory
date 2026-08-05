# Tactical Arena — Synergies, Counters, and Squads

What works *together* and what beats *what*, measured rather than reasoned about. Read
`BALANCE.md` first for how strong each unit is on its own and what the measurement can and
cannot see; this file is entirely about interactions.

---

## How synergy and counters are measured

Both are **residuals against the additive model**, and that framing is the whole point.

`BALANCE.md` fits every unit a rating and predicts a match from the sum of the two squads'
ratings. A pair with no interaction produces matches that land right on that prediction. So:

- **Synergy** = how much better a squad does than predicted *when two units are drafted
  together*. If A and B are both strong, the model already expects the squad to win — a
  synergy score is what they achieve **beyond** that. This is the real definition of the
  word, and it is why a pair of two S-tier units usually scores near zero here: they are
  good, but they are not more than the sum of their parts.
- **Counter** = how much better A's side does than predicted *when B is across the board*.

An effect is reported only when it clears |z| ≥ 3. Below that it is sampling scatter, and
the old docs' habit of narrating any two units that looked thematic together is exactly
what that bar exists to stop.

Effects are in **percentage points of win rate**. A `+4.0 pts` synergy means the pair wins
about four points more often than their individual ratings predict.

---

## Strongest synergies

<!-- BEGIN GENERATED: synergy -->
| Pair | Effect on win rate | z | Games |
| --- | ---: | ---: | ---: |
| Fat Knight + Swordsman | +11.5 pts | 5.7 | 422 |
| Magician + Swordsman | +8.1 pts | 4.4 | 434 |
| Big Brother + Little Brother | +8.0 pts | 3.6 | 396 |
| King + Necromancer | +7.2 pts | 3.8 | 404 |
| Nemesis + Swordsman | +6.9 pts | 3.1 | 398 |
| Big Brother + Clod | +6.8 pts | 3.1 | 398 |
| Juggernaut + Necromancer | +5.9 pts | 3.1 | 464 |
<!-- END GENERATED: synergy -->

### Reading the synergy table

**Only 12 pairs out of 435 clear the bar.** That is the most important thing on this page.
Most unit combinations do exactly what their individual ratings predict, and the old
practice of narrating any two units that sounded thematically linked was describing noise.

The ones that survive fall into three groups:

- **Rescue pairs.** `Fat Knight + Swordsman` (+11.5), `Magician + Swordsman` (+8.1), and
  `Nemesis + Swordsman` (+6.9) are the three strongest measured synergies, and all three
  contain the Swordsman. This is not a Swordsman combo package — it is his rating being so
  low (`-1.28`) that *any* squad containing him beats the additive prediction. A partner who
  keeps the fight away from him looks like synergy. **Judgment:** treat these as evidence
  about the Swordsman, not as draft advice.
- **Real mechanical pairs.** `Big Brother + Little Brother` (+8.0) is the sibling gimmick
  paying off exactly as designed — Pissing Contest grants Little Brother +1 range whenever a
  Big Brother is alive. `Big Brother + Clod` (+6.8) stacks two displacement-heavy bodies in
  front of an armor wall. `Juggernaut + Necromancer` (+5.9) pairs a healing lockout with
  magic mitigation, so the enemy can neither out-heal nor out-cast it.
- **Command pairs.** `King + Necromancer` (+7.2) is the strongest non-Swordsman synergy.
  The King's commands scale with raging allies and the Necromancer's Ghouls give the squad
  bodies to lose without losing units — the King's HP cost only triggers on a *fallen ally*,
  and summons dying does not pay that price.

## Anti-synergies

Pairs that do measurably *worse* together than apart — usually competing for the same
tile, the same target, or the same global rule.

<!-- BEGIN GENERATED: antisynergy -->
| Pair | Effect on win rate | z | Games |
| --- | ---: | ---: | ---: |
| King + Riot Cop | -9.4 pts | -4.5 | 430 |
| Blacksword + Clod | -6.9 pts | -3.3 | 428 |
| Big Brother + Mystic | -6.2 pts | -3.1 | 448 |
| Fat Cleric + Mother Nature | -5.8 pts | -3.1 | 432 |
| Juggernaut + Magician | -5.6 pts | -3.0 | 480 |
<!-- END GENERATED: antisynergy -->

---

## Counters

Row unit beats column unit by more than their ratings predict. Because squads are sampled
at random, this is the honest blind-pick counter matrix: it measures what actually happens
when the two are on opposite sides, not what a kit description implies should happen.

The measured counters line up with the mechanics far more cleanly than the synergies do,
which is itself worth knowing — **counters in this game are real and synergies mostly are
not**:

- **`Virus vs Riot Cop` (+8.0), `Virus vs Clod` (+6.9), `Virus vs Big Brother` (+6.5).**
  Virus counters armor as a class. Poison and blind ignore DEF entirely, and Spread turns
  one landed status into three. Every tank in the roster is a Virus target.
- **`Treant vs Virus` (+6.8)** closes that loop — Treant has poison immunity, so the
  contagion engine has nothing to grip.
- **`Nemesis vs Paladin` (+7.4).** The Paladin is status-immune and armored, and Nemesis
  simply does not care: his team-wide +1 magic damage bypasses DEF, and Chosen does not stop
  damage.
- **`Riot Cop vs Juggernaut` (+7.3)** and **`Summoner vs Riot Cop` (+9.5)** form a rock-
  paper-scissors triangle with `Virus vs Riot Cop`. The Riot Cop's finite USES economy runs
  dry against a Summoner who replaces his own bodies for free.
- **`Necromancer vs Fat Knight` (+6.6).** Battle Trauma makes the Fat Knight take +1 magic
  damage, and the Necromancer is a magic unit with a permanent −1 DEF aura. The Fat Knight's
  anti-crit trade is exactly the wrong trade against him.

<!-- BEGIN GENERATED: counters -->
| Pair | Effect on win rate | z | Games |
| --- | ---: | ---: | ---: |
| Summoner vs Riot Cop | +9.5 pts | 4.8 | 516 |
| Virus vs Riot Cop | +8.0 pts | 4.5 | 570 |
| Big Brother vs Blacksword | +7.9 pts | 4.3 | 536 |
| Fat Knight vs Treant | +7.9 pts | 4.6 | 570 |
| Nemesis vs Paladin | +7.4 pts | 4.1 | 562 |
| Riot Cop vs Juggernaut | +7.3 pts | 4.0 | 574 |
| Virus vs Clod | +6.9 pts | 3.9 | 590 |
| Treant vs Virus | +6.8 pts | 3.7 | 558 |
| Necromancer vs Fat Knight | +6.6 pts | 4.0 | 606 |
| Virus vs Big Brother | +6.5 pts | 3.6 | 538 |
| Summoner vs Nemesis | +6.4 pts | 3.7 | 612 |
| King vs Nemesis | +6.0 pts | 3.3 | 556 |
| Riot Cop vs Clod | +6.0 pts | 3.3 | 552 |
| Nemesis vs Virus | +6.0 pts | 3.5 | 588 |
| Mother Nature vs Virus | +5.9 pts | 3.4 | 588 |
| Magician vs Virus | +5.7 pts | 3.1 | 552 |
| Fat Bowman vs Swordsman | +5.7 pts | 3.7 | 572 |
| Mystic vs Summoner | +5.7 pts | 3.1 | 592 |
| Treant vs Mother Nature | +5.5 pts | 3.3 | 546 |
| Monk vs Treant | +5.5 pts | 3.4 | 626 |
<!-- END GENERATED: counters -->

---

## Draft rules that fall out of the mechanics

**Extracted**, not measured — these follow from the engine and hold regardless of what any
simulation says.

- **Duplicates are near-worthless for aura units.** Team auras dedup by `stackKey`
  (`unitCatalog.js`), so a second Mystic, Nemesis, or Necromancer contributes nothing to
  the aura it already applied. Duplicates are legal in casual and hot-seat; they are
  mechanically taxed.
- **Damage type is the first draft question.** Physical is `max(1, STR − DEF)` and dies
  into armor; magic ignores DEF; true ignores DEF *and* Defend. A squad with only physical
  damage has no answer to a braced Clod, who negates physical damage entirely while
  Defending.
- **True damage is not rare.** 17 of 30 units have access to it in some form. The old docs
  treated it as a scarce anti-wall resource handed out in ones and twos and built a whole
  comp recommendation around that scarcity; the extracted index says otherwise.
- **MP never regenerates.** Only the Magician has passive MP recovery (Magic Pipe, 10 MP
  every 3 non-casting activations). Every other refuel is a private economy — ore, HP
  costs, Study, Snack Break, Growth, Spirit Dance, Rechargeable Battery. "How does this
  squad refuel" is a real draft constraint, not flavour.
- **Global rules editors cut both ways.** King commands, Mother Nature weather, Witch
  Doctor stances, and Big Brother polarity change the game for *both* teams. Drafting one
  is a commitment to building around the rule you are turning on.
- **An ART normally eats the whole activation.** The exceptions are therefore worth more
  than their numbers suggest: permanent move-and-ART (Monk), rage move-and-ART (Archer,
  Mystic, Sniper, Summoner), and bonus-action groups (Paladin's seekers, Angel's
  Heavenseeker, Witch Doctor's dances).

---

## Reproducing this

Same pipeline as `BALANCE.md`; the pair effects come out of the same `analysis.json`:

```powershell
npm run sim -- --games 16000 --difficulty hard
npm run balance
node scripts/balance-tables.mjs
```

To verify a specific shortlist of squads head-to-head instead of sampling randomly:

```powershell
npm run sim -- --comps balance-data/my-comps.json --seeds 40 --out balance-data/comps.json
```

where the file maps a name to a four-unit squad.
