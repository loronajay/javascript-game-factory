# Hide and Seek

A first-person hide-and-seek horror game for two to eight players, across four locations. One player
is **it**; the rest hide. And something else is in the building with all of you.

*(Agents: this is the player- and QA-facing doc. Start at `CLAUDE.md` instead.)*

## Play

On Windows, double-click **`PLAY HIDE AND SEEK.cmd`**. It starts the local server and opens the game
in your default browser. Keep the launcher window open while playing; close it when you are finished.
From a terminal the equivalent is `npm start`.

## Controls

| | |
| --- | --- |
| Move | WASD or the arrow keys |
| Look | Mouse |
| Sprint | Shift, while stamina lasts |
| Crouch | C or Ctrl (hold **HIDE** on mobile) |
| Interact | E |
| Flashlight | F |
| Pause | Esc |
| Spectate | Q / E, brackets, arrows, or the on-screen buttons |

Browsers without Pointer Lock fall back to click-and-drag mouse look automatically.

## The rules

**The seeker** must find every hider before the round ends. **The hiders** must survive. Everyone
gets a head start of at least 45 seconds to scatter, which the seeker spends locked inside the closed
lobby elevator — the `ROUND` readout counts it down, then shows the tally. It never tells anybody
where anybody is.

**The demons are nobody's ally.** Every location has two or three of them, and they hunt the seeker
exactly as readily as the hiders. A hider one of them takes is still out, and still counts toward the
seeker's total — so a demon can hand the seeker the round. A **seeker** one of them takes ends the
round on the spot, and the hiders win however many had already been found.

That is the whole tension: every tool that makes seeking faster is a tool that gets you caught.

### Three things you spend

- **`HEAT SIGNATURE`** builds while you stay put. Fill it inside a room and you stop being hidden —
  the location's hunting demon turns and walks straight into that room. Changing rooms clears it, and
  so does walking a stretch of hallway. **Hiding is a delay, not a strategy.** Secret passages *cool*
  it (`COOLING`), carrying your reading in and bleeding it off rather than wiping it. A full bar
  reads `YOU ARE LIT UP`.
- **`STAMINA`** drains while you run and refills whenever you are not — fastest crouched in cover,
  then standing still, slowest while walking. Empty it and you are `WINDED`: sprinting is locked out
  entirely until you win a real share of the bar back. Running is the one thing that outpaces a
  demon, so it is a resource you spend rather than a speed you hold.
- **`FLASHLIGHT`** (F) is a battery — about two minutes of continuous light, draining only while lit.
  At zero it switches itself off and will not come back on; there is no last flick of vision. A
  caught player drops their flashlight where they fell, and anyone can pick it up and add the
  leftover charge to their own. Spare flashlights also appear on the floor at a random selection of
  authored spots each round: 8 in the hotel, 6 in each other map, carrying 35–65% charge. Use E to
  recover one in solo; online, walk over it and the server awards it once. Full batteries leave the
  pickup untouched. Spares do not respawn during a round.

The **elevator cabin is the only demon-proof refuge**, doors open or shut. Demons can open secret
panels and follow you through the passages, and a locked room can be forced during a hunt or a chase.

### Cover and keys

Crouching lowers your eye line and shrinks the range at which a demon can pick you out, which is what
makes furniture, corners and darkness real cover. Every location locks rooms on every floor and hides
that floor's master key in a drawer somewhere that starts open — searching is how you get into the
places worth hiding in.

The threat readout tells you a *state*, never a place. There is no map and no tracker: you locate a
demon by sight and sound, or not at all.

## Locations

Chosen on the setup screen before a round, never during one. The cards show a floorplan per level,
drawn from each location's own layout data, and `?map=<id>` boots straight into one.

- **The Grand Hotel** (`grand-hotel`) — four floors of guest rooms, a continuous stairwell and one
  working elevator, with secret passages linking room pairs on every floor. Two demons: **The
  Bellhop**, who walks to whoever has stopped moving, and **The Housekeeper**.
- **Cinder Mall** (`cinder-mall`) — a burnt-out shopping centre: two levels wrapped around an open
  atrium and fountain, glazed storefronts, an escalator pair, an enclosed service stair, a lift, and
  back-of-house service corridors that cool the heat meter. Three demons: **The Greeter** (the
  hunter), **The Custodian** and **The Nightwatch**.
- **Mercy Hospital** (`mercy-hospital`) — two floors, fourteen departments, continuous service stairs
  and a working elevator. Pharmacy and Imaging are locked downstairs, Administration and Isolation
  above; each floor's master hangs in a cabinet in a department that starts open. Three demons: **The
  Surgeon** (the hunter), **The Matron** and **The Orderly**.
- **Crowne Point Cinema** (`crowne-point-cinema`) — six tiered auditoriums over two floors, sound-lock
  entrances, six projection booths, public and service loops, both original stairs plus a lobby
  elevator and upper landing, restrooms and a locked film store. Keys live in the box-office drawer
  and Projection 1. Two demons: **The Usher** (the hunter) and **The Projectionist**.

## Solo play

The solo setup screen lets you take either role. As the **seeker** you wait out the head start in the
cabin while the CPU guests scatter; as a **hider** you use it to find cover alongside them before a
CPU seeker is released to hunt you.

The guests are not statues. They pick a room, walk to it and crouch, and they bolt if you or a demon
gets close — from you at a longer range, because a seeker with a plan is worth moving for while a
roaming demon is worth staying still for. A door standing open is a guest who went through it.

## Playing online

**Not yet played by real people.** Everything below has been driven in a browser against a live
server; how it *feels* between two machines has not been tested by a human.

`Online Multiplayer` opens its own stage selector. Pick a location — friends must pick the same one,
since matchmaking separates locations — then press `FIND A LOBBY`. It needs a signed-in Javascript
Game Factory account, and the name over your body in the corridor comes from your factory profile.
The lobby holds two to eight guests; the host presses `START ROUND`, and the server picks who is it
without announcing it until the doors close. Any player can be either role.

**The server owns the round.** Where you are, what you can see, how much battery you have left, which
drawer still had the key in it and who was caught are all decided there. Your client only sends which
keys you are holding and which way you are facing — a client that gets to say "I wasn't caught" is
the obvious way to cheat at hide and seek.

**The building is shared, not copied.** A door you open is open for the seeker chasing you. A drawer
holds one key and the second person to search it finds it empty. The elevator carries whoever is
standing in it. The demons are in the building hunting everyone, and a dropped battery goes to
whoever walks over it first.

A hider caught before the round ends stays in the match as a **spectator** and can cycle between the
living players. When the server ends the round, the results screen offers `FIND ANOTHER MATCH` and
`QUIT TO TITLE`. If your connection drops mid-round your body stays standing — a free find, which is
the honest consequence — and you have half a minute to walk back into it.

Playing on `localhost` talks to a network server on `localhost:3000`; anywhere else uses the live one.

### Known gaps

- Nobody has played an online round with real people yet.
- A two-player round is fragile: there is exactly one hider, so a demon reaching them ends it. Three
  or more guests is where the game is meant to live.
- Only The Grand Hotel has been playtested by a human at all. The other three are proven correct by
  tests, which is not the same as proven fun.

## QA

`npm test` runs the whole suite (`node --test`): AI, avatars, fixtures, demons, rounds, layout,
controls, music, performance, per-map plans and CPU navigation, online startup and replay, and the
architecture constraints.

`?inspect=<view>` starts at a fixed QA viewpoint without traversing — these are viewpoints, not
traversal shortcuts in a round. Combine with `?map=<id>`:

| Location | Views |
| --- | --- |
| The Grand Hotel | `stair`, `stairEntrance`, `doorway`, `monster`, `avatar` |
| Cinder Mall | `entrance`, `atrium`, `department`, `food`, `upper`, `cinema`, `book`, `lift` |
| Mercy Hospital | `lobby`, `emergency`, `ward`, `stairs` |
| Crowne Point Cinema | `lobby`, `theater1`, `projection`, `lift`, `landing` |

`?inspect=monster` and `?inspect=avatar` are interactive model workbenches (orbit, zoom, idle/walk/
run/crouch), also reachable from the title screen's `EXTRAS`.

### A solo QA route through the hotel

1. Walk to the south service lobby on Floor 1. Both vending machines should be flush against the west
   wall with their display faces toward the room.
2. Enter the stairwell on the east side and physically walk the west flight up, cross the north
   landing, then take the east flight to the next floor. Repeat to Floor 4 — there should be no use
   prompt and no teleport anywhere in it.
3. Return to Floor 1, enter the elevator, select a floor from inside, ride it, and walk out.
4. Room 105 demonstrates the drawer/key loop.
5. Stand still inside any room and watch `HEAT SIGNATURE` climb. At 100% The Bellhop routes to that
   room. Step into the corridor and walk a short way: the meter drops to 0% and it breaks off.
6. Hold Shift and run a corridor end to end. `STAMINA` drains, reads `WINDED` at zero, and Shift stops
   doing anything; stand still or crouch and watch it climb back — crouching refills noticeably
   faster than walking.
7. Press Esc mid-round. The pause menu appears and both meters freeze; `RESUME` puts you back with
   the same readings.
8. Fill the meter in room 105, open the loose wall panel and step into the secret passage. The bar
   turns green, reads `COOLING`, and counts down to `UNSEEN` — it carries your reading in rather than
   wiping it. Step out into 107 and it climbs again.

## Notes

The controller is lightweight rather than physics-engine based. Demons navigate on each location's
own waypoint graph and steer directly during a chase; they use the stairs, never the elevator.

Deploying online play means deploying **both** this cabinet and the matching `factory-network-server`
together — the server runs a mirrored copy of this game's rules.

The creature body, player base character and animation libraries are by Quaternius under CC0 1.0; see
`assets/UAL2-LICENSE.txt` and `assets/quaternius-player/`. The vendored Three.js runtime keeps its
MIT license in `vendor/THREE-LICENSE.txt`. Each location's `*-reference/` folder holds the original
untouched reference build it was adapted from.
