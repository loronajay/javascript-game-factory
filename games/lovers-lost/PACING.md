# Lovers Lost — Pacing Design

---

## Run Structure

- Fixed distance — predictable but not rigid
- Target run time: ~45 seconds for two decent runners
- Exact distance and base speed values TBD (derived from target run time)
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

- Each wave contains a fixed number of obstacles (e.g. Wave 1 = 10 obstacles)
- Each wave contains **1 speed boost**
- Exact obstacle count per wave and total wave count TBD
- Difficulty increases wave over wave: tighter windows, faster approach speeds, more two-phase goblins

---

## Obstacle Distribution

- All 4 obstacle types appear throughout
- **Single-phase goblin**: as common as spikes, birds, arrow walls
- **Two-phase goblin** (Block → Attack): less common, treated as a harder variant
- Repeats are allowed but capped — no long chains of the same type
- Exact repeat cap TBD

---

## Speed Boosts

- 1 boost per wave, placed at a fixed position within the wave
- Occasional extra boost for players whose speed has dropped significantly (struggle runner threshold TBD)
- **Boosts are elevated** — player must jump to collect them
- The boost window overlaps with a nearby obstacle window — player must manage both simultaneously
- This makes recovery an active, risky decision rather than a freebie

---

## Adaptive Difficulty

- If a player is performing well (high speed, high Perfect rate), the execution window between obstacles shortens
- Creates a skill ceiling and keeps competitive players challenged
- Exact trigger threshold TBD (e.g. X consecutive Perfects, or speed above Y% of max)

---

## Feel / Rhythm

- Hybrid: flow is somewhat predictable (wave structure, warmup) but still reactionary
- Competitive players are rewarded for reading ahead and chaining Perfects
- Adaptive difficulty ensures good runs stay challenging

---

## Open / TBD

- [ ] Exact run distance (back-calculate from 45s target once archetype models are run)
- [ ] Repeat cap (max same obstacle type in a row)
- [ ] Struggle runner threshold for extra boost
- [ ] Adaptive difficulty trigger threshold (speed vs. expected progress ratio)
