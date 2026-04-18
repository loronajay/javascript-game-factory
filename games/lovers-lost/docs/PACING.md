# Lovers Lost — Pacing Design

---

## Run Structure

- Fixed distance — predictable but not rigid
- Target run time: ~45 seconds for two decent runners
- Current locked run distance: ~5400 units
- Base / floor speed: 5
- Run is divided into **waves** (phases), each with a fixed obstacle count and one speed boost
- Difficulty ramps up as the run progresses

---

## Warmup Sequence

The run opens with a fixed tutorial sequence before wave 1 begins:

1. Jump obstacle
2. Crouch obstacle
3. Attack obstacle (single-phase goblin)
4. Block obstacle (arrow wall)

Obstacles are spread out with generous spacing. Purpose: teach all 4 inputs to new players immediately without punishing them.

---

## Wave Structure

- Each wave contains a fixed number of obstacles
- Each wave contains **1 speed boost**
- Current obstacle counts: 10 + 15 + 20 + 25 + 30
- Current run structure: 5 waves, plus a 4-obstacle warmup
- Difficulty increases wave over wave through denser spacing and pacing pressure, not wider/narrower timing grades
- Current generator priority is **feasibility first**: obstacle spacing can expand when needed to preserve a possible completion path

---

## Obstacle Distribution

Current build note: the live generator is currently emitting single-phase goblins only while the collision/tuning pass is active.

When the two-phase version returns, it should be treated as one long fairness footprint:
- fireball resolve space first
- goblin resolve space second
- enough total padding that the chained sequence never overlaps neighboring obstacles into an impossible block-then-attack requirement

- All 4 obstacle types appear throughout
- **Single-phase goblin**: as common as spikes, birds, arrow walls
- **Two-phase goblin** (Block → Attack): less common, treated as a harder variant
- Repeats are allowed but capped — no long chains of the same type
- Current repeat cap: 3
- Adjacent obstacle pairs are now checked for feasibility before placement
- Mixed-action pairs must resolve in sequence rather than overlap into impossible input demands
- Repeated spikes must be either chain-jump close or fully reset far apart

---

## Speed Boosts

Current build note: the boost design is still documented here, but the browser gameplay loop is not spawning live boosts yet.

- 1 boost per wave, placed at a fixed position within the wave
- Occasional extra boost for players whose speed has dropped significantly (struggle runner threshold TBD)
- **Boosts are elevated** — player must jump to collect them
- The boost window overlaps with a nearby obstacle window — player must manage both simultaneously
- This makes recovery an active, risky decision rather than a freebie

---

## Adaptive Difficulty

- If a player is performing well (high speed, high Perfect rate), the execution window between obstacles shortens
- Creates a skill ceiling and keeps competitive players challenged
- Timing grade windows stay fixed; spacing and pressure are what change
- Current target trigger for the fast-runner pressure tier is projected finish around ~54s

---

## Feel / Rhythm

- Hybrid: flow is somewhat predictable (wave structure, warmup) but still reactionary
- Competitive players are rewarded for reading ahead and chaining Perfects
- Spikes should feel readable but still physical: the jump must visibly clear the spike hitbox, and the score grade only decides whether that clean clear was Perfect or Good
- Adaptive difficulty ensures good runs stay challenging

---

## Open / TBD

- [ ] Struggle runner threshold for extra boost
- [ ] Adaptive difficulty trigger threshold (speed vs. expected progress ratio)
- [ ] Recover density intelligently after the new feasibility guardrails are in place
