# PUCK'D UP

A self-contained vanilla JavaScript 3D air-hockey cabinet. The current playable
mode is first-to-seven against the CPU, with three difficulties, four venues,
custom player colors, pointer/touch/keyboard input, and fullscreen pointer lock.

## Run and test

Serve this directory (or the platform repository root) over HTTP:

```sh
python -m http.server 8080
```

Open `http://localhost:8080/` when serving this directory, or
`http://localhost:8080/games/puckd-up/` when serving the repository root.
Serve from the platform root for account integration and online lobbies; a
standalone folder server still supports CPU play. Online uses local port 3000
on localhost, or the existing Railway Factory Network service on deployed hosts.
Do not open `index.html` through `file://`: browsers restrict module loading there.

```sh
npm test
```

Tests use Node's built-in runner. No installation, bundler, or new dependency is
required. Runtime dependencies are unchanged: Three.js 0.166.1 and cannon-es
0.20.0 load from jsDelivr in `game.js`. An internet connection is still required
at launch. Local vendoring/offline packaging is a separate cabinet release task.

## Architecture

`index.html` contains the cabinet markup, `style.css` its styles, and `game.js`
loads the two existing libraries and starts one cabinet instance.

| Module | Ownership |
| --- | --- |
| `scripts/cabinet.js` | Composition, fixed-step frame loop, visibility, teardown |
| `scripts/config.js` | Shared dimensions and approved tuning |
| `scripts/settings.js` | Validated cabinet preferences and legacy storage keys |
| `scripts/core/match.js` | Screens, scoring, face-offs, celebrations, pause/resume |
| `scripts/core/fixed-step.js` | 240 Hz accumulator with bounded catch-up |
| `scripts/physics/world.js` | Cannon bodies, materials, solver setup |
| `scripts/physics/table-layout.js` | Rail geometry shared by physics and meshes |
| `scripts/physics/collisions.js` | Containment, speed cap, swept contact, goal crossing |
| `scripts/physics/simulation.js` | Fixed-tick body updates, strikes, gameplay events |
| `scripts/physics/cpu.js` | CPU opponent controller; injectable at simulation construction |
| `scripts/input/` | Browser input collection and fixed-tick player motion |
| `scripts/render/` | Scene, table meshes, pooled trail, visual synchronization |
| `scripts/render/venues/` | One visual-only builder per venue and shared geometry helpers |
| `scripts/ui/controller.js` | DOM state, menu actions, HUD, accessibility and fullscreen |
| `scripts/audio/` | Asset catalog, shuffled playlist and browser media adapter |

The match and physics layers import neither the DOM nor Three.js. Bodies never
belong to a venue. Input handlers collect intent; simulation ticks consume it.
Rendering reads the resulting body state. Animation age, CPU motion, player
motion, round timing and strike cooldowns all advance on fixed ticks.

Match commands emit `screen`, `match-start`, `match-reset`, `round-reset`,
`serve`, `goal`, and `match-end` events. Physics emits `puck-hit`, `wall-hit`, and
`on-fire`. The cabinet dispatches those events to presentation adapters; physics
does not call audio or DOM APIs. `createCabinet()` returns `pause()` and
`dispose()` for a future platform lifecycle adapter. Disposal removes listeners,
releases pointer lock and audio, cancels the frame loop and frees GPU resources.

## Behavior preserved and corrected

- Preserved: 10 × 16 table, goal openings, 29 m/s puck cap, swept paddle
  collision, restitution, damping, paddle response tuning, first-to-seven,
  venue geometry, side colors and directional trail.
- Corrected: CPU/player motion and strike cooldowns previously depended on
  render frames or wall-clock time. They now use the 240 Hz simulation clock.
- Face-offs retain their 650 ms delay and goals their 1050 ms celebration.
  Pausing during either phase freezes the delay and resumes it safely. Bodies
  stay still during face-off/goal delays.
- Focus loss and hidden tabs clear held input and pause live matches. Returning
  requires Resume. Pointer-lock loss also pauses, including during a face-off.
- Missing difficulty preferences now select Arcade; `Number(null)` previously
  selected Casual. Existing `tableHockey.*` preferences are still read.

## Soundtrack and effects

The playlist follows **Mini Hoops**: shuffle all six tracks once when the cabinet
loads, play each once, then repeat that same order. Rematches, screen changes,
pause, and mute keep the current track and position. Reloading draws a new order
(a random draw can naturally repeat a previous order).

Playback starts only after a user gesture. Music streams through one media
element. The top-bar Sound button persists the mute preference as
`puckdUp.muted`; pause/hidden tabs suspend playback.

| Asset | Trigger |
| --- | --- |
| Six files in `assets/sounds/soundtrack/` | Shuffled looping playlist |
| `button-click.wav` | Enabled button activation |
| `countdown-tick.wav` | Start of the existing 650 ms face-off |
| `go.wav` | Puck becomes live |
| `puck-hit-a.wav`, `puck-hit-b.wav` | Alternating paddle contacts |
| `wall-hit.wav` | Every native or containment-resolved wall impact |
| `on-fire.wav` | Puck above 23 m/s, at most once per four simulation seconds |
| `game-end.wav` | First-to-seven result |
| `crowd-ambience.mp3` | Loops while a match is playing |

Wall impacts have **no time cooldown**. A four-voice pool supports close hits
without continually creating media elements. Containment reports velocity
reflections, not position corrections, so a native bounce is not sounded again
by the safety envelope. Paddle effects retain a short contact debounce.
Autoplay denial, missing media and unavailable audio do not stop the game.

## Validation

The dependency-free regression suite covers collision/goal rules, swept-hit
energy ordering, screen transitions, pause-safe round timing, refresh-rate
independence, preferences, repeated wall events, playlist ordering, and audio
mute/lifecycle behavior. Simulation orchestration tests use a motion-only world;
they do not claim to test Cannon's internal solver. Browser smoke tests and a
separate run against the repository's existing Cannon build supplement them.

## Platform and online lobby preview

The cabinet is registered at grid order 17 with game.json, source/emitted catalog
entries, and the existing grid-previews/puckd-up.png. Metadata advertises only
the currently playable CPU mode, not online match play.

Online lobbies reuse the shared Player Factory account gate and auth API. Each
join/search validates the current account and reads its playerId/profileName;
no cabinet-owned identity cache or manual username is introduced. Auth tokens
are never sent in lobby messages. Guests can still play CPU matches.

Quick Search pairs two players. Private lobbies expose a five-character code,
and support joining, roster updates, host transfer, cancel/leave and disconnect
cleanup. Match start is disabled in both cabinet and server until synchronized
air hockey exists. No score, rating, activity or durable-record writes occur.

`scripts/online/` owns transport and lobby UI; `scripts/platform/account-access.js`
is the shared-account boundary. Factory Network's corresponding definition is
`games/puckd-up/server/puckd-up.game.mjs` in the sibling repository. The existing
platform ratings API can serve this slug without a schema/registry change;
secure completed-match reporting is a separate milestone, not lobby metadata.

Run `npm test` for cabinet tests. With the sibling server repo present, run
`npm run test:network` for real sockets with 0/80/200 ms added round-trip latency.
For browser QA, start the local server, serve the platform root, and open
`tests/lobby-preview.html` and `tests/lobby-preview.html?seat=bob`. This localhost-only
fixture injects synthetic accounts and never calls production auth or records.

See MULTIPLAYER.md for the next implementation pass and deployment order.
Other follow-ups remain presentation using supplied artwork, sound-level review,
offline packaging, local versus and training. README.txt is a historical visual
baseline rather than current architecture guidance.
