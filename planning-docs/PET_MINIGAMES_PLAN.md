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

Status: **first playable offline slice implemented** in `games/barnyard-dash/`.

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

## Event 02 — Fence Hopper

Status: **design held for a later task; not implemented**.

An animal-hurdles timing game. Forward motion may be automatic or offer limited steering, while the core input is jump timing across changing heights and spacing patterns.

- Speed makes the run faster but also narrows reaction windows, so it is a mixed advantage.
- Strength improves recovery after clipped hurdles.
- Perfect jumps preserve momentum; early/late jumps and clips cost it.
- The primary mastery loop is chaining clean jumps, not choosing the highest-Speed pet.
- Offline CPU is required in its first playable slice.

Open design question for its own task: decide whether it is a distinct cabinet or a mode sharing Barnyard Dash presentation/runtime. Do not decide this by growing `main.js`; first evaluate the simulation and UI boundaries.

## Event 03 — Hay Bale Smash

Status: **design held for a later task; not implemented**.

A short strength event with three execution layers:

1. accelerate efficiently down a runway;
2. trigger charge/power inside a moving sweet spot;
3. align the impact angle with the target stack.

Strength sets potential force, but accuracy multiplies the delivered result. A 70-Strength pet with near-perfect execution should beat a 100-Strength pet landing around 60% accuracy.

Possible formats are distance records, target zones, and different destructible arrangements. Offline CPU is required in its first playable slice.

## Shared work deliberately deferred

- Online matchmaking and private rooms.
- Ticket rewards, entry fees, anti-cheat, and result authority.
- Durable pet accomplishments and memorial-history integration.
- A shared Pet Games lobby/event structure inside the 3D farm.
- Cross-event seasons, rankings, or stat-specific leagues.
- Bespoke animation work.

Those features need explicit ownership and trust-boundary design; they are not assumed merely because a playable local event exists.
