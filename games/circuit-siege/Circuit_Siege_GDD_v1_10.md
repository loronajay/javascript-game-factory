# Circuit Siege — GDD v1.11

## 1. Overview

**Circuit Siege** is a real-time 2-player route-tracing puzzle duel built for the JavaScript Game Factory.

Two players compete online on one shared circuit-floor board. A locked source zone at the top of the map feeds 20 separate wires into the board: 10 blue-side routes and 10 red-side routes. Each player repairs only their own color-coded routes.

Every source wire has exactly one authored canonical route to exactly one visible terminal. Routes may visually overlap, cross, layer, or run parallel, but they must never logically merge, split, branch, or share conductive paths.

Each player has 10 possible terminal routes:

- 5 visible damage terminals
- 5 visible dud terminals

Players must trace which top source wires lead to damage terminals and complete those routes before the opponent completes theirs.

The first player to complete 5 damage circuits wins.

Circuit Siege is online by design. Public matchmaking and private room matchmaking are core requirements, not later expansion features.

## 2. Core Pitch

Two players sit in opposing command chairs while a dense shared circuit board sits between them. Power feeds from a locked upper source zone into a maze of broken red and blue wire routes. Players race simultaneously to repair their own color-coded routes by inserting or refactoring simple floor-wire tiles.

The rules are intentionally minimal. There are no moving avatars, no turn system, no special powers, no switches, no gates, no splitters, and no complex circuit logic.

The challenge comes from:

- fast visual route tracing
- identifying which sources lead to damage terminals
- avoiding dud terminals
- repairing the correct routes under pressure
- reading layered wire paths without being tricked by visual overlap

The game should feel pressured, not arbitrary. Visual complexity is allowed. Logical ambiguity is not.

## 3. Genre

Circuit Siege is a real-time 2-player strategy puzzle game.

The game is board-game-like in structure, but it has arcade pressure because both players act simultaneously.

## 4. Player Count and Product Model

V1 supports 2 players.

Circuit Siege is an online 1v1 game. There is no local-first product mode.

Local play may be useful for internal debugging, but it should not shape the product design or implementation assumptions.

Core V1 online requirements:

- public matchmaking
- private room matchmaking
- online 1v1 matches
- server-authoritative match state
- deterministic route validation
- shared platform disconnect behavior

## 5. Matchmaking Model

Circuit Siege follows the platform’s standard online-game flow: players can enter either public or private matches.

### 5.1 Public Matchmaking

Public matchmaking allows a player to queue for an opponent and enter a 1v1 match when another compatible player is available.

Baseline public flow:

1. Player chooses public match.
2. Client connects to matchmaking service.
3. Server places player into queue.
4. When a second player is found, server creates a match room.
5. Server assigns blue/red sides.
6. Both clients load the same board state from the server.
7. Match countdown begins.
8. Match runs server-authoritatively until win/loss/draw/disconnect.

### 5.2 Private Matchmaking

Private matchmaking allows players to play with a specific opponent.

Baseline private flow:

1. Player creates private room.
2. Server creates a room code or invite link.
3. Second player joins the room.
4. Both players ready up, or the match starts when both are present depending on final platform flow.
5. Server assigns blue/red sides.
6. Server loads the board.
7. Match countdown begins.

Private rooms are part of the core online model, not optional polish.

### 5.3 Shared Platform Online Behavior

Circuit Siege should use the platform’s existing online-game behavior patterns for:

- connection lifecycle
- public matchmaking integration
- private room handling
- disconnect handling
- disconnect-to-menu behavior

These shared platform mechanics should not be redefined uniquely for Circuit Siege unless the game needs a specific exception.

## 6. Disconnect Behavior

Circuit Siege follows the shared platform disconnect rule.

There is no reconnect flow.

If either player disconnects during a match:

- the active match ends
- the remaining connected player is returned to the game menu
- the menu displays a clear disconnect message
- the match does not continue in the background
- the disconnected player cannot rejoin the same active match state

Acceptable disconnect messages include:

- host disconnected
- partner disconnected
- opponent disconnected

This behavior applies to both public and private matches unless the platform-level online system changes later.

## 7. Match Rules

### 7.1 Match Target

A normal match should last approximately 2–4 minutes.

If matches regularly end in under 90 seconds, the route layout is too easy.

If matches regularly exceed 5 minutes, the board is too hard to read or contains too much unresolved ambiguity.

### 7.2 Match Timer

Standard matches use a 5-minute timer.

The primary win condition is first player to complete 5 damage routes.

If the timer expires before either player completes 5 damage routes, the match ends in a draw.

V1 does not need additional timer tiebreak logic.

### 7.3 Win Condition

Each player has 5 damage routes.

Each completed damage route scores 1 point.

The first player to score 5 points wins.

Dud routes do not score.

### 7.4 Simultaneous Completion

Both players act at the same time. There are no turns and no normal-play waiting states.

If both players complete their fifth damage circuit on the same server tick, V1 may resolve using earliest server-received valid action timestamp.

If the timestamp comparison still cannot resolve the result cleanly, declare a draw.

Do not overbuild tie logic in V1.

## 8. Board Structure and Scale

The game uses one shared main board.

The board is visually shared, but route ownership is color-coded:

- Blue player traces blue routes.
- Red player traces red routes.

The board is made primarily of:

- fixed floor-wire tiles
- editable pre-placed floor-wire tiles
- empty holes where new tiles can be inserted
- terminal endpoints
- plain floor tiles
- source-feed tiles from the top source zone

The board should look dense and maze-like, but the route logic must remain strict and deterministic.

### 8.1 Grid Size

Grid size is independent from source and terminal count.

The game has 10 source feeds and 10 terminals per side, but that does not mean each side should be a 10x10 grid.

V1 should target a 20x20 grid per side.

The full shared board target is approximately 41x20 before outer UI, source-zone framing, terminal framing, and player base presentation are added.

That layout is:

- 20x20 blue-side route grid
- 1 center divider/wall column
- 20x20 red-side route grid

The center column represents the dividing wall or neutral separator between the two mirrored sides.

Each side should have:

- 10 source feeds
- 10 terminal endpoints
- 20x20 internal route space
- one-tile spacing between source feeds where possible
- one-tile spacing between terminal endpoints where possible
- enough internal space for 10 non-mixing canonical routes
- enough internal space for at least 3 repair points per route
- enough internal space for the preferred 5 repair points per route on standard competitive maps

The board should scale to support the route design. The route design should not be compressed into an arbitrary 10x10 footprint.

Do not add junction logic, T-pieces, route merging, or shared conductive paths to solve layout pressure. Increase board dimensions and use layered visual overlaps first.

## 9. Locked Source Zone

At the top of the map is a locked non-interactive source zone.

This area represents the power trunk feeding the board.

The source zone is a world element used for clarity and immersion. Players cannot interact with it.

The source zone contains 20 source wires total:

- 10 blue source wires
- 10 red source wires

Each top source wire must visibly feed into the main board.

## 10. Canonical Route Isolation Rule

This is a hard design rule.

Every top wire has exactly one canonical route to exactly one terminal.

Routes are authored from source to terminal at match start. The canonical route path exists in the board data before players begin interacting. Players repair known route paths; they do not create arbitrary new route identities.

Source wire index does not imply terminal index.

Source 1 does not automatically route to Terminal 1.

Source 10 does not automatically route to Terminal 10.

The source-to-terminal mapping is authored per map and should be intentionally non-linear so the puzzle requires actual route tracing.

Each route record must explicitly define:

- source ID
- terminal ID
- canonical tile path
- route owner/color
- mirrored counterpart route ID

### 10.1 Visual Overlap vs. Logical Mixing

Routes may visually:

- overlap
- run near each other
- pass over or under each other
- run parallel in layers
- cross perpendicularly
- appear layered for maze readability
- diverge after a shared-looking visual segment

However, routes must never logically mix.

Logical route mixing is forbidden.

That means routes must not:

- electrically merge into one route
- electrically split from one route into multiple routes
- branch
- share a conductive connection
- transfer power between routes
- allow one source to resolve another route’s terminal
- feed multiple terminals
- terminate in empty space

A visual overlap is allowed only if the map data preserves route separation.

If two routes appear to cross or overlap, the crossing must be represented as a visual overpass/underpass, layered tile, bridge-style art treatment, or equivalent non-mixing presentation. The player must be able to understand that the wires visually overlap without electrically connecting.

Every route must lead to either:

- one damage terminal
- one dud terminal

The entire game depends on mental route tracing. Visual overlap can create useful confusion. Logical mixing would make the rules nonsensical.

## 11. Route Ownership

Each player only traces their own 10 routes.

The blue player ignores red wires.

The red player ignores blue wires.

This prevents players from wasting time chasing the opponent’s routes.

The shared board can still look dense and intertwined, but route responsibility must be visually clear through color, shape language, framing, or another readable secondary support if needed.

## 12. Mirrored Map Fairness Rule

V1 maps are mirrored for competitive fairness.

The blue side and red side should use mirrored route layouts so both players solve equivalent route structures at the same time.

Routes are mirrored in the same way terminals are mirrored. Each blue route has a corresponding red route across the board centerline.

Mirroring must preserve:

- route count
- route length
- bend count
- repair point count
- hole count
- refactorable tile count
- terminal positioning by mirror
- source positioning by mirror
- route difficulty
- non-linear source-to-terminal mapping complexity

Balanced asymmetric maps may be explored later, but they are not V1. V1 should use mirrored maps because they are easier to validate and less likely to create side-advantage problems.

### 12.1 Terminal and Route Mirror Mapping

Terminal truth and route identity must mirror across the board centerline using inverse terminal indices.

Rules:

- Blue terminal `n` mirrors Red terminal `11 - n`.
- Blue route `n` mirrors Red route `11 - n`.
- Blue source wire `n` mirrors Red source wire `11 - n` when using the same left-to-right side indexing convention.

Same-index mirroring is incorrect for horizontally mirrored maps.

Linear source-to-terminal mapping is also incorrect as a default puzzle assumption.

Inverse-index mapping table:

- Blue 1 mirrors Red 10
- Blue 2 mirrors Red 9
- Blue 3 mirrors Red 8
- Blue 4 mirrors Red 7
- Blue 5 mirrors Red 6
- Blue 6 mirrors Red 5
- Blue 7 mirrors Red 4
- Blue 8 mirrors Red 3
- Blue 9 mirrors Red 2
- Blue 10 mirrors Red 1

If Blue terminal 1 is a damage terminal, Red terminal 10 must be a damage terminal.

If Blue route 4 contains 5 repair points, Red route 7 must contain the mirrored equivalent repair points.

The mirror rule preserves geometry and terminal truth across sides. It does not require linear source-to-terminal pairing.

## 13. Terminal System

Each side has 10 visible terminals:

- 5 visible damage terminals
- 5 visible dud terminals

The terminal endpoints must be visible on the board.

Every route must visually terminate at exactly one terminal.

Terminal type is not hidden. Damage terminals and dud terminals are visibly marked from the start of the match.

The challenge is tracing which top source wire leads to which visible terminal, then repairing the damage routes faster than the opponent.

Terminal configurations may change per match. The same board can reuse its mirrored route layout while changing which terminal positions are damage and which are dud, as long as each side still has exactly 5 damage terminals and 5 dud terminals.

Terminal truth must obey the inverse-index mirror rule defined in Section 12.

Completed terminals remain visible after resolution.

A completed damage terminal should remain visibly completed as a successful hit.

A completed dud terminal should remain visibly completed as a false route.

### 13.1 Damage Terminals

A damage terminal is a visible scoring endpoint.

When a player completes a route to a damage terminal:

- the route powers up
- the full route stays lit for the rest of the match
- the wire path glows clearly from source to terminal
- the scoring player gains 1 point
- the opponent’s chair/base plays a hurt animation
- the terminal is marked completed
- that route cannot score again
- all editable slots assigned to that completed route become locked

Damage terminals represent successful attacks against the opposing player.

The persistent glow is required. Players should be able to glance at either side of the board and immediately see which damage routes have already been completed.

### 13.2 Dud Terminals

A dud terminal is a visible non-scoring endpoint.

A dud route can still be completed.

When a player completes a route to a dud terminal:

- the route powers up briefly
- the dud terminal flickers or fails
- no point is awarded
- no damage animation plays
- the terminal is marked completed as a dud
- the route remains visibly resolved with a weaker false/failed state
- all editable slots assigned to that completed route become locked

Dud routes are intentional time traps.

In V1, the penalty for completing a dud route is wasted time and route lock-in.

A completed dud route should remain readable, but it should not glow with the same intensity as a completed damage route.

## 14. Floor-Tile System

The board is made of floor tiles.

The wires are part of the floor-tile graphics.

There are only two usable wire piece families:

- straight
- corner

Straight pieces support two orientations:

- horizontal
- vertical

Corner pieces support four rotations:

- north-east
- east-south
- south-west
- west-north

There are no other wire shapes in V1.

Do not add:

- T-junctions
- cross-junctions
- splitters
- switches
- gates
- bridges as conductive logic
- relays
- blockers
- bombs
- powerups

Visual overpass/underpass art is allowed, but it is not a conductive bridge mechanic.

## 15. Tile Categories and Editable Slots

The player-facing editability rule is simple: a slot is either editable or not editable.

### 15.1 Tile Categories

Source tiles belong to the locked upper source zone. They are not editable. They visually show where power enters the board.

Fixed tiles are authored route pieces. They cannot be changed by either player.

Empty holes are missing floor tiles. Players can insert a valid wire piece into a hole if the hole belongs to their route side or is otherwise marked as editable for them. A hole is an editable slot with no tile currently placed.

Editable pre-placed tiles start with a wire piece already placed but are marked as refactorable. A refactorable tile can be rotated or replaced with a different valid piece.

Plain floor tiles are non-wire terrain. They exist for board structure and visual spacing. They are not route pieces.

Terminal tiles are route endpoints. Each terminal corresponds to exactly one route and resolves as either damage or dud.

### 15.2 Editable Slot Lifecycle

A hole is an editable slot with no tile currently placed.

A refactorable pre-placed tile is an editable slot with a tile already placed.

A fixed tile is not editable.

If a player places a tile into a hole, that tile remains editable.

If a player rotates or replaces a tile in an editable slot, that slot remains editable.

Editable slots stay editable until their route is completed.

Once a route is completed, all editable slots assigned to that route become locked and can no longer be edited.

The player must be able to instantly distinguish:

- editable hole
- editable pre-placed tile
- non-editable fixed tile
- terminal
- source tile

Editable slots should use a consistent visual marker, such as:

- glowing bracket frame
- highlighted border
- socket frame
- subtle pulse
- hover/selection outline

The player should never need to guess whether a tile or hole can be edited.

## 16. Player Actions

Players do not move avatars around the board.

Players interact with the grid as a constrained editor.

V1 player actions:

- select straight horizontal tile
- select straight vertical tile
- select corner tile family
- rotate selected/refactorable tile
- replace a refactorable tile
- insert a tile into an empty hole

The player selects a corner family, then rotates it into one of the four valid corner orientations.

The game should not support freeform drawing.

The player cannot edit arbitrary fixed tiles.

## 17. Tool HUD

Each player has a tool HUD.

The tool HUD should include:

- straight horizontal piece
- straight vertical piece
- corner piece
- rotate action
- replace action

The HUD should be color-themed:

- blue tools for blue player
- red tools for red player

The selected tool must be obvious.

The HUD should not include advanced mechanics in V1.

## 18. Input Model

### 18.1 Mouse / Touch

Baseline mouse/touch flow:

1. Player selects a tool.
2. Player selects a valid editable tile or hole.
3. The requested action is submitted to the rules system.
4. The state layer validates or rejects the action.
5. The renderer updates from state.

### 18.2 Keyboard / Gamepad

Baseline keyboard/gamepad flow:

- D-pad / arrows / stick moves a grid cursor.
- Face button places selected tile.
- Another button rotates.
- Shoulder buttons cycle tools.
- Start pauses or opens the platform-level pause/menu flow if allowed during online play.

Gamepad support should be considered early because JavaScript Game Factory should support arcade-like input setups.

## 19. Route Complexity Requirement

Each standard route must contain at least 3 repair points.

The preferred competitive target is 5 repair points per route.

Each standard route must include at least:

- 1 editable hole
- 1 editable pre-placed/refactorable tile

A repair point may be:

- an editable hole where a tile must be inserted
- an editable pre-placed tile that must be rotated
- an editable pre-placed tile that must be replaced

This requirement applies to both damage routes and dud routes. Dud routes must require believable effort or they will become obvious throwaway paths.

Routes with fewer than 3 repair points are too simple and should be rejected by map validation unless explicitly marked as tutorial content.

Routes that contain only holes or only refactorable tiles should not be used for standard competitive maps.

For procedural generation, the route validator must count repair points per route and reject generated routes that do not meet the minimum complexity threshold or required repair-type mix.

## 20. Route Validation and Auto-Resolution

### 20.1 Route Validation

A route is valid when it forms a continuous connected line from its top source wire to its assigned terminal.

Adjacent wire pieces must connect directionally.

Examples:

- a tile with an east opening must connect to a neighboring tile with a west opening
- a vertical straight tile connects north/south
- a horizontal straight tile connects east/west
- a corner tile connects its two rotated directions

A route is complete only if every required connection is valid from source to terminal along that route’s canonical path.

Visual route overlap does not count as a connection.

Visual crossings never create connectivity.

In V1, separate route IDs must never electrically connect.

The renderer must never decide whether a route is complete.

Route validation belongs to the rules/state layer.

### 20.2 Automatic Completion Resolution

There is no manual submit or power-check action.

Routes auto-resolve as soon as the server detects that the canonical route has been successfully completed from its source wire to its terminal.

The server should validate affected routes immediately after every accepted edit.

When a route resolves, the server applies the terminal behavior defined in Section 13.

A completed terminal cannot score repeatedly.

A completed route cannot be edited after resolution.

## 21. Visual States and Feedback

The renderer must support clear visual states for routes, terminals, and editable tiles.

### 21.1 Route States

Core route states:

- unresolved route
- currently editable route
- completed damage route
- completed dud route
- locked route

Completed damage routes stay lit and glow from source to terminal for the rest of the match.

Completed dud routes remain visible as resolved, but use a weaker false/failed visual treatment so they are not confused with successful damage routes.

Locked route tiles must remain readable as resolved and no longer editable.

### 21.2 Tile States

Core tile states:

- fixed tile
- editable empty hole
- editable pre-placed tile
- selected editable slot
- invalid action target
- locked completed-route tile

### 21.3 Terminal States

Core terminal states:

- unresolved damage terminal
- unresolved dud terminal
- completed damage terminal
- completed dud terminal

### 21.4 Completion Feedback

Damage completion should feel forceful.

Recommended damage feedback:

- power surge travels from top source to terminal
- terminal flashes
- opponent chair shocks
- opponent panel shakes
- score pip fills
- completed route glows or locks

Dud completion should feel readable but weaker.

Recommended dud feedback:

- route flickers
- terminal sputters
- false-signal icon appears
- no chair damage occurs
- no score pip fills

Dud feedback must clearly communicate: this route was valid but not valuable.

Players should be able to glance at either side of the board and understand:

- which routes are completed
- which terminals have resolved
- which routes are still available
- which editable slots are still usable

## 22. Player Chairs and Base Presentation

Each player has a visible chair/base presentation area.

The chair is not a controllable avatar.

It represents the player’s command position and damage recipient.

When a player is hit by a damage route, their chair/base reacts.

Possible effects:

- electric shock
- spark burst
- screen shake
- damage flash
- warning light
- broken circuit pip
- short hurt animation

The chairs help make scoring feel physical and readable.

## 23. Board Readability Requirements

The board should be dense enough to create route-tracing pressure, but not so ambiguous that players feel cheated.

Good complexity:

- dense route layouts
- false-looking paths
- long winding routes
- holes placed in pressure points
- editable tiles that may be misaligned
- color-coded side ownership
- visible terminal endpoints
- visual route overlaps that do not logically connect
- layered over/under wire treatments that preserve route separation
- parallel layered wires that later diverge clearly
- perpendicular crossings that are visibly non-connecting

Bad complexity:

- routes that logically merge
- routes that logically branch
- routes that share conductive connections
- routes that disappear without a terminal
- unreadable tile art
- tiny visual connections
- hidden connection rules
- terminals that are not visibly connected to routes
- ambiguous ownership
- visual overlaps that look like electrical connections when they are not
- parallel overlaps where the player cannot tell which wire continues where after divergence
- color-only information with no secondary support if accessibility is needed later

Visual overlap is allowed because it supports route-tracing confusion.

Layering is required where overlaps occur so players can still follow which wire goes where after routes diverge.

Logical mixing is forbidden because it breaks the game’s source-to-terminal route model.

## 24. V1 Board Scope

V1 should use one authored mirrored board.

Do not start with procedural generation.

The V1 board should include:

- 20x20 grid space per side
- 1 center divider/wall column
- approximately 41x20 total shared board space before UI/framing
- one locked upper source zone
- 20 total source wires
- 20 total terminals
- 10 blue routes
- 10 red routes
- 10 blue terminals
- 10 red terminals
- 5 visible damage terminals per side
- 5 visible dud terminals per side
- mirrored blue/red route layout
- inverse-index mirrored terminal truth
- explicit non-linear source-to-terminal mapping
- strict one-source-to-one-terminal route identity
- no logical route merging or branching
- visual overlap only with non-mixing route separation
- layered overlap/divergence treatment where wires pass over, under, or alongside each other
- one-tile spacing between source feeds where possible
- one-tile spacing between terminal endpoints where possible
- enough empty holes and refactorable pre-placed tiles to satisfy the Route Complexity Requirement
- enough fixed tiles to create a clear maze

The first board should be designed for correctness first, visual density second.

## 25. Future Map System

After V1 works, the game can expand into multiple route configurations.

Recommended roadmap:

### V1

One authored board.

### V2

Several authored boards.

### V3

Template-based map variants with shuffled route truth values and hole placements.

### V4

Procedural route generation with validation.

Procedural generation should not be attempted until the core route validator and authored boards prove the design.

## 26. Procedural Generation Requirements

If generated maps are added later, the generator must validate every generated map before a match starts.

Generated maps must guarantee:

- approximately 20x20 route space per side unless a map tier intentionally changes board size
- exactly 10 routes per side
- exactly 20 routes total
- each route has one source and one terminal
- source-to-terminal mapping is explicit
- terminal ID is not inferred from source ID
- terminal ID is not inferred from route ID
- source-to-terminal mapping is non-linear enough to require tracing
- routes satisfy the Canonical Route Isolation Rule
- no route crosses to the wrong side
- every route is solvable
- every route satisfies the Route Complexity Requirement
- every side has 5 visible damage terminals and 5 visible dud terminals
- mirrored maps obey inverse-index terminal truth
- mirrored maps obey inverse-index route identity
- route difficulty is mirrored or otherwise validated as equivalent
- no route begins already completed unless explicitly intended
- every terminal is reachable through its assigned route
- visual density does not destroy readability

Generated content must be validated before a match starts.

## 27. Online Architecture Requirements

The game must be state-driven and server-authoritative.

The renderer is not the source of truth.

The client may handle:

- input collection
- local hover states
- tool selection UI
- animation
- prediction-friendly visual feedback

The match server owns:

- room membership
- side assignment
- board configuration
- terminal truth
- accepted edits
- route validation
- scoring
- win/loss/draw result
- disconnect/forfeit handling

Clients do not decide route completion or scoring.

### 27.1 Server Match State

Server match state owns:

- match ID
- room type
- player slots
- player ready states
- countdown state
- match phase
- authoritative tick/time
- board configuration seed or map ID
- terminal truth assignments
- score state
- win/loss/draw result

### 27.2 CircuitMapState

CircuitMapState is owned by the server.

It includes:

- board dimensions
- tile map
- source wires
- route definitions
- terminal definitions
- piece placements
- locked states
- completed states

### 27.3 PlayerState

Server-owned player fields:

- player ID
- side/color
- score
- committed cursor/grid target if needed
- valid action cooldowns
- connection status
- ready status

Client-owned presentation fields:

- selected tool
- hover tile
- local cursor animation
- UI focus state
- local input state

### 27.4 RulesSystem

RulesSystem owns:

- legal placement validation
- tile replacement validation
- rotation validation
- route connection validation
- terminal resolution
- scoring
- win detection

### 27.5 InputSystem

InputSystem is client-side.

It owns:

- keyboard input
- mouse input
- touch input
- gamepad input
- conversion of input into player action requests

Input requests are sent to the server as intents.

The server approves, rejects, and broadcasts the resulting state change.

### 27.6 Renderer

Renderer owns:

- drawing board state
- drawing UI
- drawing highlights
- drawing effects
- drawing terminal states
- drawing chairs/base reactions

Renderer must only draw the current state.

It must not directly mutate route logic.

### 27.7 Determinism Requirements

Because V1 is online, deterministic behavior is mandatory.

Rules:

- actions are represented as client intents
- server validates all actions
- server updates authoritative game state
- server broadcasts accepted state changes
- route validation does not depend on rendering
- scoring is based on authoritative state and server tick/time
- simultaneous inputs resolve consistently
- terminal configuration and route resolution are never trusted from the client
- win detection is server-owned

Because each player edits only their own side in V1, most direct conflict problems are avoided. The server still owns final validation because timing, score, terminal resolution, and match results must be authoritative.

## 28. Suggested Data Models

These models are implementation suggestions, not final required schemas.

### 28.1 Tile Data Model

```js
{
  id: "tile_4_7",
  x: 4,
  y: 7,

  tileKind: "fixed",
  // source | fixed | editable | hole | floor | terminal

  owner: "blue",
  // blue | red | neutral | none

  pieceType: "corner",
  // none | straight | corner

  rotation: 90,
  // 0 | 90 | 180 | 270

  routeId: "blue_route_03",

  editable: false,
  locked: false,
  completed: false,

  terminalId: null
}
```

### 28.2 Route Data Model

```js
{
  routeId: "blue_route_03",
  owner: "blue",

  sourceId: "blue_source_08",
  terminalId: "blue_terminal_02",

  mirrorRouteId: "red_route_08",

  tileIds: [
    "tile_3_0",
    "tile_3_1",
    "tile_4_1",
    "tile_5_1"
  ],

  repairPointIds: [
    "tile_4_1",
    "tile_7_3",
    "tile_9_6"
  ],

  isComplete: false,
  isResolved: false
}
```

A route explicitly maps a source to a terminal.

Do not infer terminal ID from source ID.

Do not infer terminal ID from route ID.

The map data must define the actual source-to-terminal mapping for every route.

### 28.3 Terminal Data Model

```js
{
  terminalId: "blue_terminal_03",
  owner: "blue",

  routeId: "blue_route_03",

  terminalType: "damage",
  // damage | dud

  visibleFromStart: true,
  completed: false,
  scoredBy: null
}
```

Terminal type is visible from match start, but the server still owns the authoritative terminal configuration and scoring result.

## 29. MVP Scope

The MVP should include:

- one playable authored mirrored board
- 20x20 route grid per side
- online 2-player matches
- public matchmaking
- private room matchmaking
- server-authoritative match state
- server-authoritative route validation
- server-authoritative scoring and win detection
- shared platform disconnect-to-menu behavior
- blue/red side ownership
- mirrored blue/red route layout
- inverse-index terminal and route mirror mapping
- layered visual overlap/divergence support
- 20 total source wires
- 20 total terminals
- strict one-source-to-one-terminal routes
- explicit non-linear source-to-terminal mapping
- 5 visible damage and 5 visible dud terminals per player
- straight and corner pieces
- holes for insertion
- refactorable pre-placed tiles
- route/tile/terminal visual states
- non-connecting overlap/crossing visual states
- persistent lit/glowing state for completed damage routes
- weaker resolved state for completed dud routes
- completed route lockout
- automatic route resolution
- scoring
- dud feedback
- damage feedback
- 5-minute match timer
- timer-runout draw result
- win screen

The MVP board must satisfy:

- Canonical Route Isolation Rule
- Mirrored Map Fairness Rule
- Route Complexity Requirement
- Board Readability Requirements

The MVP should not include:

- local product mode
- procedural generation
- asymmetric map balancing
- AI opponent
- special tools
- sabotage
- powerups
- route branching
- route merging
- moving avatars
- physics
- animation-heavy board effects beyond basic completion feedback

## 30. First Implementation Milestones

### Milestone 1 — Static Board Prototype

- render grid
- render fixed tiles
- render holes
- render terminals
- render top source zone
- render blue/red routes from authored data

### Milestone 2 — Server Match Skeleton

- create match server
- create public matchmaking queue
- create private room creation/join flow
- assign blue/red player slots
- broadcast match start countdown
- load authored board configuration on the server

### Milestone 3 — Online Tile Interaction

- select tool client-side
- send placement/rotation/replacement intents to server
- server validates placement into holes
- server validates rotate/replace actions on refactorable tiles
- server enforces edit permissions
- server broadcasts accepted board changes

### Milestone 4 — Server Route Validation

- validate a single route
- validate all affected routes after accepted actions
- detect completion
- resolve terminal truth server-side
- broadcast route resolution

### Milestone 5 — Scoring and Feedback

- score damage routes server-side
- resolve dud routes server-side
- broadcast route power effect event
- play chair damage effect on clients
- update score UI from server state

### Milestone 6 — Full Online Match

- both players active online
- first to 5 wins
- win/loss/draw result
- rematch or return-to-lobby flow
- disconnect/forfeit handling
- private room replay flow
- public queue re-entry flow

## 31. Open Design Questions for Next Pass

These are intentionally left unresolved for post-v1 scoping.

1. Should standard competitive maps use exactly 5 repair points per route, or allow a 3–5 repair-point range?

2. Should the game include a pre-match preview/countdown where players can inspect the board before editing begins?

3. Should there be a scan/highlight tool to briefly trace a selected route, or would that undercut the core mental-tracing challenge?

4. What is the exact public matchmaking UI flow around queue, match found, rematch prompt, and return-to-queue prompt?

5. What are the required V1 input methods: mouse, touch, keyboard, gamepad, or a subset?

6. Should the final implementation use canvas, DOM grid, or hybrid rendering?

7. What JSON map format should be used for authored maps and future procedural validation?

8. Should terminal damage/dud presets be fully mirrored and fixed per map, or selected from a small validated preset pool?

9. How scrambled should source-to-terminal mappings be in standard maps so they are challenging without becoming unreadable?

10. What exact art treatment should be used for over/under route layering so overlaps remain readable after routes diverge?

## 32. Canon Checklist

Circuit Siege canon:

- Online real-time 2-player route-repair duel.
- Public matchmaking and private room matchmaking are core V1 requirements.
- The board has one locked source zone at the top.
- The board has 20 total source wires: 10 blue and 10 red.
- The board target is 20x20 route space per side plus one center divider/wall column.
- Each side has 10 visible terminals: 5 damage and 5 dud.
- Each source wire has exactly one canonical route to exactly one visible terminal.
- Source-to-terminal mapping is explicit per route and should be intentionally non-linear.
- Source index does not imply terminal index.
- Routes may visually overlap, cross, layer, run parallel, pass over/under each other, and later diverge.
- Routes must never logically mix, merge, branch, share conductive connections, or allow one source to resolve another route’s terminal.
- Layering is required where overlaps occur so players can still tell which wire goes where after routes diverge.
- Each player solves only their own color-coded routes.
- V1 maps are mirrored for fairness.
- Terminal truth and route identity mirror by inverse index.
- Blue terminal `n` mirrors Red terminal `11 - n`.
- Blue route `n` mirrors Red route `11 - n`.
- Mirroring preserves route difficulty and geometry.
- Players repair routes by inserting straight/corner tiles into holes and refactoring marked editable slots.
- The only player-placeable pieces are straight and corner wire-floor tiles.
- Each standard route must contain at least 3 repair points.
- The preferred competitive target is 5 repair points per route.
- Each standard route must include at least 1 hole and at least 1 refactorable pre-placed tile.
- Routes automatically resolve once completed from source wire to terminal.
- Editable slots remain editable until their route is completed, then that route’s editable slots lock.
- Completed damage routes stay lit and glow for the rest of the match.
- Completed dud routes stay visibly resolved in a weaker false/failed state.
- Dud routes are intentional time traps.
- Standard matches use a 5-minute timer.
- If the timer expires before either player completes 5 damage routes, the match ends in a draw.
- The first player to complete 5 damage routes wins.
- The server owns match state, accepted edits, route validation, terminal truth, scoring, and results.
- Clients send player action intents.
- The renderer displays state; it does not own route logic.
- Disconnect behavior follows the shared platform rule: the remaining player returns to the menu with a disconnect message.
- There is no reconnect flow.
- The challenge is fast visual route tracing under online pressure, not mechanical complexity.