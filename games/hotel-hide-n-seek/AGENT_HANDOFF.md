# Agent Handoff — V6.8

Design direction, roadmap, and working agreements live in `CLAUDE.md`. This file is only the list of hard-won invariants: things that were expensive to get right and are easy to break by accident.

## Traversal (V5, still binding)

Do not reintroduce floor visibility swapping or stair teleports. Continuous vertical traversal is the architectural goal — all four floors are physically present at their real Y positions.

`walkSurfaces` contains flat hotel floors, room floors, secret tunnels, the moving elevator floor, stair landings, and stair ramps. `resolveGroundHeight()` deliberately selects only a *nearby* surface, so overlapping stair flights do not snap the player several meters vertically.

`collidesAt()` checks Y overlap as well as X/Z. That specifically fixes the V4 failure where the elevator's overhead wall header blocked the doorway.

Collider authority is plain data in `collision-logic.js`. Builders register explicit box dimensions through `registerBoxCollider`; do not restore `Box3.setFromObject()` or infer gameplay bounds from render geometry. Dynamic doors invalidate their records, while moving elevator pieces refresh theirs each tick.

## Elevator

The cabin floor is a dynamic walk surface following `elevator.car.position.y`. Hall/cabin door colliders disable once the doors are mostly open. The cabin moves in world Y with the player inside it.

The round begins with `holdSeeker()`: the seeker is placed in the Floor 1 cabin, both door sets are shut, and calls/buttons are disabled. Hiding lasts at least 45 seconds. Only the hiding-to-seeking transition may call `releaseSeeker()` and start opening the doors.

## Stairwell

The east service-zone shaft is continuous from Floor 1 through Floor 4: south entrance on every floor, a shared full-width landing, two parallel flights per transition, one north switchback landing. Visible treads are backed by smooth ramp surfaces. No stair interaction changes floors. Geometry originates in `layout.js`, shared with the Node regression tests, so a geometry change must keep `tests/layout.test.js` honest rather than the reverse.

## Rooms and lighting

Room openings are framed on every floor. Each room owns a shadow-free `fillFixture` that is visible only while its door is open — the architecture test asserts opening a door does not change the renderer's light count, and that only lights near the active floor stay in the realtime pass. Shadows are off and DPR is capped at 1.5 on purpose; adaptive quality lowers render scale after sustained slow frames.

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

The stairwell and the moving elevator report `playerFloor === 0`, and floor 0 used to make **every** light in the hotel visible — roughly 32 point lights in one forward-rendered pass, which is what made the stairwell unplayable. `layout.selectVisibleLightFloors()` now picks floors by vertical proximity to `world.state.playerFeetY`, so at most two are lit. Keep `playerFeetY` published from `player.refreshLocation()`; the lighting rule depends on it.

The stairwell's treads, landings, and rail segments are static, so they are baked into one merged mesh per material at build time (168 meshes → 2 draw calls). Anything new in there that does not move should join the batch rather than being added as its own mesh.

## Sanity / the anti-camping hunt (V6.5)

The meter exists to stop hiding in one room from being a winning strategy, and every rule for it is in `sanity-logic.js` so a server can run it headlessly — `modules/sanity.js` may sample the camera and paint the HUD, but must not re-implement the timing (the architecture test asserts it never mentions `fillSeconds`).

- There are three **zone kinds** and the meter treats each differently: `room` (an 8×8 box from `world.collections.roomCenters`) fills it and can be hunted; `hallway` — corridors, the stairwell, a moving elevator (`playerFloor === 0`) — fills it but is never entered by the demon; `tunnel` (explicit bounds from `world.collections.secretTunnels`, published by `addSecretTunnel`) **drains** it.
- Tunnels are matched *before* rooms in `locateZone`. Their floor rect overlaps the neighbouring room box by ~2.5cm of solid wall, and the tunnel is the more specific space.
- The secret passages are the game's only refuge, and the drain is what makes them one. A tunnel can never read full however long you sit in it, and — uniquely — entering one does **not** reset the meter: it carries the value in and bleeds it off over `tunnelDrainSeconds`, so diving into a passage at 99% costs you the time to calm down. Leaving a tunnel resets like any other zone change.
- Changing zone resets it, and that tick's time is dropped (the tunnel exception above aside). Distance walked **in the hallway** resets it too, once it passes `hallwayStepDistance`. Moving around *inside* a room does not: camping in place is what is being punished, not motion.
- A full meter only makes you a target while you are **in a room** — the demon walks into rooms, so a full meter in a corridor does nothing. With several full hiders it takes the nearest, with a floor priced at `floorPenalty` metres of corridor.
- Every living hider owns a `createPlayerSanity` tracker. `hiders.list()` publishes its candidate fields, and both The Bellhop's visual detection and sanity hunt consume that entire list alongside the local player.
- The hunt fires only from `ROAM`. `CHASE` always wins (it has a live sighting) and `SEARCH` is a fresher lead than a stale camper; letting either stack with the hunt would double-plan the route. On arrival the demon prowls the room rather than standing in the doorway.
- `sanity.setHunted()` is called by `monster.js`, not by the meter — the demon owns whether it is actually walking your way, so the HUD and the AI cannot disagree.

## Sprint stamina (V6.6)

Sprinting is the only thing that outruns The Bellhop, so it is a metered resource, not a modifier. Every rule is in `stamina-logic.js`; `modules/stamina.js` is the HUD and the one-shot "winded" callout only, and the architecture test asserts it never mentions `sprintSeconds` or `recoverThreshold`.

- The shift key is a *request*. `player.js` asks the meter and uses the answer, so a spent player drops back to a walk mid-stride. Do not reintroduce `keys.ShiftLeft ? CONFIG.sprintSpeed : ...`.
- The bar drains only while actually moving and not crouching — holding shift while standing still recovers instead of draining.
- **Exhaustion, not emptiness, is the sprint gate.** A bar at 10% still sprints; a bar recovering from zero does not, until it passes `recoverThreshold`. Without that lockout, emptying the bar would give a stutter-sprint one frame later instead of a real cost.
- Recovery is fastest crouched, then standing, and slowest while walking. That ordering is the point: the safe way to get sprint back is to stop and hide, which is exactly where the sanity meter starts filling. The two meters are meant to pull against each other.

## Menus and pause (V6.6)

`menu-logic.js` is the screen state machine (title / how-to / extras / pause / playing / caught); `modules/menu.js` only paints it and dispatches button clicks.

- `PLAYING` is the game's single "the simulation is running" answer. `main.js` gates the accumulator on it: **it does not advance `timestep` at all while paused**, so no meter ticks behind a menu and no paused time is owed back on resume. Do not "fix" a pause by clamping the delta instead — that reintroduces the tick the sanity meter used to steal.
- `player.js` no longer touches the overlay. It reports lock changes to the menu and the machine decides what that means — which is what keeps a pause menu from stacking on top of the caught screen when the pointer lock is released by the catch.
- Pointer lock must be requested from inside the click that chose Play or Resume, so the menu calls `player.beginPlay()` rather than the player watching the overlay. `?controls=drag` goes through the same dispatch instead of around it: there is one path into a round.
- `how-to` and `extras` remember which screen opened them, so `BACK` from the pause menu returns to the pause menu.
- Quitting reloads. The hotel, the demon, the open doors and the key ring are all still standing, so the machine reports the intent (`effect: 'quit'`) and the host rebuilds the session; there is no in-place reset and it should not be faked.

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
