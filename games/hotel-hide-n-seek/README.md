# Hotel Horror Exploration Prototype V5.2

## Play

On Windows, double-click `PLAY HOTEL HIDE-N-SEEK.cmd`. It starts the local server and opens the game in your default browser. Keep the launcher window open while playing; close it when finished.

From a terminal, the equivalent command is `npm start`.

V5 converts the hotel into one continuous vertical environment.

V5.1 is a stabilization pass for building gameplay on top of that environment:

- The cramped four-flight-per-floor stair layout is replaced with a conventional stacked switchback.
- Sloped handrails replace the full-height cage bars that obscured the stairwell.
- Every guest-room opening now has visible casing on every floor.
- Open rooms receive a low-cost fill light while their door is open, preventing valid rooms from reading as black voids.
- Pure layout helpers and regression tests cover stair continuity, doorway frames, and room-light defaults.

V5.2 closes the remaining stairwell voids, makes the bottom slab walkable, guards exposed landing edges, and splits the runtime into focused ES modules. It also removes three recurring frame costs: unchanged elevator-indicator uploads, full-speed interaction raycasts, and repeated static AABB construction.

## Architecture

`main.js` is intentionally limited to composition and the animation loop. Runtime responsibilities live under `modules/`:

- `game-config.js` — immutable tuning, floor definitions, and inspection views
- `rendering.js` — scene, renderer, procedural materials, and resize handling
- `world.js` — shared state, geometry primitives, UI events, walk surfaces, and collision
- `furnishings.js` — room furniture and searchable drawers
- `hotel.js` — rooms, corridors, secret passages, and stair construction
- `elevator.js` — car, doors, calls, and travel state
- `player.js` — input, movement, location tracking, and interaction targeting
- `performance.js` — reusable change and interval gates for expensive work

## Major changes

- All four floors remain physically present at their real Y positions.
- Collision now checks vertical overlap as well as X/Z. This fixes the elevator header behaving like an invisible full-height wall.
- The elevator cabin has a dynamic walk surface. You can physically cross the threshold, ride the moving car, and walk out at another floor.
- Stair teleportation is removed.
- A continuous enclosed switchback/spiral-style stair structure physically connects Floors 1–4.
- Visible stair treads use continuous ramp walk surfaces underneath for stable first-person climbing.
- The service-lobby floor and ceiling are cut away around the stair shaft instead of intersecting it.
- Vending machines are flush to the west wall and face into the service lobby.
- Existing drawers, floor keys, locked rooms, and secret passages remain.

## QA route

1. Walk to the south service lobby on Floor 1.
2. Confirm both vending machines are against the west wall with their display faces toward the room.
3. Enter the stairwell on the east side and physically walk the west flight up, cross the north landing, then take the east flight to the next floor. Repeat through Floor 4; there should be no use prompt or teleport.
4. Return to Floor 1, enter the elevator, select a floor from inside, ride, and exit.
5. Room 105 still demonstrates the drawer/key loop.

## Controls

WASD/arrows move, mouse look, Shift sprint, E interact, Esc releases mouse. Browsers without Pointer Lock automatically use click-and-drag mouse look. Mobile controls remain included.

## Engineering note

The controller is still lightweight rather than physics-engine based. It now uses height-aware AABB collision plus explicit walk surfaces. Before production chase AI, add a navigation graph/navmesh and formalize stair/elevator traversal nodes.

Run `npm test` for the architecture, layout, controls, and performance regressions. For visual development, `?inspect=stair`, `?inspect=stairEntrance`, and `?inspect=doorway` start at representative QA views without requiring a full traversal.
