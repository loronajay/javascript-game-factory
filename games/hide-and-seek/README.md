# Hide and Seek: Four Locations, One Rulebook

Crowne Point Cinema is selectable in solo and online setup (`?map=crowne-point-cinema`).
The six-screen reference now has red tiered seating, sound-lock entrances, service escape loops,
six projection booths, searchable restrooms and a locked film store. A working lobby elevator
joins a new upper landing; both original stairs remain. The Usher hunts sanity; The Projectionist
roams and chases. Both can catch any role.

CPU demons, seekers and hiders share `cinema-navigation.js`. Tests walk every graph edge, every
room pair, both stairs in both directions, every hider seat and the seeker's complete unlocked-room
sweep. Keys live in the box-office drawer and Projection 1; they open the film store and Projections
2/5 respectively. The supplied reference folder is unchanged.

Inspect with `?map=crowne-point-cinema&inspect=lobby` (also `theater1`, `projection`, `lift`,
`landing`); `F` enables the flashlight. Multiplayer requires deploying the updated cabinet and
companion server together; local mirror and delayed two-client startup tests cover the cinema.

Mercy Hospital is now available in solo and online setup (`?map=mercy-hospital`). It uses the
Saint Mercy V5.1 reference: two floors, fourteen departments, continuous service stairs and a
working elevator. The Surgeon hunts campers; The Matron and The Orderly roam and chase.
CPU hiders use the hospital's spawn seats and clear room aisles; the CPU seeker and demons use
the department/corridor graph. The hospital's doors start unlocked; no new key puzzle is added.

Inspection links: `?map=mercy-hospital&inspect=lobby` (also `emergency`, `ward`, `stairs`).
Press F for the flashlight. The original reference folder is unchanged.

Online deployment must include both this cabinet and the updated `factory-network-server`.
Local verification covers map-separated matchmaking, eight-player authoritative rounds, elevator
hold/release, deterministic replay and two clients receiving snapshots at different delays.
This does not replace a real two-device movement/latency playtest.

## Play

On Windows, double-click `PLAY HIDE AND SEEK.cmd`. It starts the local server and opens the game in your default browser. Keep the launcher window open while playing; close it when finished.

From a terminal, the equivalent command is `npm start`.

V6 turns the exploration prototype into a stealth survival game. A demonic being called The Bellhop spawns at a safe random hotel position, roams every floor, uses the physical stairwell, investigates its last sighting, and catches players on contact.

**Do not settle anywhere.** Every player carries a sanity clock that climbs while they stay put. Fill it in a room and you stop being hidden: The Bellhop turns and walks straight into that room. Changing rooms clears the meter, and so does walking a stretch of hallway. Hiding is a delay, not a strategy.

The **elevator cabin is the only demon-safe haven**, including when its doors are open. Secret passages still drain the sanity meter, but demons can open their panels and follow you through them. Locked rooms can also be forced during a chase or hunt.

Demons start at separate, reserved locations on every map, at least the map's minimum spacing
(24 metres, or 26 in the mall) from every player start on the same floor. Solo and online use the
same placement rule. Door pursuit checks cover openable leaves, angled approaches, secret panels,
and both stair directions; demons wait for a door to swing clear instead of losing its crossing waypoint.

**Sprinting is metered.** The `STAMINA` bar under `SANITY` drains while you run and refills whenever you are not: fastest crouched in cover, then standing still, and slowest of all while you walk. Empty it and you are *winded* — sprinting is locked out entirely until you have won a real share of the bar back, so the panic run out of a room has to end somewhere. Running is the one thing that outpaces The Bellhop, so it is a resource you spend rather than a speed you hold.

V6.8 makes the hiding phase physical, and the solo setup now lets you choose either role. As the **seeker**, the guests get at least 45 seconds to scatter across the four floors while you are locked inside the closed lobby elevator. As a **hider**, you use that head start to find cover alongside any AI hider teammates, then an AI seeker is released to hunt you. The `ROUND` readout shows the hiding countdown, then `NO LIMIT` beside the tally. It never tells the seeker where anybody is.

The catch is that **The Bellhop is nobody's ally.** It sees, hunts, and sanity-tracks the hiders as well as you, and it does not care which of you it reaches first. A guest it takes still counts toward your total, so the demon can hand you the round. A *you* it takes ends the round on the spot and the hiders win, however many you had already found. That is the whole tension: every tool that makes seeking faster — sprinting especially — is a tool that gets you found.

V6.9 adds a light and a second hunter, and both cut both ways.

**The flashlight (`F`) runs on a battery.** A full charge is about two minutes of continuous light and it drains only while lit, so it is something you spend rather than something you hold. At zero it switches itself off and will not come back on — there is no last flick of vision. A caught player drops their flashlight where they fell, and anyone, seeker or hider, can pick it up and add the leftover charge to their own up to 100%. A body on the floor is a resupply.

**There are now two demons.** The Bellhop is joined by The Housekeeper, and they start on different floors. Only The Bellhop tracks the sanity clock and walks into the room of whoever has been sitting still too long; The Housekeeper roams, sees and chases like any hunter. Neither is your ally and neither cares which of you it reaches first. The threat readout still tells you a state and never a place — with two of them loose, that restraint is the point.

## Playing online (new in V7.1, not yet played by real people)

`Online Multiplayer` opens its own stage selector. Choose The Grand Hotel, Cinder Mall, Mercy Hospital or Crowne Point Cinema, then
press `FIND A LOBBY` to connect to the shared arcade network server. Friends must choose the same
stage; matchmaking separates locations. `LEAVE / CHANGE STAGE` returns to the stage selector.
The lobby holds two to eight guests. It needs a signed-in Javascript Game Factory account — the panel says
so, and the name over your body in the corridor comes from your factory profile. The host presses
`START ROUND`; the server picks who is it and does not announce it until the doors close.
That assignment is random and authoritative, so any player can enter a round as either the seeker or a
hider; it is not fixed by the client.

**The server owns the round.** Where you are, what you can see, how much battery you have left, which
drawer still had the key in it and who was caught are all decided there, from the positions it is
tracking — your client only sends which keys you are holding and which way you are facing. That is
deliberate: a client that gets to say "I wasn't caught" is the obvious way to cheat at hide and seek.

**The hotel is shared, not copied.** A door you open is open for the seeker chasing you. A drawer
holds one key and the second person to search it finds it empty. The elevator carries whoever is
standing in it. Both demons are in the building and hunting everyone, and a battery dropped by
someone who was caught goes to whoever walks over it first.

When a hider is caught before the round ends, they stay in the match as a spectator. They can cycle
between the remaining living players with `Q` / `E`, the bracket or arrow keys, or the on-screen
previous/next buttons.
Local catch notifications cannot end an online match. When the server ends the round, the results
screen offers `FIND ANOTHER MATCH`, which returns to online stage selection, and `QUIT TO TITLE`.

If your connection drops mid-round your body stays standing in the hotel — a free find, which is the
honest consequence — and you have half a minute to walk back into it before the seat is given up.

Playing on `localhost` talks to a network server on `localhost:3000`; anywhere else uses the live
one.

### Known gaps

- **Nobody has played an online round with real people yet.** Connection, lobby, roles, the head
  start, the shared hotel and the demons have all been driven in a browser; how movement *feels*
  between two machines has not been tested by a human.
- A two-player round is fragile: there is exactly one hider, so a demon reaching them ends it. Three
  or more guests is where the game is meant to live.

The guests are not statues. They pick a room, walk to it and crouch down, and they bolt if you or the demon gets close — from you at a longer range than from the demon, because a seeker with a plan is worth moving for while a roaming demon is worth staying still for. A door standing open is a guest who went through it.

V6.6 also puts the demo behind a proper menu: a title screen with `PLAY` / `HOW TO PLAY` / `EXTRAS` (the model viewers), and `Esc` opens a pause menu mid-round with `RESUME` / `HOW TO PLAY` / `QUIT TO TITLE`. Nothing simulates behind a menu — the fixed-timestep accumulator is not advanced at all while paused, so meters no longer tick while you are reading the controls, and the paused seconds are never replayed on resume.

V6.1 makes The Bellhop a near-black silhouette with bright red eyes, corrects its model-forward direction, and keeps chase replanning from restarting an active stair route. The hotel now uses sparse red light pools and emissive sconces, disables unused shadow rendering, caps high-DPI resolution, and automatically lowers render resolution after sustained slow frames. Use `?inspect=monster` (or the title-screen link) for the interactive creature workbench with orbit, zoom, idle/walk, and auto-turn controls.

V5.1 is a stabilization pass for building gameplay on top of that environment:

- The cramped four-flight-per-floor stair layout is replaced with a conventional stacked switchback.
- Sloped handrails replace the full-height cage bars that obscured the stairwell.
- Every guest-room opening now has visible casing on every floor.
- Open rooms receive a low-cost fill light while their door is open, preventing valid rooms from reading as black voids.
- Pure layout helpers and regression tests cover stair continuity, doorway frames, and room-light defaults.

V5.2 closes the remaining stairwell voids, makes the bottom slab walkable, guards exposed landing edges, and splits the runtime into focused ES modules. It also removes three recurring frame costs: unchanged elevator-indicator uploads, full-speed interaction raycasts, and repeated static AABB construction.

V6.4 is the first step toward the multiplayer game:

- **Gameplay runs on a fixed 60hz timestep.** The loop used to feed the display's frame delta straight into movement and the demon, so the game ran differently on a 144hz monitor than on a 60hz one. Simulation now advances in whole ticks and only rendering happens per frame — the prerequisite for a server ever being authoritative.
- **Players are real human figures.** Every player, the local one included, uses a textured Quaternius Base Character driven by the matching Universal Animation Library's native idle, jog, sprint, and crouch clips. Your own body is drawn under you with its head collapsed so it does not fill the camera. `?inspect=avatar` (or the title-screen link) opens a workbench for the figure with idle/walk/run/crouch.
- **The stairwell framerate collapse is fixed.** Standing in the stairwell reported "floor 0", and floor 0 switched on every light in the hotel — roughly 32 point lights in a single forward-rendered pass. Lighting now follows vertical proximity, so at most two floors are lit. The stairwell's 108 treads, landings, and rail segments are also baked into two meshes at build time, since none of them move.

V6 adds:

- A distorted, animated demon built from the local Universal Animation Library model plus procedural horns, eyes, claws, and a fallback shadow-form.
- A patrol/chase/search state machine with field-of-view, range, vertical-level, and collider-aware line-of-sight checks.
- Crouching with a lower eye line and reduced detection range, allowing couches, dressers, desks, beds, walls, and corners to function as cover.
- Chase/search danger feedback, a catch condition, and a restart screen.
- Local vendored Three.js and GLTF loader files so the launcher no longer needs a CDN connection.

## Architecture

`main.js` is intentionally limited to composition and the animation loop. Runtime responsibilities live under `modules/`:

- `game-config.js` — immutable tuning, floor definitions, and inspection views
- `rendering.js` — scene, renderer, procedural materials, and resize handling
- `world.js` — shared state, geometry primitives, UI events, walk surfaces, and collision
- `furnishings.js` — room furniture and searchable drawers
- `hotel.js` — rooms, corridors, secret passages, and stair construction
- `elevator.js` — car, doors, calls, and travel state
- `player.js` — input, movement, location tracking, and interaction targeting
- `monster.js` — creature rendering, navigation, LOS, chase/search behavior, threat HUD state, and defeat
- `performance.js` — reusable change and interval gates, the adaptive quality controller, and the fixed-timestep accumulator
- `avatars.js` — player figures: one shared textured body and locomotion bank, cloned per player, with a placeholder body until they load
- `sanity.js` — the anti-camping meter: samples which room you are standing in, drives the HUD bar, and hands the map's hunter its target
- `map-session.js` — which location this page booted into, and the re-entry that changes it

Pure monster rules live in `enemy-logic.js`, pure avatar rules (motion state, clip choice, crouch posture, facing, seat tints) live in `avatar-logic.js`, collision boxes live in `collision-logic.js`, and sanity rules live in `sanity-logic.js`, so those decisions can be tested without WebGL — and run headlessly on a server later. The tracker minimap was removed in V6.3 — the player is meant to locate a demon by sound and sight, not by a HUD readout.

## Locations

The game ships two registered locations, and which one you are in is chosen on the setup screen
before a round rather than during one:

- **The Grand Hotel** — four floors, a continuous stairwell and one working elevator. Two demons:
  The Bellhop (who walks to whoever has stopped moving) and The Housekeeper.
- **Cinder Mall** — a burnt-out shopping centre: two levels wrapped around an atrium void, thirteen
  storefronts, an escalator pair, an enclosed service stair, a two-floor lift and two back-of-house
  service corridors that drain the sanity meter. Three demons: The Greeter (the hunter), The
  Custodian and The Nightwatch.

A location is a row in `map-catalog.js`, a pure plan module and a demon roster; nothing else in the
cabinet changes to add one. `MAP_AUTHORING.md` is the contract. Demon count is per map — two was the
hotel's number, never a rule — with exactly one camper-hunter in every roster, and a roster may be
longer than the building is tall: the mall runs three demons on two levels, spread by distance rather
than one per floor.

The setup screen's location cards show a **floorplan per level**, drawn from each map's own plan
data (`map-preview.js`) rather than from shipped art, so a building that moves a wall moves its
preview with it.

`?map=<id>` boots straight into a location. Online, the map is a lobby setting, so two locations are
two matchmaking pools and the server names the map in every snapshot.

## Major changes

- All four floors of the hotel remain physically present at their real Y positions.
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
6. Stand still inside any room and watch `SANITY` climb; at 100% The Bellhop routes to that room. Step into the corridor and walk a short way — the meter drops to 0% and the demon breaks off and resumes roaming.
7. Hold Shift and run a corridor end to end. `STAMINA` drains, reads `WINDED` at zero, and Shift stops doing anything; stand still or crouch and watch it climb back — crouching refills noticeably faster than walking does.
8. Press `Esc` mid-round. The pause menu appears and both meters freeze; `RESUME` puts you back where you were with the same readings.
9. Fill the meter in room 105, then open the loose wall panel and step into the secret passage. The bar turns green, reads `CALMING`, and counts down to `UNSEEN` — it carries your meter in rather than wiping it, so the drain is visible. Step out into 107 and it starts climbing again.

## Controls

WASD/arrows move, mouse look, Shift sprints (while stamina lasts), C or Ctrl crouches, E interacts, and Esc pauses. While spectating, Q/E, brackets, arrows, or the on-screen buttons switch players. On mobile, hold HIDE to crouch. Browsers without Pointer Lock automatically use click-and-drag mouse look.

## Engineering note

The controller remains lightweight rather than physics-engine based. The Bellhop uses a purpose-built hotel route graph for inter-floor travel and direct collider-aware steering during a chase. It intentionally uses the stairs rather than the elevator.

The creature body, player Base Character, and animation libraries are by Quaternius and are included under CC0 1.0; see `assets/UAL2-LICENSE.txt` and `assets/quaternius-player/`. The local Three.js runtime retains its MIT license in `vendor/THREE-LICENSE.txt`.

Run `npm test` for the AI, avatar, fixture, demon, round, architecture, layout, controls, server, music, and performance regressions. For visual development, `?inspect=stair`, `?inspect=stairEntrance`, `?inspect=doorway`, `?inspect=monster`, and `?inspect=avatar` start at representative QA views without requiring a full traversal.
