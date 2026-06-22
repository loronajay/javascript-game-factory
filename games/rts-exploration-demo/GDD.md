# RTS Exploration Demo — Game Design Document

## Authority and purpose

This document is the source of truth for the game’s intended scope. It supersedes all historical version notes and earlier prototype scope. Where implementation differs from this document, the implementation is provisional.

The game is a two-player RTS built around exploration, mirrored map pressure, resource harvesting, base development, neutral objectives, and eventually destroying the opposing Nexus.

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

Zombie Worms guard large organic biomass deposits. They require preparation, grant a brief strength buff to nearby units of the finishing team, and respawn with their associated deposit every three minutes with increased combat statistics.

### Behemoth

Behemoths guard large organic crystal deposits. They are weak to ranged attacks, require a substantial squad, grant a brief defense buff to nearby units of the finishing team, and respawn with their associated deposit every three minutes with increased combat statistics.

### Space Dragon

The Space Dragon is the central, strongest objective. It does not respawn. The finishing team gains extra organic crystal and biomass deposits on its side of the map. Nearby participating units gain defense, movement speed, and strength until they die. The Dragon gains combat statistics every five minutes, making delayed attempts more difficult.

## Implementation order

1. Keep the mirrored map, landmark semantics, and wall roles stable.
2. Add Nexus ownership/health and a neutral-entity system for Drifters, camps, and the Space Dragon.
3. Add resource deposits, harvesting, carrying, and Nexus delivery.
4. Add the shared economy and tiered structure construction/upgrades.
5. Add production units and their specified combat roles.
6. Add neutral respawns, rewards, and timed scaling.
7. Add complete win/loss flow and multiplayer authority.
