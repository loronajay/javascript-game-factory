# Lovers Lost — Game Design Document

## Concept

A split-screen endless runner where two lovers run toward each other from opposite sides of the screen. The player(s) must navigate obstacles using the right response. When both reach the finish line before the clock expires, the divider disappears and the lovers reunite.

---

## Current Status

- Development is currently following an **obstacle-by-obstacle validation** pass.
- Collision work now follows one hard rule: **visible hurtboxes and hitboxes must match the visible sprite shapes on screen**.
- The local/browser build now uses a **viewport-first presentation** where the gameplay canvas dominates the page instead of sitting inside a large cabinet header shell.
- The menu and help flow are now part of the active polished build:
  - menu uses a full-screen space splash
  - help screen shows 4 obstacle demo cards plus explicit action labels (`JUMP`, `CROUCH`, `BLOCK`, `ATTACK`)
- Finished runners now snap to a grounded neutral pose while waiting for the other side to finish.
- Post-run summaries now show the total run time to the millisecond so close clears can still be compared.
- Debug collision mode is available for local testing:
  - Press `F3` during gameplay to toggle debug mode
  - Open the game with `?debug=1` to start with debug mode enabled
  - Practice filters are available with `?debugObstacle=spikes|birds|arrows|goblins`
  - Debug overlay shows the current timing grade for the front obstacle (`perfect` / `good` / `miss` / `n/a`)
- Debug colors:
  - **Cyan** = player hurtbox
  - **Yellow / orange** = obstacle hitbox
  - **Green** = shield hitbox / shield contact / obstacle perfect window
  - **Magenta** = sword hitbox / sword contact
  - **Red** = actual body overlap/contact

### Obstacle validation status

| Obstacle   | Status | Current note |
|------------|--------|--------------|
| Spikes     | Locked for now | Spikes still use visible overlap for hits and clean pass logic for clears; jump timing now decides Perfect vs Good on a clean clear instead of replacing hitbox resolution. |
| Bird       | Locked for now | Bird resolution is now based on visible body-vs-bird overlap only: touch = miss, fully duck under and pass = clear. |
| Arrow wall | Locked for now | Arrow walls now resolve from visible arrow hitboxes against the visible shield hitbox or player hurtbox. |
| Goblin     | Locked for now | Single-phase goblins and phase-1 goblins now resolve from visible sword-vs-goblin or body-vs-goblin contact. |

---

## Screen Layout

- Screen is split vertically down the middle (even split)
- **Left side:** Boy runs right →
- **Right side:** Girl runs left ←
- Supports fullscreen and browser view
- A visible divider separates the two sides during gameplay
- On reunion: divider animates away, characters meet in the center and hug

---

## Controls

| Input  | Action | Defeats obstacle type          |
|--------|--------|--------------------------------|
| Up     | Jump   | Spikes                         |
| Toward | Attack | Goblin                         |
| Away   | Block  | Arrow wall / Goblin pre-attack |
| Down   | Crouch | Bird                           |

- **Single player:** Left side = WASD, Right side = Arrow keys
- **Local co-op:** Each player controls one side
- **Online co-op:** Each player controls one side, over network

---

## Obstacles

4 types, each requiring a specific response. Wrong response or no response = hit.

| Obstacle   | Visual                      | Required response           | Notes                                   |
|------------|-----------------------------|-----------------------------|-----------------------------------------|
| Spikes     | Ground spikes               | Jump                        | Visible overlap decides hit vs clear; clean clears now grade Perfect or Good from jump timing |
| Bird       | Low-flying bird             | Crouch                      | Collision pass completed for current build |
| Arrow wall | 3 arrows stacked vertically | Block                       | Shield-vs-arrow contact now drives resolution |
| Goblin     | Goblin character            | Attack — or Block → Attack  | Sword-vs-goblin and body-vs-goblin contact now drive the attack phase |

Current build note: two-phase goblins remain part of the design, but the procedural generator currently keeps `twoPhase = false` during the validation/tuning pass. Live random runs are single-phase goblins only for now.

### Goblin mechanic

The goblin is the only obstacle that can require two inputs:

- **Goblin squares up** → player must Attack. Blocking is a miss.
- **Goblin winds up an arrow** → player must Block first, then Attack. Attacking the arrow or blocking the charge are both misses.
- Windup speed varies to prevent pattern memorization.
- In the two-phase version, the obstacle is a chained package made of **two separate clears**:
  - **Phase 1: fireball** â†’ cleared by visible shield-vs-fireball contact
  - **Phase 2: goblin** â†’ cleared by visible sword-vs-goblin contact
- Both phases behave like the rest of the obstacle set: visible hitboxes determine the outcome, and each phase may award its own **Perfect**, **Good**, or **Hit** result.
- The player must physically resolve the fireball first, then physically resolve the goblin second.
- Failing either phase = hit for that phase; clearing phase 1 does not auto-clear phase 2.
- The **warmup goblin** is always single-phase (squares up only) — the two-phase variant is never the player's first goblin.

### Obstacle spawning

- Procedurally generated per run — types and input intervals are randomized
- Fixed quantity per run — every run has the same total number of obstacles and speed boosts
- Ensures leaderboard scores are comparable across runs
- **Repeat cap:** max 3 consecutive obstacles of the same type

- Generation is now **feasibility-aware**: adjacent obstacles must be clearable with the live movement and input rules before they can be emitted
- Mixed-action pairs must be spaced so the first obstacle can resolve before the next one demands a different input
- Repeated spikes must be either close enough for a same-jump chain or far enough apart for a full land-and-rejump reset
- Two-phase goblins must reserve enough total padding for the full **fireball â†’ goblin** sequence so there are no impossible overlaps before, during, or after the chained obstacle

---

## Timing Grades

| Grade   | Window   | Speed effect                        | Score effect       |
|---------|----------|-------------------------------------|--------------------|
| Perfect | 1 frame  | +3 speed × chain multiplier         | +300 × chain multiplier |
| Good    | 4 frames | +1 speed (chain break penalty first) | +100              |
| Miss    | none     | 15% speed penalty (chain break first, floor: 5) | -150  |

- Perfect and Good windows are **fixed** — they never change with adaptive difficulty
- The **interval between required inputs** is what compresses/expands (see Adaptive Difficulty)
- Two-phase goblin: both the fireball phase and the goblin phase can award **Perfect** if their own collision/timing windows are hit cleanly
- Two-phase goblin: Perfect window applies to the **Attack phase only**. The Block phase has no Perfect opportunity — this prevents RNG from influencing Perfect chains

- Spikes stay **hitbox-first**: visible overlap with the spikes is always a miss, while a clean pass is scored as **Perfect** or **Good** from the jump-start timing

---

## Speed System

Distance is measured in abstract units.

- **Starting speed:** 10 → 1.0 distance/frame (run begins here)
- **Floor speed:** 5 → ~0.707 distance/frame — punishment minimum; floor players cannot reach the finish in 90s
- **No speed cap** — player skill determines how fast a run can go
- **Run distance:** ~5400 units
- **Hard cutoff:** 90 seconds — players who have not reached the finish line fail

### Speed-to-distance curve

```
dist_per_frame = sqrt(speed / 10)
```

| Speed | dist/frame |
|-------|------------|
| 5     | ~0.707     |
| 10    | 1.000      |
| 20    | ~1.414     |
| 50    | ~2.236     |

### Gaining speed

- Clear with **Perfect** → `+3 × speed_multiplier`
- Clear with **Good** → +1 speed (chain break penalty applied first)

### Losing speed

- **Good or Miss** → chain break penalty first: `chain_length × 2.0` speed lost (floor: 5)
- **Miss** → additional 15% of current speed lost after break penalty (floor: 5)
- At speed 5 (floor) → no speed loss from either penalty, score decremented only

### Chain multipliers

Applied per Perfect clear, scaling with consecutive chain length and obstacles faced:

```
speed_multiplier = 1 + sqrt(chain) × 0.25 × (obstacles_faced / 104)
score_multiplier = 1 + chain × 0.06 × (obstacles_faced / 104)
```

- Chain resets to 0 on any Good or Miss
- Chain break penalty fires before the Good/Miss speed adjustment

### Archetype benchmarks (⚠️ invalidated — re-run `dev/archetype-model.js` after sqrt curve change)

| Archetype   | Perfects | Goods | Misses | Finish  | Score  |
|-------------|----------|-------|--------|---------|--------|
| Perfect     | 104      | 0     | 0      | 45.6s ✓ | 97,030 |
| Competitive | 90       | 14    | 0      | 54.4s ✓ | 31,311 |
| Average     | 31       | 63    | 10     | ~61s ✓  | 14,377 |
| Casual      | 11       | 73    | 20     | ~68s ✓  | 7,695  |
| Struggle    | 0        | 70    | 34     | ~77s ✓  | 1,900  |
| Floor       | 0        | 0     | 104    | FAIL ✗  | 0      |

### Speed boosts

- 1 boost per wave, positioned within the wave
- **Boosts are elevated** — player must jump to collect them
- The boost window overlaps with a nearby obstacle — player manages both simultaneously
- Recovery is an active, risky decision, not a freebie
- **Diminishing returns** — inversely proportional to current speed:
  - At high speed → ~+1 speed
  - At floor speed (5) → ~+5 speed

Current build note: boosts are still part of the design target, but the browser gameplay loop is not spawning live boosts yet.

### Struggle assist

Activates when a runner's projected finish time ≥ 90s (estimated fail).

- **Boost magnitude:** flat +60% of current speed per opportunity
- **Opportunities:** 3 per trigger window
- **Deactivation:** projected time drops below 90s OR all 3 opportunities exhausted (first-met)
- No window widening — assist is speed only, nothing structural changes
- A runner who plays well during the assist window will exit it naturally; a runner who continues to struggle gets a lifeline but not a guaranteed win

### Adaptive difficulty

- As a player's speed pulls ahead of expected progress, the **interval between required inputs compresses**
- This applies to: spacing between obstacles in a wave, and the gap between goblin phases
- Perfect/Good frame windows themselves are never affected
- **Two tiers:**
  - Tier 1 (tuning): activates when projected finish time ≈ competitive archetype (~54s)
  - Tier 2 (assist): activates when projected finish time ≥ 90s — see Struggle assist above

---

## Wave Structure

- **5 waves** per run, targeting ~45 second average for two decent runners
- **100 total obstacles** (10 + 15 + 20 + 25 + 30), averaging ~40 distance units between obstacles
- **Wave 1:** 10 obstacles + 1 speed boost
- Each subsequent wave: +5 obstacles (wave 2 = 15, wave 3 = 20, wave 4 = 25, wave 5 = 30)
- Advanced runners receive additional obstacles proportional to their speed vs. expected progress
- Difficulty increases wave over wave: faster approach speeds, more two-phase goblins, compressed intervals
- Current generator preference is **fairness over density**: if spacing must expand to keep a sequence possible, the possible sequence wins

Current build note: live waves already use the fixed obstacle counts and feasibility checks, but they are not yet spawning the per-wave boost layer and they currently keep goblins single-phase.

### Warmup sequence (pre-wave 1)

Fixed tutorial sequence with generous spacing:
1. Spikes (Jump)
2. Bird (Crouch)
3. Single-phase goblin (Attack)
4. Arrow wall (Block)

Purpose: teach all 4 inputs before the first scored wave begins.

---

## Collision Rules

- Collision decisions should be made from the **same geometry shown in debug mode**, not from separate guessed logic.
- A miss should only happen when the visible hurtbox and visible obstacle hitbox actually overlap.
- A clear should only happen when the obstacle is fully passed without that overlap occurring.
- Do not use hidden timing-window logic to replace on-screen contact resolution.
- Spikes are a hybrid case: hit vs clear still comes from visible overlap/pass logic, but the score grade for a clean clear comes from jump timing.
- Spikes, birds, arrow walls, and goblin attack phases now follow this rule in the live build.
- Arrow walls use visible **shield vs arrow** contact before falling back to body contact.
- Goblin attack phases use visible **sword vs goblin** contact before falling back to body contact.
- Two-phase goblin fireballs should follow the same rule as other collision obstacles: no raw-input auto-clear, only visible shield/body collision resolution.

---

## Scoring

- Score tracked **per side** independently
- Cleared obstacle → score awarded, modified by timing grade
- Hit → score decremented
- A side's score is only counted if that side successfully reaches the finish
- On reunion, both sides' scores are totaled and displayed

---

## Win / Lose Conditions

- **Win:** Both sides reach the finish before the clock expires → reunion, full score awarded
- **Partial:** One side makes it, the other doesn't → no reunion, losing side's score forfeit
- **Lose:** Neither side makes it

---

## Modes

| Mode          | Players | Notes                                               |
|---------------|---------|-----------------------------------------------------|
| Single player | 1       | Controls both sides (WASD + Arrow keys)             |
| Local co-op   | 2       | Each player controls one side                       |
| Online co-op  | 2       | Each player controls one side, via WebSocket server |

### Online mode

Uses the existing **Factory Network server** (Railway, WebSocket + Express).

#### Player flow

```
menu → ONLINE MULTIPLAYER
  └─ online_side_select  (Boy / Girl)
       └─ online_lobby
            ├─ FIND MATCH → "Searching…" + Cancel  (public queue)
            └─ PLAY WITH FRIEND
                 ├─ CREATE ROOM → show code, wait for partner
                 └─ ENTER CODE → join friend's room, wait for partner
                      └─ playing (online) → reunion / partial_finish / game_over → score_screen → menu
```

#### Matchmaking rules

- Players queue by side — boys queue separately from girls.
- Public match (`find_match`): server pairs the front of the Boy queue with the front of the Girl queue. Multiple players of the same side can be waiting simultaneously; each waits their turn. A Cancel button returns to the menu at any point.
- Side is **never auto-switched** — a Boy who queues always plays Boy.
- Friend match (`create_room` / `join_room`): one player creates a room and shares the code out-of-band; the other enters it. If the joining player picks a side already occupied in that room, they receive an error and return to side-select.

#### Clock and obstacle sync

- Server sends a `match_start` message containing a shared **seed** and a **server timestamp**.
- Both clients generate identical obstacle waves from the shared seed (seeded RNG in `obstacles.js` replaces `Math.random()`). No obstacle data is transmitted during the run.
- Both clients compute elapsed time as `Date.now() - serverStartTime`. The server records authoritative run duration (`match_end − match_start`) for leaderboard submission — neither client self-reports run time.

#### In-game sync

- Each client sends its own player actions (`jump` / `crouch` / `attack` / `block`) to the server the moment they fire; server relays them to the other client.
- Remote actions are injected via `inp.injectAction(remoteSide, action)` in `online.js` — no raw WebSocket calls outside that file.
- Only the local player's physical keys are read; the remote side's controls are disabled for the local player.

#### Disconnect handling

- If the remote player disconnects mid-run, the local player is sent immediately to the partial finish screen with a note: "Your partner disconnected."
- No pausing or waiting — the run ends for the remaining player as a partial result.

#### Server message types used

| Message | Direction | Purpose |
|---|---|---|
| `find_match` | Client → Server | Enter public side queue |
| `create_room` | Client → Server | Open a private room |
| `join_room` | Client → Server | Join a friend's room by code |
| `match_start` (seed + timestamp) | Server → both clients | Begin the run |
| `room_message` (action) | Client → Server → other client | Relay player actions |
| `room_message` (disconnect) | Server → remaining client | Notify of partner drop |

---

## Backgrounds

Each side of the screen has its own distinct world with a unique visual theme. As both runners approach the finish line, the two backgrounds begin to converge — the worlds bleed into each other toward the center. The dividing bar fades out as the backgrounds unify, so that by the time the characters meet in the middle for their hug, the screen is a single unified scene. The reunion moment is earned visually, not just mechanically.

---

## End Sequence

1. Both characters approach the finish — backgrounds begin converging, divider fades
2. Characters meet in the center and hug in the unified scene
3. Score screen: per-side breakdown + combined total + final run time
4. Option to replay or return to menu

---

## Open Questions

- [ ] Leaderboards + team leaderboards (post-launch)
