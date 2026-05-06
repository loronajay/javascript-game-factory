# Illuminauts - Game Design Document

## 1. High Concept

**Illuminauts** is a 2-player online shared-maze race game where players navigate a dark alien facility using limited suit-generated light. Players start on opposite sides of the maze and race to reach the illuminated **Beacon Core** at the center.

Players collect **Power Cells** to temporarily expand their suit light, gather **Access Chips** to disable **Laser Doors**, avoid fixed-route **Alien Patrols**, and time their movement around scheduled laser hazards. The game is about route memory, darkness pressure, timing, and indirect competition, not combat.

## 2. Core Identity

Illuminauts is a competitive navigation game built around incomplete information.

Players are not fighting each other. They are racing through the same hostile maze while dealing with darkness, hazards, and uncertainty. The pressure comes from knowing another player may be finding a better route while you are lost, waiting for a laser cycle, recovering from damage, or trying to remember the way back after a respawn.

## 3. Design Pillars

### Limited Vision

Players can only see a small area around their character. The rest of the facility is blacked out. The suit light defines what the player can currently understand.

### Shared Maze, Indirect Competition

Both players exist in the same maze. They can cross paths and briefly see each other if within visible range, but they cannot attack, push, block, steal from inventory, trade, or directly interfere.

### Route Memory

Progress is not only about collecting items. Players must remember corridors, hazards, branches, and unlocked routes. Death sends a player back to their start, but solved route progress remains, making memory the key recovery skill.

### Timing Pressure

Alien Patrols and laser hazards follow readable schedules or routes. Players must wait, sprint, slip behind patrols, and time hallway movement.

### Procedural Fairness

The map can be procedurally generated, but generation must prioritize legal, fair, raceable layouts over randomness. The generator must prove both players have viable routes to the Beacon Core.

## 4. Game Mode

### Primary Mode: 2-Player Online Race

Two players connect through the Factory Network server and enter the same generated maze.

Player A starts on one side of the map. Player B starts on the opposite side. Both players race toward the Beacon Core near the center of the maze.

The first player to reach the Beacon Core wins.

## 5. Player Interaction Rules

Players share the same world but do not directly interact.

Players may pass through each other. Player collision is non-blocking.

Players cannot damage each other, push each other, body-block, trade items, steal keys, or trigger effects on each other.

Players may indirectly affect each other through shared world state. For example, a player may collect a shared Access Chip before the other player finds it, or disable a Laser Door that both players can later pass through.

## 6. Movement

Movement uses classic RPG-style navigation.

The player moves through a tile-based maze using directional input. Movement should feel deliberate and readable rather than physics-heavy.

Recommended controls:

- Keyboard: WASD or arrow keys.
- Gamepad: D-pad or left stick.
- Mobile, if supported later: virtual D-pad or virtual stick.

Movement should support smooth tile stepping or grid-aligned movement, but it should not become a freeform action game. The maze and hazards depend on readable tile positioning.

## 7. Camera and View

Each player has a zoomed-in local view centered around their character.

The game does not show the full maze. The player only sees the nearby section of the facility, and even that area is constrained by suit light.

The visibility stack is:

1. Camera determines what part of the maze could appear on screen.
2. Suit light determines what inside that camera area is actually visible.
3. Power Cells temporarily expand the suit light radius.
4. The Beacon Core emits its own glow when the player gets close enough.

## 8. Fog of War and Light

Players begin with a small circular light radius around their character. Everything outside that radius is blacked out.

The suit light reveals nearby floors, walls, Laser Doors, Power Cells, Access Chips, Alien Patrols, laser hazards, and other players.

Previously seen areas do not remain fully revealed by default. The game should preserve the pressure of darkness. If a memory layer is added later, it should be dim and should not reveal active entities.

## 9. Power Cells

Power Cells are temporary suit-light upgrades.

When collected, a Power Cell overcharges the player's suit illumination system and expands the player's visible radius.

Power Cell rules:

- Power Cells are pickups found in the maze.
- A Power Cell expands the player's light radius for 15 seconds.
- The effect ends early if the player dies.
- If another Power Cell is collected while active, the timer should refresh unless testing supports a better stacking rule.
- Power Cells should not permanently reveal the map.

Power Cells are the sci-fi equivalent of torches. The word "torch" should not be used in final UI unless as internal development shorthand.

## 10. Access Chips

Access Chips are generic key items used to disable Laser Doors.

Access Chip rules:

- Any Access Chip can disable any Laser Door.
- Access Chips are shared-world pickups while on the map.
- Once one player collects an Access Chip, it disappears from the map for both players.
- After collection, the Access Chip belongs only to the player who picked it up.
- Access Chips remain collected after death.
- A player's HUD shows their current Access Chip count.

This creates indirect competition. One player can find an Access Chip that the other player missed, but the collected chip does not go into a shared inventory.

## 11. Laser Doors

Laser Doors are locked energy blockades.

Laser Door rules:

- A Laser Door blocks movement until disabled.
- A player disables a Laser Door by spending one Access Chip.
- Once disabled, the Laser Door remains disabled for both players for the rest of the match.
- Laser Doors do not re-enable after player death.
- Laser Doors are shared-world state.

Laser Doors are progression barriers, not timed hazards.

The game must clearly distinguish Laser Doors from timed laser hazards. Laser Doors are disabled by Access Chips. Timed laser hazards are avoided through movement timing.

## 12. Alien Patrols

Alien Patrols are enemy hazards that follow fixed routes.

They are not combat opponents. They are timing and route-pressure systems.

Alien Patrol rules:

- Alien Patrols follow set patrol routes.
- Routes may loop or reverse.
- Players can observe timing and move behind patrols to explore deeper.
- Contact with an Alien Patrol causes 1 heart of damage.
- Alien Patrols should not chase freely in v1.
- Alien Patrols should not spawn directly on player starts, critical pickups, or unavoidable chokepoints without a safe timing solution.

Alien Patrols should create situations where a player waits in safety, watches the route, then moves through the corridor after the patrol passes.

## 13. Laser Hazards

Laser hazards are scheduled environmental threats. They damage players but do not permanently block progress.

### Laser Gates

Laser Gates are timed beam barriers.

Rules:

- A Laser Gate flickers or charges before activating.
- The flicker gives players a small reaction window.
- When active, the laser beam is thick enough that passing through is not trivial.
- Contact with an active Laser Gate causes 1 heart of damage.
- Laser Gates cannot be disabled with Access Chips in v1.
- Laser Gates should have clear inactive, warning, active, and cooldown states.

Laser Gates should be tile-readable. During the active state, the beam should occupy enough tile space that the player must actually respect the timing.

### Laser Turrets

Laser Turrets are wall-mounted hazards that fire down hallways.

Rules:

- A Laser Turret fires on a fixed schedule.
- The turret should visibly charge or flicker before firing.
- The shot travels down a straight corridor until it hits the opposite wall.
- Contact with the shot causes 1 heart of damage.
- Players must time their hallway progression, wait for the firing cycle, or sprint through safe windows.

Laser Turrets should be used for corridor pressure. They should not create unavoidable hits from off-screen without warning.

## 14. Health and Death

Each player has 3 hearts.

Damage sources include:

- Alien Patrol contact.
- Active Laser Gate contact.
- Laser Turret shots.
- Any future approved hazard type.

Damage rules:

- Each contact with a damaging hazard removes 1 heart.
- After taking damage, the player receives brief invulnerability to prevent repeated damage from the same contact.
- At 0 hearts, the player dies and respawns at their original maze start.

Death rules:

- The player returns to their original starting position.
- Hearts are restored to 3.
- Collected Access Chips remain collected.
- Disabled Laser Doors remain disabled.
- Any active Power Cell effect is canceled.
- Temporary invulnerability and other short-lived effects reset.

Death is a time penalty and route-memory test, not a full progress wipe. The player should not be forced to redo every solved step.

## 15. Sprint and Stamina

Players have a sprint button tied to a stamina bar.

Sprint exists to help players cross dangerous timing windows, escape bad positions, or recover time after route mistakes. It should not let players ignore the maze.

Sprint rules:

- Holding the sprint button increases movement speed.
- Sprint drains stamina while active.
- Sprint stops when stamina is depleted.
- Stamina regenerates when the player is not sprinting.
- Stamina should regenerate slowly enough that sprint timing matters.
- Stamina should not be large enough to let players brute-force long sections of the maze.

The HUD displays the stamina bar.

## 16. Beacon Core

The Beacon Core is the goal room at or near the center of the maze.

The Beacon Core is illuminated, making it visible when players get close enough. However, seeing the glow does not guarantee that the player has found the entrance.

The room may be visible from the wrong side of a wall, creating the feeling that the player is close while still requiring correct navigation.

Beacon Core rules:

- The first player to enter the Beacon Core wins.
- The Beacon Core emits visible light.
- The entrance should not be automatically obvious from all sides.
- The generator must ensure that both players have legal routes to reach it.

## 17. HUD

Each player needs a compact HUD that supports fast reading under pressure.

Required HUD elements:

- Hearts remaining.
- Access Chip count.
- Stamina bar.
- Power Cell active icon or timer.

Optional HUD elements for later:

- Match timer.
- Directional proximity pulse toward the Beacon Core.
- Damage flash.
- Respawn countdown.

The HUD should not reveal maze information that the player has not earned through exploration.

## 18. Procedural Generation

Procedural generation is important to replayability, but it must be constrained. The generator should not simply create a random maze and scatter objects.

The generator must build legality first, then variety.

Required generation guarantees:

- Both players have legal paths from their starts to the Beacon Core.
- Both players' primary routes are roughly comparable in length and difficulty.
- Access Chips are reachable before they are needed for critical Laser Doors.
- The map cannot require both players to collect the same single Access Chip to preserve legal progress.
- Laser Doors should not hard-lock a player out of all progress because the other player collected a shared pickup.
- Alien Patrols do not spawn directly on starts.
- Laser hazards do not create unavoidable damage.
- Power Cells are spaced to support meaningful scouting, not random clutter.
- The Beacon Core is reachable from both sides.

Recommended generation model:

1. Place the Beacon Core near the center.
2. Place Player A and Player B starts on opposite sides.
3. Generate guaranteed legal routes from each start to the Beacon Core.
4. Add branches, loops, and dead ends.
5. Add Access Chips and Laser Doors with solvability checks.
6. Add Alien Patrol routes with safe waiting areas.
7. Add Laser Gates and Laser Turrets with timing-safe corridors.
8. Add Power Cells near decision-heavy junctions, dangerous sections, or route-scouting opportunities.
9. Validate that both players can still reach the Beacon Core.

For v1, locked Laser Doors should usually gate shortcuts, alternate routes, or optional route advantages instead of being the only possible route. Required Laser Doors can be added later after the generator is strong enough to prove fairness.

## 19. Networking Model

Illuminauts is intended for online play using the Factory Network server.

The server should own authoritative game state. Clients should handle input, rendering, UI, camera, animation, sound, and prediction only where safe.

Server-owned state should include:

- Match creation.
- Maze seed or generated maze data.
- Player spawn positions.
- Player validated positions.
- Access Chip pickup state.
- Player Access Chip counts.
- Laser Door disabled state.
- Alien Patrol timing and positions.
- Laser Gate timing.
- Laser Turret timing and shots.
- Player hearts.
- Damage events.
- Death and respawn events.
- Power Cell activation and expiration timing.
- Win detection.

Client-owned presentation should include:

- Camera follow.
- Fog rendering.
- Suit light visuals.
- HUD display.
- Local movement animation.
- Sound effects.
- Input buffering.
- Screen shake or visual feedback.

Clients should not authoritatively decide pickups, damage, deaths, door state, or win state.

## 20. Match Flow

1. Players connect to the Factory Network server.
2. Server pairs two players into a match.
3. Server generates or selects a maze seed.
4. Server assigns opposite-side spawn positions.
5. Players spawn with 3 hearts, 0 Access Chips, full stamina, and normal suit light.
6. Players explore the maze.
7. Players collect Power Cells and Access Chips.
8. Players disable Laser Doors, avoid Alien Patrols, and time laser hazards.
9. On damage, players lose hearts.
10. On death, players respawn at their start with 3 hearts while keeping Access Chips and opened Laser Door progress.
11. First player to enter the Beacon Core wins.
12. Match ends and both players return to post-match/menu flow.

If one player disconnects, the remaining player should be returned to the menu with a message explaining that the opponent disconnected. No reconnect flow is required unless later platform behavior changes.

## 21. Tunable Values

Initial recommended tuning values:

- Hearts: 3.
- Power Cell duration: 15 seconds.
- Base suit light radius: small, enough to read nearby walls and immediate hazards.
- Powered suit light radius: large enough to scout junctions and patrol routes, but not enough to trivialize the maze.
- Sprint duration: short burst, tuned by stamina capacity.
- Stamina regen: moderate, requiring deliberate sprint use.
- Damage invulnerability: brief, enough to prevent multi-hit contact abuse.
- Match length target: approximately 2-4 minutes.

These values should be tuned through playtesting. The current design depends heavily on pacing, visibility radius, and map size.

## 22. Out of Scope for v1

The following are intentionally out of scope for the first version:

- Player combat.
- Weapons.
- Player-vs-player damage.
- Blocking or pushing other players.
- Inventory trading.
- Item stealing.
- Permanent map reveal.
- Complex alien chase AI.
- Boss fights.
- Multiple key colors.
- Character classes.
- RPG stat progression.
- Large campaign structure.
- Cosmetic loadouts.
- Reconnect flow.

These features may be evaluated later, but they should not be included in the initial implementation scope.

## 23. Implementation Priorities

### Phase 1: Single-Match Prototype

- Tile maze rendering.
- Local player movement.
- Camera follow.
- Basic suit light and fog.
- Static test maze.
- Beacon Core win trigger.

### Phase 2: Core Systems

- Power Cells.
- Access Chips.
- Laser Doors.
- Hearts and damage.
- Death and respawn.
- Stamina sprint.

### Phase 3: Hazards and Patrols

- Alien Patrol fixed routes.
- Laser Gates.
- Laser Turrets.
- Hazard telegraphs.
- Damage invulnerability.

### Phase 4: Online Integration

- Factory Network pairing.
- Server-authoritative match state.
- Shared pickups.
- Shared Laser Door state.
- Server-owned hazard timing.
- Win detection.
- Disconnect handling.

### Phase 5: Procedural Generation

- Legal route skeleton.
- Branches and loops.
- Fair start-to-core route validation.
- Pickup placement validation.
- Hazard placement validation.
- Replayable generated maps.

## 24. Design Risks

### Risk: Maze Feels Unfair

If players take damage from hazards they could not reasonably see or react to, the game will feel cheap. Hazards need clear telegraphs and safe timing windows.

### Risk: Death Is Too Punishing

Respawning at the start is severe. Keeping Access Chips and disabled Laser Doors is required to prevent death from becoming a full reset.

### Risk: Fog Makes Navigation Frustrating

The light radius must be small enough to create tension but large enough to make navigation readable. Power Cells should help players scout, not solve the entire maze.

### Risk: Procedural Generation Breaks Fairness

The generator must validate routes and item logic. Random placement without solvability checks will create bad matches.

### Risk: Networking Desync

The server must own critical state. Clients should not independently resolve pickups, damage, doors, hazard timing, or victory.

## 25. Current Canon Summary

Illuminauts is a 2-player online shared-maze race set in a dark alien facility. Players use suit-generated light to navigate, collect Power Cells to expand visibility, gather Access Chips to disable Laser Doors, avoid Alien Patrols and timed laser hazards, and race to reach the Beacon Core. Players can cross paths but cannot directly interact. Damage removes hearts, death respawns the player at their start, and structural progress remains intact. The game is won through navigation, memory, timing, and efficient routing under darkness pressure.
