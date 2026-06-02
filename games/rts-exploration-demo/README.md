# RTS Exploration Demo v7

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
- Attack-move, patrol, hold-position, or command queue
- Minimap tokens for revealed native creatures/resources
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
