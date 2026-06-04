# RTS Exploration Demo v10

Desktop-first modular RTS engine prototype for JavaScript Game Factory.

## Run locally

```bash
python -m http.server 8080
```

Open:

```text
http://localhost:8080
```

## Current scope

This version is still an engine test, not a full RTS. It focuses on map navigation, fog-of-war, unit selection, basic melee combat, destructible route blockers, neutral native creatures, placeholder resource landmarks, minimap readability, and movement/combat crispness.

Players currently start with:

- 3 Scout units
- 3 Grunt units

Scouts are alien recon units. They move faster, reveal more fog, and do not attack.

Grunts are alien melee physical combat units. They can move with scouts, attack destructible membrane wall tiles, and attack neutral native crawlers.

Neutral Crawlers are larger native alien creatures. They guard future resource landmarks, retaliate in melee, leash instead of chasing forever, show health when damaged/in combat, and die when reduced to 0 HP.

## Controls

- Left click: select one owned unit
- Shift + left click: add/remove one owned unit from selection
- Left drag: box-select owned units
- Right click ground: move selected units
- Right click destructible gate: selected grunts distribute attacks across the connected gate segments
- Right click neutral creature: selected grunts attack the creature
- WASD / arrow keys: pan camera
- Space: center camera on selected units
- Escape: clear selection
- F: toggle fog debug
- P: toggle path debug

## New in v7

- Reduced player-unit collision footprints so scouts/grunts move through lanes more cleanly.
- Kept neutral crawlers larger so native monsters still feel like bigger map threats.
- Scaled player-unit visuals down slightly while keeping selection readable.
- Widened authored destructible gates so squad attacks are less cramped.
- Changed destructible wall commands to detect connected membrane gates and distribute grunts across multiple wall segments instead of all targeting the clicked tile.
- Added quick command acknowledgement rings on selected units after move/attack orders.
- Added visual-facing smoothing so units turn more cleanly without making movement feel sluggish.
- Retuned formation spacing and separation to reduce shove/jitter behavior.

## Still intentionally not included

- Economy
- Resource harvesting
- Buildings
- Production
- Multiplayer/lobby integration
- Win/loss conditions
- Team-vs-team enemy player combat
- Patrol, hold-position, or command queue
- Creature reward buffs/debuffs

## Tuning notes

Main knobs are in `src/config.js` and `src/unit-defs.js`.

Important values:

- `CONFIG.formationSpacing`
- `CONFIG.separationRadius`
- `CONFIG.separationStrength`
- `CONFIG.destructibleWallHp`
- `UNIT_DEFS.scout.body.radius`
- `UNIT_DEFS.grunt.body.radius`
- `UNIT_DEFS.grunt.movement.moveSpeed`
- `UNIT_DEFS.grunt.combat.baseDamage`
- `UNIT_DEFS.grunt.combat.attackCooldown`
- `UNIT_DEFS.grunt.combat.windupTime`
- `UNIT_DEFS.grunt.combat.attackRange`
- `UNIT_DEFS.neutralCrawler.body.radius`
- `UNIT_DEFS.neutralCrawler.combat.baseDamage`
- `UNIT_DEFS.neutralCrawler.combat.acquireRange`
- `UNIT_DEFS.neutralCrawler.combat.leashRange`
- `UNIT_DEFS.scout.vision.revealRange`
- `UNIT_DEFS.grunt.vision.revealRange`

Wall destruction timing is based on contact time, not travel time. If grunts start far from the target, total time includes pathing to the wall first.


## v8 layering patch

- Moved world UI overlays into a dedicated late render pass.
- Health bars, command acknowledgement rings, attack reticles, move markers, and debug paths now render above units, neutral creatures, walls, and fog-edge overlap.
- Added selected-target brackets so active attack targets remain readable when units and crawlers overlap.


## v9 command architecture patch

- Added `src/commands.js` as the command-system boundary. Player right-click actions now create command objects instead of directly mutating unit orders.
- Current local commands: `MOVE_UNITS`, `ATTACK_UNIT`, and `ATTACK_DESTRUCTIBLE`.
- Command objects include `id`, `team`, `unitIds`, `source`, and `issuedAtTick`, which is the shape needed for later AI injection and server-authoritative multiplayer.
- Added a fixed 60 Hz simulation step in `src/main.js`. Rendering still uses `requestAnimationFrame`, while units/combat/fog advance through simulation ticks.
- Replaced gameplay timing calls in `src/units.js` with simulation time so attack windup, combat state, and command acknowledgements are no longer tied directly to wall-clock render timing.
- Added explicit unit-command methods such as `moveUnitsTo`, `attackUnitsUnit`, and `attackUnitsDestructible`; selected-unit wrappers remain for compatibility.
- Added `src/snapshot.js` and exposed `window.__rtsDebugSnapshot()` for quick plain-data inspection of tick, units, selected IDs, destructibles, and recent commands.
- HUD now shows simulation tick and command history count.

## Server-authority direction

This build does not integrate with `factory-network-server` yet. It prepares for that integration by making local input produce the same command objects that AI and server-approved multiplayer messages can eventually produce. The intended future flow is:

```text
input / AI / network -> command system -> fixed-tick simulation -> renderer
```

For the platform server, the likely path is server-authoritative or host-authoritative command validation, not deterministic lockstep yet.


## v10 local command/mode patch

- Added `ATTACK_MOVE_UNITS` and `STOP_UNITS` commands to `src/commands.js`.
- Added attack-move mode: press `Q`, then left-click ground. Combat-capable selected units move toward the target and acquire hostile/neutral units along the way.
- Added stop command: press `X` to cancel selected units' current movement/attack orders.
- Attack-move state is preserved while a unit temporarily breaks off to fight; after the target dies, the unit resumes its attack-move destination.
- Revealed native crawlers now remain represented on the minimap after discovery. Currently visible crawlers render brighter; previously discovered but not currently visible crawlers render dimmer.
- Revealed resource landmarks now get minimap tokens after discovery, using distinct colors for biomass and crystal placeholders.
- Debug snapshots now include unit `attackMoveTarget`, unit `discovered`, and resource discovery state.

Additional controls:

- `Q`: arm/cancel attack-move mode
- `Q` then left-click ground: attack-move selected combat units
- `X`: stop selected units


## v13 patch notes

- Fixed enemy unit targeting for moving player/AI units. Attack slots against unit targets now follow the moving target instead of staying at the target position from the original click.
- Grunts now repath when their assigned melee slot moves away from their current path endpoint.
- Combat-capable non-neutral units can retaliate when damaged, while scouts remain non-combat recon units.
