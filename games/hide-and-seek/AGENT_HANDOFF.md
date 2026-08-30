# Agent Handoff — V7.2

Design direction, roadmap, and working agreements live in `CLAUDE.md`. This file is only the list of hard-won invariants: things that were expensive to get right and are easy to break by accident.

## Traversal (V5, still binding)

Spectator/traversal regression (2026-08-30): CPU poses retain rig-facing `yaw` (+Z) and publish
`cameraYaw` for the spectator camera (-Z); human/network poses already use camera yaw. Hiders must
publish facing too. The seeker uses the map graph for chases as well as patrols, never a room-centre
sweep that forces a same-room chase back into the corridor. Guided stairs still check body collision,
and arrival snapping checks clearance and actual walk height. A blocked waypoint invalidates the
whole remaining route, not just its first leg. Replanning from a flight preserves the body's actual Y
and exits along the stair spine before rejoining a floor graph. CPU wall avoidance persists between
ticks, and retrying a seeker route must not reset its retry count.

Do not reintroduce floor visibility swapping or stair teleports. Continuous vertical traversal is the architectural goal — all four floors are physically present at their real Y positions.

`plan.surfaces` contains flat hotel floors, room floors, secret tunnels, the moving elevator floor, stair landings, and stair ramps. `resolveGroundHeight()` deliberately selects only a *nearby* surface, so overlapping stair flights do not snap the player several meters vertically.

`collidesAt()` checks Y overlap as well as X/Z. That specifically fixes the V4 failure where the elevator's overhead wall header blocked the doorway.

## The building is data (V6.9)

`hotel-plan.js` **is** the hotel. Every wall, slab, ceiling, room, door, secret panel, tunnel, furnishing, walk surface and spawn is plain world-space data it emits, and the file contains no renderer at all — `tests/hotel-plan.test.js` asserts that, with comments stripped so the prose may name what the code avoids.

- `modules/hotel.js` is **only a renderer**. It walks the plan and makes meshes. It may not author a position, a room, a wall or a stair; the architecture test fails if `addRoom`, `splitWallForOpening`, `createStairLayout` or `roomVariants` reappear in it.
- `modules/furnishings.js` **draws a placement and registers nothing**. A bed is solid because the plan says so. The old `registerStatic`/`registerBoxCollider` path is gone on purpose: a bed that blocks on screen and is thin air on the server is exactly the drift this seam exists to prevent.
- Do not restore `Box3.setFromObject()` or infer gameplay bounds from render geometry.
- Doors are not colliders the renderer owns. The plan carries a hinge and the runtime reports only how far the leaf has swung, through `world.setOpening(planId, angle)`; elevator doors report an open amount the same way. The resolved list is rebuilt only when an opening actually changed, so this is cheaper than the old per-frame mesh walk, not more expensive.
- The **elevator cabin is the one exception** and deliberately so: it rides the shaft, so its bounds are state rather than layout. It keeps `world.registerBoxCollider`, and its floor is the single `dynamic` walk surface, fed by `world.setDynamicHeight('elevator-car', y)`.

Why this matters beyond tidiness: online, the demon and every catch must be resolved by the server. A server cannot run WebGL, so if only a browser can say where the walls are, only a browser can say who was caught.

## Elevator

The cabin floor is a dynamic walk surface following `elevator.car.position.y`. Hall/cabin door colliders disable once the doors are mostly open. The cabin moves in world Y with the player inside it.

The round begins with `holdSeeker()`: the seeker is placed in the Floor 1 cabin, both door sets are shut, and calls/buttons are disabled. Hiding lasts at least 45 seconds. Only the hiding-to-seeking transition may call `releaseSeeker()` and start opening the doors.

## Stairwell

The east service-zone shaft is continuous from Floor 1 through Floor 4: south entrance on every floor, a shared full-width landing, two parallel flights per transition, one north switchback landing. Visible treads are backed by smooth ramp surfaces. No stair interaction changes floors. Geometry originates in `layout.js`, shared with the Node regression tests, so a geometry change must keep `tests/layout.test.js` honest rather than the reverse.

## Rooms and lighting

Room openings are framed on every floor. Each room owns a shadow-free `fillFixture` that is visible only while its door is open — the architecture test asserts opening a door does not change the renderer's light count, and that only lights near the active floor stay in the realtime pass. Shadows are off and DPR is capped at 1.5 on purpose; adaptive quality lowers render scale after sustained slow frames.

### The light count never changes (V7.2)

**This is the hard one.** three.js bakes the number of lights of each type into every material's shader program cache key, so the frame on which a light appears, disappears, or is hidden is a frame that recompiles and relinks every shader program in the scene. Measured on the built hotel, a normal frame is ~6ms and the frame that adds one point light is **4,580ms** (software renderer — the ratio is what matters). That was the stairwell chug: entering it lit a second floor, doubling the point lights.

So the rule for anything that emits light in this cabinet:

- **Hall and table lamps are records, not lights.** `plan.lights` and `furnishings.addTableLamp` push plain `{ floor, x, y, z, color, intensity, distance, decay }` into `world.collections.floorLights`. `modules/hotel.js` owns a fixed pool of `LIGHT_POOL_SIZE` (8) `PointLight`s, created once at build and **never hidden**; `selectPoolLights` assigns the nearest lit lamps into them as the player moves and parks any spare slot at `intensity = 0`. `layout.selectVisibleLightFloors` still decides which floors are candidates — it just feeds the pool instead of a visibility flag.
- **Switch a light with `intensity`, never with `visible`.** The flashlight (`modules/player.js`) does this; so does a parked pool slot. `flashlightBeam.visible = ...` used to recompile the hotel on the most-pressed key in the game.
- **A light that arrives late is a light that stalls.** The demon's `headHalo` is constructed in `createMonster` and merely re-parented onto the face when the GLB lands, because creating it with the face moved the count a second into the round.
- `rendering.warmUp()` (`renderer.compile`) is called before the first frame so materials compile on the loading screen. It is only honest while the count is fixed, since a program is compiled against the light counts in force when it is built.
- Share materials for anything spawned during play — a new material is a new program compile. Dropped batteries reuse one casing and one lens material for this reason.

## The Bellhop (V6)

Spawns at a safe random position, roams all four floors, and travels between them on a purpose-built route graph using the **stairs, never the elevator**. Chase replanning must not restart an active stair route — a route with `stair` points is committed. Detection is FOV + range + vertical level + collider-aware LOS; crouching lowers the eye line and shrinks detection range, which is what makes furniture and corners real cover.

The demon's face detail rides the animated `Head` bone rather than a fixed offset, and the model's forward direction is corrected at load — the architecture test pins both, plus the named face parts.

## Fixed timestep (V6.4)

Gameplay advances on `createFixedTimestep` at 60 ticks/s. `simulate()` is called once per whole tick with `timestep.step`; only rendering, the adaptive quality sampler, and the model viewer run per frame. Do not pass a `requestAnimationFrame` delta into gameplay again — a 144hz machine would run a different game, and no server could be authoritative over it. A frame is capped at five ticks and the remainder is dropped, which is what keeps a stall from spiralling.

## Player avatars (V6.4)

Every player is a figure, the local one included: the local avatar is driven from the camera through the same `setPose` a network snapshot will use, so there is only one body implementation. Specifics that were fiddly:

- The textured Base Character and the compatible locomotion library are each loaded **once**. Each avatar body is a clone whose `SkinnedMesh`es are rebound to their own cloned skeleton — a plain `Object3D.clone()` leaves every clone animating as the source body.
- The temporary capsule lives under `avatar.body`, so it must be removed with `avatar.body.remove(avatar.placeholder)` when the model loads. Removing it from `avatar.root` silently does nothing and produces a capsule torso with the real character's limbs sticking through it.
- Preserve the Base Character's texture materials. Replacing every mesh material with a flat seat tint turns the finished character back into a mannequin.
- Crouching uses the animation bank's native `Crouch_Idle_Loop` / `Crouch_Fwd_Loop`; do not manually fold the thigh and calf bones.
- The clips carry scale tracks, so the local head collapse is re-applied after the mixer too, not once at load.
- Which clip plays is decided in `avatar-logic.js` against the clip names the loaded GLB actually ships. Never hard-code a clip name in `modules/avatars.js`.

## Stairwell performance (V6.4)

The stairwell and the moving elevator report `playerFloor === 0`, and floor 0 used to make **every** light in the hotel visible — roughly 32 point lights in one forward-rendered pass, which is what made the stairwell unplayable. `layout.selectVisibleLightFloors()` now picks floors by vertical proximity to `world.state.playerFeetY`, so at most two are lit. Keep `playerFeetY` published from `player.refreshLocation()`; the lighting rule depends on it. Since V7.2 those floors only choose the *candidates* for a fixed-size light pool — see "The light count never changes" above, which is what actually removed the stairwell hitch.

The stairwell's treads, landings, and rail segments are static, so they are baked into one merged mesh per material at build time (168 meshes → 2 draw calls). Anything new in there that does not move should join the batch rather than being added as its own mesh.

## Static batching (V7.2)

The stairwell's bake is now the whole hotel's. `modules/static-batcher.js` runs once at the end of
`hotel.build()`: each floor group is traversed, its static leaf meshes are merged per material, and
emptied containers are pruned. The floor groups go from ~2,780 meshes to ~620.

- **Nothing changes about how the hotel is built.** The renderer still walks the plan one record at
  a time; the flatten pass happens afterwards. Do not make a builder batch-aware — that drags the
  merge decision back into the code whose only job is to walk the plan.
- **What may never be merged is named in `hotel.flattenStatics()`**: door hinges, drawer groups, the
  hall elevator doors, every `collections.interactables` object, and the room-fill fixtures. A merged
  mesh has no local transform *and no identity* — `player.js` finds what you are looking at by
  matching the object its ray hit, so a batched interactable is a door that can no longer be opened.
  Anything new that animates or has to be pointed at goes in that skip set.
- **Merged meshes stay raycastable.** The interaction ray reads the nearest hit and then walks up to
  an interactable, so a wall that stops being a ray target is a door you can open through it.
- **Frustum culling is the trade.** A merged floor is one bounding box and is always drawn. That is
  intended: ~620 always-drawn batches beat ~2,780 individually culled boxes.
- **Share materials for anything placed dozens of times.** A material instance is the batch key, so a
  fresh `MeshStandardMaterial` per plant pot is 58 draw calls that can never merge. See
  `potMaterial` / `vendingMaterial` in `modules/furnishings.js`.
- `HotelPrototype.getState().render` reports live `drawCalls`/`triangles` and what the pass collapsed.

## Heat signature / the anti-camping hunt (V6.5, renamed V7.4)

The meter was called `sanity` through V7.3. It counts *up* while you sit still and a full bar brings
a demon to your door, which is the opposite of what a sanity bar does everywhere else — it is a heat
signature, and it is named one everywhere: `heat-logic.js`, `modules/heat.js`, the `hotel:heat-*`
events, the plans’ room `heat` bounds, and the roster’s `heat: null` for a demon that does not hunt.
The mirrored copy in `factory-network-server` was renamed with it; deploy both repositories together.

The meter exists to stop hiding in one room from being a winning strategy, and every rule for it is in `heat-logic.js` so a server can run it headlessly — `modules/heat.js` may sample the camera and paint the HUD, but must not re-implement the timing (the architecture test asserts it never mentions `fillSeconds`).

- There are three **zone kinds** and the meter treats each differently: `room` (an 8×8 box from `world.collections.roomCenters`) fills it and can be hunted; `hallway` — corridors, the stairwell, a moving elevator (`playerFloor === 0`) — fills it but is never entered by the demon; `tunnel` (explicit bounds from `world.collections.secretTunnels`, published by `addSecretTunnel`) **drains** it.
- Tunnels are matched *before* rooms in `locateZone`. Their floor rect overlaps the neighbouring room box by ~2.5cm of solid wall, and the tunnel is the more specific space.
- The elevator cabin is the only protected refuge, even with open doors. Demons can open secret panels and traverse tunnels. A tunnel still cannot read full however long you sit in it, and entering one does **not** reset the meter: it carries the value in and bleeds it off over `tunnelDrainSeconds`. Leaving a tunnel resets like any other zone change.
- Changing zone resets it, and that tick's time is dropped (the tunnel exception above aside). Distance walked **in the hallway** resets it too, once it passes `hallwayStepDistance`. Moving around *inside* a room does not: camping in place is what is being punished, not motion.
- A full meter only makes you a target while you are **in a room** — the demon walks into rooms, so a full meter in a corridor does nothing. With several full hiders it takes the nearest, with a floor priced at `floorPenalty` metres of corridor.
- Every living hider owns a `createPlayerHeat` tracker. `hiders.list()` publishes its candidate fields, and both The Bellhop's visual detection and heat hunt consume that entire list alongside the local player.
- The hunt fires only from `ROAM`. `CHASE` always wins (it has a live sighting) and `SEARCH` is a fresher lead than a stale camper; letting either stack with the hunt would double-plan the route. On arrival the demon prowls the room rather than standing in the doorway.
- `heat.setHunted()` is called by `monster.js`, not by the meter — the demon owns whether it is actually walking your way, so the HUD and the AI cannot disagree.

## Sprint stamina (V6.6)

Sprinting is the only thing that outruns The Bellhop, so it is a metered resource, not a modifier. Every rule is in `stamina-logic.js`; `modules/stamina.js` is the HUD and the one-shot "winded" callout only, and the architecture test asserts it never mentions `sprintSeconds` or `recoverThreshold`.

- The shift key is a *request*. `player.js` asks the meter and uses the answer, so a spent player drops back to a walk mid-stride. Do not reintroduce `keys.ShiftLeft ? CONFIG.sprintSpeed : ...`.
- The bar drains only while actually moving and not crouching — holding shift while standing still recovers instead of draining.
- **Exhaustion, not emptiness, is the sprint gate.** A bar at 10% still sprints; a bar recovering from zero does not, until it passes `recoverThreshold`. Without that lockout, emptying the bar would give a stutter-sprint one frame later instead of a real cost.
- Recovery is fastest crouched, then standing, and slowest while walking. That ordering is the point: the safe way to get sprint back is to stop and hide, which is exactly where the heat meter starts filling. The two meters are meant to pull against each other.

## Menus and pause (V6.6)

`menu-logic.js` is the screen state machine (title / how-to / extras / pause / playing / caught); `modules/menu.js` only paints it and dispatches button clicks.

- `PLAYING` is the game's single "the simulation is running" answer. `main.js` gates the accumulator on it: **it does not advance `timestep` at all while paused**, so no meter ticks behind a menu and no paused time is owed back on resume. Do not "fix" a pause by clamping the delta instead — that reintroduces the tick the heat meter used to steal.
- `player.js` no longer touches the overlay. It reports lock changes to the menu and the machine decides what that means — which is what keeps a pause menu from stacking on top of the caught screen when the pointer lock is released by the catch.
- Pointer lock must be requested from inside the click that chose Play or Resume, so the menu calls `player.beginPlay()` rather than the player watching the overlay. `?controls=drag` goes through the same dispatch instead of around it: there is one path into a round.
- `how-to` and `extras` remember which screen opened them, so `BACK` from the pause menu returns to the pause menu.
- Quitting reloads. The hotel, the demon, the open doors and the key ring are all still standing, so the machine reports the intent (`effect: 'quit'`) and the host rebuilds the session; there is no in-place reset and it should not be faked.

## The in-game HUD (V7.4)

The round now uses the menus' own design language — hairline warm border, near-black ground, a red
accent tick, 8px letterspaced micro-labels, one serif numeral — instead of the prototype's six
translucent black rounded rectangles. The rules that hold it together:

- **Four corners and one rail.** Key ring top left, location top right, the round plate top centre,
  the controls legend bottom left, and everything a player spends in `#hudRail` down the right.
  `.hudPlate` fixes one width for both side columns so the plates line up as columns, not as four
  boxes near the corners.
- **Nothing is positioned relative to another element's height.** Every panel in the rail used to be
  `position:fixed` at its own hard-coded `top`, which is only correct for one roster size, and the
  stylesheet carried a duplicate copy of the stamina block per `.monster-*` state to re-pin it. The
  rail is a grid; a third demon pushes the meters down. Do not reintroduce a `top` on a rail child.
- **A meter is a label, a readout and a track**, sharing `.hudMeter` / `.meterHead` /
  `.meterTrack` / `.meterFill`. Heat, stamina and the flashlight are the same shape because they are
  the same kind of thing: something you spend. State is a `data-state` (or `data-on`) attribute the
  module sets and CSS colours — a module must never write a colour.
- **The interaction prompt's keycap is CSS**, drawn from `data-key`. `player.js` sets the sentence
  the interactable wrote; it must not paste `[E] ` onto the front of it again.
- **`#threatVignette` is transparent on its own** and lit only by a `.monster-*` body class, each
  declared exactly once. `tests/demons.test.js` asserts that: a second copy of any of those
  selectors is how a chase glow used to outlive the chase.

## The flashlight (V6.9)

A flashlight is the strongest seeker-favouring tool in the game, so it obeys the standing rule: it costs something. `flashlight-logic.js` holds every rule, pure and immutable, and `modules/player.js` only paints the beam and the HUD.

- **The battery is the cost.** `FLASHLIGHT_CONFIG.drainSeconds` of light, draining **only while lit**. At zero it switches itself off, and `setFlashlight(empty, true)` refuses — an empty light cannot be flicked back on for one more frame of vision. Do not "fix" that refusal.
- **A caught player drops their remaining charge.** `createFlashlightDrop` makes the record and `modules/round.js` drops it for hiders and the seeker alike, so a body on the floor is a resupply. That is the loop that keeps the light meaningful without making it infinite.
- **`describeFlashlight` is a network pose field, not a HUD model.** It returns exactly `{ on, charge }`. Online, `on` must replicate because a lit player is visible to everyone, and `charge` is server-authoritative — a client that reports its own battery is the same class of cheat as one that reports it wasn't caught.
- **Open item:** `enemy-logic.canDetectPlayer` still weighs only crouching and distance. A lit player is not currently easier for a demon to see. If that changes, it must change in `enemy-logic.js` so a server runs the same rule.

## Maps (V7.2)

`map-catalog.js` is the registry of locations. A map is a catalog row, a pure plan module named by the global it attaches to, and a demon roster — see `MAP_AUTHORING.md` for the plan contract.

- **Adding a map must not require editing the renderer, the menu, `main.js` or `index.html`.** `modules/hotel.js` resolves a plan through `maps.resolveMapPlan` rather than naming a factory; the picker is filled from `maps.listMaps()`. `tests/architecture.test.js` fails if that starts to drift.
- **`status: 'soon'` is a real state.** A registered map with no plan is shown as a locked row and `playableMapId` refuses to resolve it into a round, on the client and on the server. `normalizeMapId` is descriptive (the picker needs to name an unbuilt place); `playableMapId` is what anything standing a round up must use.
- **A map is entered, never swapped.** The building is constructed at boot and the demons spawn into it, so changing location re-enters the page (`modules/map-session.js`) carrying the solo setup across. Do not try to rebuild the world under a live round.
- **Online, the map is a lobby setting.** Matchmaking already compares settings, so two maps are two pools for free, and the snapshot names the map. A client whose building disagrees refuses the round rather than adjudicating against geometry it does not have.
- **Online has its own stage setup before the lobby.** Both pickers use `modules/map-picker.js`; a map change carries `mode: 'online'` through `map-session.js` so it never falls into solo setup. Online round results return here, too. The online menu accepts only server-owned catch results; local demon brains must stay idle while awaiting a remote pose.
- **How tall a building is comes from the map.** `world.state.floorCount` in the browser, `player.floorCount` in the tick. Five modules used to walk 1..4 by hand; a test keeps the literal out.

## Demons, per map (V6.9, rewritten V7.2)

`modules/demons.js` composes a map's roster from the single `createMonster` factory; there is no second monster implementation and there must not be one. **Two was The Grand Hotel's number, not a rule** — the roster is data, up to `MAX_DEMONS` (6), and Cinder Mall has three.

- **A roster may be longer than the building is tall, so demons are spread by distance, not one per floor.** Cinder Mall is three demons on two levels; "a floor each" is arithmetic with no answer there, and the floor was never the point — two demons in one corridor is what must not happen, two at opposite ends of a 96m concourse is fine. `navigation.minSpawnSeparation` is the rule, and both `demon-logic.chooseDemonSpawn` and `modules/monster.js` apply it.
- **A status row belongs to the roster or it does not exist.** The hotel's two are authored in `index.html`; anything else is built at runtime, and `pruneStatusRows` removes any row naming a demon that is not in this building. Cinder Mall showed five before that existed.
- **Copy names the map's own staff.** `monsters.hunterName()` / `monsters.rosterText()` — a round in the mall telling the seeker to beat The Bellhop is naming a demon who does not work there.

## Where a demon may walk belongs to the plan

`demon-logic.js` used to navigate by arithmetic against one floorplan: a corridor spine at x=0, a list of patrol Z values, and a dogleg to |x|=3.75 for anything off it. A plan emits a `navigation` block instead — a per-floor waypoint graph plus the vertical connectors between floors — and `enemy-logic.createNavigator` is the only thing that reads it.

- **`planFloorRoute` is the one router.** The demon, the offline seeker and the offline hiders all use it. There were four copies of the dogleg before; do not write a fifth.
- **An edge never joins two floors.** A floor change is a connector, and a walk edge between levels is a demon walking up through a ceiling.
- **A connector may be a switchback or a straight run.** The hotel's stairwell is two lanes with a landing; the mall's escalators are one flight. `createStairRoute` handles both — it assumed the switchback and crashed on a single flight.
- **`layout.js`'s stairwell is the hotel's**, and the mall builds its own. Nothing may call `layout.createStairLayout()` to find out where *a* map's stairs are.

## The building owns its lift, including which way it opens

The lift's five coordinates are `plan.elevator`. Facing is the sign of `frontZ - centerZ`: the hotel
opens toward -Z and the reference mall toward +Z. Never restore raw low-Z occupancy assumptions.
Cabin walls, doors, buttons, passenger checks and the held seeker's view must all use the same
facing. `modules/elevator.js` reads the shaft in `build()`, not at construction. Hall doors carry
world-space Y and their own Z; render them at those coordinates. Both orientations are exercised
in `tests/elevator-facing.test.js`.

## Cinder Mall reference fidelity

`mall-plan.js` preserves the reference's twenty public entries and furnished shops. Primary doors
and the master keys remain gameplay additions. Furniture has plan-owned collision; its meshes
never register it. Shop targets are clear aisle points, with separate bounds for heat zones.
Ground ceilings cover shops only, never the atrium or escalators. Shop finishes sit above the
structural slab to avoid z-fighting. The projection corridor is inside the cinema's rear wall.

The aisle graph is checked against full player-width collision and walk surfaces at build time.
Straight escalators are one flight, not a switchback with a duplicated return flight. A connector
can carry floor-specific `approaches` when its two landings differ. Keep the entrance/edge/route
clearance tests in `tests/mall-plan.test.js` passing when moving any furniture or wall.

## A door hangs in a wall that runs one way or the other

The renderer re-derived every door leaf as thin-in-X and wide-in-Z, and `createDoorFrameLayout` always placed its jambs either side along Z. Both are a hotel corridor written into the renderer. A door record carries `w`/`d`, `hingeX`/`hingeZ`, `localX`/`localZ`; a `doorFrames` entry carries `axis`. **Honour them** — the failure mode is a leaf lying flat through a shopfront and a jamb standing in the middle of the opening.

- **A room with no door is treated as locked**, so no demon patrols into it. Every `roomCenters` entry needs a `roomDoors` entry, even one that starts open.

## Plan geometry is shared, and lives in `collision-logic.js`

`boxBounds`, `hingedBounds`, `slidingBounds`, `resolveColliders`, `walkHeightAt` and `rotateY` were in `hotel-plan.js`; a mall cannot sensibly ask a hotel where its own floor is. Both plan modules re-export them, so `plan.resolveColliders(...)` still works everywhere. **`collision-logic.js` must load before any plan module** — in `index.html` and in the server's `shared/index.mjs`.

- **Exactly one demon per map hunts campers.** Every other demon is constructed with `heat: null` deliberately. Two heat hunters would converge on the same full meter and make the anti-camping rule read as a swarm; it also keeps `selectHuntTarget` single-hunter. `tests/map-catalog.test.js` asserts it for every registered map.
- **They start apart.** Each demon's `excludedSpawnFloors` is every floor already taken, so a roster of three opens on three levels rather than two in one stairwell.
- **A demon without authored markup gets a HUD row built for it.** The hotel's two are in `index.html`; a new map's are created into `#demonStatuses`. Adding a demon must never be an HTML edit.
- **The threat readout stays aggregated and position-free.** `enemy-logic.aggregateEnemyState` reduces every demon to one worst-case state for the vignette and the `hotel:monster-state` event. Do not add a per-demon indicator — that is the tracker minimap coming back through the side door, and with three demons it leaks three positions.
- **The round does not care which demon caught you.** `resolveDemonCatch` takes a player id, not a killer. Keep it that way; a third demon costs nothing in `round-logic.js`, and that is now load-bearing rather than aspirational.

## The shared hotel (V7.1)

`fixtures-logic.js` owns every door, secret panel, drawer, key ring and the elevator. Before it, the
renderer owned all of them, which is why an online round was a hotel where a door you opened was
still a wall for the seeker chasing you.

- **A client sends "I pressed E", never "I opened door-201".** The authority picks the fixture by
  distance, then height, then a facing dot — the same ordering `canTag` uses, and for the same
  reason. It does not raycast: a server has no meshes to raycast against.
- **Interaction is edge-triggered on the authority.** A client that holds `E`, or one that spams the
  message, must not strobe a door open and shut sixty times a second. The rising edge is read off
  the input stream, which is also why `shouldSendInput` has to send the *release* — an `interact`
  that latches true means the next press is not an edge at all.
- **A drawer is contested.** It holds one key, `emptied` is permanent, and `searched` resets on close
  so the next player gets to look and finds it empty. Two players pressing on the same tick is
  exactly what this seam exists to resolve.
- **Only the floor the cabin is standing at has its hall doors open.** Every other floor's opening
  onto the shaft stays shut whatever the cabin is doing, or the shaft becomes a four-storey hole.
- **The elevator cabin is still the one collider that is state rather than layout.** It rides the
  shaft, so `space.setDynamicBoxes` keeps it in a short separate list — folding it into the cached
  collider set would rebuild all 700-odd boxes every tick it moves.
- **`describeFixtures` publishes only what a client has to draw.** An undiscovered secret panel is
  not on the wire, and neither is anyone's key ring but your own: the full map would be a wallhack
  for every locked room nobody has opened yet.

## The demons, server-side (V7.1)

`demon-logic.js` is the brain; `modules/monster.js` is the body. Everything that decides — where a
demon walks, what it can see, when it replans, who it catches — moved out of the rendering module.

- **`modules/monster.js` has a puppet mode.** `setRemotePose` switches the whole brain off:
  `update` returns after `updateRemote`, so online it detects nothing, routes nothing and catches
  nobody. There is one authority per hotel, and a second demon thinking in a browser would disagree
  about who died.
- **A demon's catch requires line of sight**, exactly like a seeker's tag. It used to be distance
  only, which made a shut door real cover against a player and no cover at all against a demon. The
  sight ray only runs for a candidate already within arm's reach, so it costs a ray on the rare tick
  where somebody is about to die rather than one per body per tick.
- **Only The Bellhop hunts campers** — still. `hunts: false` on The Housekeeper is deliberate and
  keeps `selectHuntTarget` single-hunter.
- **Roaming opens an unlocked door; only the hunt forces a lock.** A locked room is a hiding place,
  not a fortress, but a roaming demon should not be a master key.
- **A snapshot carries a demon's position and nothing about its intent.** Its route, its target and
  its awareness stay on the server; the HUD still gets one aggregated threat state. That is the
  tracker minimap rule (V6.3), enforced at the network boundary this time.

## Online, the parts that bite (V7.1)

- **`find_lobby` must carry `HotelOnline.LOBBY_LIMITS`.** The server matches an open lobby on its
  seat limits, and a search that omits them is sanitized to the server-wide default of 2-6 — which
  never equals the 2-8 lobby this game creates. The symptom is silent and baffling: every guest gets
  their own room and nobody can see anybody.
- **The cabinet is served from the repo root.** `modules/account-access.js` imports
  `/js/platform/**` for the sign-in gate, so `server.mjs` roots at the repo and opens
  `/games/hide-and-seek/`. Rooting it at the cabinet again 404s those modules and the whole module
  graph fails to boot.
- **The offline hiders stand down when a match starts.** `hiders.standDown()` removes their bodies
  rather than pausing them — a hider nobody can catch, standing still in a corridor, is a decoy the
  seeker wastes the whole round on.
- **The factory profile is read, never written.** `account-access.js` derives a match alias. This is
  the repo's Factory-Identity-First rule and it is not negotiable in a cabinet.
- **A dropped guest keeps their body.** It stays standing and catchable for the 30-second grace
  window, and `resumeRequestFor` refuses to ask for a seat that window has already closed on.
- **Automation cannot playtest this.** Chrome freezes `requestAnimationFrame` in unfocused tabs, so
  two scripted clients cannot both simulate a round. Connection, lobby, roles and replication can be
  verified from a script; how movement feels cannot.

## Deliberate removals — do not "restore" these

- **The tracker minimap (removed V6.3).** Knowing where the demon is defeats the game, and in multiplayer it would leak hider positions. Threat feedback is `#monsterStatus`, the vignette, and audio only.
- Stair teleportation, floor visibility swapping (V5).

## Since V5.1 — the old "next work" list

Items 1–3 of the V5.1 recommendations are done: crouch shipped with V6, audio shipped as `modules/music.js` (soundtrack that reacts to monster state, plus SFX from `assets/sounds/`), and the entity route graph shipped with the demon. Two are still open and unclaimed:

- Persistence for keys/doors/drawers.
- Elevator horror failures — still gated on baseline traversal staying stable.

Sound *propagation* (noise the demon and other players can hear) was never built and matters much more now that hide-and-seek is the target; see the roadmap in `CLAUDE.md`.

## The round (V6.7)

`round-logic.js` owns roles, the clock and both win conditions, and it is written N-player from the start — the single-player build is one seeker plus three offline hiders, not a special case. Invariants:

- **Only one place ends a round.** `settle()` is it. A tag, a demon kill and the clock expiring all funnel through it, so they cannot disagree about who won. Do not end a round from a caller.
- **The catch is resolved from positions by `modules/round.js`, never announced.** A client that reports "I tagged them" or "I wasn't caught" is the obvious cheat, and this is the shape the server has to keep. `canTag` is distance + height + line of sight, in that order.
- **A hider the demon eliminates still counts toward the seeker's win.** The condition is "every hider is out", not "every hider was tagged".
- **The demon taking the seeker ends the round immediately**, with survivors left alive. Do not retroactively catch them.
- **The head start is a rule, not a caption.** It has a hard 45-second minimum. The seeker is physically held inside the closed lobby elevator; its doors start opening exactly on the hiding-to-seeking transition. The round clock does not run during hiding, and a tick spanning release spends only its remainder on the round clock.
- **The round HUD is position-free.** Clock and tally only. This is the same rule that removed the tracker minimap in V6.3, and online it is the difference between a HUD and a wallhack.

## Offline hiders (V6.7)

`hider-logic.js` decides; `modules/hiders.js` walks. Two things here were bugs before they were rules:

- **Opening the room's door is part of taking a room.** `assignSpot()` is the only way a hider claims one precisely so no caller can forget — an earlier version opened the door on a re-pick but not on the spawn's first spot, and those hiders ground into a closed door.
- **"Arrived" means standing in the room, not out of waypoints.** The mover gives a waypoint up when the way is solid, so an empty route proves nothing. A hider that runs out of route without reaching its spot strikes that room off its own list and picks another; without that it crouches in the corridor for the rest of the round, which is both a terrible hiding place and a free find.

Hiders route through the one stairwell the demon uses, via `enemy-logic.createStairRoute`. Do not grow a second navigation system for them.

## Movement and line of sight (V7.0)

There is **one mover**. `movement-logic.js` is pure and owns both integrators: `stepAxes` (the local
player's, two axes tried separately) and `stepToward` (a routed body's, direct step then the two
perpendicular ones). `player.js`, `monster.js` and `hiders.js` all call it against a `space` the
world provides.

- **A runtime module may not call `world.resolveGroundHeight` or `world.collidesAt` directly.**
  Sliding along a wall, snapping to the ground and giving up when boxed in are rules; a module that
  re-derives them is a second physics implementation the server would have to match.
  `tests/architecture.test.js` fails on it.
- **`groundAt` returning null is not the same answer as `blocked` returning true.** One is a ledge
  and one is a wall, and only a wall is worth sliding along. Keep them distinct.
- **A `guided` waypoint is followed literally, vertical component included.** Stair flights and the
  elevator carry a body along a path the walk surfaces cannot describe.
- **Line of sight is `collision-logic.segmentBlocked`, an AABB slab ray.** It replaced a
  `THREE.Raycaster` in the demon that skipped every collider whose `enabled` flag was *absent* — and
  the plan's records do not carry one, so nothing had been occluding the demon at all. Do not
  reintroduce a raycast: a server cannot run one.

## The authoritative round (V7.0)

`sim-logic.js` is `tick(state, delta, inputs) -> state`, and it is the same file in the browser and
on the server.

- **A client sends what it is trying to do, never what happened.** `readInput` narrows a message to
  a direction, a facing and three held keys. Whether you moved, whether your battery is empty and
  whether you were tagged are answers the tick gives.
- **The tick does not mutate what it is handed**, and the same inputs produce the same state — a
  mirrored server has to agree with the client that ran them.
- **`createPlanSpace` caches its colliders and rebuilds only when a door actually moves.** Resolving
  700-odd boxes per query per body per tick is not a tick budget.
- **The demon is not in the tick yet.** `resolveDemonCatch` / `endRoundByDemon` are wired to the one
  place a round may end, so adding the hunt changes nothing downstream.

## Online (V7.0)

- **`factory-network-server/games/hide-and-seek/shared/` is a byte-for-byte mirror.** Change a pure
  file here, run `node tools/mirror-sim.mjs`, commit both repos. Both sides check the manifest, and
  the failure mode of an unchecked mirror is silent: the server keeps deciding catches in a hotel
  that no longer exists while every suite stays green.
- **There is one authority per hotel.** Online, `main.js` stands the local round and both demons
  down. Do not "fix" an empty online hotel by starting the local demons.
- **The client never resolves a catch.** `modules/online.js` may not import or re-implement
  `canTag`, `resolveTag` or `resolveDemonCatch`; the architecture test asserts it.
- **All of it is replicated now:** doors, drawers, keys, the elevator, dropped batteries and both
  demons. See "The shared hotel" and "The demons, server-side" above for the rules each of them
  brought with it.
