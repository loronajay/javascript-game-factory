# Lovers Lost — Game Design Document

## Concept

A split-screen endless runner where two lovers run toward each other from opposite sides of the screen. The player(s) must navigate obstacles using the right response. When both reach the finish line before the clock expires, the divider disappears and the lovers reunite.

---

## Screen Layout

- Screen is split vertically down the middle
- **Left side:** Boy runs right →
- **Right side:** Girl runs left ←
- A visible divider separates the two sides during gameplay
- On reunion: divider animates away, characters meet in the center and hug

---

## Controls

| Input  | Action | Defeats obstacle type         |
|--------|--------|-------------------------------|
| Up     | Jump   | Spikes                        |
| Toward | Attack | Goblin                        |
| Away   | Block  | Arrow wall / Goblin pre-attack |
| Down   | Crouch | Bird *(pending sprites)*      |

- **Single player:** Left side = WASD, Right side = Arrow keys
- **Local co-op:** Each player controls one side
- **Online co-op:** Each player controls one side, over network

---

## Obstacles

4 types, each requiring a specific response. Wrong response or no response = hit.

| Obstacle    | Visual                        | Required response          | Notes                                          |
|-------------|-------------------------------|----------------------------|------------------------------------------------|
| Spikes      | Ground spikes                 | Jump                       |                                                |
| Bird        | Low-flying bird               | Crouch                     | Pending crouch sprites                         |
| Arrow wall  | 3 arrows stacked vertically   | Block                      |                                                |
| Goblin      | Goblin character              | Attack — or Block → Attack | Two-phase if goblin winds up; see below        |

### Goblin mechanic

The goblin is the only obstacle that can require two inputs:

- **Goblin squares up** → player must Attack. Blocking is a miss.
- **Goblin winds up an arrow** → player must Block first, then Attack. Attacking the arrow or blocking the charge are both misses.
- Windup speed varies to prevent pattern memorization.
- Both phases must be cleared correctly; failing either = hit.

### Obstacle spawning

- Procedurally generated per run — types and timing windows are randomized
- Fixed quantity per run — every run has the same total number of obstacles and speed boosts
- Ensures leaderboard scores are comparable across runs

---

## Timing Grades

Two grades only. Timing window exact values TBD (implementation detail).

| Grade   | Window          | Effect                        |
|---------|-----------------|-------------------------------|
| Perfect | Near frame-perfect, tight but achievable for casual players | Full score + bonus multiplier |
| Good    | Any other clean clear | Base score |
| Miss    | Wrong input or no input | Score decrement + speed penalty |

- Perfect is the skill ceiling — competitive players optimize for Perfect chains
- Good keeps casual players in the game

---

## Speed System

- Both characters run at a **base speed**, measured as distance covered per frame
  - Example: speed 5 = 1 distance/frame, speed 10 = 2 distance/frame
- The finish line is at a **fixed distance coordinate**
- A **shared clock deadline** defines the latest arrival time — a perfect run arrives with time to spare, a hit run cuts it closer
- **~5 hits without recovery** = speed too low to reach the finish before the clock expires

### Speed boosts

- Always present on the track (fixed quantity per run, like obstacles)
- Available to all players regardless of current speed
- **Diminishing returns:** boost value is inversely proportional to current speed
  - Player near max speed → small boost
  - Player who has taken hits → large boost
- Functions as both a comeback mechanic and a parameter on a perfect run
- Recovery curve algorithm (linear vs exponential) — TBD

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

| Mode          | Players | Notes                                   |
|---------------|---------|-----------------------------------------|
| Single player | 1       | Controls both sides (WASD + Arrow keys) |
| Local co-op   | 2       | Each player controls one side           |
| Online co-op  | 2       | Each player controls one side, via WebSocket server |

### Online mode

Uses the existing **Factory Network server** (Railway, WebSocket + Express):
- Matchmaking: `find_match` with `gameId: "lovers-lost"`
- Private rooms: `create_room` / `join_room` with room code
- In-game sync: `room_message` for state updates
- Max 2 players per room (already enforced server-side)

---

## End Sequence

1. Both characters reach the finish
2. Divider animates away
3. Characters walk toward each other and hug
4. Score screen: per-side breakdown + combined total
5. Option to replay or return to menu

---

## Open Questions

- [ ] Exact timing grade windows (ms values for Perfect vs Good)
- [ ] Recovery curve algorithm — linear vs exponential
- [ ] Crouch obstacle + sprites (pending assets)
- [ ] Pacing — obstacle density, speed boost distribution, difficulty curve over the run
- [ ] Leaderboards + team leaderboards (post-launch)
