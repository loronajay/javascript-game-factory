# Farm Riding — the Horse, the Riding Skill and Windrush Downs

Status: **R0–R6 built** (2026-09-29). See "As built" at the end for the
module map, the defaults taken on the open questions, and what is not yet
verified (no two people have raced; needs deploy of both repos, migration 059
and `FARM_RACE_SECRET` on both servers). Replaces Phase 7 ("Horse — ridable pet") of `FARM_LIVESTOCK_PLAN.md`. Sibling
of `FARM_PETS_AND_CARE_PLAN.md` (the horse is a pet), `PET_MINIGAMES_PLAN.md`
(the server-authoritative race pattern this reuses) and `FARM_FISHING_PLAN.md`
(the Cove is the last place that opened off the Market Square).

## The idea in one paragraph

The horse is a pet you buy from Hollis and ride. Riding anywhere else (the
farm, the Market Square, the Cove) is **cosmetic**: you move at the player's
walk/run speed on horseback, with no stamina and no jump. **Windrush Downs**
is a large open riding ground off the Market Square's west wall, and it is
the one place where the horse is **piloted**: its stats and the rider's
**Riding** skill set its top speed, acceleration, stamina, turning and jump,
Space jumps, and there are courses, a gallop strip and open country to use
them on. You can only pass the Downs gate while mounted. Races are friendly
by default, but racers can put up a **stake**, and spectators can **bet** on
a race at the booth before it closes. Tickets moving is what makes races
server-authoritative.

## Decisions locked (owner, 2026-09-29)

1. **Name: Windrush Downs** (`/farm/downs/`).
2. **The horse is a pet sold by Hollis, the Livestock Dealer**, in the Market
   Square. It is a pet (a profile, care, traits, growth, a memorial) with
   `ridable: true`, excluded from Pet Games, and not a herd row. It is bought,
   not adopted from the Pets panel.
3. **Several horses, one per free stable stall.** Capacity comes from housing
   (the livestock rule), so a second Stable means more horses. A horse is
   refused at the Dealer without a free stall.
4. **Horses have four riding stats**: Speed and Strength (existing pet stats)
   plus **Stamina** and **Agility**, horse-only, grown and server-pinned like
   the others.
5. **Off the farm you tie up at a hitching rail.** Dismount at the rail just
   inside the Market's and the Cove's gate to go about on foot, and remount
   there. Leave the place on foot and the horse goes home to its stall.
6. **First person everywhere, with the horse in view.** You see its head,
   neck, mane, ears and the reins in front of you, moving with the gait
   (see Camera).
7. **Riding is a player skill** (`skills.riding`, 1–99 on the Farming curve),
   server-owned like Farming and Husbandry. Its levels give **perks** to
   riding every horse. Riding also **trains the horse** (bounded growth).
8. **A race is its own world.** Racers see only their race (the course and
   the other racers). Free riders and spectators are hidden from them, and
   racers can't collide with anyone outside the race.
9. **Tickets can ride on a race.** Racers can agree a stake, and spectators
   who register at the **Betting Booth** before betting closes can bet on a
   racer.

## The horse as a pet

A normal pet care row (`farm-pet-care.mts`) with `ridable: true`, `soldBy:
"dealer"` and `home: "stable-stall"`. Food is **Oats**, with carrots and
apples as liked crops. Three toys (a salt lick, a hanging ball, a jump
pole). Palettes: bay, chestnut, grey, black, palomino, pinto, rarity-weighted
as pets already are. The whole pet profile applies: gender, age, size,
hunger, happiness, traits, growth grade, rapport, death from neglect,
memorial.

**Hollis** gets a Horses tab: a few horses on sale each UTC day (a pure
function of the day, like the Seed Merchant's specials), each with its
visible stats and grade, priced by grade. The server rolls the horse at
purchase through the pets' adoption roller, so the Dealer's shelf is only a
preview of the seeds. Needs a free stall. Proposal: Riding 1 is enough to
buy, and a higher grade needs a higher Riding level (see open questions).

### Riding stats

| Stat | Drives | Source |
|---|---|---|
| **Speed** | gallop top speed, some acceleration | existing pet stat |
| **Strength** | jump height, acceleration, what a jump costs | existing pet stat |
| **Stamina** | stamina pool, recovery | **new, horse-only** |
| **Agility** | turn rate at speed, stumble recovery, jump clearance | **new, horse-only** |

A care row may declare `extraStats: { stamina, agility }`, which go through the
same pipeline (`base + gained`, rates, potential grade, life-stage weighting)
and the same server pinning in `farm-pet-growth-policy.mts` (and its parity
test). Only the horse declares them, so no other pet changes.

**Condition affects the ride**: hunger below 30 → stamina pool ×0.7, below
10 → won't gallop; low happiness → recovery ×0.8; elder → top speed ×0.9.
Traits are data through `petTraitMultiplier` with new keys (`rideAccel`,
`rideStamina`, `rideTurn`, `rideJump`).

### Numbers (first pass, tune by feel)

`t = stat / 100`, then Riding perks and condition multiply on top.

| Quantity | Formula | Range |
|---|---|---|
| Walk / trot / canter | 1.8 / 4.0 / 7.0 m/s | — |
| Gallop top speed | 9 + 6·t(speed) | 9–15 m/s |
| Acceleration | 2.5 + 2·t(strength) + 1·t(speed) | 2.5–5.5 m/s² |
| Stamina pool | 60 + 60·t(stamina) | 60–120 |
| Turn rate at gallop | 50° + 50°·t(agility) /s (walk: 140°/s) | 50–100 °/s |
| Jump apex | 0.7 + 0.9·t(strength) | 0.7–1.6 m |

Stamina: gallop −10/s, canter −1/s, trot +5/s, walk +9/s, standing +14/s, and a
jump costs 12. At 0 the horse is **winded**: it drops to a trot, can't
gallop or jump, and recovers at the trot rate until it's back over 30%.

### Horse training (riding makes the horse better)

A ride in the Downs counts as the horse's **play** for the day (happiness,
rapport, the same 100/60/30% daily diminishing returns as toys) **and** adds
a small **training** gain to the stat the ride used: gallop time → Speed and
Stamina, jumps cleared → Strength and Agility. The server bounds training
like all growth: it goes into `gained`, is capped per farm day and by the
rates' lifetime ceiling, and is only credited from **verified** rides (see
Trust). Training can't take a stat past the grade's potential. It helps a
horse reach its potential, it doesn't raise the potential.

## The Riding skill

`skills.riding` on the farm document, server-owned (the save guard pins it,
as it does Farming). 1–99, the same RuneScape curve (`farm-skills.mts` ↔
`services/farm-skill-catalog.mts`).

**XP comes only from things the server verified**:

- A completed course run (Gallop, Show Ring, Cross-Country, Oval time trial),
  verified by replaying its input log. XP by course and faults, with a
  daily diminishing curve per course so grinding one course plateaus.
- A finished race: XP for finishing, a bonus by placing, and more for a
  bigger field.
- A little from cosmetic riding elsewhere? **No** (proposed). There's
  nothing to verify, so it would be free XP.

**Perks** are the one place the rider changes the horse. They're kept modest
(together at most about +15%) so the horse stays the main thing:

| Level | Perk |
|---|---|
| 1 | Walk, trot, canter, gallop; Novice Show Ring |
| 5 | **Steady Seat**: stumbles last 25% shorter |
| 10 | **Open Show Ring**; stamina drain at the gallop −5% |
| 15 | **Light Hands**: +5% turn rate at speed |
| 20 | Can buy Exceptional-grade horses from Hollis |
| 25 | **Second Wind**: winded ends at 20% instead of 30% |
| 30 | **Clean Jumper**: +8 cm clearance on every fence |
| 40 | stamina drain at the gallop −10% total |
| 50 | **Collected Canter**: canter costs no stamina |
| 60 | Can buy Prodigy-grade horses; **Championship** cross-country line |
| 75 | +3% gallop top speed |
| 99 | a Riding cape-style cosmetic for the rider (tack slot later) |

The table is data (`RIDING_PERKS` in the pure layer, mirrored by the
server's race sim) so it can be tuned without touching the sim.

## How it pilots (the Downs)

The feel we want is something with weight: momentum, a turning circle that
gets wider with speed, and a stamina budget you plan around.

- **W (hold)**: speed up through walk → trot → canter. Let go and it eases
  down gradually (it coasts, it doesn't stop dead).
- **Shift (with W)**: gallop, costs stamina.
- **S**: rein in, a hard brake. When stopped, it backs up slowly.
- **A / D**: turn. The rate falls with speed. The mouse is only for looking.
- **Space**: jump. Height comes from strength, distance from speed at
  takeoff. You can't jump when winded or in the air.
- **Stumble**: running into a solid at canter or faster kills your speed,
  costs 10 stamina and freezes input briefly. You never fall off.
- **Faults**: each fence has a clearance. Jump under it and you knock a rail
  (4 faults, a small speed loss).
- Refusals (approach too slow or at too sharp an angle) are v2.

### Camera: first person, with the horse in view

The camera sits at the rider's eye, on the horse's back. A **rider's-view
rig** is the front half of the horse model (head, neck, mane, ears, the top
of the shoulders), plus reins running to two gloved hands at the bottom of
the frame. It's parented to the camera's yaw (not its pitch), so looking down
shows the neck and looking around doesn't swing the horse. The gait drives
it:

- the head nods on the walk/trot rhythm and stretches out at the gallop;
- the camera bobs with the stride (amplitude by gait, with a setting to reduce
  motion);
- FOV widens a few degrees at the gallop, and the ears prick up before a jump;
- a jump lifts the whole rig and the neck comes up on landing.

It's built from the same `horse.glb` (the front bones kept, the back half
hidden) with the rider's palette. The same rig shows while riding
cosmetically on the farm, in the Market and in the Cove. Other riders see the
whole horse with your avatar seated on it.

Clips: `WalkSlow` = walk, `Walk` = trot (sped up), `Run` = canter/gallop with
timescale by speed, `Jump` scrubbed to the airtime, `Idle` standing.

## Windrush Downs — the place

`/farm/downs/` on `createFarmWorld` like the Market and the Cove, with live
presence + chat on the existing bridge (room id `farm:downs`). Reached through
a new **west gate** in the Market Square. About **200 × 160 m** of **rolling
ground**. A pure `downs-terrain.mts` heightfield is read by the ground mesh,
the ride sim and placement (the body already stands on `ground(point)`).
Longer camera far plane, fog, instanced scenery.

1. **The Hitching Green** (arrival): the gate, a water trough, a notice board
   with personal bests and today's races, a rail to hang around at.
2. **The Gallop**: a ~180 m straight with a start line, distance markers and
   a finish post. Sprints.
3. **The Oval**: a fenced ~500 m oval with a rail and a grandstand. The
   main race venue, with the **Betting Booth** and the race board at the stand.
4. **The Show Ring**: an arena with numbered fences. Novice (0.8 m), Open
   (1.3 m, Riding 10). Against the clock, with faults.
5. **The Cross-Country Trail**: a loop through a copse and over the hills,
   with logs, a ditch, a bank up, a drop down and a water splash (slow
   through the water, reusing the pond's drag). A Championship line with
   bigger fences opens at Riding 60.
6. **Open Country**: hills, a stream, loose logs and hedges to jump for fun,
   and a ridge overlooking the market.

Course furniture is farm decor rows (new `decor.jump.*` with a `clearance`),
so a new fence is a catalog row.

### Timed runs (solo)

Ride through a course's start and a timer starts. Pass every numbered
fence/flag in order and finish to get time + faults. At the finish the
client sends the run's **input log** (the sim is deterministic, and the log
is compact: one input byte per tick), the server replays it, and a run that
replays to the claimed time and faults earns Riding XP and horse training.
Personal bests are local, and a per-course board is possible later on the
existing `game_run_records`/leaderboard catalog.

## Races

A race is a **server-authoritative room** on `factory-network-server`. The
pattern is Pet Games': the server runs the mirrored `farm-ride.mts`, the
client sends only sequenced inputs, predicts its own horse and interpolates
the others.

**Racers don't collide with each other** (proposed). Horses pass through
one another, so each racer's horse depends only on its own inputs and the
course. That makes the client's prediction of its own horse exact (the same
inputs through the same pure sim), so racing feels as immediate as solo
riding at any ping. The server stays the judge because it runs every
racer's inputs itself, and a late input just repeats the last one, as in
Pet Games. Blocking and bumping would be a v2 with real reconciliation.

**The flow**

1. **Post a race**: at the race board (the Oval stand, or the start of the
   Gallop/Cross-Country), a rider picks a course (Gallop sprint, Oval 1 or
   2 laps, Cross-Country), the field size (2–6) and a **stake** (0 = friendly,
   up to a cap). It goes on the board.
2. **Enter**: riders join at the board. With a stake, entering escrows it
   from your ticket balance. Your horse is locked in at entry (its stats read
   from the server at that moment).
3. **Betting is open** from posting until the **gate closes**: 20 s after the
   field is full or the poster starts it, and before the countdown.
4. **The race**: the racers are moved into the race world (a 3-2-1 at the
   start line), and **everything outside the race disappears for them**.
   Spectators at the Downs see the race as a live broadcast of the server's
   snapshots, drawn on the course. Free riders are kept off a course that's
   in use (a rope at its entrances) so spectators aren't confused.
5. **Finish**: the server's finish order settles everything: stakes, bets,
   XP, training. The order is posted in chat, on the board and over the
   winners' heads. A racer who disconnects is a DNF (their stake is lost to
   the pot, and bets on them lose).

### Stakes (racers)

Winner-takes-the-pot: every racer puts in the same stake, and the winner
receives the pot **less a 10% house fee, which is burned** (the Exchange
Board's fee). With a field of 5 or more, 2nd place gets their own stake back
(open question). Nobody can enter a race they can't pay for.

### Spectator bets (the Betting Booth)

- **Register in person**: ride up to the Booth while betting is open. After
  the gate closes, the Booth refuses. "Get there in time" is the rule.
- **Pari-mutuel**: all bets on a race make one pool. At the finish the pool,
  less a 10% burned fee, is shared among those who backed the winner in
  proportion to their stakes. The Booth shows the live pool and the implied
  odds on each racer while betting is open. If nobody backed the winner,
  everyone gets their bet back (less the fee).
- **Racers can't bet in the spectator pool**, not even on themselves. The
  stake is how they bet.
- Min 2 racers for a pool to open; bet 1–1,000 a race (open question).

### Why betting needs care (collusion and laundering)

Two players can move tickets between accounts by racing each other and one
of them losing on purpose, or by a racer throwing a race that friends have
bet against. That's the same problem the Exchange Board has, and the same
fence answers it:

- the 10% burned fee on every pot and pool;
- stakes won and bet winnings **count against the same 10,000-ticket daily
  earn cap** as Exchange sales, and stakes/bets against the daily spend cap;
- the stake per race and the bet per race are capped;
- one account per seat, and the platform's existing rate limits.

That keeps laundering to about the Exchange's rate. A thrown race can't be
proved and we won't try to prove it.

**Tickets must stay a currency players earn, not one they buy.** Betting
earned points is a game mechanic. Betting a currency sold for money (or one
that can be cashed out) is gambling law. If tickets are ever sold for money,
betting has to go or be rethought first. Worth a line in the ticket economy
guide.

## Trust

| What | Where it's decided |
|---|---|
| Horse stats | server (stored farm doc, server-recomputed), read at entry, never from the page/URL |
| Free riding in the Downs, cosmetic riding elsewhere | client (nothing depends on it) |
| Course runs → Riding XP, training | server replays the input log |
| Races → finish order, stakes, bets, XP, training | server-authoritative room (mirrored sim) |
| Ticket movement | platform-api, in one transaction |

**The prerequisite: the network server has to be able to report a result to
platform-api that the API believes.** Today every online result reaches the
API as a **client's report** of what the server decided (the gap
`PET_MINIGAMES_PLAN.md` lists as not built). That's fine for a few fenced
tickets, but not for a pot that other players paid into. Races need a
**server-to-server attestation**: `factory-network-server` signs the
settlement (race id, course, entrants, finish order, input-log hashes) with a
shared secret, and a new `POST /games/farm/downs/races/:id/settle` accepts
only that signature. Escrow at entry/bet goes through the API directly, and
settlement is idempotent on the race id (the ticket ledger key
`farm:race:<id>`). A race that never settles (server crash) refunds
everything after a timeout. Speed Demon's Ranked scope asks the same
question, so this seam should be built once, generically
(`network-attestation` in platform-api), not as a farm-only route.

## Riding elsewhere (cosmetic)

- **Farm**: E on your horse = **Mount** (a horse is too big to carry; stroke/
  feed is in the Pets panel or a second key). Normal walk/run speeds, the
  rider's-view rig, the eye raised to rider height. You can't ride into
  buildings (you're refused at the door, "Dismount to go inside"). Ladders
  and seats need you to dismount. E dismounts.
- **Leaving mounted**: the URL carries the horse's instance id (like `?farm=`),
  and the next page reads its profile from the server.
- **Market Square / Cove**: a **hitching rail** inside each gate. Dismount
  there, remount there. Leave the place on foot and the horse goes home to
  its stall. The Downs gate is in the Market, so to go riding you ride from
  the farm through the Market (or remount at the Market's rail).

## Pure layers (new)

- `js/farm-ride.mts`: the ride sim, deterministic, 60 Hz, mirrored to the
  network server. Input `{ urge, gallop, brake, turn, jump }` + riding profile
  + terrain + solids/clearances → pose, speed, gait, stamina, airborne,
  events (stumble, fault, gate passed, finish). `cosmetic: true` clamps to
  walker speeds and ignores stamina and jumps.
- `js/farm-ride-profile.mts`: pet profile + condition + traits + Riding perks
  → riding numbers.
- `js/farm-riding-skill.mts`: perks table, XP awards (mirrored by the API).
- `js/downs-terrain.mts`, `js/downs-courses.mts` (course lines, gates, run
  state, local bests via injected storage), `js/farm-downs-scene.mts` (decor
  rows, gate, spawn, booth, board).
- `js/downs-race.mts`: race board and race client state machine (posted →
  entering → betting closed → countdown → running → settled), socket/clock
  injected.
- `js/downs-betting.mts`: pari-mutuel maths (pool, fee, payouts, implied
  odds), mirrored exactly by the API's settlement.

## Phases

1. **R0: The horse.** Care row, Oats, stable-stall homes (one horse each),
   `extraStats`, server pinning, Hollis's Horses tab, Pet Games exclusion.
2. **R1: Mount and cosmetic riding on the farm.** Mount/dismount, the
   rider's-view rig, gait clips, no-building refusal, `farm-ride.mts` with
   `cosmetic`.
3. **R2: Ride through the gates.** Horse handoff, hitching rails, mounted
   riders in presence.
4. **R3: Windrush Downs opens.** Page, terrain, west gate (mounted only), the
   full sim, HUD (gait, stamina, speed), Open Country + the Gallop.
5. **R4: Courses + the Riding skill.** Show Ring, Cross-Country, Oval time
   trials, faults, local bests, input-log replay on the API, Riding XP and
   perks, horse training.
6. **R5: Friendly races.** Server-authoritative race rooms (mirrored sim), the
   race board, race isolation, spectator broadcast, finish order, XP. No
   tickets yet. Network-server deploy.
7. **R6: Stakes and the Betting Booth.** The network attestation seam, escrow,
   settlement, pari-mutuel pool, the caps, refund on timeout.

R6 is last on purpose. Money shouldn't go on a race until races have been
run by real people and the sim is trusted.

Later: bumping/blocking between racers, refusals, ghosts, per-course
boards, tack/saddle cosmetics, horse breeding (with pet breeding).

## Open questions

1. **Racer collisions**: no collisions between racers (proposed, exact
   prediction), or bumping from the start (harder netcode, more drama)?
2. **Stakes**: winner takes all, or does 2nd get their stake back in a field
   of 5+? Stake cap per race (proposed 500)?
3. **Bets**: 1–1,000 per bet (proposed)? One bet per spectator per race, or
   several racers backed at once?
4. **Hollis's horses gated by Riding** (Exceptional at 20, Prodigy at 60,
   proposed), or open to anyone who can pay?
5. **Horse prices**: what does a Steady horse cost vs a Prodigy? (A horse
   should feel like the biggest purchase at the Dealer.)
6. **Spectators on foot**: the Downs gate needs you mounted, so every
   spectator is on a horse. Fine, or should the Booth also be reachable some
   other way (e.g. a viewing stand on the Market side of the west wall)?
7. **Cosmetic riding XP**: none (proposed), or a trickle with a daily cap?

## As built (2026-09-29)

All seven phases in one pass. Where this differs from the text above, this wins.

**Defaults taken on the open questions** (flag any the owner wants changed):
riders never collide with each other (exact prediction); winner takes the pot
(no second-place refund); stake 0–500; bets 1–1,000, five per race per
spectator; Exceptional horses at Riding 20, Prodigy at 60; horse prices
Steady 2,500 / Gifted 4,500 / Exceptional 8,000 / Prodigy 15,000; no Riding XP
for cosmetic riding; spectators must be mounted (the Downs gate needs a horse).
Horse-to-happiness "riding counts as play" is **not** wired — training is.

**The horse (R0).** `pet.horse` in `farm-catalog/animals.mts` with a `model`
block (the Quaternius GLB in `yield-animals/`, named clips incl. trot/run/jump,
coats as two repainted materials), `soldBy: "dealer"`, `ridable`, `petGames:
false`. Stamina/Agility live in `profile.riding` (`farm-horse-riding.mts`) and
grow in step with the pets' own Speed/Strength growth (effective growing days
= gain ÷ rate), plus capped `trained` points. Hollis's paddock is three horses
a UTC day rolled from seeds (`farm-horse-stock.mts` ↔ `db/farm-horses.mts`,
`POST /games/farm/horses/purchases`, ledger key `farm:horse:<day>:<slot>`); a
horse takes a Stable stall (`stall` on the pet row, server-assigned and pinned)
and that stall disappears from the herd's homes (`herdHomes`/`farmHerdHomes`).
Riding is a server-owned skill record `skills.riding`.

**Riding (R1–R2).** One pure sim, `farm-ride.mts` (cosmetic/piloted), a
controller (`farm-riding-controller.mts`), the pet sim's `ridden` state, a
first-person saddle camera over the horse's own body with gait bob and a
gallop FOV kick, hands and reins (`farm-rider-view.mts`). Off the farm,
`farm-riding-away.mts` + `farm-horse-tether.mts`: arrive mounted from the URL
(`farm-riding-travel.mts`, the horse re-read from the server's farm), tie up
at a hitching rail (`decor.prop.hitching-rail`; Market has three, Cove one).
Doors and gates are worked from the horse's head (`riderReach`). Presence
poses carry `mount` (client + bridge `sanitizeMount`) and visitors sit a rider
in the saddle (`mountSeat`, `sit_chair_idle_a`).

**Windrush Downs (R3–R4).** `/farm/downs/` through the Market's west gate
(`MARKET_DOWNS_GATE`, riders only). Pure: `downs-terrain.mts` (the
heightfield), `downs-scene.mts` (everything that stands there),
`downs-course.mts` (courses, runs, local bests), `farm-ride-profile.mts`,
`farm-riding-skill.mts` (perks, XP, training). Drawn by `downs-world.mts` and
`downs-props.mts`; the page is `farm-downs-page.mts` with `downs-hud`,
`downs-map`, `downs-board`. A finished run goes to `POST
/games/farm/riding/runs` (`db/farm-riding.mts`), which rides it again with
`downs-replay.mts` from the server's own ride profile and pays only a run that
lands on the claimed time and faults.

**Races and bets (R5–R6).** API: `services/farm-race-policy.mts` (limits,
pot/pool maths, HMAC ticket/seat/result), `db/farm-races.mts`, migration 059
(`farm_races`, `farm_race_ledger`), routes in `routes/farm-riding-routes.mts`.
Race room: `factory-network-server/games/farm-downs/` (self-owning bridge,
60 Hz on `downs-race.mts`, signed result). Client: `downs-race-session.mts`
(socket + exact prediction) and `downs-racing.mts` (race board, booth, glue).
Racers see only their race (`visibleMembers`); the result is settled by any
rider handing the signed result to `/races/:id/settle`.

**The riding set is mirrored.** `tools/mirror-riding-sim.mjs` copies eleven
pure files byte for byte to `platform-api/src/riding-sim/` and
`factory-network-server/games/farm-downs/mirror/`; tests in all three places
hold it. **Any change to those files: `npm run build:browser && node
tools/mirror-riding-sim.mjs`, rebuild the API, commit both repos.**

**Verified:** unit tests on every rule, an end-to-end two-horse race through
the real bridge, the API's post→bet→start→settle and refund flows on a fake
pool, headless browser runs of mounting on the farm, arriving mounted in the
Market, opening the west gate from the saddle into the Downs, galloping,
turning and jumping there. **Not verified:** a live race between two people
across the deployed servers; the race/booth panels by eye.
