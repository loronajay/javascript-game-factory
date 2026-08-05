# Tactical Arena — Balance & Tier List

The measured strength of all 30 draftable units, fitted from matches played through the
real engine. This file replaces the old `UNIT_TIER_LIST.md`, `UNIT_TIER_LIST_REASONING.md`,
`TEAM_COMPS.md`, and `TEAM_COMP_ANALYSIS.md`.

**Doc set.** `UNIT_KIT_REFERENCE.generated.md` is the numbers substrate (extracted from
`UNIT_TYPES`, never hand-edited). `UNIT_ARCHETYPES.md` is the design read — what each unit
is *for*. `MATCHUPS.md` is synergies and counters. This file is *how strong*.

---

## How to read this, and what it is not

Every number below came from one of exactly three places, and each is labelled:

- **Extracted** — read directly out of the engine by `scripts/kit-audit.mjs`. Cannot drift.
- **Measured** — produced by `scripts/roster-sim.mjs` playing real matches, then fitted by
  `scripts/balance-report.mjs`. Reproducible from a seed.
- **Judgment** — a human read, explicitly marked as such, usually explaining *why* a
  measured number is or isn't trustworthy for a given unit.

The old docs mixed all three without saying which was which, and the tier list in
particular asserted an ordering that had never been tested against anything. That is the
specific problem this rewrite exists to fix.

### The measurement

<!-- BEGIN GENERATED: run-meta -->
- **Matches:** 16,000 (15,736 decided, 98.3%)
- **CPU difficulty:** hard
- **Board:** 13×13, 1v1, 4-unit squads drawn at random from all 30 draftable units
- **Both orientations played:** every sampled pairing is played twice, swapping which side spawns first, so corner and first-turn advantage cancel
- **Engine:** real `createMatchState` → `chooseActivation` → `applyCommand`; no synthetic damage model
- **Regenerate:** `npm run sim -- --games 16000 --difficulty hard` then `npm run balance`
<!-- END GENERATED: run-meta -->

Squads are sampled at random from the whole roster rather than from a shortlist of comps
somebody already believed in. That matters: the previous analysis played 13 hand-picked
squads against each other, which can only ever rank the units that were already on the
shortlist.

### Why a fitted rating instead of a win rate

A unit's raw win rate is contaminated by whoever got drafted beside it. A strong unit
sampled next to three weak ones posts a bad record through no fault of its own.

So each unit gets a **rating**: squad strength is modelled as the sum of its four units'
ratings, and `P(win) = sigmoid(strengthA − strengthB)`. Fitting that against every match
separates a unit's own contribution from its teammates'. Rating **0 is roster-average**.
The **squad win%** column converts it to something readable: the win rate a squad is
predicted to post when this unit replaces an average one and the other three are average.

The estimator is itself tested. `tests/balance-estimator.test.js` generates matches from
known true ratings and asserts the fit recovers them — both the ordering and the magnitude.
On the validation set it recovers true ratings at r = 0.9985 with a regression slope of
0.98, so the ordering is trustworthy and the magnitudes are not systematically shrunk.

### What this measurement cannot see — read before quoting a tier

The sim is two CPUs playing each other. That is a real, complete, rules-legal game of
Tactical Arena, but it is not a skilled human game, and the gap is not uniform across the
roster. It systematically **under-rates** four kinds of unit:

1. **Rage payoffs.** The CPU never *seeks* RAGE — it only arrives there by taking damage,
   and it will happily heal an ally out of the best mode that ally has. Measured RAGE
   uptime is a few percent of unit-turns. Any unit whose ceiling is a rage ART (Magician's
   Nuke, Blacksword's Banish, Virus's Explosion, Ronin's Final Draw, Fat Bowman's
   Desperation Shot) is being scored near its floor.
2. **Multi-turn setup.** Nothing in the CPU sequences a combo across turns. Blacksword's
   Ether → crit → blind → Tick chain, or holding a Witch Doctor dance for the turn it
   matters, simply never happens.
3. **Positional discipline.** Units whose kit is a standing instruction about where the
   squad stands — Clod's phalanx, Paladin's healing radius, Ronin's isolation bonus — get
   whatever the CPU's positioning happens to give them.
4. **Draft context.** Squads are random, so every unit is measured as a **blind pick**. A
   unit that exists to counter something specific is measured against the field, not
   against its target. `MATCHUPS.md` is where that value shows up instead.

It **over-rates** units that are strong with no plan at all: always-on auras, passive
damage, and anything that works while standing still.

Judgment calls in this document are almost always me saying which side of that gap a unit
falls on. They are marked **Judgment** every time.

---

## Tiers

<!-- BEGIN GENERATED: tier-summary -->
- **S** *(format-defining)* — Nemesis, Necromancer, Gargoyle, Clod, Blacksword
- **A** *(strong in most squads)* — Paladin, Virus, King, Riot Cop
- **B** *(solid role-players)* — Fat Wizard, Juggernaut, Fat Cleric, Fat Bowman, Little Brother, Monk, Fat Knight, Mystic, Summoner
- **C** *(conditional or demanding)* — Ronin, Witch Doctor, Archer, Father Time, Treant, Miner, Big Brother, Angel
- **D** *(hardest to justify)* — Sniper, Magician, Mother Nature, Swordsman
<!-- END GENERATED: tier-summary -->

Tier cuts are made on the fitted rating. **The boundaries are softer than the letters make
them look** — a unit sitting within about two standard errors of a cut could legitimately
belong on either side, and the ± column is there so you can see which ones those are.
Treat neighbouring tiers as overlapping bands, not as a ranking.

<!-- BEGIN GENERATED: tier-table -->
| Tier | Unit | Rating | ± | Squad win% | Raw win% | Games |
| :---: | --- | ---: | ---: | ---: | ---: | ---: |
| S | Nemesis | +1.25 | 0.04 | 77.6% | 70.4% | 4152 |
| S | Necromancer | +0.87 | 0.04 | 70.5% | 64.5% | 4300 |
| S | Gargoyle | +0.74 | 0.04 | 67.6% | 63.0% | 4268 |
| S | Clod | +0.65 | 0.04 | 65.8% | 61.4% | 4258 |
| S | Blacksword | +0.63 | 0.04 | 65.2% | 60.6% | 4236 |
| A | Paladin | +0.55 | 0.04 | 63.3% | 60.2% | 4266 |
| A | Virus | +0.43 | 0.04 | 60.5% | 56.9% | 4290 |
| A | King | +0.29 | 0.04 | 57.1% | 54.3% | 4202 |
| A | Riot Cop | +0.25 | 0.04 | 56.3% | 53.8% | 4158 |
| B | Fat Wizard | +0.11 | 0.03 | 52.8% | 51.0% | 4526 |
| B | Juggernaut | +0.09 | 0.04 | 52.4% | 51.5% | 4226 |
| B | Fat Cleric | +0.08 | 0.04 | 52.0% | 51.9% | 4242 |
| B | Fat Bowman | +0.07 | 0.04 | 51.7% | 51.4% | 4244 |
| B | Little Brother | +0.01 | 0.04 | 50.2% | 50.8% | 4166 |
| B | Monk | -0.01 | 0.03 | 49.8% | 49.6% | 4416 |
| B | Fat Knight | -0.06 | 0.04 | 48.6% | 49.2% | 4262 |
| B | Mystic | -0.09 | 0.04 | 47.8% | 48.0% | 4360 |
| B | Summoner | -0.10 | 0.04 | 47.6% | 48.1% | 4344 |
| C | Ronin | -0.14 | 0.04 | 46.4% | 47.8% | 4320 |
| C | Witch Doctor | -0.21 | 0.04 | 44.7% | 47.2% | 4290 |
| C | Archer | -0.22 | 0.04 | 44.6% | 44.9% | 4186 |
| C | Father Time | -0.22 | 0.04 | 44.4% | 45.7% | 4330 |
| C | Treant | -0.36 | 0.04 | 41.1% | 44.8% | 4362 |
| C | Miner | -0.36 | 0.04 | 41.1% | 43.9% | 4306 |
| C | Big Brother | -0.41 | 0.04 | 39.8% | 42.9% | 4072 |
| C | Angel | -0.48 | 0.04 | 38.2% | 42.3% | 4316 |
| D | Sniper | -0.59 | 0.04 | 35.6% | 39.5% | 4188 |
| D | Magician | -0.71 | 0.04 | 33.0% | 38.2% | 4302 |
| D | Mother Nature | -0.76 | 0.04 | 31.8% | 37.0% | 4288 |
| D | Swordsman | -1.28 | 0.04 | 21.7% | 28.7% | 4124 |
<!-- END GENERATED: tier-table -->

---

## Placements

One note per unit: what the measurement says, and — where it matters — why it should or
should not be believed. Kits are described in `UNIT_ARCHETYPES.md`; this is only about
strength. Ratings carry ±0.04, so differences under about 0.1 are not real.

### S — format-defining

#### Nemesis
`+1.25` · the largest gap in the roster. Nothing else is close, and it is not his damage:
17/game is mid-pack and he kills 0.57/game. Realm of Magic — team-wide +1 magic damage and
−1 MP on every ART — is simply the best always-on effect in the game, and it works while he
does nothing in particular. He also has the worst survival of any top unit (21%), which the
rating already accounts for. **Judgment:** this is a genuine outlier, and the one placement
I would act on. An aura that good on a body the enemy must kill anyway is a lot of free
value; DEF 2 is supposed to be the cost, but at 21% survival he is clearly still paying it
and winning anyway.

#### Necromancer
`+0.87` · 31 damage and 0.92 kills a game at 42% survival — the best damage-to-durability
ratio among the casters. Wither (35% of activations) and Summon Ghoul (21%) do the work,
and the Ghouls' output now credits him. Dead Zone and Deathly Aura are the kind of
always-on effect the sim reads accurately, so this placement is trustworthy.

#### Gargoyle
`+0.74` · 40 damage, 1.24 kills, 52% survival — he is the most complete body in the game
and the numbers agree from every direction. Splits evenly between basic attacks, Defend,
Flight, and Pyroclasm, meaning he has no dead turns. Status immunity plus displacement
immunity means most control drafted against him does nothing.

#### Clod
`+0.65` · the highest survival in the roster (58%) on 40 damage. Spends 40% of activations
Defending, which is exactly the point: Rock Hard negates physical damage entirely while
braced and refunds MP when it is attacked. **Judgment:** the sim likely *under*-rates the
phalanx — Brick House pays +1 STR per sheltered ally and the CPU does not deliberately
form up around him.

#### Blacksword
`+0.63` · 36 damage and 1.26 kills, but only 28% survival — he trades hard and dies. Note
he pays HP for every ART, so a low survival number is partly self-inflicted by design.
**Judgment:** under-rated. His Ether → crit → blind → Tick chain requires multi-turn setup
the CPU never performs, and Banish (kill everything on a dark tile) is rage-locked at 4.5%
uptime. This is close to his floor, and his floor is already S.

### A — strong in most squads

#### Paladin
`+0.55` · 36 damage plus 7 healing a game, 37% survival. Lightseeker is 48% of his
activations — the bonus-action true-damage pulse is as strong as it looks, because it costs
no action. Hand of Life's healing is a standing instruction about where the squad stands,
so the CPU captures only part of it.

#### Virus
`+0.43` · Cough is 53% of his activations and Spread does the rest for free. 25% survival
is poor, and Explosion (2%) and Poison Tick (3%) barely fire. **Judgment:** clearly
under-rated. His whole design is a status *multiplier* that pays off over a long game, and
his best line — poison the squad, then Explosion — is a rage ART the CPU never engineers.

#### King
`+0.29` · 11 activations a game, zero damage, zero kills, 50% survival. He is pure command
throughput: Strike! 45%, Higher Ground! 34%, Hold! 17%. Worth noting he rose from **C to
A** versus the old hand-written list, which predates the July 25 buff giving every survivor
a permanent +2 STR per fallen ally. That buff is the placement. **Judgment:** a rare case
where the CPU plays a unit *well*, because his whole kit is one free decision a turn with no
positioning attached.

#### Riot Cop
`+0.25` · 14.1 activations a game — the most in the roster — at 49% survival, on a finite
USES economy rather than MP. Stun Gun (42%) and Smoke Bomb (29%) are relentless. He is a
peeler whose value shows up as the enemy not getting to act.

### B — solid role-players

#### Fat Wizard
`+0.11` · 26 damage and 9 healing at 40% survival, the most balanced hybrid line in the
roster. Clumsy means his misses still splash, so his floor is unusually high — which is
precisely the sort of thing a simulation measures well.

#### Juggernaut
`+0.09` · 34 damage and 1.16 kills, third-highest damage in the game, dragged to the middle
by everything else. Null Zone's healing lockout is a hard counter that random squads rarely
punish; against a healer squad he is far better than this.

#### Fat Cleric
`+0.08` · 23 healing a game, the most in the roster, on the most durable healer body (39%
survival). The permanent-Defend RAGE buff is live at 6.1% uptime. A dependable pick whose
value is almost entirely denial of the enemy's damage.

#### Fat Bowman
`+0.07` · 29 damage from range at 35% survival. Planted rewards never moving, which is
close to what the CPU does with her anyway, so this number is honest.

#### Little Brother
`+0.01` · 31 damage and 1.02 kills — real output for a B unit. Pairs measurably with Big
Brother (**+8 pts**, one of the strongest synergies measured), which is the sibling gimmick
paying off in data.

#### Monk
`-0.01` · 28 damage but only 24% survival and 7.4 activations — he dies early. Front Kick
now fires (3% of activations) after the fix, and Protect another 3%. **Judgment:** still
under-rated. Shadow Step's permanent move-and-ART is the strongest action-economy passive
in the game and the CPU converts almost none of it, spending 59% of his turns on plain
basic attacks.

#### Fat Knight
`-0.06` · 29 damage, but the worst damage-taken figure in the roster (30/game) and 22%
survival — Battle Trauma trades crit protection for magic vulnerability and the field is
full of magic. Fart is reachable post-fix but fires only 2% of the time. Best measured
synergy in the whole run: **Swordsman +12 pts**.

#### Mystic
`-0.09` · 24 healing and a team-wide +1 DEF, on 8 damage. She fell from **S to B** versus
the old list. **Judgment:** part of that fall is real — a pure support with no damage in a
roster this aggressive is genuinely worse than the old doc claimed — but Guardian's +1 team
DEF is a flat damage reduction on every enemy swing all match, and that compounding is
under-weighted by a blind-pick sample.

#### Summoner
`-0.10` · 28 damage a game once his ghosts are credited to him, on 87% Summon uptime. He is
doing exactly what he is designed to do — converting his activation into somebody else's —
and it comes out roughly average. Counters Riot Cop hard (**+10 pts**).

### C — conditional or demanding

#### Ronin
`-0.14` · 25 damage, 0.87 kills, 40% of activations spent Defending. Wanderer pays him for
isolation and the CPU keeps him with the group, so almost none of his passive is live.
**Judgment:** the archetype and the simulator are in direct conflict here; treat this as
uninformative rather than a verdict.

#### Witch Doctor
`-0.21` · 18% survival, the third-worst in the roster. Uses all five dances (Fire 39%, Rain
28%, Misfortune 15%, Black Death 5%). **Judgment:** dances are global rules edits that help
the enemy too, and picking the right one at the right moment is the entire skill of the
unit — the CPU picks by immediate score. Hex Strike's dark-tile refuel needs footing
discipline he never shows.

#### Archer
`-0.22` · 25 damage at 21% survival. Close Shot demands she walk into melee range with
2 MOVE and 24 HP, and she dies for it. Her ARTS barely fire (Leg Shot 6%, Volley 5%, Poison
Arrow 2%) — she is played as a plain shooter. **Judgment:** her rage is one of the biggest
spikes in the game (never miss, 50% crit) at 5% uptime. Under-rated, but she also asks a lot
of the player. She was **D** on the old list; the data says C, and the rage buff is real.

#### Father Time
`-0.22` · 13 damage, 18% survival. Age is 26% of his activations and its permanent ±1 stat
swings are exactly the kind of slow compounding advantage a blind-pick sample cannot see —
they also all vanish when he dies, and he dies a lot.

#### Treant
`-0.36` · 14.3 activations a game (second most) and 40% survival, but only 19 damage — he
survives without converting. Fell from **A to C**. Beats Virus measurably (**+7 pts**) on
poison immunity. A wall that cannot close a game is worth less than the old list assumed.

#### Miner
`-0.36` · 24 damage at 23% survival. The turn-start ore buff is in this data. Still spends
13% of activations on Shaft Prop and 7% on Ore Harvest — a fifth of his game is economy
rather than fighting, and 63% basic attacks means the ore mostly becomes ordinary shots.

#### Big Brother
`-0.41` · 22 damage, 13.2 activations, 39% survival — durable but low-pressure, which is
what the old list said too. Force Push is reachable post-fix. Strong measured synergies with
Little Brother (+8) and Clod (+7); measurably anti-synergistic with Mystic (−6).

#### Angel
`-0.48` · 19 damage and 16% survival — the second-worst survival in the roster on STR 3.
Elevate 9%, Anoint 7%, Heavenseeker 4%. **Judgment:** a white-tile support whose payoff is
board-state discipline, measured by a CPU with none. Under-rated, but the fragility is real.

### D — hardest to justify

#### Sniper
`-0.59` · 21 damage at 16% survival, and he spends 36% of activations on Throw Cigar rather
than shooting. Rifle Powered pierces walls and bodies and is the designated anti-turtle
tool, which random squads rarely reward. **Judgment:** the terrain-engineering half of his
kit is genuinely hard for any planner to value; treat this as a soft D.

#### Magician
`-0.71` · the most alarming line in the table: **4% survival, 4.1 activations a game** — he
dies almost immediately, every game. He spends 33% of activations on Flee and only 7% on
Spark, his actual damage. **Judgment:** this is substantially a CPU artifact. The planner
runs him rather than casting, so he never trades, and Nuke fires 4% of the time. A DEF-3
23-HP body is supposed to be fragile, but 4% survival says the CPU is throwing him away.
Worth investigating as a planner issue rather than a balance one.

#### Mother Nature
`-0.76` · up from `-1.45` after the weather fix, and now fighting (65% basic attacks, 14
damage a game) instead of flipping the weather forever. Still 7% survival. **Judgment:**
the least trustworthy number on this page. The CPU sets a weather but has no notion of which
weather suits its squad, which is the whole unit. Do not read this as a verdict.

#### Swordsman
`-1.28` · the roster's floor, and the gap to 29th is as large as the gap from 29th to 20th.
**4% survival, 4.3 activations, 0.19 kills a game** — he dies before doing anything. 63% of
his activations go to Footwork, a rush ART that walks him into the enemy squad. **Judgment:**
part CPU, part real. The CPU clearly misplays him, and his best measured partners are
Fat Knight (+12) and Magician (+8) — the two other units it also throws away, which suggests
a shared "melee rushes in and dies" failure rather than three separate unit problems. But he
is also the deliberate baseline unit in a roster that has been buffed around him for months,
and the old list already called him "the fair baseline in a powered-up roster". **This is
the placement I would look at first after Nemesis** — and I would look at the CPU's melee
engagement logic before touching his stats.

---

## Per-unit telemetry

Measured averages per match. These explain *how* a unit earns its rating, and they are
often more actionable than the rating itself — a unit with high damage and a low rating is
doing work that doesn't convert, which is usually a sign it dies before finishing.

Damage is attributed by diffing HP across every applied command, so it captures every
mechanic equally: resolver-coded true damage, aura ticks, fire, thorns, and summon bites
all land on the unit responsible. Damage from turn-boundary hazards belongs to no
activation and is excluded rather than misattributed.

<!-- BEGIN GENERATED: telemetry -->
| Unit | Dmg/game | Taken/game | Heal/game | Kills/game | Survival | Acts/game | RAGE uptime |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Nemesis | 17.1 | 25.8 | 0.3 | 0.57 | 21% | 6.1 | 0.7% |
| Necromancer | 30.6 | 18.5 | 0.0 | 0.92 | 42% | 10.2 | 4.2% |
| Gargoyle | 39.6 | 24.0 | 0.0 | 1.24 | 52% | 11.8 | 7.2% |
| Clod | 40.5 | 20.2 | 0.0 | 1.29 | 58% | 13.4 | 4.6% |
| Blacksword | 36.5 | 30.5 | 2.2 | 1.26 | 28% | 8.4 | 4.5% |
| Paladin | 36.4 | 22.8 | 6.5 | 1.06 | 37% | 9.1 | 5.4% |
| Virus | 29.2 | 23.8 | 0.1 | 0.72 | 25% | 7.9 | 4.5% |
| King | 0.0 | 23.7 | 0.0 | 0.00 | 50% | 11.0 | 3.0% |
| Riot Cop | 21.1 | 22.7 | 0.0 | 0.60 | 49% | 14.1 | 4.4% |
| Fat Wizard | 25.6 | 25.6 | 8.6 | 0.72 | 40% | 11.9 | 3.1% |
| Juggernaut | 33.6 | 24.7 | 0.7 | 1.16 | 41% | 12.7 | 3.2% |
| Fat Cleric | 15.8 | 28.4 | 22.8 | 0.64 | 39% | 12.4 | 6.1% |
| Fat Bowman | 29.3 | 26.5 | 0.0 | 0.89 | 35% | 10.5 | 4.3% |
| Little Brother | 31.1 | 21.6 | 0.0 | 1.02 | 37% | 11.1 | 4.9% |
| Monk | 28.4 | 25.3 | 0.0 | 0.79 | 24% | 7.4 | 7.2% |
| Fat Knight | 29.4 | 29.8 | 0.0 | 0.65 | 22% | 7.7 | 9.4% |
| Mystic | 7.6 | 28.4 | 23.5 | 0.31 | 29% | 10.8 | 6.9% |
| Summoner | 28.0 | 22.3 | 2.5 | 0.37 | 28% | 9.3 | 5.3% |
| Ronin | 25.1 | 27.3 | 0.9 | 0.87 | 30% | 9.4 | 4.4% |
| Witch Doctor | 16.2 | 26.0 | 8.6 | 0.46 | 18% | 8.0 | 6.4% |
| Archer | 25.3 | 23.4 | 0.0 | 0.75 | 21% | 8.6 | 5.0% |
| Father Time | 13.4 | 24.1 | 4.3 | 0.38 | 18% | 8.2 | 4.4% |
| Treant | 19.4 | 27.7 | 1.0 | 0.66 | 40% | 14.3 | 6.8% |
| Miner | 23.6 | 24.3 | 0.0 | 0.70 | 23% | 9.2 | 5.4% |
| Big Brother | 21.6 | 24.6 | 0.3 | 0.70 | 39% | 13.2 | 4.5% |
| Angel | 19.0 | 24.6 | 1.9 | 0.47 | 16% | 7.9 | 5.2% |
| Sniper | 21.5 | 22.7 | 0.0 | 0.63 | 16% | 8.9 | 4.6% |
| Magician | 19.3 | 24.5 | 0.0 | 0.23 | 4% | 4.1 | 10.0% |
| Mother Nature | 14.1 | 26.6 | 2.2 | 0.25 | 7% | 6.8 | 5.3% |
| Swordsman | 14.6 | 26.1 | 0.5 | 0.19 | 4% | 4.3 | 9.9% |
<!-- END GENERATED: telemetry -->

---

## Kit usage: what the CPU never touches

Share of a unit's activations spent on each ART. An ART near zero is **not automatically
bad** — it may be rage-locked, situational, or simply something the CPU's planner cannot
value. But it does mean the measured rating for that unit contains almost none of that
ART's power, which is exactly the caveat a tier list needs to carry.

<!-- BEGIN GENERATED: unused-arts -->
| Unit | ART | Share of activations | Rage-locked |
| --- | --- | ---: | :---: |
| Miner | Blasting Cap | 0.00% |  |
| Big Brother | Polarity Shift | 0.00% |  |
| Blacksword | Dark Ether | 0.00% |  |
| Ronin | Patient Blade | 0.00% |  |
| Mother Nature | Landscaper | 0.00% |  |
| Treant | Source Shift | 0.00% |  |
| Ronin | Challenge | 0.04% |  |
| Virus | Smog | 0.11% |  |
| Ronin | Broken Oath | 0.14% |  |
| Riot Cop | Shield Bash | 0.21% |  |
| Riot Cop | Cover | 0.41% |  |
<!-- END GENERATED: unused-arts -->

### Three ARTS the CPU cannot see (verified)

Three of the zero-usage entries above are **CPU defects, not weak abilities**. Each was
confirmed with `scripts/probe-art-choice.mjs`, which drops a unit into the exact situation
its ART was designed for and asks the CPU what it would do.

**Fat Knight's Fart and Big Brother's Force Push — never chosen, ever.** With four enemies
packed adjacent, the CPU picked Stumble and Force Tug **100%** of the time.

The cause is precise. Both are tagged `ai.intent: "statusAoe"`, and that scorer in
`src/ai/cpuController.js` opens with:

```js
if (art.effect?.type !== "status" || !art.effect.status) return { control: 0, heal: 0 };
```

Neither ART has an `effect` block at all — they are pure displacement
(`resolution: shoveAura` / `forcePush`). So both score exactly zero control and can never
beat any alternative. The natural experiment that confirms it: **Virus's Smog shares the
same `statusAoe` intent, does have `effect.type: "status"`, and is chosen 100% of the
time** in its own probe.

> **Proposed patch (not applied).** Retag both to `ai.intent: "displaceAoe"`, the intent
> that already exists for shove effects and scores `affected.length * 4`. Verified: with
> that one-word change both ARTs are selected 100% of the time in the probe. The control
> weight may then want tuning — going from "never" to "always" suggests the right answer
> is somewhere in between — but the retag is what makes them reachable at all.

**Monk's Front Kick — loses to a plain basic attack 100% of the time.** With four adjacent
enemies the CPU always swings instead. Front Kick is `intent: "strike"`, which is scored on
projected damage; at 10 power against the Monk's STR 9 it is barely an upgrade, and its
real value — the knockback, and the stun when the shove is blocked by the board edge or an
ally — is not scored at all. So it reads as "4 MP for about one extra damage".

> **Proposed patch (not applied).** Give the `strike` scorer a control term for
> `art.knockback`/`art.stun`, mirroring how `targetedBlast` already sums `statusValue` for
> its stun. Front Kick was buffed in `c79aa30d` specifically to add stun conversion — that
> buff currently has no effect on CPU play whatsoever.

**Judgment.** This matters beyond the tier list. The CPU is the whole single-player
experience outside the campaign's scripted fights, so an ART it cannot value is an ART most
players will never see used against them. The Monk's measured rating in particular should
be read as a floor: his signature ability contributed nothing to it.

**Virus's Smog is *not* in this category.** It scores fine and is chosen whenever it is
live; it reads as 0% only because Smog is self-centred at radius 2 while the CPU correctly
keeps a range-5 caster at distance. That is a positioning consequence, not a defect —
though it does mean a human who walks Virus in gets an ability the CPU never will.

### Mother Nature oscillates her own weather (verified)

She rates last in the roster by a wide margin, and the reason is not her kit. Tracing her
ART choices across whole matches:

```
seed  3: heatwave -> thunderstorm -> heatwave -> thunderstorm -> heatwave
seed 11: thunderstorm -> heatwave -> thunderstorm -> heatwave -> thunderstorm
```

She flips between exactly two weathers every turn, for the entire match, in every match.
That is the 41%/41% split in the usage table. Because she is `actsFirst` and each weather
cast consumes her whole activation, **she spends the entire game changing the weather and
never fights** — and each flip immediately discards the persistent effect the previous one
had established.

The likely cause is that each weather ART carries a one-turn team buff (Heatwave's +1 STR,
Thunderstorm's +1 magic damage) alongside its persistent rule. The planner appears to score
the one-turn buff it does *not* currently have as a fresh gain each turn, so whichever
weather is not active always looks better than standing pat.

> **Proposed patch (not applied).** Score weather on the *persistent* rule rather than the
> one-turn pulse, and add hysteresis so re-casting a weather that is already live — or
> replacing one whose persistent effect the squad is actively using — carries a penalty.
> Blizzard, Landscaper, and Great Flood are at 0% usage for the same reason: they never win
> against the two-weather flip-flop.

### What the fixes actually changed

All three defects above were fixed (`tests/ai-control-scoring.test.js` guards them), and
the whole roster was re-simulated so the tiers on this page describe the *current* CPU.
The pre-fix run is kept as `balance-data/sim-hard-prefix.json` — same seed, same squads, so
this is a paired comparison.

<!-- BEGIN GENERATED: fix-impact -->
Significance threshold for a real change: **±0.10** rating (2σ on a paired difference).

| Unit | Pre-fix | Post-fix | Δ rating | Dmg/game | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| Mother Nature | -1.45 | -0.76 | +0.69 | 7.2 → 14.1 | **real** |
| Summoner | -0.04 | -0.10 | -0.06 | 1.0 → 28.0 | within noise |

Every other unit moved less than ±0.10, which is what re-centring plus sampling noise looks like.
<!-- END GENERATED: fix-impact -->

**Judgment.** Only the weather fix moved outcomes. Mother Nature gained two-thirds of a
rating point and doubled her damage, because she went from spending every activation
flipping the weather to actually fighting under one. The Fart / Force Push / Front Kick
fixes make those ARTS *reachable* — verified directly, and the CPU now uses each one in the
situation it was designed for — but they do not measurably move win rates at this sample
size. That is an honest null result, not a disappointment: they were dead buttons, they now
work, and the units around them were not balanced on the assumption that they fired.

Mother Nature's post-fix rating is still low, and it is still the least trustworthy number
on this page. The CPU now sets one weather and keeps it, but it has no notion of *which*
weather suits the squad it was drafted into, which is the entire skill of the unit.

---

## Does the read survive a different CPU?

The same roster re-simulated at `normal` difficulty. Large movement here means a unit's
placement is sensitive to how well it is piloted — which is itself a finding about the
unit, and a hint about how it will behave in human hands.

<!-- BEGIN GENERATED: stability -->
| Unit | Hard | Normal | Δ |
| --- | ---: | ---: | ---: |
| Magician | -0.71 | -0.52 | +0.19 |
| Angel | -0.48 | -0.61 | -0.13 |
| Archer | -0.22 | -0.34 | -0.12 |
| Treant | -0.36 | -0.46 | -0.10 |
| Fat Knight | -0.06 | +0.03 | +0.09 |
| Big Brother | -0.41 | -0.50 | -0.08 |
| Swordsman | -1.28 | -1.21 | +0.07 |
| Monk | -0.01 | -0.07 | -0.06 |
| Ronin | -0.14 | -0.08 | +0.06 |
| Blacksword | +0.63 | +0.57 | -0.06 |
| Sniper | -0.59 | -0.65 | -0.06 |
| Fat Wizard | +0.11 | +0.17 | +0.06 |
<!-- END GENERATED: stability -->

---

## Proposed balance patches

**Not applied.** These are the changes the data actually supports, in the order I would do
them. Each names what it is responding to so it can be argued with.

### 1. Investigate the CPU's melee engagement before touching any melee stats

The three lowest-rated non-commander units — Swordsman (`-1.28`), Magician (`-0.71`), and
the Monk/Fat Knight pair just above them — share one measured signature: **4% survival and
about 4 activations a game**, against 10–14 activations for durable units. They are not
losing fights; they are dying before they get to have them. The Swordsman spends 63% of his
activations on Footwork, an ART that walks him *through* the enemy squad.

Their strongest measured "synergies" are with each other, which is what a shared failure
mode looks like rather than three independent balance problems.

> **Do this first.** Any stat buff applied now would be compensating for a planner that
> throws these units away, and would over-tune them the moment the planner improves.

### 2. Nemesis — the one clear outlier

`+1.25`, with the next unit at `+0.87` and the roster mean at 0. The gap from Nemesis to
2nd is larger than the gap from 2nd to 8th. Realm of Magic gives the whole team +1 magic
damage *and* −1 MP on every ART, permanently, for free, with no positioning requirement.

> **Proposed:** make the aura cost something rather than reducing its size. Options, in the
> order I would try them: (a) the MP discount applies only to allies within a radius, giving
> the enemy a way to play around it; (b) the discount drops while Nemesis is silenced —
> Nullify currently makes him immune to silence, which removes the counterplay the kit
> otherwise implies; (c) the +1 magic damage applies only to allies, not to Nemesis himself.
> I would not touch his stat line — DEF 2 already does its job (21% survival).

### 3. Leave Mother Nature, the Monk, Virus, and Blacksword alone for now

All four are flagged in their placements as under-measured for identifiable reasons —
weather selection, move-and-ART economy, rage payoffs, and multi-turn setup respectively.
Their ratings are floors, not verdicts.

> **Proposed:** re-measure after the CPU work in (1), rather than patching against numbers
> the simulation cannot currently produce honestly.

### 4. Consider whether the Sniper's terrain kit should be reachable at all

He spends 36% of activations on Throw Cigar and 61% on plain shooting; Build Cover and Smoke
Bomb are near zero. Unlike the three defects fixed above, this does not look like a scoring
bug — board construction is genuinely hard for a planner to value.

> **Proposed:** treat this as a design question, not a bug. Either the terrain half of his
> kit gets AI support proportional to how central it is, or it should be understood as a
> human-only tool and his baseline shooting compensated accordingly.

---

## Reproducing this

```powershell
npm run kits                                        # regenerate the kit reference
npm run sim -- --games 16000 --difficulty hard      # ~1 hour on 11 workers, checkpointed
npm run sim -- --games 6000 --difficulty normal
npm run balance -- --compare balance-data/sim-normal.json
node scripts/balance-tables.mjs                     # inject the tables into these docs
```

Raw match records land in `balance-data/`. Runs are seeded, so the same command reproduces
the same numbers; pass `--seed` to sample a different set of squads.
