# Farm Riding — the Horse and Windrush Downs

Status: **scoping** (2026-09-29). Replaces Phase 7 ("Horse — ridable pet") of
`FARM_LIVESTOCK_PLAN.md`. Sibling of `FARM_PETS_AND_CARE_PLAN.md` (the horse
is a pet) and `FARM_FISHING_PLAN.md` (the Cove is the last place that opened
off the Market Square).

## The idea in one paragraph

The horse is a pet you can ride. Riding anywhere else (the farm, the Market
Square, the Cove) is **cosmetic**: you move at the player's walk/run speed on
horseback, with no stamina and no jump. **Windrush Downs** is a large open
riding ground off the Market Square's west wall, and it is the one place
where the horse is **piloted**: its stats set its top speed, acceleration,
stamina, turning and jump, Space jumps, and there are courses, a gallop strip
and open country to use them on. You can only pass the Downs gate while
mounted. Nothing there pays tickets or XP. It is a playground for the horse,
and races there are friendly and not sanctioned.

### The name

**Windrush Downs**. "Downs" is the old word for open rolling grassland used for
gallops (Epsom Downs, the Berkshire Downs), and "Windrush" is about moving
fast. Alternatives if you don't like it: *Thistledown Downs*, *Longmeadow
Gallops*, *Hollow Oak Downs*.

## Decisions to lock (proposed — owner to confirm)

1. **The horse is a pet species** (`pet.horse`, `ridable: true`), adopted
   from the Pets panel like the other ten, and **excluded from Pet Games**.
   Home is a **stable stall** (the Stable's stalls already exist as fixtures
   with half-doors). The model is the Quaternius `horse.glb` already converted
   in Phase 0, with the clips `Idle`/`WalkSlow`/`Walk`/`Run`/`Jump`/`Death`.
2. **Piloting only happens in the Downs.** Everywhere else the horse
   reuses the rider's own walker speeds, and Space does nothing. One flag on
   the page picks the mode, so there is one ride module with a `cosmetic`
   switch, not two riding systems.
3. **You enter the Downs mounted and stay mounted.** The Market's west gate
   refuses anyone on foot ("You'll need to be riding to go out to Windrush
   Downs"). Inside the Downs, E does not dismount, and you leave the way you
   came, still mounted.
4. **The Downs is unsanctioned.** No tickets, no XP, no server boards.
   Personal bests are kept locally. That is why the ride sim can run on the
   client (see Trust).
5. **The ride sim is pure and deterministic from day one** (fixed 60 Hz
   step, no DOM/THREE/clock/random), like Pet Games and Shark Hall. If we
   ever want sanctioned races with prizes, making them server-authoritative is
   a mirror of this sim, not a rewrite.

## The horse as a pet

A normal pet care row (`farm-pet-care.mts`): food (**Oats**, and carrots/
apples as liked crops so a farm can feed its own), home (stable stall), three
toys (a salt lick, a hanging ball, a jump pole for the paddock), lifespan,
palettes (bay, chestnut, grey, black, palomino, pinto; rarity as the pets'
palettes already work). All of the pet profile applies: gender, age, size,
hunger, happiness, traits, growth grade, rapport.

### Riding stats

Pets already have two visible stats, **speed** and **strength**, grown by
the server-pinned growth policy. A horse needs four to feel different from
another horse:

| Stat | Drives | Source |
|---|---|---|
| **Speed** | gallop top speed, a bit of acceleration | existing pet stat |
| **Strength** | jump height, acceleration, how little a jump costs | existing pet stat |
| **Stamina** | size of the stamina pool, recovery rate | **new, horse-only** |
| **Agility** | turn rate at speed, how fast it gets up after a stumble, jump clearance | **new, horse-only** |

Proposal: a care row can declare **extra stats** (`extraStats: { stamina, agility }`)
that go through the same growth pipeline (`base + gained`, rates, potential
grade) and the same server pinning in `farm-pet-growth-policy.mts`. Only the
horse uses it for now. Existing pets don't change.

**Condition affects performance**, so care matters on the track:

- Hunger below 30 → stamina pool ×0.7. Below 10 → the horse won't gallop.
- Low happiness → recovery ×0.8.
- Elder life stage → top speed ×0.9 (it keeps its peak stats, but it's slower).
- Traits are data, like the rest: *Zoomies* → acceleration ×1.15, *Lazy*-type
  traits → recovery ×0.85, and so on, through `petTraitMultiplier` with new
  keys (`rideAccel`, `rideStamina`, `rideTurn`, `rideJump`).

### Numbers (first pass, to tune by feel)

Stats are 0–100. `t = stat / 100`.

| Quantity | Formula | Range |
|---|---|---|
| Walk / trot / canter | fixed 1.8 / 4.0 / 7.0 m/s | — |
| Gallop top speed | 9 + 6·t(speed) | 9–15 m/s |
| Acceleration | 2.5 + 2·t(strength) + 1·t(speed) | 2.5–5.5 m/s² |
| Stamina pool | 60 + 60·t(stamina) | 60–120 |
| Turn rate at gallop | 50° + 50°·t(agility) /s (at walk always 140°/s) | 50–100 °/s |
| Jump height (apex, rider-clear) | 0.7 + 0.9·t(strength) | 0.7–1.6 m |
| Jump length | from takeoff speed × airtime | falls out |

Stamina: gallop −10/s, canter −1/s, trot +5/s, walk +9/s, standing +14/s,
a jump costs a flat 12. At **0 stamina** the horse is *winded*: it drops to
a trot, can't gallop or jump, and recovers at the trot rate until it's back
over 30%. The HUD shows the stamina bar and the current gait.

## How it pilots (the Downs)

The feel we want is something with weight: momentum, a turning circle that
gets wider as it speeds up, and a stamina budget you have to plan around.

- **W (hold)** — urge on: accelerates up through walk → trot → canter.
  Releasing W eases down gradually. It coasts, it doesn't stop dead.
- **Shift (hold, with W)** — gallop. Costs stamina.
- **S** — rein in: brakes hard. When stopped, it backs up slowly.
- **A / D** — turn. The turn rate falls with speed, so a gallop takes a wide
  line and a sharp corner means slowing down first. Mouse look stays free for
  the camera, and the horse doesn't steer by the mouse.
- **Space** — jump. Height comes from strength, distance from how fast you
  take off. You can't jump when winded or while already in the air.
- **Collisions**: running into a solid at canter or faster is a **stumble**,
  which kills your speed, costs 10 stamina and freezes input briefly (agility
  shortens it). You never fall off, and there's no injury.
- **Obstacles have a clearance height**. Jump too low and you **knock a
  rail**: a fault on a course, and a small speed loss.
- **Refusals** (optional, v2): coming at a fence too slowly or at a sharp
  angle makes the horse stop short. This is what makes lining up your
  approach a skill.

**Camera**: the farm is first-person. For riding that means you see the
horse's neck and ears, which is atmospheric but makes it hard to judge
jumps. Proposal: in the Downs the default is a **third-person chase camera**,
and **V** switches to first person. Elsewhere, riding stays first-person to
match the page.

Clips: `WalkSlow` = walk, `Walk` = trot (sped up), `Run` = canter/gallop with
timescale following speed, `Jump` scrubbed to the airtime, `Idle` standing.

## Windrush Downs — the place

`/farm/downs/` — a new page on `createFarmWorld` like the Market and the Cove,
with live presence + chat on the existing bridge (room id `farm:downs`).
Reached through a new **west gate** in the Market Square (the east wall has
the stalls). It is much bigger than the 28 × 28 m farm: about **200 × 160 m**,
which will need a longer camera far plane, fog to cover the distance, and
instanced scenery.

**Ground that isn't flat.** Rolling ground matters more here than anywhere
else. A pure `downs-terrain.mts` heightfield (the same idea as the pond
profile: one function that the ground mesh, the ride sim and placement all
read). The body already stands on `ground(point)`, so this extends it rather
than inventing something new.

Areas:

1. **The Hitching Green** (arrival): the gate, a water trough, a notice board
   with your personal bests, the start gate for friendly races, and a rail
   to hang around at. This is where everyone meets.
2. **The Gallop**: a long straight strip (~180 m) with a start line, distance
   markers and a finish post. Flat out, all about stamina. A timed sprint.
3. **The Oval**: a fenced ~500 m oval with a rail. This is where friendly
   races are run, and it's where the stamina budget really matters (gallop
   the whole way and you'll be winded before the line).
4. **The Show Ring**: an enclosed arena with numbered fences (verticals,
   oxers, a triple combination). Rides against the clock, with faults for
   knocked rails. Two layouts to start with, *Novice* (0.8 m) and *Open*
   (1.3 m), so a weak jumper can still have a go.
5. **The Cross-Country Trail**: a winding loop through a copse and over
   the hills, with fallen logs, a ditch, a bank up and a drop down, and a
   **water splash** (slower through the water, reusing the pond's water
   drag). Timed, with numbered flags.
6. **Open Country**: everything in between, meaning hills, a stream, a
   scattering of free-standing logs and hedges to jump for fun, and a
   ridge with a view back to the market.

All the course furniture is **farm decor rows** (new `decor.jump.*` rows with
a `clearance`), so the Downs is built like the Market Square was, and a new
fence type is just a catalog row.

### Timed runs (solo)

Ride through a course's start gate and a timer starts. Pass every numbered
fence/flag in order (a missed one is shown and the run doesn't count). At the
finish you get **time + faults** (4 per knocked rail, show-jumping style).
Personal bests per course are stored locally, and a ghost of your best is a
possible v2. No tickets, no board.

### Friendly races

At the Hitching Green (or the Oval's start), riders standing in the start
gate see "Race? (R)". R to join, and anyone in the gate can press **Start**,
which gives a 3-2-1 countdown. Everyone's timer starts from the same moment
off the bridge's clock. The finish order is posted in chat and over the
winners' heads. Joining is optional, and riders who aren't racing can stay
on the track (but see the question about ghosting).

Unsanctioned means we don't police it: each client times its own run and
posts it. Someone could fake a time, and it wouldn't matter because nothing
is won. The bridge only gets new relayed frame types (`downs_race_*`) with
the usual per-member rate limit, and never simulates anything.

### Presence

The pose frame gets a **mount** block: horse species/palette, gait, speed
and `y` (so a jump shows up for other people). A visitor on horseback is the
horse body with the rider's avatar seated on it. Other people's horses are
eased toward their last pose like bodies are now, and a jump plays the clip
off the `y` curve.

## Riding elsewhere (cosmetic)

- **Farm**: E on your horse → a "Ride" option (E still pets/carries for
  other pets; a horse is too big to carry, so E on a horse is **Mount**, and
  the pet prompt moves to a second key or the Pets panel). While riding you
  move at your normal walk/run speed, the eye line is raised to a rider's
  height, doors and low beams are still solid (you **can't ride into**
  buildings, and a clear refusal is shown), and ladders and seats need you
  to dismount first. E dismounts.
- **Leaving the farm mounted**: the horse comes with you through the gate.
  The URL carries the horse's instance id (as `?farm=` already carries the
  farm), and the next page reads the horse's profile from the server's copy
  of the farm (public, server-computed stats), never trusting a stat from the
  URL.
- **Market Square / Cove**: you stay mounted. Proposal: a **hitching rail**
  just inside each place's gate. Dismount there to walk around (vendors,
  fishing, trading), and remount at the rail. Leaving the place on foot
  leaves the horse at the rail, and it goes home to its stall (it's back on
  the farm when you get there).

## Trust

Riding changes nothing a server would need to settle: no goods, no tickets,
no XP, no stats. So:

- **Stats are read from the server** (the stored farm document's pets, with
  the server-recomputed stats), so you can't bring in a 100/100/100/100 horse
  by editing the page.
- **The sim runs on the client.** A modified client could gallop forever in
  the Downs, but everyone only sees a fast horse at an unsanctioned
  playground. That is the same level of trust as the room and the Market's
  presence.
- **Riding as care** (optional): a ride in the Downs counts as the horse's
  *play* for the day (happiness, rapport, with the same diminishing daily
  returns as toys). It goes through the normal pet save path and its
  existing bounds, and doesn't grant any stat growth on its own.

If sanctioned racing (entry fees, prizes, a ladder) ever comes, it moves to
`factory-network-server` as a server-authoritative room running the mirrored
`farm-ride.mts`, the same way Pet Games did.

## Pure layers (new)

- `js/farm-ride.mts`: the ride sim. Input `{ urge, gallop, brake, turn, jump }`,
  horse riding profile, terrain `ground()`, solids and jump clearances in →
  next pose, speed, gait, stamina, airborne, stumble/fault events out.
  `cosmetic: true` bypasses stamina/jump and clamps to walker speeds.
- `js/farm-ride-profile.mts`: pet profile + condition + traits → the riding
  numbers above. Pure, tested against the stat table.
- `js/downs-terrain.mts`: the heightfield.
- `js/downs-courses.mts`: course definitions (ordered gates/fences, start/
  finish), run state (timer, next gate, faults), plus a local bests store behind
  an injected storage.
- `js/downs-race.mts`: friendly race state machine (gate → joined → countdown
  → running → finished), with the socket/clock injected.
- `js/farm-downs-scene.mts`: the layout as decor rows, bounds, the gate, spawn.

## Phases

1. **R0: The horse as a pet.** Care row, Oats, stable-stall home, toys,
   palettes, `extraStats` (stamina, agility) through growth + server pinning,
   Pet Games exclusion. The horse can be adopted and looked after, and it
   wanders the farm.
2. **R1: Mount and cosmetic riding on the farm.** Mount/dismount, rider eye
   height, walker speeds, gait clips, no-building refusal.
   `farm-ride.mts` exists with `cosmetic: true`.
3. **R2: Ride through the gates.** Horse handoff by id, server-read profile,
   hitching rails in the Market and Cove, mounted riders visible in presence.
4. **R3: Windrush Downs opens.** The page, the terrain, the Market's west
   gate (mounted only), the full ride sim (stamina, gaits, Space jump,
   stumbles), the HUD, the chase camera, presence. Open Country and the
   Gallop only.
5. **R4: Courses.** Show Ring (Novice/Open), Cross-Country Trail, the Oval,
   timed runs, faults, local bests, the notice board.
6. **R5: Friendly races.** Start gate, countdown, finish order, the bridge's
   `downs_race_*` frames (a network-server deploy).

Later, outside this plan: sanctioned races with prizes (server-authoritative
mirror), a Riding skill, tack/saddle cosmetics, horse breeding (with pet
breeding), ghosts of your best run, refusals.

## Open questions

1. **The name**: Windrush Downs, or one of the alternatives?
2. **Horse-only stats**: add Stamina + Agility as real grown stats (proposed),
   or derive everything from speed + strength to keep the pet profile
   uniform?
3. **Dismounting off the farm**: hitching rails (proposed), or always stay
   mounted until you're home, or dismount sends the horse home immediately?
4. **Camera in the Downs**: third-person chase by default (proposed) or first
   person to match the rest of the farm? Is there a seated/riding pose on the
   avatar GLBs, or does the rider need a static pose added?
5. **How many horses**: can a farm keep more than one (one per stall, as the
   stable allows)? Proposed yes, since stats make horses worth comparing.
6. **Where you get a horse**: the Pets panel like every pet (proposed), or
   sold by Hollis in the Market as the "big animal" guy, even though it's a pet?
7. **Does riding train the horse?** Proposed: counts as play (happiness/rapport)
   only. Alternatively a small riding-specific growth bonus, which would need
   bounds in the growth policy.
8. **Racers and non-racers on the Oval**: do riders who aren't racing collide
   with racers, or does a race ghost everyone who isn't in it?
