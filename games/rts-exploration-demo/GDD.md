# RTS Exploration Demo — Game Design Document

## Authority and purpose

This document is the source of truth for the game’s intended scope. It supersedes all historical version notes and earlier prototype scope. Where implementation differs from this document, the implementation is provisional.

The game is a two-player RTS built around exploration, mirrored map pressure, resource harvesting, base development, neutral objectives, and eventually destroying the opposing Nexus.

## Implementation status — 2026-06-22

### Implemented foundation

- Level 01 has an authored reference-map layout, typed legend landmarks, grey breakable walls, and distinct transit/objective wall roles.
- Transit walls are thin and quick to break; objective walls are thicker and protect the Space Dragon or large-resource areas.
- Scouts and Grunts can select, move, attack-move, stop, attack units, and attack breakable walls under a fixed-timestep simulation.
- The two gold-map Drifters are live neutral units with authored vertical patrol routes. They pause patrol while engaged in combat.
- Both authored Nexus landmarks are live owned structures with health, combat targeting, fog-aware presentation, and debug visibility. Their destruction does not yet end a match.

### Not implemented yet

- Nexus destruction and win/loss flow.
- Drifter rewards, three-minute respawns, and scaling.
- Behemoth, Zombie Worm, and Space Dragon entities, combat, rewards, respawns, and scaling.
- Deposits, Harvesters, carrying/delivery, economy, structures, production, tiers, and all unspecific costs/tuning.

### Next approved direction

Use the Nexus entity foundation for deposits, harvesting, and the rest of the economy.

## Win condition

Each player owns one Nexus. A player wins by destroying the opposing Nexus. Nexus structures cannot be built.

## Level 01 map

`map-reference.png` is the visual reference. The board is split by an implied diagonal, with mirrored player-side layouts and a Space Dragon objective at the centre. Natural wall tiles and resource layouts are mirrored between sides.

### Legend

| Marker | Meaning |
| --- | --- |
| Large blue circle | Player 1 Nexus |
| Large red circle | Player 2 Nexus |
| Solid cyan square | Behemoth camp and large organic crystal deposit |
| Solid green square | Zombie Worm camp and large organic biomass deposit |
| Outline cyan square | Large organic crystal deposit unlocked after the Space Dragon dies |
| Outline green square | Large organic biomass deposit unlocked after the Space Dragon dies |
| Gold circle | Drifter |
| Purple centre square | Space Dragon |
| Cyan circle | Small organic crystal deposit |
| Green circle | Small organic biomass deposit |

### Natural walls

Natural wall tiles are breakable, do not respawn, and yield one weak-steel piece when broken and harvested. They have two authored roles:

- Transit walls: thin, quick-to-break exits and route barriers.
- Objective walls: thicker, high-investment protection around large-resource camps and the Space Dragon.

Players may later build Pillars: breakable, buildable wall structures that can be placed anywhere on the map.

## Resources

The economy uses weak steel, strong steel, organic biomass, organic crystals, synth biomass, and synth crystals.

- Organic deposits are harvested by Harvesters and transported to the Nexus.
- Small organic deposits are unguarded, one-time deposits. Each player side receives the same count and placement counterpart.
- Large organic deposits are guarded and respawn three minutes after harvest, together with their guardian. Each guardian respawn is stronger.
- Weak steel is obtained from broken natural walls and may also be synthesized by a Weak Steel Foundry.
- Strong steel is synthesized only by a Strong Steel Foundry.
- Crystal and biomass synthesizers create less-potent synth resources slowly.

Exact costs, yields, carry capacities, construction times, and tier multipliers are intentionally not yet specified.

## Structures

All structures have three tiers. Higher tiers yield resources faster or improve the relevant production function. Structures and upgrades consume case-by-case combinations of resources; organic and synth biomass/crystals may both satisfy a category, but synth materials require greater quantities.

- Nexus — home base and loss condition; not buildable.
- Pillar — buildable breakable wall tile; permitted anywhere.
- Scout, Grunt, Brute, Builder, Harvester, Wyvern, Ranger, Cannon, and Mechanic production structures.
- Crystal Synthesizer and Biomass Synthesizer.
- Weak Steel Foundry and Strong Steel Foundry.

All structures other than Pillars are restricted to their owner’s side of the map.

## Player units

Combat units have three tiers; higher tiers improve their combat statistics.

| Unit | Role and matchups |
| --- | --- |
| Scout | Non-combat exploration unit; weak to Grunts; works best with protection. |
| Spy | One per player at match start; non-buildable, very low HP, smaller and faster than Scouts. |
| Grunt | Cheap melee squad unit; strong in groups, against non-combat and ranged units; weak to flying units. |
| Brute | Stronger, tougher Grunt with the same matchup profile. |
| Builder | Builds structures and Pillars; multiple Builders accelerate work; very weak in combat and vulnerable to Grunts. |
| Harvester | Non-combat resource collector and transporter; vulnerable to Grunts. |
| Wyvern | Flying combat unit; strong against melee, weak to ranged. |
| Ranger | Ranged combat unit; strong against flying, weak to melee. |
| Cannon | Stationary ranged base-defense unit; weak to Mechanics. |
| Mechanic | Repairs units and structures, and dismantles Cannons and other stationary units; otherwise non-combat and vulnerable to Grunts. |

## Neutral objectives

### Drifter

Drifters patrol up and down their authored routes. Killing one grants one organic biomass and a brief movement-speed buff to nearby units of the finishing team. A Drifter respawns three minutes after death and becomes stronger each time.

### Zombie Worm

One Zombie Worm guards each large organic biomass deposit. Its existing camp placement has three burrow holes; the Level 01 map layout is not changed for this encounter.

- Only one hole is active at a time. The Worm emerges from a randomly selected hole, remains above ground for 10 seconds, then burrows.
- After 1.5 seconds underground, it emerges from a randomly selected hole. It may select the same hole it just used.
- The Worm is attackable and can be killed only while it is above ground.
- While emerged, it attacks by swinging its head through a forward half-circle, damaging every enemy unit within that sweep/range.
- It retains the existing brief strength reward for nearby units of the finishing team, and it respawns with its associated deposit after three minutes with increased combat statistics.

The biomass deposit should read as an organic, burrowing creature lair: a central biomass growth with the three emergence holes clearly legible around it.

### Behemoth

Behemoths guard large organic crystal deposits. While unengaged, a Behemoth walks a circular patrol around its crystal deposit; this is a movement path, not a wall enclosure or a map-layout change.

- Its melee attack deals high splash damage.
- It can also throw boulders at range, and those boulders deal splash damage on impact.
- It is weak to ranged attacks, requires a substantial squad, grants a brief defense buff to nearby units of the finishing team, and respawns with its associated deposit every three minutes with increased combat statistics.

The crystal deposit should feel like a large, valuable crystal formation with a clear circular patrol space for its guardian.

### Space Dragon

The Space Dragon is the central, strongest objective. It does not respawn. The finishing team gains extra organic crystal and biomass deposits on its side of the map. Nearby participating units gain defense, movement speed, and strength until they die. The Dragon gains combat statistics every five minutes, making delayed attempts more difficult.

## Implementation order

1. Add Nexus ownership/health and a neutral-entity system for camps and the Space Dragon.
3. Add resource deposits, harvesting, carrying, and Nexus delivery.
4. Add the shared economy and tiered structure construction/upgrades.
5. Add production units and their specified combat roles.
6. Add neutral respawns, rewards, and timed scaling.
7. Add complete win/loss flow and multiplayer authority.
