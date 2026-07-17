# Tactical Arena - Unit Tier List: Reasoning

This is the reasoning behind `UNIT_TIER_LIST.md`, rewritten for the 2026-07-17
balance state. It is based on the live unit definitions in `src/core/units/*.js`,
the shared stat and aura folds in `src/core/unitCatalog.js`, and the damage rules
in `src/rules/combat.js` / `src/rules/damage.js`.

## What changed in this pass

The old list had the right skeleton but was behind the current meta. Paladin is
now a true S-tier blind pick because white-tile footing also gives DEF, on top of
status immunity, lifelink, and bonus-action seeker chip. Clod rises because Quake
refunds on 3+ targets rather than the entire enemy team. Monk rises because Front
Kick crit knockback now converts blocked paths into stuns. Little Brother rises
because Rechargeable Battery restores 5 MP and Flamethrower leaves permanent fire.
Father Time is easier to trust with Age explicitly at range 4. Riot Cop remains
strong, but the magic-shield nerf matters: non-critical magic is still blanked
while Defending, critical magic now leaks +1 through.

## Ranking levers

1. **Always-on team value.** Auras like Guardian, Dead Zone, Grove Ward, Realm of
   Magic, and Deathly Aura compound across every turn and usually cannot be
   outplayed by simple positioning.
2. **Mitigation against the right damage type.** DEF handles physical only.
   Magic ignores DEF, and true damage ignores DEF and Defend. Team magic
   reduction is therefore one of the rare answers to caster piles.
3. **Action economy.** Bonus actions, move-and-ART, free pulses, and extra bodies
   are better than bigger numbers because they break the normal activation limit.
4. **Rage path and payoff.** A rage ultimate is only worth full credit if the unit
   can safely reach <=5 HP and still act afterward.
5. **Resource economy.** MP does not passively regenerate. Self-refund, discounts,
   finite USES, ore, HP-as-fuel, and weather or stance support decide long games.
6. **Conditionality.** Tile color, weather, isolation, exact squadmates, and
   global rules that also help the enemy all tax an otherwise powerful kit.

---

# S Tier

These are the units I would expect to shape drafts by their presence. They either
bring unconditional team value or are so hard to answer cleanly that the enemy has
to draft with them in mind.

### Mystic - best universal support

Guardian is still the cleanest defensive aura in the roster: +1 DEF to every ally
while Mystic lives. That single point matters because physical damage is based on
STR minus DEF, so it shrinks every normal swing and stacks naturally with Defend,
healers, and tanks. Her active kit covers the rest of the support checklist:
Wish for cheap board-wide healing, Pray for local burst healing, Purify for full
status cleanup, and Silence for caster control.

The rage mode is also wild: +15 MP on entry, huge movement, move-and-ART, magic
basics, and passive Defend while still acting. She is fragile before rage, but her
value does not depend on a particular partner. That is S-tier reliability.

### Necromancer - mitigation, DEF shred, and free screens

Dead Zone is the reason Necromancer stays S. Magic bypasses DEF, so a team-wide
-1 magic damage reduction is one of the game's rare answers to the strongest
damage type. He also projects Deathly Aura, stripping enemy DEF in radius 3, and
can raise two Ghouls that carry the same aura while blocking space.

That combination means he helps defensive shells and physical teams at the same
time. Wither and Dark Bomb give him real caster pressure, while Grave Wrath turns
the aura into a wider STR/DEF/MOVE debuff field. He is fragile, but the kit pays
you immediately before he ever reaches rage.

### Gargoyle - safest tank-carry

Gargoyle answers too many common plans at once. It cannot be displaced, reflects
targeted statuses, is immune to every status, punishes melee while Defending, and
can still pressure clustered lines with Pyroclasm. Heavy caps Move, but Flight
partly offsets that by giving diagonal repositioning and landing true damage.

Volcanic Rage is the best defensive rage in the game: +2 DEF, always Defending
while still acting, longer Pyroclasm, and free eruptions. A unit that is difficult
to move, difficult to control, difficult to burst, and still has AoE is a draft
anchor.

### Nemesis - offensive aura engine

Realm of Magic gives every ally +1 magic damage and reduces ART costs by 1, to a
minimum of 1. Because magic ignores DEF, that is both a damage buff and a resource
engine for the game's strongest offensive archetype. It gets even better on AoE
and repeated casts.

Nemesis himself is not just an aura holder: Dark Pulse hits eight rays, heals
allies, can refund itself, and auto-casts at HP thresholds. He is DEF 2, so the
draft must protect him, but the reward is format-level.

### Paladin - promoted all-purpose anchor

Paladin now crosses the S line. Hand of Life already turned his physical damage
into nearby ally healing, and Chosen already made him immune to poison, slow,
blind, silence, and stun. The current white-tile DEF bonus makes Lightseeker
positioning defensive as well as offensive, so his preferred tiles now support
both survivability and bonus-action true chip.

He still has physical-damage matchups where Clod or Defend can shrink his healing,
but the full package is too reliable to keep in A: durable bruiser, control-proof
anchor, sustain engine, tile chipper, and strong rage seeker payoff.

---

# A Tier

These units are very strong and often first-pickable, but each has a clearer
counter, setup burden, or comp dependency than the S tier.

### Clod - physical damage veto

Rock Hard is binary but enormous: while Defending, Clod negates physical damage
entirely and gains MP when struck. Brick House gives adjacent allies +1 DEF and
rewards a compact formation with extra STR for Clod. The July Quake change matters
because refunding on 3+ targets makes his magic AoE a realistic pressure option
rather than a miracle condition.

He is A rather than S because his signature defense is far less relevant into
magic and true damage. Still, any physical squad must solve him or lose the front.

### Treant - magic ward sustain tank

Treant has been underrated by lists that focus only on weather. Grove Ward is the
same kind of team magic reduction that makes Dead Zone important, but attached to
a 30-HP, DEF-6 body. Enrich restores ally MP, Source Shift gives weird resource
play, Deep Roots rewards compact anchoring, and Petrify can make a clustered fight
stall while healing allies and draining enemies.

Weather raises his ceiling, especially Spring Shower and Thunderstorm, but he no
longer needs a weather comp to justify the slot. A team magic ward on a real tank
is simply valuable.

### Monk - action-economy skirmisher

Shadow Step is a structural advantage: Monk moves by radius and may move and use
an ART in the same activation from turn one. Protect is a strong bodyguard action
because it moves him to the ally and sets both units to Defend, even if the ally
already acted.

The Front Kick buff raises his threat. A critical knockback that hits the board
edge stuns the target; if an allied body blocks the path, that ally is stunned.
He is still range-1 and not a pure damage carry, but his mobility plus control is
now premium.

### Father Time - permanent stat swings and revive

Time Steal deals true damage in radius 2 and refunds MP, so melee teams fund his
control by standing near him. Age at range 4 is now much easier to apply safely,
and permanent +1/-1 STR or DEF changes combat math for as long as Father Time
lives. Time Stretch gives short-term movement control.

Rewind is one of the biggest possible rage plays: a full-HP revive with statuses
cleared. The short aura radius and rage-locked revive keep him out of S, but his
floor is much better than a normal revive bot.

### Magician - armor solvent

Spark and Banish are simple but strategically essential: range-5 magic that
ignores DEF. He is the clean answer to Clod, Gargoyle, and other armor stacks.
Magic Pipe gives him a way to recover MP, Flee keeps him alive, and Banish adds
silence to the damage.

Nuke is rage-locked and he is fragile, so he needs a screen. Even so, no roster
read is complete without respecting how hard he punishes DEF-first drafts.

### Fat Wizard - durable caster with sustain

Fat Wizard brings a caster kit on a 30-HP body. Zap provides magic pressure,
Clumsy means missed or critical Zap still splashes, Surge gives healing, Relay
Power moves HP/MP to an ally, and Study turns a marked target into sustain.

Lazy Cast is the payoff: free Zap and Surge, stronger Zap, hit splash, and stun
on criticals. He lacks a team aura, but he is one of the safest self-contained
casters.

### Virus - status win condition

Spread makes any debuff on an enemy jump to nearby allies. Smog is no-roll blind
in a radius, Cough supplies poison, Poison Tick converts poison into board-wide
true damage, and Explosion can finish poisoned teams through DEF and Defend.

The reason Virus is A instead of S is matchup polarity. Status immunity and
cleanse are common enough to matter: Paladin, Angel, Gargoyle, King, Mystic, and
Fat Cleric all blunt the plan. Into teams without those answers, Virus can feel
like the best unit in the game.

### Juggernaut - anti-heal clock

Null Zone disables all healing on the board while Juggernaut is raging, gives
free ARTs, and makes him harder to kite. That single passive can flip the sustain
matchup. Self Destruct is a guaranteed 10 true AoE finisher if the trade wins the
game, and Bruiser Mode turns empty MP into better combat stats.

His weakness is the path: base Move 2 melee, small MP pool, and best effects at
low HP. He is terrifying when piloted into the right window, less reliable when
forced to chase.

### Mother Nature - weather commander

Mother Nature is a rules-editor with 100 MP and range 6. Thunderstorm stacks with
caster plans by lowering ART costs and boosting magic. Spring Shower multiplies
healing and MP restoration. Blizzard slows everyone up front and buffs movement
ART range. Heatwave turns crits and fire into a board rule. Landscaper adds no-roll
push/wall control.

She remains A, not S, because weather is global and she must act first. The best
Mother Nature player drafts to abuse the weather more than the opponent can.

### Little Brother - upgraded artillery

Little Brother's current kit is much scarier than the old list gave him credit
for. Rechargeable Battery now restores 5 MP from magic damage, enough to fund his
big casts quickly. Flamethrower deals true cone damage and leaves permanent fire
under enemies hit, while Cannon Fire gives range-5 physical pressure with stun
and splash on crit.

He is still crit-incentivized and better with Big Brother on board, but permanent
fire plus true cone pressure is a real plan, not just a gimmick.

---

# B Tier

These are good units that fill real jobs. They are often excellent in the right
shell, but less automatic than A-tier picks.

### Fat Cleric - durable main healer

Fat Cleric is hard to remove: 30 HP, DEF 5, Snack Break sustain, Hope, Cleanse,
Focus Prayer, and a rage revive. She is one of the best units for a grind plan.
The main reason she is B is comparison pressure: Mystic's Guardian and Purify are
more universal, while Necromancer/Treant mitigation changes the incoming damage
equation before healing is needed.

### Angel - status-immune magic support

Angel's low STR is deceptive because Blessed Arrow deals magic damage. He attacks
armor well, ignores status comps entirely, can Anoint allies for range spikes, and
has a strong white-tile rage pulse that heals allies and damages enemies without
spending the action.

He is a specialist support, not a main carry. In the right draft he plays above B,
especially beside Sniper, Paladin, Mystic, or Nemesis.

### Witch Doctor - stance rules-editor

Witch Doctor can change the match with one dance. Spirit Stance is a real MP
battery. Misfortune doubles status odds. Rain amplifies healing. Fire boosts STR.
Black Death creates a dangerous rage board state.

The tax is that several stances are global or timing-sensitive, and his standalone
body is merely fine. He belongs in comps that deliberately abuse the stance.

### Sniper - anti-turtle specialist

Rifle Powered makes Sniper unique: range 6, shots pierce units and walls, and
damage never falls below 2. Build Cover is better for him than anyone else because
he can shoot through it. Smoke Bomb and Throw Cigar add control and chip.

His small MP pool and low team synergy keep him in B, but against screens, walls,
and slow turtles he is exactly the answer.

### Blacksword - dark-tile duelist

Blacksword has a self-contained combo: Dark Ether guarantees a critical attempt,
Darkspread blinds the target on crit, then Dark Tick punishes every blinded enemy
on the board for true damage. Dark Tread rewards dark-tile fights with damage and
lifesteal, while Banish threatens every enemy on dark tiles at the cost of his life.

The kit is strong but tile-conditional and HP-fueled. He can absolutely carry a
planned dark/status shell, but blind drafting him asks for more work.

### Fat Knight - sturdy anti-crit bruiser

Fat Knight is a dependable body. Battle Trauma cancels bonus crit damage and turns
magic hits into temporary STR, Fart now deals 3 true damage when pushes are blocked,
Stumble gives true-damage pathing, and Trample is a useful rage line payoff.

He is especially good in Fat Squad, but outside it he competes with Clod,
Gargoyle, Paladin, and Juggernaut for frontline slots.

### Riot Cop - peeler with a real nerf

Riot Cop still offers a lot: DEF 7, adjacent +1 DEF aura, slow immunity, Cover,
Stun Gun true damage, Smoke Bomb AoE blind, Shield Bash displacement, and finite
USES instead of MP. He is a great protection piece.

The reason he does not rise higher is the current Riot Shield behavior. Defending
still blanks non-critical magic, but critical magic now gets +1 through, so he is
not an absolute caster stop. His own damage is also more control than clock.

### Summoner - variable action economy

Summon is one of the highest-ceiling actions in the game: a full-health ghost
arrives, takes a complete turn, and disappears. Beckon can call a raging ghost,
which makes the ceiling spectacular. The five-choice Soul Shuffle gives agency
without making the result deterministic.

That variance is the point and the weakness. The Summoner's own body is fragile
and low-pressure, and focused burst can end the whole engine.

### Fat Bowman - planted turret

Fat Bowman scales hard when allowed to stand still. Heavy Handed rewards long
range, Planted stacks STR up to +4, Curve Shot pierces units, Dragonsbane has two
poison rolls, and Desperation Shot creates one huge rage attack.

The counterplay is direct: force her to move or outrange her. She is strong in
Siege Line and Fat Squad, less forgiving elsewhere.

---

# C Tier

These units have real tools, but their reliable blind-draft value is narrow or
their floor is unusually punishing.

### Swordsman - fair baseline

Swordsman is not bad. Footwork now deals 3 true damage through enemies, Moonstrike
and Mage Killer bring useful control, Life Sap sustains, and Quick makes him a
dangerous low-HP bruiser.

The issue is roster context. Many newer melee units bring auras, immunity, bodyguard
utility, magic/true pressure, or stronger rage payoffs. Swordsman remains the honest
benchmark, which puts him below the powered-up specialists.

### Miner - self-throttled ranger

Miner can become a functional range-5 ranger after one Ore Harvest, and Blasting
Cap gives true damage plus displacement. Headlamp is no-roll blind, and max ore
adds stats and crit chance.

The problem is that ore is everything at once: ammo, crit scaling, stat scaling,
wall tools, and setup. Shooting spends the same resource he wants to hoard, so his
long-game output repeatedly pauses for mining.

### Big Brother - narrow anti-heal tech

Big Brother is a real counter-pick. Super Magnet makes basic attacks true damage,
Magnetic Field blocks healing near him, Polarity Shift flips HP/MP restoration,
and displacement can ruin formations.

Into sustain walls, that can be the best tool on the board. Into teams that do
not rely on healing, his STR 2 clock and short-range control are much less
threatening.

### Ronin - awkward isolated duelist

Ronin can hit very hard when isolated, especially with Challenge, Broken Oath,
Shuriken true poke, and Final Draw's +12 STR rage. He also has crit healing and
good base melee stats.

The awkward part is that his passive wants him away from allies in a 4-unit squad
game where auras, bodyguards, and healers reward clustering. He is powerful in the
duel he asks for and uneven everywhere else.

### King - ceiling/floor split

King commands can be enormous in human hands. Strike, Hold, Pursue, and Higher
Ground all scale with allied units in RAGE, so a near-dead bruiser squad can become
terrifying. Rally healing when allies fall also creates comeback moments.

The cost is structural. King cannot move, attack, or Defend; he loses 10 HP when
an ally falls; and he cannot sustain victory alone. Drafting him blind means
playing three fighters plus a command engine, and that floor is too low for a
higher tier despite the ceiling.

---

# D Tier

### Archer - outpaced legacy ranger

Archer has useful pieces: permanent poison, 3-turn slow, poison immunity, range-5
Volley true damage, and a strong rage accuracy/crit package. The problem is that
nearly every later ranger or status unit took one of those jobs and sharpened it.

Sniper out-ranges and pierces cover. Angel deals magic and ignores status. Little
Brother brings true cone damage and permanent fire. Fat Bowman outscales if
planted. Virus and Witch Doctor turn status into a whole win condition. Archer is
playable, but she is the easiest draft slot to upgrade.

---

## Final read

The current roster is healthier than a simple S-to-D ladder implies. Most C and D
units have real comps where they matter, and several B units can play like A when
the draft lines up. The main meta change is that defensive value is no longer just
"stack DEF": the best teams combine DEF, Defend, healing, and especially magic
reduction. That is why Necromancer, Treant, Clod, and Gargoyle all grade higher in
this refactor, and why Paladin's new defensive tile payoff pushes him into S.
