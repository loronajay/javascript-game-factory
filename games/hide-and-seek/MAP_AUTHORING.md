# Adding a map

A location in this game is **three things and nothing else**:

1. a row in `map-catalog.js`,
2. a pure plan module that emits the building as plain records,
3. the demons named in the catalog row.

The renderer walks whatever plan comes back, the
authoritative tick spawns whatever demons the row lists, the picker fills itself from the registry,
and matchmaking separates maps into pools. Register the classic script and server mirror imports
as described below. No map-specific branch belongs in the renderer or CPU controllers.

Four maps exist:

| Map | Plan | Shape | Demons |
| --- | --- | --- | --- |
| The Grand Hotel | `hotel-plan.js` | four floors | 2 |
| Cinder Mall | `mall-plan.js` | two levels around an atrium | 3 |
| Mercy Hospital | `hospital-plan.js` | two floors, fourteen departments | 3 |
| Crowne Point Cinema | `cinema-plan.js` + `cinema-navigation.js` | two floors, six auditoriums | 2 |

`status: 'soon'` is a real state for a map registered before it is built — it shows in the picker as
a locked card and can never be resolved into a round. Nothing is sitting in it right now.

Read `mall-plan.js` before writing another one. It preserves the Cinder Mall reference geometry
while adding game-owned primary doors, master keys and a collision-checked aisle graph. The mall,
hospital and cinema each adapt an untouched reference build in their `*-reference/` folder; leave
those folders as they are.

---

## 1. The catalog row

`map-catalog.js`, in `MAPS`:

```js
Object.freeze({
  id: 'cinder-mall',                 // lower-kebab; this is what a URL, a saved preference and a lobby setting carry
  name: 'Cinder Mall',
  eyebrow: 'TWO LEVELS',
  blurb: 'A burnt-out shopping centre. Three of the staff are still on shift.',
  status: MAP_STATUS.READY,          // READY only once the plan below exists; SOON until then
  floorCount: 2,                     // how tall it is; nothing may assume the hotel's four
  plan: Object.freeze({ global: 'MallPlan', factory: 'createMallPlan', floorDefsKey: 'FLOOR_DEFS' }),
  demons: MALL_DEMONS,
}),
```

`plan.global` is the name the plan module attaches itself to (see below). `floorDefsKey` names an
export on that module holding the floor definitions; pass `null` only for the hotel, which uses the
`FLOOR_DEFS` already in `modules/game-config.js`.

**Demon rules the tests enforce:**

- a roster may be any length up to `MAX_DEMONS` (6) — two was the hotel's number, never a rule, and
  it may be **longer than the building is tall**: Cinder Mall runs three demons on two levels;
- **exactly one demon per map has `hunts: true`.** That is the one that reads the heat meter and
  walks to a camper. Two camper-hunters converge on the same full bar and read as a swarm rather
  than a stalker you can learn;
- ids are unique within a map, names read as `The Something`, and each carries an `accentColor` and
  `eyeColor` (the demon's fresnel rim and its eyes);
- `statusElementId` is optional. The hotel's two have authored rows in `index.html`; anything without
  one gets a `#demonStatuses` row built for it at runtime.

Demons open **clear of each other by distance**, not one per floor. A floor each was arithmetic that
only worked while the one map was four storeys deep with two demons in it; a map wider than it is
tall separates them sideways. `navigation.minSpawnSeparation` is how far apart is far enough.

## 2. The plan module

A new file at the cabinet root, loaded as a classic script in `index.html` *before* `main.js`, and
mirrored to the server (add it to `MIRRORED_FILES` in `tools/mirror-sim.mjs` and to the import list
in the server's `shared/index.mjs`). Copy the UMD wrapper off `hotel-plan.js`:

```js
(function attachMallPlan(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MallPlan = api;
})(typeof window !== 'undefined' ? window : globalThis, function createMallPlanApi() {
  'use strict';
  const FLOOR_DEFS = Object.freeze([ /* one entry per level */ ]);
  function createMallPlan({ config, floorDefs, layout, floorY, keyIdForFloor, keyLabelForFloor }) { /* ... */ }
  return { FLOOR_DEFS, createMallPlan };
});
```

**There is no renderer in this file.** Not a `THREE` import, not a mesh, not a material instance —
only plain numbers in world space. That is the whole reason a server can adjudicate a catch: if only
the browser can say where the walls are, only the browser can say who was caught.

### What `createMallPlan` must return

Every field below is required, and an empty array is a legitimate answer for anything the building
genuinely does not have (a mall with no secret passages returns `secretPanels: []`).

| Field | What it is |
| --- | --- |
| `boxes` | Every wall, slab and ceiling. `{ floor, group, kind, material, collider, x, y, z, w, h, d, rotationY?, localY }` — `y` is world space, `localY` is within the floor. |
| `colliders` | The `boxes` with `collider: true`, as bounds: `{ minX, maxX, minY, maxY, minZ, maxZ, id, floor }`. |
| `surfaces` | What a body can stand on. `{ kind: 'rect' \| 'ramp' \| 'dynamic', floor, minX, maxX, minZ, maxZ, y, priority }`; a ramp adds `startZ/endZ/startY/endY`. Higher `priority` wins where two overlap. |
| `swingDoors` / `slidingDoors` | Doors as hinged / sliding bodies, for the moving colliders. |
| `roomDoors` | `{ id, kind: 'room', roomNumber, floor, side, direction, x, z, width, locked, requiredKey, openInitially, hingeX, hingeZ, y, localX, localZ, w, h, d, openAngle }`. |
| `secretPanels` | Same shape, `kind: 'secret'`, plus `hideWhenOpen`. |
| `secretTunnels` | `{ id, kind: 'tunnel', floor, minX, maxX, minZ, maxZ }` — a zone that **drains** the heat meter. |
| `roomCenters` | `{ roomNumber, floor, x, z, side }`. These become the heat meter's `room` zones and the demon's hunt targets. |
| `furnishings` | Placements, not meshes: `{ id, type, floor, x, z, rotationY, y }`. `type` must be one `modules/furnishings.js` knows — read the dispatch at the bottom of that file for the current list, and teach it a new one rather than approximating with an existing shape. Ids must be stable: a drawer is contested state online. |
| `hallDoors` | The lift's hall doors. |
| `signs`, `doorFrames`, `wallLamps`, `lights`, `fixtures` | Presentation the renderer draws. `lights` are the point-light pool; `fixtures` include the per-room fill. |
| `stairs` | `{ treads, rails }` for the continuous stairwell. |
| `spawns` | `{ seeker: { floor, x, y, z }, hiders: [ …the same ] }`. Hider spawns must be places a body can actually stand, and there should be one per lobby seat (8). |
| `spawns.flashlights` | Candidate floor pickups: `{ id, label, floor, x, y, z }`. Use stable unique IDs and meaningful location labels. Author clear, reachable floor beside furnishings, never inside props or door swings. The round owner selects half the candidates per floor and assigns 35–65% charge; online only the server samples them. Include at least four candidates per floor. |
| `elevator` | `{ centerX, centerZ, frontZ, halfWidth, halfDepth, floors }`. **The sign of `frontZ - centerZ` owns which way the cabin opens** — the hotel and the hospital face -Z, the mall faces +Z. Everything downstream derives facing from it, so state it correctly rather than assuming either sign. |
| `navigation` | How a demon gets around. See below — this is the one that decides whether the AI can play your map at all. |

The quickest way to get the shape exactly right is to print one:

```bash
node -e "const f=require('./tests/helpers/hotel-fixture.js');const h=f.buildHotel();console.log(JSON.stringify(h.roomDoors[0],null,2))"
```

### The navigation block

Where a demon may walk is part of the plan, because the hotel's answer — a corridor spine at x=0 and
a list of Z values — describes precisely one building.

```js
navigation: {
  nodes: [{ id, floor, x, z }],   // waypoints; the hotel emits its corridor spine, the mall a ring
  edges: [[idA, idB]],            // same-floor walk links only. A floor change is a connector.
  connectors: [{                  // the ways up. A map may have several; the nearest serving both floors wins.
    id, kind: 'stair', floors: [1, 2],
    approach: { x, z },           // the hall point outside its door
    approaches: { 1: { x, z }, 2: { x, z } }, // optional per-floor endpoints, e.g. an escalator
    layout: { entrances, landings, flights },   // the shape `enemy-logic.createStairRoute` walks
    shell: { bounds: { xWest, xEast, zMin, zMax } },  // "is a body on the stairs"
  }],
  spawnNodes: [{ floor, x, z }],  // where a round may open a demon
  minSpawnSeparation: 26,
}
```

Rules the tests enforce:

- **an edge never joins two floors.** A demon that could stroll between levels along the graph walks
  up through a ceiling;
- **each level's graph is connected.** An island is a set of waypoints nothing can ever walk to;
- **room targets are clear aisles, not furniture centers.** Include doorway/inside nodes so room
  egress uses the door too; test actual room-to-room movement with player and demon dimensions;
- **player and demon spawn nodes must be separated** by `navigation.minSpawnSeparation` from
  every seeker/hider seat on the same floor. Solo reserves all seats before role selection; the
  authority checks every participating body. Unsafe starts are rejected, never used as a fallback;
- **only the elevator cabin is protected from demons.** Publish routes through secret passages
  and leave room for their panels to open. Check door crossings from both sides and at angles,
  using moving/closed fixtures as well as fully open doors;
- **a spur reaches every room.** `roomCenters` are the demon's hunt targets, so a room the graph
  cannot reach is a room nobody is ever hunted in;
- a connector's `flights` may be a switchback (two lanes, `west`/`east`, with a landing between) or a
  **straight run** of one flight — an escalator is the latter.

An empty graph is legal and means "walk straight at it", which is the right answer for a single open
room and the wrong one for anything with walls.

The hotel's spine predates room-entry graph nodes and still declares `corridorSweep` for its legacy
seeker doglegs. **A new map supplies a complete graph and omits that field.** Camera and physics
initialization and the solo CPU seats all come from the plan's `spawns`, so a map that authors them
badly puts a body inside a wall on the first frame.

Low tiered surfaces (as in Crowne Point's seating) must be within the ground-snap range of their
floor datum. `planFloorRoute` samples `space.groundAt` for every unguided waypoint, including the
final room target; aiming at `floorY` alone strands a CPU above its requested destination.

### Things that will bite

- **Colliders check vertical overlap.** A box with no real `h` is a wall a body walks through from
  the floor above.
- **A material instance is what decides whether two meshes can share a batch.** Anything placed dozens
  of times must use one shared material, or you pay a draw call per placement.
- **A door hangs in a wall that runs one way or the other.** `w`/`d`, `hingeX`/`hingeZ` and
  `localX`/`localZ` on the leaf say which, and a `doorFrames` entry carries `axis`. Both used to be
  derived on the assumption of a hotel corridor — thin in X, wide in Z — which draws a leaf lying
  flat through a shopfront and stands a jamb in the middle of the opening.
- **Materials are named, and the names come from `modules/rendering.js`.** `floor1`..`floor4`, `wall`,
  `ceiling`, `wood`, `brass`, `dark`, `darker`, `metal`, `accent`, `linen`, `bed`, `green`, `shade`,
  `black`, `redLight`, `elevatorInterior`. A name that is not in there silently falls back to `wall`.
  The mall also uses `tile`, `carpetRed`, `service`, `glass`, `upholstery`, `red` and `screen`.
- **A lift can face either way along Z.** The sign of `frontZ - centerZ` owns its facing. Do not
  assume that a cabin's front always has the smaller Z coordinate.
- **A shop's hunt target is not its boundary.** Rooms may carry `minX`, `maxX`, `minZ`, `maxZ`
  alongside a clear `x,z` aisle target; heat uses the bounds while navigation uses the target.
- **Stair visuals can specify `material` and `rotationX`.** Inclined escalator decks and metal
  treads still batch by material. A missing material retains the hotel's wooden stair default.
- **Optional `inspectionViews` belong to the plan.** Named `{ x, y, z, yaw, pitch }` views can be
  opened with `?map=<id>&inspect=<name>` for repeatable browser QA without changing a live round.
- **A room with no door is treated as locked**, so no demon ever patrols into it. Every `roomCenters`
  entry needs a `roomDoors` entry, even one that starts open.

## 3. Turning it on

1. Add the script tag to `index.html` ahead of `main.js`, and **after `collision-logic.js`** — that is
   where the shared plan geometry lives, and every plan module re-exports it.
2. Add the file to `MIRRORED_FILES` in `tools/mirror-sim.mjs` and to `shared/index.mjs` on the server.
3. Run `node tools/mirror-sim.mjs` and commit **both** repos. Drift fails a test in each.
4. Flip the catalog row to `MAP_STATUS.READY`.
5. `npm test` here, `npm test` in `factory-network-server`.

## The picker

Nothing to do. The card, the copy and the **floorplans** are all derived: `map-preview.js` projects
the plan's own walls, rooms and stair runs straight down, and `modules/menu.js` draws them. A map
that moves a wall moves its preview in the same commit, and a new map arrives with a preview already
drawn. Shipping a screenshot instead would be a second description of the same walls that goes stale.

## How a player changes map

A map is chosen **before** a round, never during one — the building is constructed at boot, the
demons spawn into it, and the collision set is its plan. Picking a different location writes the
choice down and re-enters the page into it (`modules/map-session.js`), carrying the half-filled solo
setup across so the reload is not a punishment for looking. A `?map=<id>` link boots straight into
one.

Online, the map is a **lobby setting**. Matchmaking compares settings, so two locations are two pools
automatically, and the authority names the map in every snapshot: a client that built a different
building refuses the round out loud rather than walking a body through a wall it does not have.
