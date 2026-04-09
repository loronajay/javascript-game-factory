# Lovers Lost — Game Design Document

## Concept

A split-screen endless runner where two lovers run toward each other from opposite sides of the screen. The player(s) must navigate obstacles using the right response. When both reach the finish line before the clock expires, the divider disappears and the lovers reunite.

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
| Down   | Crouch | Bird *(pending sprites)*       |

- **Single player:** Left side = WASD, Right side = Arrow keys
- **Local co-op:** Each player controls one side
- **Online co-op:** Each player controls one side, over network

---

## Obstacles

4 types, each requiring a specific response. Wrong response or no response = hit.

| Obstacle   | Visual                      | Required response           | Notes                                   |
|------------|-----------------------------|-----------------------------|-----------------------------------------|
| Spikes     | Ground spikes               | Jump                        |                                         |
| Bird       | Low-flying bird             | Crouch                      | Pending crouch sprites                  |
| Arrow wall | 3 arrows stacked vertically | Block                       |                                         |
| Goblin     | Goblin character            | Attack — or Block → Attack  | Two-phase if goblin winds up; see below |

### Goblin mechanic

The goblin is the only obstacle that can require two inputs:

- **Goblin squares up** → player must Attack. Blocking is a miss.
- **Goblin winds up an arrow** → player must Block first, then Attack. Attacking the arrow or blocking the charge are both misses.
- Windup speed varies to prevent pattern memorization.
- Both phases must be cleared correctly; failing either = hit.
- The **warmup goblin** is always single-phase (squares up only) — the two-phase variant is never the player's first goblin.

### Obstacle spawning

- Procedurally generated per run — types and input intervals are randomized
- Fixed quantity per run — every run has the same total number of obstacles and speed boosts
- Ensures leaderboard scores are comparable across runs
- **Repeat cap:** max 3 consecutive obstacles of the same type

---

## Timing Grades

| Grade   | Window   | Speed effect                        | Score effect       |
|---------|----------|-------------------------------------|--------------------|
| Perfect | 1 frame  | +3 speed × chain multiplier         | +300 × chain multiplier |
| Good    | 4 frames | +1 speed (chain break penalty first) | +100              |
| Miss    | none     | 15% speed penalty (chain break first, floor: 5) | -150  |

- Perfect and Good windows are **fixed** — they never change with adaptive difficulty
- The **interval between required inputs** is what compresses/expands (see Adaptive Difficulty)
- Two-phase goblin: Perfect window applies to the **Attack phase only**. The Block phase has no Perfect opportunity — this prevents RNG from influencing Perfect chains

---

## Speed System

Distance is measured in abstract units. **1 unit = 1 frame at base speed.**

- **Base speed:** 5 → 1 distance/frame
- **Minimum speed:** 5 (floor) — hits at this speed cost score only, no speed loss
- **No speed cap** — player skill determines how fast a run can go
- **Run distance:** ~5400 units (derived so floor player fails at the 90s hard cutoff)
- **Hard cutoff:** 90 seconds — players who have not reached the finish line fail

### Speed-to-distance curve

```
dist_per_frame = (speed / 5) ^ 0.2
```

| Speed | dist/frame |
|-------|------------|
| 5     | 1.00       |
| 10    | 1.15       |
| 20    | 1.32       |
| 50    | 1.59       |

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

### Archetype benchmarks (validated, D ≈ 5400)

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

### Warmup sequence (pre-wave 1)

Fixed tutorial sequence with generous spacing:
1. Spikes (Jump)
2. Bird (Crouch)
3. Single-phase goblin (Attack)
4. Arrow wall (Block)

Purpose: teach all 4 inputs before the first scored wave begins.

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

Uses the existing **Factory Network server** (Railway, WebSocket + Express):
- Matchmaking: `find_match` with `gameId: "lovers-lost"`
- Private rooms: `create_room` / `join_room` with room code
- In-game sync: `room_message` for state updates
- Max 2 players per room (already enforced server-side)

---

## Backgrounds

Each side of the screen has its own distinct world with a unique visual theme. As both runners approach the finish line, the two backgrounds begin to converge — the worlds bleed into each other toward the center. The dividing bar fades out as the backgrounds unify, so that by the time the characters meet in the middle for their hug, the screen is a single unified scene. The reunion moment is earned visually, not just mechanically.

---

## End Sequence

1. Both characters approach the finish — backgrounds begin converging, divider fades
2. Characters meet in the center and hug in the unified scene
3. Score screen: per-side breakdown + combined total
4. Option to replay or return to menu

---

## Open Questions

- [ ] Leaderboards + team leaderboards (post-launch)
