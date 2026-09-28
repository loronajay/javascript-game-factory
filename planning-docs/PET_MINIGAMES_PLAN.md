# Farm Pet Games — design and rollout plan

> Source of truth for the farm's player-piloted pet competitions.  
> Started 2026-09-25 from the three concepts selected with the player.  
> Implement one event per task; do not combine all three into one implementation pass.

## Product rule

Pet games are skill games with a modest persistent-stat influence:

**player execution > pet stats > species flavor**

The farm owns pet identity and long-term progression. A minigame may read a selected pet's name, species, size, palette, Speed, and Strength and may later submit accomplishments through a trusted platform seam. It must not become another profile editor or persist a competing copy of a pet.

Every event needs an offline CPU mode. Online PvP may be added later, but the game must remain testable and enjoyable when server population is low.

## Event 01 — Barnyard Dash

Status: **Quick Race, Grand Prix and server-authoritative online (2–8 pets) shipped** in `games/barnyard-dash/` (2026-09-28).

A third-person 3D direct-control obstacle race around a farm course. The player accelerates, brakes, steers, and times jumps. Offline modes range from a 1v1 duel through fields of 4, 6, or 8 total pets, with CPU racers filling every non-player slot.

Locked balance:

- Speed multiplier is `0.90 + Speed / 500`, giving a deliberately narrow 90–110% range.
- Strength does not raise top speed. It preserves momentum in mud and after impacts and supplies force for breakable hay/gates.
- Current size affects collision radius, so larger pets trade presence for a wider line.
- Hurdles reward jump timing. Mud rewards route choice. Tight turns reward braking and racing lines.
- The cabinet reads the canonical farm layout through the shared layout store and falls back to a balanced loaner when no eligible pet is available.
- Racers use the farm's actual 3D GLB animals, animation clips, palette materials, authoritative size data, and reusable farm scenery/prop builders. Barnyard Dash is not a 2D game and must not substitute flat racer tokens for those assets.
- The first course is a single-lap offline race with selectable 2/4/6/8-pet fields. No ticket reward, record submission, accomplishment write, or online authority is part of this slice.

Next sensible Barnyard Dash passes:

1. Playtest and tune course readability, CPU pace, collision feel, and race duration.
2. Replace or augment procedural racer markers with measured species art while preserving visible-body hitboxes.
3. Add course variants and difficulty rows as data, not branches in the composition root.
4. Design the trusted result/accomplishment authority before writing wins or records back to farm history.
5. Add online PvP only with a headless latency harness and server-authoritative or deterministic contract.

## Event 02 — Pondside Push

Status: **Quick Match vs CPU levels and server-authoritative online (2–4 pets) shipped** in `games/pondside-push/` (2026-09-28). Rounds run themselves (countdown → brawl → splash → next round), and a stand-off always ends: after 15 s the island sinks until it is gone.

A four-pet king-of-the-hill brawl on a circular grass-and-stone island surrounded by water. The player's farm pet faces three deterministic CPU rivals. Holding a clean forward line builds momentum; the bump button produces a short burst and its collision force grows with approach speed. The last pet on the island wins the round, and the first pet to three round wins takes the match.

- Speed has a narrow effect on maximum pace; sustained direction and steering discipline create the larger advantage.
- Strength adds a modest bump-force multiplier, while current size uses the species' canonical visible-body radius.
- The cabinet reads canonical farm identity through the shared Pet Games adapter and has no farm write path.
- The first slice is offline only, with no rewards, records, or online authority.

## Event 03 — Fence Hopper

Status: **design held for a later task; not implemented**.

An animal-hurdles timing game. Forward motion may be automatic or offer limited steering, while the core input is jump timing across changing heights and spacing patterns.

- Speed makes the run faster but also narrows reaction windows, so it is a mixed advantage.
- Strength improves recovery after clipped hurdles.
- Perfect jumps preserve momentum; early/late jumps and clips cost it.
- The primary mastery loop is chaining clean jumps, not choosing the highest-Speed pet.
- Offline CPU is required in its first playable slice.

Open design question for its own task: decide whether it is a distinct cabinet or a mode sharing Barnyard Dash presentation/runtime. Do not decide this by growing `main.js`; first evaluate the simulation and UI boundaries.

## Event 04 — Hay Bale Smash

Status: **design held for a later task; not implemented**.

A short strength event with three execution layers:

1. accelerate efficiently down a runway;
2. trigger charge/power inside a moving sweet spot;
3. align the impact angle with the target stack.

Strength sets potential force, but accuracy multiplies the delivered result. A 70-Strength pet with near-perfect execution should beat a 100-Strength pet landing around 60% accuracy.

Possible formats are distance records, target zones, and different destructible arrangements. Offline CPU is required in its first playable slice.

## Shared Pet Games layer (shipped 2026-09-28)

Both events now share one layer in `games/pet-games/shared/`:

- **Rival pool** (`sim/rivals.js`): 42 named CPU pets across all ten species and every coat, in three tiers. A field is a seeded weighted draw — Rookie grids lean on locals, Champion grids on the circuit's best — and a fresh seed per race keeps fields fresh. Rivals never copy the player's stats.
- **CPU levels** (`sim/levels.js`): Rookie / Pro / Champion. A level means *hands* (each event's `cpu.js` holds its own knob table), never a stronger pet. Tests hold the ordering on real courses and real brawls.
- **Online** (`online/lobby-client.js`, `online/input-stream.js`, `online/smoothing.js`, `ui/online-panel.js`): quick match, private rooms by code, host settings, CPU guests for empty chairs, reload-safe sessions. Server-authoritative on `factory-network-server` (`games/pet-games/`), which runs the events' `sim/` folders mirrored byte for byte by `games/pet-games/tools/mirror-sim.mjs`. Clients send only sequenced inputs, predict their own pet by replaying unacknowledged inputs, and interpolate everyone else. `tests/online-latency.test.js` runs the real server engines and the real client sessions over a simulated 80 ms RTT with jitter.
- **Platform** (`platform.js`): results go through `POST /games/:slug/results` (tickets under the time-budget fence), and `GET /games/:slug/career/:playerId` derives the public PvP record, CPU wins and best cup finishes from those results — no new table.

## Barnyard Dash Grand Prix (shipped 2026-09-28)

Five courses (`sim/courses.js`, authored by lap fraction; a lint walks every course hugging each fence) and three cups (`grand-prix.js`): Clover (3 races), Harvest (3), Blue Ribbon (all 5). A cup is one grid of seven pool rivals at a class, points 10-8-6-5-4-3-2-1, reverse-table grids. Every podium pays tickets by class; **winning a cup puts a trophy on the farm** — bronze (Rookie), silver (Pro), gold (Champion) of that cup, nine procedural decor items (`js/farm-props-trophies.mts`) with the new `prize` unlock type, granted as a farm entitlement inside the same settlement transaction (`services/game-result-grants.mts`) and only when the result was not fenced. The server re-scores a cup's points from its placings and refuses a final place those points cannot reach.

## Still deferred

- Fence Hopper and Hay Bale Smash (events 03/04).
- Server attestation of online results to platform-api (today an online result is the client's report of what the server decided, under the same plausibility + fence standing as every cabinet).
- Ranked/ELO for Pet Games; seasons; stat-specific leagues.
- Pondside cups/tournaments; per-pet accomplishments in farm history.
- An in-world Pet Games venue inside the 3D farm.
