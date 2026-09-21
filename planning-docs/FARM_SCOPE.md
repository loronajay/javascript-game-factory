# The Farm — scope (2026-09-20)

> Status: slices 1–3 shipped (1 and 2 on 2026-09-20, build mode on 2026-09-21 — see `CHANGELOG.md`). The barn became enterable along the way (`farmObstacles` expands it into walls; E works the doors). Species rows carry `height` (metres), not `scale`. Slice 3 diverged from the plan below in two ways worth knowing: the layout is version 2 with EVERYTHING on the field as a decor row (the slice-1 dressing became `STARTER_FARM_DECOR`, so nothing is fixed any more), and the farm did NOT import the room's decor placement/align/resize rules (they are written against the room's catalog and its three mounts) — it has its own pure `farm-decor-layout.mts` with exact rotated-box geometry, and shares only the room's gizmos. What did lift into `js/space-editor/`: the camera controller, the undo history and the thumbnail renderer (plus `css/space-editor.css`); the pointer gesture router stayed per editor. Ponds shipped in the same slice. On 2026-09-21 every building became enterable through a catalog `shell` (see `CHANGELOG.md`), the countryside arrived (`farm-scenery.mts`) and the catalog grew to 50. Later the same day the interiors stopped being superficial: `farm-fixtures.mts` makes every piece of furniture solid and drawn from one list, `farm-body.mts` gives the player a height (lofts, a silo catwalk, climbable ladders, seats, gravity), and the gate is a door. Later that day every model got real materials (`farm-materials.mts`, metre-scaled procedural colour+bump tiles) and pets became carriable (`carried` sim state, line-of-sight wander targets so a shut stall pens a pet). Next: commands (call / treat / sit) and needs on the pet row.

A second personal 3D space beside `/room/`: a walkable outdoor farm where the
player's pets live and wander, built out later with fences, ponds, plants and a
farming loop. This document scopes the first two slices — the environment and
the pet engine — and pins the decisions that make the later slices cheap.

## What it is

- **A platform surface, not a cabinet.** Lives at `/farm/` like `/room/`, has no
  `game.json`, and is entered from the same chips (grid, `/me`, `/player`).
  `/farm/?id=<playerId>` visits another player's farm read-only, exactly the
  room's owner/visitor split.
- **The room's sibling, on the room's stack.** Same THREE vendor, same
  first-person walk (WASD, pointer-lock look, Shift sprint, E to interact), same
  layout-document-in-`game_loadouts` storage, same build-mode frame when it
  arrives. The farm does NOT get a second copy of the room; it imports the room
  modules that are already surface-agnostic and writes only what is farm-shaped
  (see *Reuse map*).
- **Pets are the point.** The Gobkit animals (`farm/assets/animals/`, CC0) are
  the first residents. A pet is not placed like decor — it *roams* inside the
  farm bounds, avoids what stands on the ground, and reacts to the player.

## Out of scope for these two slices

Fencing options, ponds, plants, crops/farming, pet needs/progression, pet
purchase/earning, co-presence in the farm, mobile/touch. Each is listed under
*Later* with the seam it will plug into, so nothing here paints them in.

## Reuse map — what comes from the room and how

Rule: **import a room module unchanged where its API is already
surface-agnostic; extract into a neutral shared module only when the farm's
need forces a change to it; never copy a file.** The room's names stay
`arcade-room-*` until a second consumer actually forces a rename — renaming
16k lines for symmetry is churn, not architecture.

| Need | Source | How |
|---|---|---|
| Placement maths (clamp to bounds, rotate, overlap, obstacle list) | `arcade-room-layout.mts` (`RoomBounds`, `RoomPlacement`, `clampPlacementToRoom`, `placementsOverlap`, `floorObstacles`, `rotatedFootprint`) | Import as-is. `RoomBounds` is `{width, depth, wallInset}` — the farm's `wallInset` is the perimeter fence inset. |
| Build camera (orbit/pan/zoom, preset views) | `arcade-room-camera.mts` (pure) | Import as-is. |
| Snap-to-neighbour guides, resize handles, gizmos | `arcade-room-decor-align.mts`, `-decor-resize.mts`, `-editor-gizmos.mts` | Import when the fence/plant slice needs them (slice 3+). |
| Colour picker | `arcade-room-color-picker.mts` + `-color.mts` (pure) | Import as-is. |
| Procedural surface textures | `arcade-room-surfaces.mts` (pattern drawers → canvas tile) | Import the drawer; **add** `grass`, `dirt`, `gravel` patterns to it (they are just more rows + drawers, the room may use them too). |
| Player avatar catalog + GLB bodies | `arcade-room-avatar-catalog.mts`, `arcade-room-visitors.mts` | Import. `avatarId` on the farm layout mirrors the room's (read from the same profile-level source the room's store exposes, `loadSelfAvatarId`). |
| Owner/visitor store, account-vs-device save target | `arcade-room-store.mts` | **Generalise by parameter**: it hardcodes `ARCADE_ROOM_GAME_SLUG`, the cache key and the layout normaliser. Give `createRoomLayoutStore` a `{ slug, cacheKey, normalize }` option (defaults = today's room values, so the room does not change) and the farm passes `farm`. This is the one room file the farm edits in slice 1. |
| Editor frame (topbar/rail/drawer/inspector), panel builder | `arcade-room-editor.mts`, `-editor-panel.mts` | **Not in slices 1–2.** These are the two most room-coupled files (cabinet/surface/decor/avatar tabs, wall cutaways). When the farm's build mode arrives (slice 3) the plan is to lift the *frame* (`room.css` editor classes + the tab/drawer/inspector shell) into a shared `js/space-editor/` and leave each surface's tabs in its own file. Not before — there is nothing to place yet. |
| First-person walk | inline in `arcade-room.mts` (`updatePlayer`, look handlers) | **Extract** `js/arcade-room-walker.mts` (pure: keys + yaw/pitch + dt → next pose, bounds and obstacle test injected). The room adopts it in the same change; a test covers it. This is the extraction the room was owed anyway — its composition root is 834 lines. |
| Presence / chat / emotes | `arcade-room-presence.mts` etc. | Later. The bridge keys rooms by owner id; a `farm` room name is one string. |
| Server document catalog | `services/arcade-room-loadout-catalog.mts` | **New sibling** `services/farm-loadout-catalog.mts`, same policy (bounds + id namespaces only, client owns meaning), registered in `db/game-loadouts.mts` under slug `farm`. Zero route code. |

## Slice 1 — the farm environment

Goal: walk around an outdoor farm that looks like one, alone, signed in or out.

- **Page**: `farm/index.html` + `farm/farm.css` (the shell/HUD classes the room
  uses, shared where identical — start gate, prompt, control hint).
- **World**: a flat ground of `FARM_BOUNDS = { width: 28, depth: 28 }` metres
  (the room is 12×9; a farm should feel open, and the pet wander needs space).
  Procedural grass with a dirt path baked into the tile; a hemisphere/sky
  gradient dome with fog; one directional sun with shadows plus ambient; a
  handful of static dressing (a barn shell and two trees from primitives, in
  the `arcade-room-decor-props.mts` style) so the horizon is not empty. A
  low perimeter fence ring from primitives marks the bounds — in slice 3 it
  becomes the first row of the fence catalog and the player's choice.
- **Player**: same first-person walker as the room via the extracted
  `arcade-room-walker.mts`; spawn at the gate on the south edge.
- **Layout document v1** (`js/farm-layout.mts`, pure):
  ```
  { version: 1, ground: "ground.meadow", pets: [], decor: [] }
  ```
  `ground` is a catalog id in `js/farm-catalog/ground.mts` (3–4 rows: meadow,
  dry, clover, mud). `decor` is reserved and empty. `normalizeFarmLayout` is the
  one place a stored document is made valid.
- **Store**: `createRoomLayoutStore({ slug: "farm", ... })` — owner reads
  `GET /games/farm/garage`, visitor reads `GET /games/farm/loadout/:id`,
  signed-out is device-only and says so. Nothing to save yet in slice 1 beyond
  the seeded document; the plumbing is proven by the visitor read.
- **Server**: `farm-loadout-catalog.mts` + registration; `pets` rows are
  bounded (count ≤ 24, `speciesId` matches `pet.<species>`, name ≤ 20 chars
  cleaned), `ground` matches `ground.<name>`, `decor` accepted as an empty
  list for now and namespace-checked (`decor.<cat>.<variant>`) so slice 3
  needs no server change to start placing.
- **Tests**: `farm-layout.test.mjs` (normalise, bounds), `farm-catalog.test.mjs`
  (every ground row has a pattern drawer — the room's own assertion),
  `arcade-room-walker.test.mjs`, server catalog test. Headless screenshot via
  the room's puppeteer/SwiftShader recipe before calling it done.

## Slice 2 — the pet engine

Goal: adopt an animal, name it, and watch it live in the farm.

- **Species catalog** `js/farm-catalog/animals.mts` (pure, CI-validated):
  one row per Gobkit file — `id: "pet.corgi"`, title, `file`, `scale`,
  `habitat: "ground" | "water" | "air"`, `walkSpeed`, `turnRate`, footprint
  radius, and the clip frame table. A test asserts every row's GLB exists on
  disk (the jukebox pattern). In slice 2 **`ground` and `air` species are
  adoptable** (corgi, duck, hippo, platypus, red panda, rhino, bat — 7);
  `water` species (anglerfish, jellyfish, shark) are in the catalog but not
  offered until there is a pond, and the catalog says why on the card.
- **Clips** `js/farm-animal-clips.mts`: the pack ships one 120-frame track,
  not named clips, so this seam turns `g.animations[0]` into
  `{ idle, attack, dead, walk }` via `AnimationUtils.subclip` at 24 fps. The
  rest of the code uses names, the way `arcade-room-visitors.mts` does for
  avatars. `attack` and `dead` are loaded but unused in slice 2.
- **Sim** `js/farm-pets.mts` (pure — no THREE, no DOM, no clock, injected
  random; fixed-timestep, ticked at 60 tps by the page's accumulator):
  - per pet: `{ instanceId, speciesId, x, z, yaw, state, timer }`, states
    `idle → wander(target) → idle`, with `turn` blended in.
  - wander picks a target inside bounds minus the fence inset, rejects one
    inside any `floorObstacle` (the same list the walker uses), walks at
    species speed, steers around obstacles with a simple two-feeler push, and
    never enters the player's personal radius (a pet drifts off rather than
    clips through).
  - **pets keep apart**: soft separation between pets sharing a footprint.
  - `air` species carry a hover height and bob; otherwise the same brain.
  - `attention`: when the player is within reach and facing a pet it turns to
    face them (`turn` state), which is what the interact prompt reads.
- **Bodies** `js/farm-pet-bodies.mts` (THREE): loads the species GLB once,
  clones per pet (`SkeletonUtils.clone`, the visitors module's approach), a
  mixer per body, `idle`/`walk` cross-faded off the sim state, eased toward
  the sim pose exactly as remote visitors are (`arcade-room-visitor-motion`
  is reusable here for the easing), a canvas name tag above each.
- **Interaction**: E on a pet in reach = *pet it*: a heart card floats up
  (the emote-card sprite path in `arcade-room-visitors` generalised to any
  body), the animal plays a short `idle` pop and holds `attention` for 3 s.
  Reach rules come from `findVisitorInReach` — a pet is a body with a pose.
- **Adopting**: a minimal owner-only **Pets** overlay (not the full build
  frame yet): species cards with a real render (the decor-thumbnail
  offscreen-WebGL pattern), a name field, adopt / rename / release; cap 12
  pets in slice 2 (perf budget: 12 skinned meshes + shadows on a 28 m ground
  is comfortable). Every change saves through the store at once — there is no
  drag to batch. Visitors see the pets, not the overlay.
- **Tests**: `farm-pets.test.mjs` drives the sim for minutes of ticks with a
  seeded random and asserts every pet stays inside bounds, never ends a tick
  inside an obstacle, and separation holds; clip seam test on frame ranges;
  catalog file-exists test; server rejects an unknown species and a 25th pet.

## Later (each plugs into a seam above)

- **Build mode** (slice 3): lifts the room's editor *frame* into
  `js/space-editor/`; the farm's tabs are Ground / Fences / Pets. Fence catalog
  rows are `decor.fence.<style>` **stretchable** items (the room's
  end-arrow stretch is exactly a fence run); the perimeter becomes four rows.
- **Ponds**: a `decor.pond.<shape>` ground item whose footprint is a `water`
  habitat region; the sim's target picker gains habitat masks, and the three
  aquatic species become adoptable. This is why habitat is on the species row
  from day one.
- **Plants / crops**: `decor.plant.*` rows now; a farming loop (plant → grow
  over real time → harvest) is a server-clocked state on the layout row
  (`plantedAt`), which is a new column and a new validator, not a new table.
- **Commands**: call / pet / give treat / sit and the like. Each is a verb the
  sim already has a slot for — `attention` is the state a command interrupts
  into, so a command is a new state on the pure sim plus a prompt, never a
  change to bodies or storage. Treats are the first consumable on a pet row.
- **Pet needs / bonds**: hunger and affection on the pet row, decayed by
  server time; feeding is the first "interact with an item" verb.
- **Pet ownership / cosmetics**: `createFarmInventory({ grantAll: true })`
  from the start, like the room — species become earnable later by
  changing the grant list.
- **Company**: presence in the farm is the room's bridge under a `farm`
  room name; pets are owner-simulated and streamed as poses like visitors.

## Decisions pinned

1. Farm = platform surface at `/farm/`, storage slug `farm` on `game_loadouts`.
2. Import room modules; edit only `arcade-room-store` (parameterise) and
   extract the walker; no editor lift until slice 3.
3. Pets roam, they are not placed. The sim is pure and fixed-timestep.
4. Habitat is on the species row from day one; aquatic species wait for water.
5. Everything granted in this phase through one visible inventory seam.
