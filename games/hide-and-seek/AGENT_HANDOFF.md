# Agent Handoff — the invariants

Design direction, architecture and open work live in `CLAUDE.md`. This file is only the list of
things that were expensive to get right and are easy to break by accident. Each entry says what the
rule is and, where it is not obvious, what went wrong before it existed.

It is not a history. If something here no longer matches the code, the code wins — fix the entry.

---

## Traversal

- **No floor visibility swapping and no stair teleports.** Every floor is physically present at its
  real Y and traversal is continuous. This is the architectural goal, not an implementation detail.
- `plan.surfaces` carries flat floors, room floors, secret tunnels, the moving elevator floor, stair
  landings and stair ramps. `resolveGroundHeight()` deliberately selects only a *nearby* surface, so
  overlapping stair flights cannot snap a body several metres vertically.
- **`collidesAt()` checks Y overlap as well as X/Z.** Without it the elevator's overhead wall header
  blocks the doorway like a full-height wall.
- Visible treads are backed by smooth ramp surfaces. No stair interaction changes floors.
- The hotel's stairwell geometry originates in `layout.js` and is shared with the regression tests,
  so a geometry change must keep `tests/layout.test.js` honest rather than the reverse. **That
  stairwell is the hotel's** — every other map builds its own, and nothing may call
  `layout.createStairLayout()` to find out where *a* map's stairs are.

## Movement and line of sight

There is **one mover**. `movement-logic.js` is pure and owns both integrators: `stepAxes` (the local
player's, two axes tried separately) and `stepToward` (a routed body's, direct step then the two
perpendicular ones). `player.js`, `monster.js`, `hiders.js` and `seeker.js` all call it against a
`space` the world provides.

- **A runtime module may not call `world.resolveGroundHeight` or `world.collidesAt` directly.**
  Sliding along a wall, snapping to the ground and giving up when boxed in are rules; a module that
  re-derives them is a second physics implementation the server would have to match.
  `tests/architecture.test.js` fails on it.
- **`groundAt` returning null is not the same answer as `blocked` returning true.** One is a ledge and
  one is a wall, and only a wall is worth sliding along. Keep them distinct.
- **A `guided` waypoint is followed literally, vertical component included.** Stair flights and the
  elevator carry a body along a path the walk surfaces cannot describe.
- **Line of sight is `collision-logic.segmentBlocked`, an AABB slab ray.** It replaced a
  `THREE.Raycaster` in the demon that skipped every collider whose `enabled` flag was merely
  *absent* — and the plan's records do not carry one, so nothing had been occluding the demon at all.
  Do not reintroduce a raycast: a server cannot run one.

## The building is data

`hotel-plan.js`, `mall-plan.js`, `hospital-plan.js` and `cinema-plan.js` **are** their buildings.
Every wall, slab, ceiling, room, door, secret panel, tunnel, furnishing, walk surface and spawn is
plain world-space data they emit, and the files contain no renderer at all — the plan tests assert
that with comments stripped, so the prose may name what the code avoids.

- `modules/hotel.js` is **only a renderer**. It walks the plan and makes meshes. It may not author a
  position, a room, a wall or a stair; the architecture test fails if `addRoom`,
  `splitWallForOpening`, `createStairLayout` or `roomVariants` reappear in it.
- `modules/furnishings.js` **draws a placement and registers nothing.** A bed is solid because the
  plan says so. A bed that blocks on screen and is thin air on the server is exactly the drift this
  seam exists to prevent.
- Do not restore `Box3.setFromObject()` or infer gameplay bounds from render geometry.
- Doors are not colliders the renderer owns. The plan carries a hinge and the runtime reports only
  how far the leaf has swung, through `world.setOpening(planId, angle)`; elevator doors report an
  open amount the same way. The resolved collider list is rebuilt only when an opening actually
  changed.
- **The elevator cabin is the one exception, deliberately.** It rides the shaft, so its bounds are
  state rather than layout. It keeps `world.registerBoxCollider`, and its floor is the single
  `dynamic` walk surface, fed by `world.setDynamicHeight('elevator-car', y)`.

Why this matters beyond tidiness: online, the demons and every catch are resolved by the server. A
server cannot run WebGL, so if only a browser can say where the walls are, only a browser can say who
was caught.

### Plan geometry is shared and lives in `collision-logic.js`

`boxBounds`, `hingedBounds`, `slidingBounds`, `resolveColliders`, `walkHeightAt` and `rotateY` are
there, not in a plan — a mall cannot sensibly ask a hotel where its own floor is. Every plan module
re-exports them, so `plan.resolveColliders(...)` still works everywhere. **`collision-logic.js` must
load before any plan module**, in `index.html` and in the server's `shared/index.mjs`.

### A door hangs in a wall that runs one way or the other

A door record carries `w`/`d`, `hingeX`/`hingeZ`, `localX`/`localZ`; a `doorFrames` entry carries
`axis`. **Honour them.** The renderer used to re-derive every leaf as thin-in-X and wide-in-Z and
always place jambs either side along Z — a hotel corridor written into the renderer — which drew a
mall storefront's leaf lying flat through the shopfront and stood a jamb in the middle of the
opening.

- **Door plan heights are world coordinates.** The hotel renderer subtracts the parent floor
  elevation; mall door records carry their own floor elevation.
- **A room with no door is treated as locked**, so no demon patrols into it. Every `roomCenters`
  entry needs a `roomDoors` entry, even one that starts open.

## Maps

`map-catalog.js` is the registry. A map is a catalog row, a pure plan module named by the global it
attaches to, and a demon roster. `MAP_AUTHORING.md` is the plan contract.

- **Adding a map must not require editing the renderer, the menu, `main.js` or `index.html`.**
  `modules/hotel.js` resolves a plan through `maps.resolveMapPlan` rather than naming a factory; the
  pickers fill themselves from `maps.listMaps()`. `tests/architecture.test.js` fails on drift.
- **`status: 'soon'` is a real state.** `normalizeMapId` is descriptive, because the picker needs to
  name an unbuilt place; **`playableMapId` is what anything standing a round up must use**, on the
  client and on the server.
- **A map is entered, never swapped.** The world is built at boot and the demons spawn into it, so
  changing location re-enters the page (`modules/map-session.js`) carrying the solo setup across. Do
  not try to rebuild the world under a live round.
- **Online, the map is a lobby setting.** Matchmaking already compares settings, so two maps are two
  pools for free, and the snapshot names the map. A client whose building disagrees refuses the round
  rather than adjudicating against geometry it does not have.
- **Online has its own stage setup before the lobby.** Both pickers use `modules/map-picker.js`; a
  map change carries `mode: 'online'` through `map-session.js` so it never lands in solo setup.
- **How tall a building is comes from the map** — `world.state.floorCount` in the browser,
  `player.floorCount` in the tick. A test keeps the literal `1..4` out.
- **Map boot applies the authored spawn to the camera and the physics together.** Setting one and not
  the other puts the player one frame inside a wall.
- **Every playable map must lock something on every floor** (`tests/map-keys.test.js`): every locked
  door names a key some drawer on that floor actually holds, and no key sits behind a door it opens.
  Mercy Hospital shipped fully unlocked once, which left the whole key loop dead on it.

## Where a demon may walk belongs to the plan

A plan emits a `navigation` block — a per-floor waypoint graph plus the vertical connectors between
floors — and `enemy-logic.createNavigator` is the only thing that reads it. It replaced arithmetic
against one floorplan: a corridor spine at x=0, a list of patrol Z values, and a dogleg to |x|=3.75.

- **`planFloorRoute` is the one router.** The demons, the CPU seeker and the CPU hiders all use it.
  There were four copies of the hotel's dogleg before; do not write a fifth.
- **An edge never joins two floors.** A floor change is a connector; a walk edge between levels is a
  demon walking up through a ceiling.
- **A connector may be a switchback or a straight run.** The hotel's stairwell is two lanes with a
  landing, the mall's escalators are one flight. `createStairRoute` handles both — it used to assume
  the switchback and crash on a single flight. A connector may carry floor-specific `approaches` when
  its two landings differ.
- **Every room needs a node in the mouth of its door.** A route planned from inside a room with no
  door node aims at the corridor spine — through the room's wall. Put the node in open floor rather
  than level with the jamb (the hotel's sit at |x| = 3.4): a waypoint inside the wall's own thickness
  is walkable only straight-on, and a body arriving at an angle clips it and wedges.
- **`createNavigator` joins the graph at the nearest waypoint the body can actually walk straight
  to**, and every routed body passes its `space` in. The old heuristic dropped the first waypoint
  whenever the body already stood nearer the goal than that waypoint did — harmless in a corridor,
  catastrophic in a mall, where a demon in a storefront is nearer the shop opposite than the aisle
  node outside its own door, so the leg became a straight line through the shopfront.
- **A blocked step gives the waypoint up**, and **a blocked waypoint invalidates the whole remaining
  route**, not just its first leg. `walk` used to retry a solid leg at 60hz forever.
- **A CPU body whose leg failed replans rather than abandoning its target.** The CPU seeker used to
  skip any room reached by one long graph edge through a doorway — deterministically, every patrol
  cycle, so a store could never be searched. Retrying a route must not reset its retry count.
- **Navigation checks body clearance** when joining or shortening a route, so chase refreshes keep
  moving through doors. Both runtimes wait for swinging leaves and use authored door centres and
  angles; the authority includes secret panels.
- **A demon's mover clearance is a doorway's height, not the demon's own stature.** Doors are 2.12m;
  a demon ducks at 2.05m (`demon-logic.DEFAULTS` and `modules/monster.js`). At its full 2.25m it was
  stopped dead by any map that models a door header.
- **Straight stair pursuit supports either lane label**, and stair detection checks height so rooms
  below landings stay rooms. Guided stairs still check body collision, and arrival snapping checks
  clearance and actual walk height. Replanning from a flight preserves the body's actual Y and exits
  along the stair spine before rejoining a floor graph.
- **CPU wall avoidance persists between ticks.**
- Tier/room waypoints must read the actual walk-surface height, not a floor datum, or a CPU chases a
  height it can never reach.

## The building owns its lift, including which way it opens

The lift's five coordinates are `plan.elevator`. **Facing is the sign of `frontZ - centerZ`**: the
hotel opens toward -Z, the mall toward +Z. Cabin walls, doors, buttons, passenger checks and the held
seeker's view must all use the same facing; never restore raw low-Z occupancy assumptions.
`modules/elevator.js` reads the shaft in `build()`, not at construction. Hall doors carry world-space
Y and their own Z and must render at those coordinates. Both orientations are exercised in
`tests/elevator-facing.test.js`.

- **Only the floor the cabin is standing at has its hall doors open.** Every other floor's opening
  onto the shaft stays shut whatever the cabin is doing, or the shaft becomes a multi-storey hole.
- **The cabin blocks demons outright** — entry, detection and catches — even with its doors open. It
  is the one demon-safe refuge in the game.
- Hall and cabin door colliders disable once the doors are mostly open. The cabin moves in world Y
  with the player inside it.
- **The round begins with `holdSeeker()`**: the seeker is placed in the lobby cabin, both door sets
  are shut, and calls and buttons are disabled. Only the hiding-to-seeking transition may call
  `releaseSeeker()`.

## Demons

`modules/demons.js` composes a map's roster from the single `createMonster` factory. There is no
second monster implementation and there must not be one. **Two was The Grand Hotel's number, not a
rule** — the roster is data, up to `MAX_DEMONS` (6).

- **Exactly one demon per map hunts campers.** Every other demon is constructed with `heat: null`
  deliberately. Two heat hunters would converge on the same full meter and make the anti-camping rule
  read as a swarm, and it keeps `selectHuntTarget` single-hunter. `tests/map-catalog.test.js` asserts
  it for every registered map.
- **They start apart, by distance rather than by floor.** A roster may be longer than the building is
  tall — three demons on two levels has no "floor each", and the floor was never the point: two
  demons in one corridor is what must not happen, two at opposite ends of a 96m concourse is fine.
  `navigation.minSpawnSeparation` is the rule, applied by both `demon-logic.chooseDemonSpawn` and
  `modules/monster.js`. Each map authors dedicated demon starts, never ones overlapping a player's.
- **Solo and online share spawn selection**: reserve every player start, enforce the map's spacing,
  and never fall back to an unsafe player-adjacent start.
- **A status row belongs to the roster or it does not exist.** The hotel's two are authored in
  `index.html`; anything else is built at runtime into `#demonStatuses`, and `pruneStatusRows`
  removes any row naming a demon not in this building. Adding a demon must never be an HTML edit.
- **The threat readout stays aggregated and position-free.** `enemy-logic.aggregateEnemyState`
  reduces every demon to one worst-case state for the vignette and the `hotel:monster-state` event.
  Do not add a per-demon indicator — that is the tracker minimap coming back through the side door,
  and with three demons it leaks three positions.
- **The round does not care which demon caught you.** `resolveDemonCatch` takes a player id, not a
  killer.
- **Copy names the map's own staff** — `monsters.hunterName()` / `monsters.rosterText()`. A round in
  the mall telling the seeker to beat The Bellhop names a demon who does not work there.

### Behaviour

- Detection is FOV + range + vertical level + collider-aware LOS. Crouching lowers the eye line and
  shrinks detection range, which is what makes furniture and corners real cover.
- **A demon's catch requires line of sight**, exactly like a seeker's tag. Distance-only made a shut
  door real cover against a player and no cover at all against a demon. The ray only runs for a
  candidate already within arm's reach.
- **Demons use the stairs, never the elevator.** Chase replanning must not restart an active stair
  route — a route with `stair` points is committed.
- **Demons are dormant for the head start.** While `round.phase` is `HIDING` they patrol and are
  visible, but they do not look, do not read the heat meter and **cannot catch** — `goDormant` in
  `demon-logic.js` for the mind, and the early return in `sim-logic.tickDemons` for the catch. A
  hider in the first forty-five seconds has no information to act on, and in a small round a demon
  reaching them ended the match before the seeker's cabin ever opened. A test that stages a demon on
  top of a body has to advance the phase first, or it is asserting against the grace.
- **The head-start grace is stated twice, off one flag.** The solo round does not run the
  authoritative tick, so `modules/round.js` publishes `world.state.headStart` and gates its own
  `resolveDemonCatches` on it, and `modules/monster.js` — its own copy of the brain — reads the same
  flag. Change one and you have handed the head start back to the demons in single player only;
  `tests/head-start-grace.test.js` pins both sides of it.
- **Roaming opens an unlocked door; only the hunt forces a lock.** A locked room is a hiding place,
  not a fortress, but a roaming demon must not be a master key.
- **Secret passages calm heat but are traversable by demons.** They are cover, not sanctuary.
- The demon's face detail rides the animated `Head` bone rather than a fixed offset, and the model's
  forward direction is corrected at load. The architecture test pins both, plus the named face parts,
  the fresnel rim, the rigged shroud and talons, and the awareness-reactive posture.

### Server-side

`demon-logic.js` is the brain; `modules/monster.js` is the body. Everything that decides — where a
demon walks, what it can see, when it replans, who it catches — lives in the pure layer.

- **`modules/monster.js` has a puppet mode.** `setRemotePose` switches the whole brain off: `update`
  returns after `updateRemote`, so online it detects nothing, routes nothing and catches nobody.
- **A roster that has taken a snapshot stops publishing a threat state of its own.** Online the
  demons are puppets whose local awareness is a permanent `roam`; `demons.update` running beside
  `applySnapshot` repainted the authority's `chase` sixty times a second, and the soundtrack restarts
  a track on every state change.
- **A snapshot carries a demon's position and nothing about its intent.** Its route, target and
  awareness stay on the server.

## The heat signature

The anti-camping meter. It counts *up* while you sit still and a full bar brings a demon to your
door — a heat signature, not a sanity bar, which is why it is named `heat` everywhere
(`heat-logic.js`, `modules/heat.js`, the `hotel:heat-*` events, the plans' room `heat` bounds, and a
roster's `heat: null`).

Every rule is in `heat-logic.js` so a server can run it headlessly. `modules/heat.js` samples the
camera and paints the HUD and must not re-implement the timing — the architecture test asserts it
never mentions `fillSeconds`.

- Three **zone kinds**: `room` (from `world.collections.roomCenters`) fills the meter and can be
  hunted; `hallway` — corridors, the stairwell, a moving elevator (`playerFloor === 0`) — fills it
  but is never entered by a demon; `tunnel` (explicit bounds from `world.collections.secretTunnels`)
  **drains** it. A room may carry explicit heat bounds independent of its walkable hunt target.
- **Tunnels are matched before rooms** in `locateZone`. Their floor rect overlaps the neighbouring
  room box by a couple of centimetres of solid wall, and the tunnel is the more specific space.
- Entering a tunnel does **not** reset the meter: it carries the value in and bleeds it off over
  `tunnelDrainSeconds`, so the drain is visible. Leaving one resets like any other zone change.
- Changing zone resets it and that tick's time is dropped. Distance walked **in the hallway** resets
  it once it passes `hallwayStepDistance`. Moving around *inside* a room does not — camping in place
  is what is punished, not motion.
- **A full meter only makes you a target while you are in a room**, since demons walk into rooms.
  With several full hiders the hunter takes the nearest, with a floor priced at `floorPenalty` metres
  of corridor.
- Every living hider owns a `createPlayerHeat` tracker. `hiders.list()` publishes its candidate
  fields, and both visual detection and the heat hunt consume that whole list alongside the local
  player.
- **The hunt fires only from `ROAM`.** `CHASE` always wins (it has a live sighting) and `SEARCH` is a
  fresher lead than a stale camper; either stacking with the hunt would double-plan the route. On
  arrival the demon prowls the room rather than standing in the doorway.
- **`heat.setHunted()` is called by `monster.js`, not by the meter** — the demon owns whether it is
  actually walking your way, so the HUD and the AI cannot disagree.

## Sprint stamina

Sprinting is the only thing that outruns a demon, so it is a metered resource, not a modifier. Every
rule is in `stamina-logic.js`; `modules/stamina.js` is the HUD and the one-shot "winded" callout
only, and the architecture test asserts it never mentions `sprintSeconds` or `recoverThreshold`.

- **The shift key is a request.** `player.js` asks the meter and uses the answer, so a spent player
  drops back to a walk mid-stride. Do not reintroduce `keys.ShiftLeft ? CONFIG.sprintSpeed : ...`.
- The bar drains only while actually moving and not crouching.
- **Exhaustion, not emptiness, is the gate.** A bar at 10% still sprints; a bar recovering from zero
  does not, until it passes `recoverThreshold`. Without the lockout, emptying the bar buys a
  stutter-sprint one frame later instead of a real cost.
- Recovery is fastest crouched, then standing, and slowest while walking. That ordering is the point:
  the safe way to get sprint back is to stop and hide, which is where the heat meter starts filling.

## The flashlight

The strongest seeker-favouring tool in the game, so it obeys the standing rule: it costs something.
`flashlight-logic.js` holds every rule, pure and immutable; `modules/player.js` only paints the beam
and the HUD.

- **The battery is the cost.** `FLASHLIGHT_CONFIG.drainSeconds` of light, draining only while lit. At
  zero it switches itself off, and `setFlashlight(empty, true)` refuses. Do not "fix" that refusal.
- **A caught player drops their remaining charge.** `createFlashlightDrop` makes the record and
  `modules/round.js` drops it for hiders and the seeker alike.
- **`describeFlashlight` is a network pose field, not a HUD model.** It returns exactly
  `{ on, charge }`. `on` must replicate because a lit player is visible to everyone; `charge` is
  server-authoritative, since a client reporting its own battery is the same class of cheat as one
  reporting it wasn't caught.
- **A toggle is an intent that outlives the round trip** (`flashlight-logic.reconcileFlashlight`).
  The snapshot is a round trip old, so mirroring it straight back over the local light meant the
  press flipped it on, the next frame mirrored the stale "off" over it, and the input that finally
  went out said off. The intent is held until the authority agrees, until it refuses (an empty
  battery cannot be switched on), or until a 1.5s grace runs out. Only the switch is ever held
  locally; the charge stays the server's outright.

## The round

`round-logic.js` owns roles, the clock and both win conditions, and it is N-player from the start —
the single-player build is one seeker plus CPU hiders, not a special case.

- **Only one place ends a round: `settle()`.** A tag, a demon kill and the clock expiring all funnel
  through it, so they cannot disagree about who won. Do not end a round from a caller.
- **The catch is resolved from positions by `modules/round.js`, never announced.** A client that
  reports "I tagged them" or "I wasn't caught" is the obvious cheat. `canTag` is distance + height +
  line of sight, in that order.
- **A hider a demon eliminates still counts toward the seeker's win.** The condition is "every hider
  is out", not "every hider was tagged".
- **A demon taking the seeker ends the round immediately**, with survivors left alive. Do not
  retroactively catch them.
- **The head start is a rule, not a caption.** A hard 45-second minimum, physically enforced by the
  cabin — and by the demons, who cannot catch during it (see Demons → Behaviour). The round clock does not run during hiding, and a tick spanning release spends only its
  remainder on the round clock.
- **The round HUD is position-free.** Clock and tally only.
- **Round copy receives the roster separately from the catch bodies.**
- **A `caught` event is only an ending when it says so.** `roundOver: false` means eliminated, and
  the menu must stay on `PLAYING` so the player can still open it. Treating every `caught` as an
  ending left an eliminated player spectating a live game with Esc doing nothing.
- **An ending says which ending it is.** One overlay serves both — growing a second full-viewport
  screen is what that decision avoided — so `#caughtOverlay` carries
  `data-result="win" | "loss" | "neutral"`. The loss is the red screen that has meant "it found you"
  all game; a hider whose seeker was dragged off was reading their own victory as a death.
  `modules/round.js` decides it from the outcome against the local role, and a hider eliminated an
  hour earlier still won. Online, an interrupted match is `neutral` — a dropped connection is not a
  defeat.

## CPU bodies

`hider-logic.js` and `seeker-logic.js` decide; `modules/hiders.js` and `modules/seeker.js` walk. They
are stand-ins for players who are not there yet and are deliberately shaped that way: they wear the
rig every player wears, they route through the map's own graph, and `hiders.list()` returns exactly
the shape catch resolution and the demons' threat checks want.

- **Opening the room's door is part of taking a room.** `assignSpot()` is the only way a hider claims
  one, precisely so no caller can forget — an earlier version opened the door on a re-pick but not on
  the spawn's first spot, and those hiders ground into a closed door.
- **"Arrived" means standing in the room, not out of waypoints.** The mover gives a waypoint up when
  the way is solid, so an empty route proves nothing. A hider that runs out of route without reaching
  its spot strikes that room off its own list and picks another; without that it crouches in the
  corridor for the rest of the round, which is both a terrible hiding place and a free find.
- Hiders flee the seeker from further out than a demon: a seeker with a plan is worth moving for, a
  roaming demon is worth staying still for.
- **The seeker uses the map graph for chases as well as patrols**, never a room-centre sweep that
  forces a same-room chase back into the corridor.
- **Solo hiders use the map's own seats**, reserving the local hider's, and the CPU seeker uses the
  complete map graph.
- **CPU poses keep rig-facing `yaw` (+Z) and publish `cameraYaw` (-Z) for the spectator camera.**
  Human and network poses already use camera yaw. Hiders must publish facing too.
- Do not grow a second navigation system for any of them.

## Spectating

A caught hider stays in the match as a camera, never as a body. Target eligibility and cycling are
pure (`spectator-logic.js`); `modules/spectator.js` only moves the camera and paints the switcher.
The spectated player's head is hidden while they are the target and restored when they are not.

## Menus and pause

`menu-logic.js` is the screen state machine (title / how-to / extras / pause / playing / caught);
`modules/menu.js` only paints it and dispatches button clicks.

- **`PLAYING` is the game's single "the simulation is running" answer.** `main.js` gates the
  accumulator on it and **does not advance `timestep` at all while paused**, so no meter ticks behind
  a menu and no paused time is owed back on resume. Do not "fix" a pause by clamping the delta.
- **`player.js` does not touch the overlay.** It reports lock changes and the machine decides what
  they mean, which is what keeps a pause menu from stacking on the caught screen.
- Pointer lock must be requested from inside the click that chose Play or Resume, so the menu calls
  `player.beginPlay()`. `?controls=drag` goes through the same dispatch: there is one path into a
  round.
- `how-to` and `extras` remember which screen opened them.
- **Quitting reloads.** The building, the demons, the open doors and the key ring are all still
  standing, so the machine reports `effect: 'quit'` and the host rebuilds the session. There is no
  in-place reset and it must not be faked.
- **`render()` must not focus a screen's first button.** On every setup and lobby screen that is the
  back arrow in the header, so Space or Enter pressed while reading the options was a click on "back
  to main menu". The panel takes focus instead, arming nothing. The first *control* is no safer: on
  the solo screen it is a location radio, and an arrow key on a radio group changes map, which
  re-enters the page.
- **`#overlay` aligns its panel to the start with `margin: auto`**, not `align-items: center`, which
  clips the top of a panel taller than the viewport.
- **Entering play transfers the lobby socket to the match**; only backing out releases it.

## The in-game HUD

The round uses the menus' own design language — hairline warm border, near-black ground, a red accent
tick, 8px letterspaced micro-labels, one serif numeral.

- **Four corners and one rail.** Key ring top left, location top right, the round plate top centre,
  the controls legend bottom left, and everything a player spends in `#hudRail` down the right.
  `.hudPlate` fixes one width for both side columns so the plates line up as columns.
- **Nothing is positioned relative to another element's height.** The rail is a grid; a third demon
  pushes the meters down. Do not reintroduce a `top` on a rail child — hard-coded tops are only
  correct for one roster size, and forced a duplicate stamina block per `.monster-*` state.
- **A meter is a label, a readout and a track**, sharing `.hudMeter` / `.meterHead` / `.meterTrack` /
  `.meterFill`. Heat, stamina and the flashlight are the same shape because they are the same kind of
  thing: something you spend. State is a `data-state` (or `data-on`) attribute the module sets and
  CSS colours — **a module must never write a colour.**
- **The interaction prompt's keycap is CSS**, drawn from `data-key`. `player.js` sets the sentence the
  interactable wrote and must not paste `[E] ` onto the front of it again.
- **`#threatVignette` is transparent on its own** and lit only by a `.monster-*` body class, each
  declared exactly once. `tests/demons.test.js` asserts that: a second copy of any of those selectors
  is how a chase glow used to outlive the chase.

## Rendering and performance

### Fixed timestep

Gameplay advances on `createFixedTimestep` at 60 ticks/s. `simulate()` is called once per whole tick
with `timestep.step`; only rendering, the adaptive quality sampler and the model viewer run per
frame. **Do not pass a `requestAnimationFrame` delta into gameplay again** — a 144hz machine would
run a different game and no server could be authoritative over it. A frame is capped at five ticks
and the remainder dropped, which keeps a stall from spiralling.

### The light count never changes

**This is the hard one.** three.js bakes the number of lights of each type into every material's
shader program cache key, so the frame on which a light appears, disappears or is hidden recompiles
and relinks every shader program in the scene. Measured on the built hotel, a normal frame is ~6ms
and the frame that adds one point light is ~4,580ms. That was the stairwell chug: entering it lit a
second floor and doubled the point lights.

- **Hall and table lamps are records, not lights.** `plan.lights` and `furnishings.addTableLamp` push
  plain `{ floor, x, y, z, color, intensity, distance, decay }` into
  `world.collections.floorLights`. `modules/hotel.js` owns a fixed pool of `LIGHT_POOL_SIZE` (8)
  `PointLight`s, created once at build and **never hidden**; `selectPoolLights` assigns the nearest
  lit lamps and parks spare slots at `intensity = 0`. `layout.selectVisibleLightFloors` picks the
  candidate floors by vertical proximity to `world.state.playerFeetY` — keep that published from
  `player.refreshLocation()`.
- **Switch a light with `intensity`, never with `visible`.** The flashlight does this. Toggling
  `flashlightBeam.visible` used to recompile the hotel on the most-pressed key in the game.
- **A light that arrives late is a light that stalls.** The demon's `headHalo` is constructed in
  `createMonster` and merely re-parented onto the face when the GLB lands.
- `rendering.warmUp()` (`renderer.compile`) runs before the first frame so materials compile on the
  loading screen. It is only honest while the count is fixed.
- **Share materials for anything spawned during play.** A new material is a new program compile.
- Shadows are off and DPR is capped at 1.5 on purpose; adaptive quality lowers render scale after
  sustained slow frames.

### Static batching

`modules/static-batcher.js` runs once at the end of `hotel.build()`: each floor group is traversed,
its static leaf meshes are merged per material, and emptied containers are pruned (~2,780 meshes to
~620).

- **Nothing changes about how the building is built.** The renderer still walks the plan one record
  at a time and the flatten pass happens afterwards. Do not make a builder batch-aware.
- **What may never be merged is named in `hotel.flattenStatics()`**: door hinges, drawer groups, the
  hall elevator doors, every `collections.interactables` object, and the room-fill fixtures. A merged
  mesh has no local transform *and no identity* — `player.js` finds what you are looking at by
  matching the object its ray hit, so a batched interactable is a door that can no longer be opened.
  Anything new that animates or has to be pointed at goes in that skip set.
- **Merged meshes stay raycastable.** The interaction ray reads the nearest hit and walks up to an
  interactable, so a wall that stops being a ray target is a door you can open through it.
- **Frustum culling is the trade**, and it is intended: ~620 always-drawn batches beat ~2,780
  individually culled boxes.
- A material instance is the batch key, so a fresh `MeshStandardMaterial` per plant pot is 58 draw
  calls that can never merge. See `potMaterial` / `vendingMaterial` in `modules/furnishings.js`.
- `HotelPrototype.getState().render` reports live `drawCalls`/`triangles` and what the pass collapsed.

### Avatars

Every player is a figure, the local one included: the local avatar is driven from the camera through
the same `setPose` a network snapshot uses, so there is only one body implementation.

- The textured base character and the compatible locomotion library are each loaded **once**. Each
  body is a clone whose `SkinnedMesh`es are rebound to their own cloned skeleton — a plain
  `Object3D.clone()` leaves every clone animating as the source body.
- The temporary capsule lives under `avatar.body`, so it must be removed with
  `avatar.body.remove(avatar.placeholder)`. Removing it from `avatar.root` silently does nothing and
  leaves a capsule torso with the real character's limbs sticking through it.
- The local head collapse and the demon's forced posture are re-applied **after** the mixer writes
  each frame, or the clip overwrites them.

### Rooms and lighting

Room openings are framed on every floor. Each room owns a shadow-free `fillFixture` visible only
while its door is open; the architecture test asserts opening a door does not change the light count.

## The shared building (fixtures)

`fixtures-logic.js` owns every door, secret panel, drawer, key ring and the elevator as plain
contested state. Before it, the renderer owned all of them, which is why an online round was a
building where a door you opened was still a wall for the seeker chasing you.

- **A client sends "I pressed E, at door-201", never "I opened door-201".** The authority picks the
  fixture by distance, then height, then a facing dot — the same ordering `canTag` uses, for the same
  reason. It does not raycast: a server has no meshes.
- **`interactId` is an aim, not an outcome.** Nearest-in-the-cone and the client's raycast are two
  different questions and they disagree whenever a cone holds more than one fixture, which the player
  reads as "I pressed E and the wrong thing opened". So the press carries the id the crosshair was
  on and `selectInteractable` honours it **only if it survives the very same reach test** —
  otherwise it falls back to its own pick. It grants nothing a client could not already reach; it
  only chooses between things it could. `sim-logic.readInput` bounds the string, every client
  interactable carries a `fixtureId` matching the plan's own id, and anything the raycast finds that
  the plan does not name (a dropped battery) sends `null`.
- **Interaction is edge-triggered on the authority.** A client holding `E`, or spamming the message,
  must not strobe a door sixty times a second. The rising edge is read off the input stream, which is
  also why `shouldSendInput` has to send the *release*.
- **A drawer is contested.** It holds one key, `emptied` is permanent, and `searched` resets on close
  so the next player looks and finds it empty.
- **`describeFixtures` publishes only what a client has to draw.** An undiscovered secret panel is not
  on the wire, and neither is anyone's key ring but your own — the full map would be a wallhack for
  every locked room nobody has opened yet.
- **Sparse fixture snapshots treat an omitted door as closed.**

## The authoritative tick

`sim-logic.js` is `tick(state, delta, inputs) -> state`, the same file in the browser and on the
server. It owns the fixtures, the demons and catch resolution.

- **A client sends what it is trying to do, never what happened.** `readInput` narrows a message to a
  direction, a facing and three held keys. Whether you moved, whether your battery is empty and
  whether you were tagged are answers the tick gives.
- **The tick does not mutate what it is handed**, and the same inputs produce the same state — a
  mirrored server has to agree with the client that ran them.
- **`createPlanSpace` caches its colliders and rebuilds only when a door actually moves.** Resolving
  700-odd boxes per query per body per tick is not a tick budget. The moving cabin stays in a short
  separate dynamic list for the same reason.

## Online, the parts that bite

- **`factory-network-server/games/hide-and-seek/shared/` is a byte-for-byte mirror.** Change a pure
  file here, run `node tools/mirror-sim.mjs`, commit and deploy **both repos**. Both sides check the
  manifest, and the failure mode of an unchecked mirror is silent: the server keeps deciding catches
  in a building that no longer exists while every suite stays green.
- **There is one authority per building.** Online, `main.js` stands the local round and every local
  demon down. Do not "fix" an empty online building by starting the local demons.
- **The client never resolves a catch.** `modules/online.js` may not import or re-implement `canTag`,
  `resolveTag` or `resolveDemonCatch`; the architecture test asserts it. The online menu accepts only
  server-owned catch results.
- **`find_lobby` must carry `HotelOnline.LOBBY_LIMITS`.** A search that omits seat limits is
  sanitized to the server-wide default of 2-6, which never equals the 2-8 lobby this game creates.
  The symptom is silent and baffling: every guest gets their own room and nobody can see anybody.
- **The initial authoritative snapshot supplies roles, spawns, fixtures and the countdown before
  controls start.** Incomplete roles or a different map show online recovery rather than a round.
- **Events are read as edges off the authority's state**, not emitted by the stood-down local state
  machine — the lift was silent online because `modules/elevator.js` was the only thing emitting
  `elevator-start` / `elevator-arrive`. The first snapshot is the world as it stands, not an event.
- **Socket loss retains server ownership, and the reconnect grace starts at the drop**, not at lobby
  creation. A dropped guest keeps their body: it stays standing and catchable for 30 seconds — a free
  find, which is the honest consequence — and `resumeRequestFor` refuses a seat that window has
  closed on.
- **The offline hiders stand down when a match starts.** `hiders.standDown()` removes their bodies
  rather than pausing them — a hider nobody can catch, standing still in a corridor, is a decoy the
  seeker wastes the whole round on.
- **The factory profile is read, never written.** `account-access.js` derives a match alias. This is
  the repo's Factory-Identity-First rule and it is not negotiable in a cabinet.
- **The cabinet is served from the repo root.** `modules/account-access.js` imports `/js/platform/**`
  for the sign-in gate, so `server.mjs` roots at the repo and opens `/games/hide-and-seek/`. Rooting
  it at the cabinet again 404s those modules and the whole module graph fails to boot.
- **Automation cannot playtest this.** Chrome freezes `requestAnimationFrame` in unfocused tabs, so
  two scripted clients cannot both simulate a round. Connection, lobby, roles and replication can be
  verified from a script; how movement feels cannot.

## Deliberate removals — do not "restore" these

- **The tracker minimap.** Knowing where a demon is defeats the game, and in multiplayer it leaks
  hider positions. Threat feedback is `#monsterStatus`, the vignette, and audio only.
- **Stair teleportation and floor visibility swapping.**
- **Raycast-based line of sight**, and any gameplay bound inferred from render geometry.
