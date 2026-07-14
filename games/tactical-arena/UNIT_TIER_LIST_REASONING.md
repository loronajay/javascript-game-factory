# Tactical Arena — Unit Tier List: Reasoning

Justifications for every placement in `UNIT_TIER_LIST.md`. Everything here is traced to
the actual unit data in `src/core/units/*.js` and the shared resolvers
(`src/core/unitCatalog.js`, `src/rules/combat.js`, `src/rules/damage.js`), cross-read
against `UNIT_ARCHETYPES.md` and `TEAM_COMPS.md`.

## What I'm ranking on (the levers that actually win)

This engine rewards a specific set of things, and my tiers weight them in roughly this
order:

1. **Unconditional team value.** An always-on aura that touches every ally every turn
   (Mystic's +1 DEF, Nemesis's +1 magic / −1 MP, Necromancer's −1 magic taken) is worth
   more than any single big number, because it compounds across the whole match and can't
   be played around.
2. **Damage-type coverage.** `physical = max(1, STR − DEF)` dies into armor; **magic
   ignores DEF**; **true ignores DEF *and* Defend**. Units that deal magic/true, or that
   *remove* the enemy's ability to use DEF/Defend/healing, sidestep the game's main
   defensive axis. This is the single most important balance fact in the roster.
3. **Action economy.** An activation is one move + one primary, and an ART normally eats
   the whole thing. Anything that breaks that rule — permanent move-and-ART, bonus actions
   that don't spend the turn, or extra bodies — is a structural advantage, not a nicety.
4. **Rage payoff vs. rage path.** RAGE (≤5 HP) is usually a unit's strongest mode, but a
   unit is only as good as how safely it can reach and survive that state.
5. **Economy.** MP never regenerates. A private refuel (Magic Pipe, Growth, Spirit Dance,
   ore, HP-as-fuel, Snack Break, USES) is what lets a kit function past turn 10.
6. **Conditionality tax.** Tile/weather/isolation/comp requirements, fragility, and slow
   starts all discount an otherwise strong kit — a high ceiling with a bad floor lands
   lower than a smaller-but-reliable one. One caveat the board itself enforces: a "slow
   start" is only a real tax if the enemy can *contest* it. Squads spawn in opposite
   corners 10–12 tiles apart (13×13 or 15×15), and the fastest turn-one engage in the game
   covers 6 tiles, so the first several turns are a shared neutral approach for both sides.
   A unit that spends them setting up (mining, planting, charging) in its own corner is not
   losing tempo it could have spent fighting — no one is in range to fight yet.

Format assumed: 4-unit squads, 1v1 blind-pick/draft, RAGE at ≤5 HP. A unit that's only
good inside one bespoke comp is judged on how often that comp is available, not on its
best-case game.

---

# S Tier

The four units whose value is unconditional *and* format-defining. Every one of them is
either the keystone of a top comp or simply the best at its job with no setup required.

### Mystic — the single best support
Guardian is **+1 DEF to the entire team, permanently, for free**. In a game where physical
damage is `STR − DEF`, that's a flat damage cut on every enemy swing for the whole match,
and it can't be dispelled or outpositioned. On top of that she has the best MP curve of any
healer (Wish = 1 HP to *every* ally board-wide for 2 MP, ~19 casts on her 38 pool), Pray
for burst AoE healing, **Purify** (strip *all* statuses — the hard answer to a status lock),
Silence, and silence-immunity. Her rage is a defensive monster: +15 MP on entry, +6 MOVE,
magic basics, move-and-ART, and she's **permanently treated as Defending** (halves *all*
incoming physical and magic). She's the healer who won't die, attached to the best aura in
the game. She shows up in nearly every strong comp for a reason.

### Nemesis — the best offensive enabler
Realm of Magic gives **every ally +1 magic damage and −1 MP on every ART (min 1)** while he
lives. That's not a buff, it's a tax cut that compounds into dozens of free MP and a flat
damage bump on every cast, AoE included — and it enables the strongest damage archetype in
the game (all-magic, which opts out of the enemy's entire DEF axis). His own kit is no
slouch: MP 45, MOVE 3, silence-immune, Dark Pulse (8-ray magic that heals allies and refunds
its own cost on 4 hits), a threshold reaction that auto-casts Dark Pulse for free at 20/15/10/5
HP so chipping him is dangerous, and Regenerate rage (+5 HP/+15 MP). DEF 2 is the only knock,
and it's a real one — but you draft around protecting him because the payoff is that large.

### Necromancer — mitigation, debuff, and free bodies in one slot
He does three unconditional things at once. Dead Zone = **−1 magic damage taken for the whole
team** — the single best patch for the game's un-blockable damage type, the exact reason the
Fortress comp (the sim apex) works. Deathly Aura = **−1 enemy DEF within 3 tiles**, which
quietly raises his whole team's physical damage. And Summon Ghoul places up to **two extra
10-HP bodies that never take a turn** yet block movement, screen his fragile body, carry the
same −1 DEF aura (extending the debuff field), and bite for 1 true every rollover. Grave
Wrath rage widens the aura to radius 4 and deepens it to −2 DEF/−1 STR/−1 MOVE, on the
Ghouls too. That's a huge amount of always-on, no-piloting-required value.

### Gargoyle — the immovable AoE fortress with the best rage
Stone Body makes him **immune to displacement** (and the ART that tries eats 2 true), Stone
Ward makes him **immune to every status** (targeted statuses *reflect back onto the caster*),
Heavy hard-caps his MOVE at 3, and while Defending a melee attacker takes thorns. He is
unmovable, uncontrollable, and unpleasant to touch. Pyroclasm is real damage — 4 magic to
every enemy on any of the 8 rays, burning *through* bodies so screening fails. And Volcanic
Rage is the best rage in the roster: +2 DEF, **permanently Defending while still taking full
turns** (so he halves everything *and* acts), Pyroclasm +2 range, a **free Pyroclasm the
instant he rages**, and another every third turn after. Fire-immune with permanent-fire crits
on top. He's the screen in half the top comps and a menace on his own.

---

# A Tier

Strong, flexible, high-impact units with one clear condition, a clunky path to their payoff,
or a role that's a notch below format-defining.

### Paladin — the cleanest value bruiser
Hand of Life turns **every point of physical damage he deals into healing for allies within
2 tiles** — a lifesteal aura on a STR-10 body, which rewrites how you position a whole squad.
Chosen makes him **immune to poison, slow, blind, silence, and stun** — a hard anchor against
any control comp. And Lightseeker is a **bonus action** (1 true to every enemy on a light tile
within 5, *without spending his turn*), upgraded by Darkseeker in rage. Free recurring chip
on a unit that already wants to be swinging is the best kind of value here. He's just below S
because his damage and healing are both *physical* (they fall off into armor — into a DEF-8
Clod his hit and therefore his heal are near zero) and his chip is tile-gated to half the
board. Elite, but conditional where the S units are not.

### Clod — the physical wall
Highest DEF in the game (8), and Rock Hard means that **while Defending he negates physical
damage entirely** — not halves, zero — and refunds 3 MP per hit, so an enemy melee squad
literally *refuels* him by attacking. Brick House turns him into a phalanx pivot (+1 DEF to
huddled allies, +1 STR to him per sheltered ally). Quake (scaling magic AoE, self-refunding on
a full-team hit), Stone Throw (control), and Thunderous Charge (rage true-blast + mass stun)
give him a real offense too. A tier rather than S only because Rock Hard is *binary* — it's
inert against magic, and a magic pile ignores everything that makes him special.

### Monk — the action-economy unit
Shadow Step is one of the best passives in the game: he moves on a **radius** (diagonals, and
bodies/walls don't block him because only the destination is checked) **and may move and use
an ART in the same activation, always** — the thing every other unit needs rage for, from turn
one. That turns Front Kick (STR-scaling strike, knockback on crit) and Protect (an *on-your-turn
reaction* — step to an ally and both Defend, even if they acted) from commitments into ordinary
plays. Blind-immune, +1 STR per 5 missing HP, and a scaling rage. Held out of S only by melee
range 1 / base 2 MOVE and a lower damage ceiling than the casters — but as a bodyguard/skirmisher
he's premier.

### Juggernaut — the anti-heal denier
Null Zone (rage) is one of the nastiest passives in the roster: +2 STR/+2 MOVE, **ARTs cost
no MP**, and **all healing on the board is disabled for everyone** — which also means he can't
be pulled out of rage, and neither can any healer save anyone. That single mode hard-counters
the entire sustain half of the game. Self Destruct is a guaranteed 10-true r4 finisher whose
only cost is the unit itself, and Bruiser Mode (STR 10 / MOVE 3 at 0 MP) means empty is his
combat form. A rather than S because he's a 2-MOVE melee whose best mode requires being at
≤5 HP, and non-raging he's a clunky 5-MP tank that needs Tether Grab just to start a fight.

### Magician — the armor solvent
The purest expression of "magic ignores DEF": Spark is his STR (6) as magic from range 5, so
against a DEF-8 Clod he does 6 where a STR-10 Swordsman does 1–2. He is *the* reason armor
isn't oppressive. Magic Pipe refuels him (10 MP every 3 casts he skips Spark/Banish), Banish
adds a 75% silence to shut off an enemy caster, Flee is his escape, and Nuke (rage, 12 magic
in r3) wipes a cluster. Fragile (23 HP/DEF 3) and mostly single-target until rage, so he needs
a screen — but he answers the whole tank archetype by himself.

### Fat Wizard — the durable, self-sufficient caster
A caster with a *tank's* HP bar (30 HP, DEF 4 at range 3), which lets him stand in the second
rank and actually use his kit. Clumsy means he never fully whiffs (misses still splash 2 magic,
crits splash 3). Study is a free self-refuel (mark a target, +1 damage to it, magic hits on it
give back 2 HP/2 MP). He also *heals* (Surge, and Relay Power's clean HP/MP transfer). Lazy Cast
(rage) is a win condition — Zap and Surge go **free**, Zap gains +3 damage, splashes on every
hit, and **stuns** on crit. Durability + self-sufficiency + healing + a monster rage, just
without a team-wide aura to push him into S.

### Virus — the status win-condition (S-ceiling, A-floor)
The most systemically dangerous kit in the roster: Spread means **any debuff on any enemy, from
any source, jumps to that enemy's neighbors within 2 tiles** — single-target control becomes
free AoE control, at no action cost. Growth refunds him 2 MP every time he poisons someone (so
spreading poison *makes* mana), Smog blinds a radius with no roll, and Poison Tick / Explosion
convert the spread into DEF-and-Defend-ignoring true burst. Infectious Affinity (rage) removes
all the randomness. He's held at A, not S, purely because his floor is real: **Paladin, Angel,
Gargoyle, King, and Monk-vs-blind are status-immune, and Mystic/Fat Cleric cleanse** — against
an immunity-heavy draft he does comparatively little. When the enemy has no answer, he's the
best unit in the game; when they do, he's a mid caster.

### Father Time — attrition that pays for itself, plus a revive
Time Steal deals **1 true damage every turn to every enemy within 2 tiles** — unavoidable,
undefendable, DEF-ignoring — and refunds him 1 MP per point dealt, so standing near him is a
slow death that *funds his spells*. Against a melee squad that must close on him, that's free
damage forever. Age rewrites stat lines permanently (−1 to an enemy, or +1 to an ally, until
he dies), and Rewind (rage) is a **full-HP revive with statuses cleared** — the single biggest
swing any unit can make. Stun/slow immune. A rather than S because his aura is short-range and
his headline play (Rewind) is expensive and rage-locked.

---

# B Tier

Good units that either fill a role well, need a comp built around them, or carry a real
condition. First picks in the right draft, not in a blind one.

### Angel — anti-armor support with an anti-meta anchor
STR 3 is misleading: his basic is **magic that ignores DEF** and scales with *every* STR
source (King's Strike, Fire Dance, Nemesis's +1, his own +2 rage), so he out-damages physical
rangers into armor. Holy Being makes him **immune to every status** — a hard anti-Contagion
anchor — and Heavenseeker (rage) is a **bonus action** doing board-wide white-tile chip *and*
heal without spending his turn. Anoint hands an ally +1 range (huge on a Sniper). Held at B by
the tiny body, the tile-conditional accuracy/crit, and a pure-support damage profile.

### Witch Doctor — the rules-editor stance-dancer
His passive is *whichever dance he did last*, and two of those dances are format-relevant:
**Misfortune** doubles all status rolls on the board (the engine behind any status comp), and
**Spirit** is the only real **MP battery** in the game (3 MP to allies within 2 on every basic
attack — enormous in a caster squad). Rain (global +1 healing) and Fire (team +1 STR) round him
out. B because his value is almost entirely comp-dependent — standalone he's a mediocre STR-8,
range-4 support; you draft him *for* a status or caster core.

### Mother Nature — weather rules-editor (A-ceiling)
Like the King she **must act first**, but she fights, and her weather rewrites the board for
*both teams*: Thunderstorm (−1 MP per ART globally, stacks with Nemesis to near-free casting),
Spring Shower (+1 to *every* HP/MP restore — a multiplier on any healer), Heatwave, Blizzard.
100 MP lets her reset the world almost every turn, and Landscaper is roll-free push+wall/damage.
She's a build-around: A-tier as the centerpiece of Storm Coven or Spring Garden, but weather
cuts both ways and an unbuilt squad wastes half her kit, so she lands at B by default.

### Fat Cleric — the healer you have to work to kill
30 HP, DEF 5, and Snack Break turns a no-move Defend into a +1 HP/+1 MP refuel, so she sustains
herself across a long game. Hope (random AoE heal), Cleanse (negative-only, keeps buffs), Focus
Prayer (a gamble — heals, or backfires a status onto your own ally), and Second Helping (rage
**revive** at 50% HP). Emergency Snacks means rage isn't a death sentence for her. A genuinely
strong, durable main healer — just without a game-warping aura, which is what separates her
from Mystic.

### Sniper — the anti-turtle specialist
Longest range in the roster (6) and the *only* unit that ignores the line-of-sight rule: Rifle
Powered pierces **bodies and walls**, with a min-2 damage floor, so armor-stacking and screening
both fail against him. He also shapes the board (Build Cover walls only *he* shoots through,
Throw Cigar fire, Smoke Bomb blind). B rather than A because his 18-MP pool is small, he has no
team synergy, and he's a fragile solo carry — but he's an A-tier pick specifically *into* any
turtle/screen comp.

### Riot Cop — the sturdy peeler
No MP — his gear runs on **finite USES** (the only cooldown-style economy), so he's always able
to do *something*. Riot Shield hard-counters two damage categories: −1 from ranged basics and
**full magic nullification while Defending**. With DEF 7, Heavy Boots (slow immunity), and a +1
DEF ally aura, he's among the hardest units to remove. Cover is the cleanest bodyguard action in
the game (swap places with an ally and Defend). Lockdown rage clamps everyone nearby to 1 MOVE /
−2 DEF. Solid, sturdy utility across the board.

### Little Brother — crit-splash artillery
Cannon Fire (fixed 10 physical, stun + splash on crit) and Splash Fire (crit basics deal 2 true
in a radius) make him a crit-fishing area gun; Rechargeable Battery means enemy casters refuel
him (+3 MP per magic hit). Flamespitter rage fires Flamethrower *free* after orthogonal basics —
an attack + a cone in one turn. B because his payoff is crit-dependent and he's noticeably better
paired with Big Brother (Pissing Contest).

### Fat Knight — the anti-crit brick
Battle Trauma is a sharp trade: +1 magic taken, but **crits do him no bonus damage at all** —
against this roster's many crit-fishing kits (Angel, Blacksword, Little Brother, Miner, Treant)
he's a wall, and magic that softens him *arms* him (+1 STR). Fart is a real "get off me" button,
and Trample (rage) walks a line through a cluster for 3 true each. A durable, cohesive bruiser —
B on his own, better inside Fat Squad / King Rush.

### Treant — the magic-reduction sustain tank
Undersold if you only see the weather gimmick. Grove Ward is the **same −1-team-magic-taken**
mitigation that makes the Necromancer so valuable, on a 30-HP/DEF-6 body; Deep Roots adds
positional DEF for anchoring a compact fight; and Petrify (rage) is a superb ultimate — an
**invulnerable 2-turn statue** that heals himself and nearby allies while draining nearby
enemies. Enchanted Roots and his closed HP/MP economy (Soul Sap, Ether, Source Shift) reward a
weather partner. B because the stat half of his kit is weather-dependent and he's slow (2 MOVE /
range 2); A-adjacent inside Spring Garden.

### Blacksword — the dark-tile duelist
A self-contained combo engine on a sturdy body (30 HP, DEF 6, STR 10, blind-immune): Dark Ether
guarantees his next basic crits → Darkspread blinds it → Dark Tick deals 3 true to *every*
blinded enemy on the board. Dark Tread gives him +1/+2 damage on dark tiles and 1 HP lifesteal
per dark-tile hit, and Banish (rage) instantly kills **every enemy on a dark tile** (he dies
doing it) — half the board. Spends HP instead of MP, which pushes him toward the rage he wants.
B because it's all tile-conditional and his footing can hurt him (+1 damage taken on light).

---

# C Tier

Situational — a strong best case gated behind a specific playstyle, positioning, comp, or a
notable weakness.

### Fat Bowman — the stationary turret
Excellent *if she never moves*: Heavy Handed makes her shots hit **harder the farther out** the
target is (up to +2 at range 4), and Planted stacks +1 STR per turn she holds still, to +4 — so
she can become an 11-STR range-4 gun that also pierces bodies and double-rolls poison.
Desperation Shot (rage) is one enormous shot. But **confirming any move wipes the Planted stack
to zero**, and her range is only 4 — so while a corner turret is a genuinely viable plan (the
enemy has to close on her, and she out-scales them the longer they take), anything that
out-ranges her (a Sniper, a caster) or a flanker that finally reaches her tile can force the
reposition that resets her to nothing. She's strong for exactly as long as she's allowed to
stand still.

### Summoner — the tempo gamble
Converts his own mediocre activation into a **random roster unit that arrives at full HP and
takes a complete turn**, almost every turn on his 100-MP pool — and Beckon (rage) calls one that
arrives *already raging* (a Magician into an instant Nuke). The action-economy ceiling is real.
But it's **high-variance** (you don't pick the draw, only from five shuffled options), his own
body is weak (STR 6, no aura, 23 HP), and a disciplined burst comp that ignores the ghosts and
kills the caller shuts the whole engine off.

### Big Brother — the anti-heal tech piece
STR 2, and explicitly not a damage dealer — but Super Magnet makes his basics **true damage**, a
reliable unpreventable 2 through any DEF/Defend, even a braced Clod. His real value is control:
Magnetic Field makes anything within 1 tile of him **un-healable**, Polarity Shift globally swaps
HP↔MP restores (a hard counter to healing comps), and Force Push/Tug displace. A genuinely strong
counter-pick into the sustain half of the roster — but into a non-healing comp you've spent a
slot on tech they don't care about, which caps him at C.

### Swordsman — the reliable baseline
The reference unit, and a perfectly fine one: STR 10 / 3 MOVE closes and hits, Footwork is a real
6-tile engage that deals true damage through bodies, and his three ARTs are useful riders on a
swing (70% blind, 70% silence, half-damage lifesteal). Last Stand + Quick make him nastiest near
death. Nothing wrong with him — he's just outclassed by the rebuild-original melee (Blacksword,
Ronin, the tanks) at almost everything, so he rarely earns the slot over them.

### Ronin — the awkward duelist
High personal threat: Wanderer pays him for fighting alone (+2 while no ally is near him, +1 vs
isolated targets, +1 vs anyone who missed him, self-heal on crit), and Final Draw (rage) is
**+12 STR** — a one-swing threat to almost anything. But every part of his passive wants him
*away from his own team*, which is structurally hostile to a 4-unit squad, and Final Draw recoils
its own damage back onto him. He's a specialist flanker whose kit fights the format; strong in
the exact isolated duel he's built for, hard to leverage otherwise.

### Miner — the slow-scaling ammo ranger
His resource is Ore, and he **starts with none** — at 0 ore his range collapses from 5 to **1**.
That reads scarier than it plays: his opening turns are spent mining in a back corner 10+ tiles
from any enemy, *in parallel with* their unavoidable approach, so it costs him nothing the board
wasn't already going to — and a single Ore Harvest (2–5 ore) restores his full range immediately,
so he's a working range-5 ranger from turn two. The real tax is ongoing, not up-front: every
ranged shot **spends** the ore that is simultaneously his ammo, his crit chance (per 5 held), and
his stat line (+1 STR/+1 DEF at max), so sustained fire keeps forcing him back to mining, and his
best numbers are backloaded behind hoarding he can't do while shooting. A functional ranger with a
genuine self-throttling economy and no team value — solid but unremarkable, which is C, not the
"begins the match unable to function" liability an earlier read made him out to be.

---

# D Tier

The hardest to justify in a normal draft — either a genuine liability, or a floor low enough
that you need a lot to go right before you see value. (High ceilings noted; the placement is
about reliability.)

### King — S-ceiling, liability floor
The most piloting-dependent unit in the game. He **cannot move, attack, or Defend** — he issues
one global command a turn (Strike/Hold/Pursue/Higher Ground), and each **scales +1 per allied
unit currently in RAGE**, so a King behind three raging bruisers hands the team +5 STR. That's a
real comeback engine. But the cost is brutal and structural: he takes **−10 HP every time an ally
falls** (30 HP ≈ three dead allies and he's gone), he brings **no body to the fight** — he can't
move, attack, or Defend, so you are effectively fielding three real units in four slots — and he
**does not sustain victory**: a team of only a King has already lost. (His command is a mandated
first step each turn, but the engine auto-opens it and simply rejects any out-of-order squadmate
command with a reminder — it's a rigid rhythm, not a way to brick your turn.)
Draft him blind, without the dedicated rage-squad and the piloting to ride your units at low HP,
and he's a four-slot liability. In expert hands inside King Rush he's a different, much better
unit — but a tier list ranks the reliable case, and his is bad.

### Archer — the outclassed legacy ranger
Paradoxical by design (range 5, but Close Shot pays her to fight at adjacency) on a fragile,
slow body (24 HP, DEF 4, 2 MOVE), so committing to her correct range is both slow and lethal.
Her attrition tools (permanent poison, 3-turn slow, Volley's true-damage cone) and her rage
spike (never miss, 50% crit) aren't *bad* — but every rebuild ranger does her job better: the
Sniper out-ranges and pierces, Angel ignores DEF and is immune to everything, Little Brother
splashes, Fat Bowman out-scales at range. She's the member of the old "classic" squad the
rebuild most clearly left behind, and there's almost always a better pick for the slot.

---

## A note on the shape of this list

This is a well-tuned roster — the gap from S to C is smaller than in most games, and several C/D
units have genuinely high ceilings (King, Ronin, Summoner) that a skilled pilot inside the
right comp can absolutely realize. The tiers reflect **reliable, general-draft power**: how much a
unit gives you when you can't guarantee the perfect supporting cast or flawless sequencing. Read
alongside `TEAM_COMPS.md` — a C-tier tech piece like Big Brother or a build-around like Mother
Nature can be the *best* unit on the board in the specific comp it was made for.
