# Circuit Siege - Online-First Implementation Plan

## 0. Current Status

As of the current implementation pass, Circuit Siege is no longer just a scope document. The game now has a working online-authoritative vertical slice in this repo plus matching authoritative handlers in `factory-network-server`.

### Implemented now

- shared authored board data and canonical route validation
- compact map-file loading that derives route cells from route points at load time
- `maps/` folder support via `maps/index.json`
- server-selected `mapId` flow so the browser swaps to the authoritative board instead of freelancing local map choice
- authoritative match engine, room engine, and server bridge contract
- public matchmaking and private room flow
- automatic match start once both players are present
- browser-side session controller, board renderer, and held-piece tool flow
- exact mask tools for `EW`, `NS`, `NE`, `ES`, `SW`, and `NW`
- `R` rotates the held piece
- `F` swaps held-piece family between straight and corner
- clicking an editable pre-placed tile lifts that piece into hand
- server-authoritative route completion, scoring, and completed-route lockout
- live countdown timer presentation plus authoritative timer-expiry resolution
- results overlay with per-side circuit totals, disconnect messaging, and visible player usernames
- internal `map-editor.html` page for loading, validating, previewing, copying, and downloading compact map JSON
- browser/local regression coverage for shared rules, server flow, and client flow

### Important current caveat

Circuit Siege website testing is only valid when the matching Circuit Siege authoritative files in `factory-network-server` are deployed. The client and local harness can look correct while the live site still behaves incorrectly if the server repo is on an older authored-board version.

That now includes the `maps/` folder and `maps/index.json` manifest too. Map ids and compact map files must stay mirrored between the game repo and `factory-network-server`.

### Current focus

The project has moved out of architecture bootstrap and into gameplay/readability polish. The biggest remaining work is now in:

- menu and lobby clarity
- board readability and slot affordances
- route-tracing clarity under pressure
- final interaction polish around held pieces and toolkit behavior
- richer match-end presentation polish
- continued validation that authored routes are readable and fair in real matches

### Map variety recommendation

The next content-scale step should be **multiple validated maps**, not live procedural generation yet.

What the current codebase is ready for:

- a server-selected pool of authored board JSON files
- a local/internal map editor or board authoring viewer that writes the compact shared board schema
- reuse of the existing shared route validator for per-route completion checks once a board is already known-good

What the current codebase is not ready for yet:

- full procedural generation with confidence
- legality scoring for generated readability/overlap quality
- mirror correctness validation beyond a single authored board
- offline seed inspection and rejection/fallback reporting

Recommendation:

1. Add support for a small approved board pool first.
2. Build an internal editor/validator viewer against the current board schema.
3. Use that tool to author and approve several strong maps.
4. Only then begin the stricter procedural-generation pipeline.

## 1. Purpose

This document scopes **Circuit Siege** for implementation in this repo using the existing planning docs as canon and the `circuit_siege_debug_demo_v0_5` prototype only as a reference.

The planning docs are the source of truth for:

- product shape
- match flow
- UX expectations
- board rules
- online authority boundaries

The debug demo is useful because it already proves a modular board viewer/editor, but it is not the product contract.

Hard rule:

Circuit Siege must be built as an **online-first 1v1 game**, not as a local puzzle board that later gets multiplayer attached to it.

## 2. Product Definition

Circuit Siege is a real-time 2-player route-repair duel played on one shared mirrored board.

Each player owns one color-coded side:

- Blue repairs blue routes.
- Red repairs red routes.

Each side has:

- 10 top source wires
- 10 visible terminals
- 5 visible damage terminals
- 5 visible dud terminals
- 10 canonical routes

Players race to determine which source wires lead to damage terminals and complete those routes before the opponent does.

The first player to complete 5 damage routes wins. If the 5-minute timer expires first, the player with more completed damage routes wins; equal damage totals result in a draw.

## 3. Hard Canon Rules

These rules should shape architecture from the start:

1. Every source wire maps to exactly one terminal.
2. Every route has one authored canonical path.
3. Routes may visually overlap, cross, or run parallel, but they must never logically merge or branch.
4. Source index does not imply terminal index.
5. The board is mirrored for fairness in V1.
6. Terminal truth is visible from match start.
7. Route completion is automatic after a valid edit; there is no manual submit action.
8. Players edit only their own side.
9. Clients do not decide route completion, scoring, or win state.
10. Public matchmaking and private rooms are both core V1 requirements.

## 4. Recommended V1 Scope

V1 should ship one complete online mode, not a partial sandbox.

### Included

- One authored mirrored board
- 20x20 route space per side
- 41x20 shared board footprint before framing/UI
- Locked source zone at the top
- Center divider column
- Blue/red side ownership
- One-to-one source/terminal route definitions
- Non-linear source-to-terminal mapping
- Straight and corner pieces only
- Editable holes
- Editable refactorable pre-placed tiles
- Automatic route validation and completion
- Damage scoring and dud resolution
- 5-minute match timer
- timer-expiry win by higher damage total, or draw on equal damage totals
- Public matchmaking
- Private room creation/join flow
- Server-authoritative match state
- Server-authoritative route validation
- Disconnect-to-menu behavior using shared platform rules
- Win/loss/draw end screen

### Excluded

- Local product mode
- AI opponent
- Live procedural generation
- Asymmetric boards
- Special tools or power-ups
- Sabotage mechanics
- Route branching or merging
- Avatar movement
- Physics systems
- Spectator mode
- Reconnect flow

## 5. UX and Match Flow

The planning docs imply a clear online game flow:

1. Player enters Circuit Siege menu.
2. Player chooses public match or private room flow.
3. Matchmaking/room system assigns blue or red side.
4. Both clients load the same authored board snapshot from the server.
5. Countdown begins automatically once both players are present.
6. Live match starts.
7. Players edit their own route slots simultaneously.
8. Server resolves completed routes immediately after accepted edits.
9. Match ends on fifth damage route, timer expiry, or disconnect.
10. Players see result and can rematch or return to menu/lobby based on room type.

UX priorities for V1:

- readable board before flashy effects
- strong ownership cues for blue/red sides
- obvious editable-vs-fixed tile distinction
- visible damage-vs-dud terminals from the start
- clear route lock state after completion
- immediate feedback when an action is rejected or accepted
- strong damage feedback and weaker dud feedback

## 6. Debug Demo vs Canon

The existing debug demo gives us a useful starting seam, but it diverges from canon in important ways.

### Good reusable ideas from the demo

- board data separated from rendering
- modular `state`, `renderer`, `tools`, and debug panels
- explicit route and slot records
- 41x20 mirrored board shape
- 3-repair-point-per-route board tuning

### Demo behavior that should not define V1

- local state is authoritative
- route-hover cheat exists
- route table exposes hidden debug structure
- event log is debug-facing rather than player-facing
- no online phases, countdown, or disconnect handling
- no platform room flow
- no authoritative timer/win-state pipeline

### Important product mismatch

The clarified V1 interaction model should follow the demo more closely than this earlier plan assumed.

The current intended player-facing model is:

- exact piece picks for `EW`, `NS`, `NE`, `ES`, `SW`, and `NW`
- `R` rotates the piece currently being held
- clicking an editable pre-placed tile lifts that exact piece into hand
- clicking an editable hole or editable refactor slot places the held piece if the slot belongs to the local player

So the demo's piece-palette and held-piece flow are valid product references, while its debug cheats and local authority are not.

## 7. Architecture Rule

Circuit Siege should be built in three clean layers:

```text
1. Authoritative Match Engine
   Owns rooms, side assignment, timer, board state, slot edits,
   route validation, terminal resolution, scoring, and match result.

2. Transport / Match Adapter
   Connects the engine to public matchmaking, private rooms,
   and client broadcast/update flows.

3. Browser Client
   Renders state, collects input, shows effects,
   and submits player intents to the server.
```

Hard rule:

No browser-owned completion checks.
No browser-owned score changes.
No browser-owned terminal truth.
No browser-owned match result.

## 8. Recommended Folder Structure

```text
games/circuit-siege/
  index.html
  map-editor.html
  style.css
  game.js
  GDD.md
  IMPLEMENTATION_PLAN.md

  scripts/
    client/
      init-game.js
      input.js
      screen-router.js
      tool-hud.js
      board-renderer.js
      board-view-model.js
      match-ui.js
      effects.js

    shared/
      circuit-board.js
      route-validator.js
      tile-connectivity.js
      commands.js
      snapshots.js
      ids.js
      timer.js
      win-state.js

    adapters/
      dev-match-adapter.js
      remote-match-adapter.js

  server/
    circuit-siege-room-engine.js
    circuit-siege-room-store.js
    circuit-siege-matchmaking.js

  maps/
    index.json
    canon-v1.json

  tests/
    shared/
      tile-connectivity.test.js
      route-validator.test.js
      board-model.test.js
      win-state.test.js

    server/
      room-engine.test.js
      command-validation.test.js
      disconnect-behavior.test.js

    client/
      board-view-model.test.js
      tool-hud.test.js
```

This keeps rules pure and testable while preventing `game.js` from becoming a mixed-purpose controller.

## 9. Command and Snapshot Shape

The client should send intents. The server should validate them and broadcast state.

### Example commands

```js
{ type: "QUEUE_PUBLIC", playerId: "p1" }
{ type: "CREATE_PRIVATE_ROOM", playerId: "p1" }
{ type: "JOIN_PRIVATE_ROOM", playerId: "p2", roomCode: "A8Q2" }
{ type: "PLACE_TILE", playerId: "p1", slotId: "blue_slot_03", pieceType: "straight", rotation: 90 }
{ type: "ROTATE_TILE", playerId: "p1", slotId: "blue_slot_07" }
{ type: "REPLACE_TILE", playerId: "p1", slotId: "blue_slot_09", pieceType: "corner", rotation: 180 }
```

### Example snapshot

```js
{
  matchId: "match_123",
  phase: "live",
  boardId: "authored-board-v1",
  timerMsRemaining: 224000,
  players: {
    blue: { playerId: "p1", score: 3, connected: true },
    red: { playerId: "p2", score: 2, connected: true }
  },
  routes: {},
  slots: {},
  terminals: {},
  result: null
}
```

## 10. Rendering Recommendation

Use a board renderer that reads an authoritative snapshot and a local UI state object.

Recommended rendering split:

- server snapshot drives board truth
- client UI state drives hover, selection, focus, and animations
- route effects are derived from state transitions, not from game logic in the renderer

The debug demo's SVG approach is a good V1 candidate because:

- the board is grid-heavy and interaction-rich
- slots need obvious hover/selection framing
- layered crossings are easier to author/read in SVG than in raw canvas for early versions
- route readability matters more than sprite throughput here

If the final renderer stays SVG or hybrid DOM/SVG, that is acceptable for V1.

## 11. Test-First Requirements

This repo's rules mean Circuit Siege should be built test-first.

The first tests should cover:

- tile opening/connectivity rules
- route validation along canonical paths
- rejection of invalid slot edits
- route auto-resolution after accepted edits
- damage vs dud scoring behavior
- completed route lockout
- fifth-damage win detection
- timer-expiry winner-or-draw behavior based on damage totals
- disconnect handling by match phase
- mirror-board data invariants

Rendering tests should stay light. The highest-value tests are in shared rules and server authority behavior.

## 12. Milestone Plan

### Milestone 1 - Board Data and Pure Rules

- define authored board schema
- write tile connectivity tests
- write canonical route validator tests
- write slot edit permission tests
- write score and win-state tests

### Milestone 2 - Local Dev Harness Using Server-Like Contracts

- build a dev match adapter
- render authored board from snapshot data
- submit commands through the adapter rather than mutating client state directly
- keep demo-only debug panels optional and isolated

### Milestone 3 - Online Match Skeleton

- create room engine
- connect to public matchmaking flow
- connect private room create/join flow
- assign sides and load authoritative board
- implement countdown and phase transitions

### Milestone 4 - Authoritative Live Editing

- send player tile intents to server
- validate owner and slot permissions
- broadcast accepted board edits
- reject invalid actions cleanly
- resolve completed routes on the server

### Milestone 5 - Match Feedback and End States

- show damage and dud completion feedback
- update score pips from server state
- lock resolved routes visually
- implement timer expiry, win, draw, and disconnect end states

### Milestone 6 - UX Polish and Board Readability Pass

- simplify tool HUD to match canon
- remove competitive-breaking debug affordances
- tune overlap readability
- refine chair/base feedback
- verify that the authored board stays readable under pressure

## 13. Immediate Next Build Slice

The original bootstrap slice is complete. The next safe slice is now gameplay and readability tightening on top of the authoritative foundation:

1. Simplify menu and lobby flow until it matches the intended online rhythm.
2. Keep the held-piece and toolkit model aligned with the demo/GDD interaction contract.
3. Improve board readability so editable slots, completed routes, and dud vs damage outcomes are obvious under pressure.
4. Continue testing real authored routes in both the local harness and live deployed multiplayer flow whenever board data changes.

After those stability/readability fixes, the next content slice should be:

1. Finalize the shared board schema for more than one map.
2. Add server/client support for selecting from a pool of approved authored maps.
3. Build an internal board editor/viewer that can load, validate, mirror-check, and save map JSON.
4. Expand to procedural generation only after the validator and authoring workflow are proven on multiple boards.

That sequence protects the current hard invariant: the authoritative route logic is in place, so polish work should improve clarity without reintroducing rules drift.

## 14. Open Choices We Should Lock Soon

The planning docs leave a few implementation choices open. For this repo, these are the most important to settle early:

1. Final tool HUD interaction: exact masks vs canon-friendly tool family flow.
2. Final renderer: SVG-only vs hybrid DOM/SVG.
3. Pre-match preview/countdown behavior.
4. Required V1 inputs on day one: mouse only, or mouse plus keyboard/gamepad.
5. Final authored board JSON contract for server/client sharing.

My recommendation for the first pass:

- use SVG or hybrid DOM/SVG
- ship mouse-first with keyboard support next
- keep a short countdown but no separate inspection phase yet
- define one shared compact board JSON contract before online integration

## 15. Scope Summary

Circuit Siege should be treated as an online-authoritative competitive puzzle game with one strong authored board already working, followed by a near-term move to a small approved board pool.

The current debug demo is a useful prototype seam for board rendering and slot interaction, but the production work is mostly about:

- authoritative rules
- online match flow
- clean client/server separation
- readable competitive UX

For map variety, the safest order is:

- board pool first
- compact editor/validator second
- procedural generation third

If we keep the planning docs as canon and use the demo only as a technical head start, the scope is clear and manageable.
