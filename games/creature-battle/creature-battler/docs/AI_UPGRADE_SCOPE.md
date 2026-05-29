# AI Upgrade Scope — Training Mode AI Overhaul
## Creature Battle

**Status**: All 4 chunks complete (2026-05-29).
**File**: `scripts/battle-ai.js` — all AI logic lives here, no other files touched.
**Depends on**: `battle-engine.js` exports (`hasStatus`, `getElementModifier`, `getMoveData`, `getEffectiveSpeed`, `SLOT_NAMES`)

---

## Why This Exists

The original AI (`selectAiCommands` / `buildAiAction`) was written before the element system,
skills/passives, and status effects were fully implemented. It only knew how to:
- Pick the highest `basePower` affordable damage move
- Target the lowest-HP enemy
- Self-heal or ally-heal below 50%
- Honour challenge taunt

It was completely blind to elements (would happily fire same-element moves that *heal* the target),
status effects (never inflicted debuffs, never accounted for being silenced), and the entire
skills command. This upgrade series addresses that in four chunks.

---

## Chunk 1 — Element-Aware Move + Target Scoring ✅ DONE

### What was added
Three internal helpers replace the old `sort by basePower` logic:

**`_scoreMoveVsTarget(move, target)`**
Returns `basePower * elementModifier`. If `getElementModifier` returns `'absorb'` (same-element
move would heal the target) the score is `basePower * -1.5` — a heavy negative so the AI
actively avoids self-sabotage, not just ignores it.

**`_scoreMoveVsSide(move, side)`**
For `all_enemies` moves: sums `_scoreMoveVsTarget` across every alive target on the side.
Absorb penalties still apply per-target so AoE moves into a team with the same element score poorly.

**`_pickBestDamageAction(creature, targetSide)`**
Iterates every affordable damage move × every alive target slot (or the full side for AoE moves)
and returns `{ bestMove, bestTargetSlot, bestScore }`. `bestTargetSlot` is `null` for AoE —
callers must not override it with a specific slot. The engine's AoE fan-out handles `null` correctly.

**`_pickBestMoveVsTarget(creature, target)`**
Used only in the challenge-taunt path where the target is locked. Reduces to a per-move score
comparison against the fixed target.

### Key design decisions
- `ELEMENT_SUB` (the 1.25×/0.75× partial matchups) is handled automatically because the scoring
  calls `getElementModifier` which already includes that table.
- AoE absorb: individual targets that absorb subtract from the AoE score rather than zeroing it,
  so mixed-element teams don't make AoE moves look worthless.
- `bestScore` is returned from `_pickBestDamageAction` so chunk 2 can use it as the baseline for
  the status move comparison.

---

## Chunk 2 — Status-Aware Move Selection ✅ DONE

### What was added

**Silence guard**
Both the self-heal and ally-heal paths are wrapped in `if (!silenced)`. A silenced creature
falls straight through to damage moves. Previously it would queue an art the engine would silently
skip — not a crash, but a wasted turn.

**`_STATUS_VALUES` constant**
```js
const _STATUS_VALUES = { stun: 42, silence: 34, poison: 36, burn: 30, blind: 24, slow: 18 };
```
Flat estimated value for each status on the same rough scale as `basePower * elementMod` scores.
Calibrated so status moves beat typical neutral-element hits but lose to super-effective damage —
the AI won't waste a stun on a target it could one-shot with a 1.5× hit.

**`_scoreStatusMove(move)`**
`STATUS_VALUE[id] * (move.accuracy / 100)` — accuracy-weighted so an 88%-accurate poison is
worth less than a 100%-accurate stun in the comparison.

**`_pickStatusTarget(statusId, targetSide)`**
Per-status targeting heuristic. Never returns a slot that already carries the status (no stacking):
- `poison` / `burn` → lowest HP% (DoT becomes lethal faster)
- `stun` → highest `max(STR, INT)` (neutralise biggest offensive threat)
- `blind` → highest STR (only hurts physical attackers)
- `slow` → highest SPD
- `silence` → prefers targets that have at least one art/utility move equipped

**`_pickStatusAction(creature, targetSide, bestDmgScore)`**
Evaluates all affordable single-target hostile utility moves with `applyStatus`. Only picks one
if its score is **strictly greater than** `bestDmgScore` — so damage always wins on a tie.

**`_pickAoeStatusAction(creature, targetSide, bestDmgScore)`**
Handles `all_enemies` utility moves (e.g. Clod's Dust Cloud). Only fires if ≥ 2 targets are
missing the status (no point casting Dust Cloud if only one target isn't already blind).
Score = `STATUS_VALUE[id] * freshTargetCount * (accuracy / 100)`.

### Decision order in `buildAiAction`
1. Challenge taunt override (unchanged)
2. Self-heal if < 50% HP (skip if silenced)
3. Ally-heal most-hurt teammate < 50% HP (skip if silenced)
4. Compute `_pickBestDamageAction` → establishes `dmgScore` baseline
5. If not silenced: check AoE status move; then check single-target status move
6. Fall through to best damage move; fallback to `basic_attack`

---

## Chunk 3 — Skills Integration ✅ DONE

### Goal
Make the AI use the SKILL command, not just ATTACK and ART.

### Design plan

The skills system lives in `skill-registry.js`. Relevant functions:
- `canUseSkill(skill, actor, { bs, actorSide })` — full affordability + once-per-battle guards
- `getClassSkill(id)` — looks up a skill definition by id
- `creature.classSkills` — array of skill definitions the creature has learned

The AI action for a skill is:
```js
{ commandType: 'skill', moveId: skill.id, targetSide, targetSlot, speed }
```

### Skill categories to handle

**Damage skills** — skills with `damageClass: 'physical'` or `'magic'` and a `basePower`.
Score them with the existing `_scoreMoveVsTarget` / `_scoreMoveVsSide` logic. They should
compete directly against damage moves. Many damage skills have higher effective power than
creature moves, especially finishers and AoE sweeps.

**Self-buff skills** — skills with `targeting: 'self'` and `damageClass: 'utility'` (e.g.
Temper, War Stance, Blaze Stance). Use at round 1 or when HP is above 60% (setup phase).
Don't use if target has a passive that punishes buffs (out of scope for now).

**Finisher skills** — skills with once-per-battle conditions (e.g. `heroic_surge`, `stand_firm`,
`iron_fortress`, `castlebreaker`). Use under correct conditions (`canUseSkill` already guards
the mechanical gates; AI just needs to recognise "this is a good moment").

**Reactive/setup skills** — `brace`, `challenge`, `courage_strike` wind-up, `total_defense`,
`counter_stance`, `aegis_shield`. These need situational heuristics.

### Suggested implementation approach

1. Collect all skills the creature can use right now: `creature.classSkills.filter(s => canUseSkill(s, creature, { bs, actorSide: 'opponent' }))`
2. Split into damage-skills and utility-skills buckets
3. Score damage skills with existing scoring helpers — let them compete with moves head-to-head
4. For utility skills: priority-gate approach (similar to chunk 2 status moves):
   - Self-buff: use at round 1 or if HP > 60% and buff not already at max stage
   - Finishers: use when HP < 30% or specific flag conditions are met
   - Brace/Counter Stance: use if outnumbered or if opponent has strong physical moves
   - Challenge: use on the highest-damage player creature
   - Aegis Shield / Total Defense: use when HP < 35%

### What NOT to do in chunk 3
- Don't implement per-skill-id hardcoded logic for all 50+ skills. Group by category/behaviour.
- Don't touch `skill-registry.js` — the AI calls `executeRegisteredSkill` indirectly through
  `resolveAction`; it just needs to produce a valid `{ commandType: 'skill', moveId }` action.
- Don't break the online sync — skill actions go through the same `sortActions` / `playbackStep`
  path as all other actions; no special handling needed.

---

## Chunk 4 — Passive + Class Awareness ✅ DONE

### Goal
Light polish pass. The AI uses its passive inventory to tune thresholds and behaviour.

### Design plan

**Offensive passives** — if the creature has `war_stance` equipped and hasn't used it,
the self-buff utility skill path (chunk 3) already handles it. No extra work.

**Survival passives** — if creature has `indestructible` or `resilient`, lower the panic
heal threshold from 50% to 35% (it can survive lower).

**Finisher passives** — if `defiant` is equipped (damage buff below 30% HP), do NOT flee
to healing at low HP — stay aggressive.

**`castlebreaker` awareness** — if opponent has a DEF-stacked creature, castlebreaker
should score higher. Check target's DEF stage modifiers.

**Don't-challenge-Defiant** — if using the Challenge skill, avoid targeting a creature
that has the `defiant` passive (the damage-reflection payback is risky).

### Implementation note
Passive checks read from `creature.equippedPassives` (array of `{ id, ... }` objects).
Helper: `creature.equippedPassives?.some(p => p.id === 'passive_id')`.

---

## Files changed so far

| File | Change |
|------|--------|
| `scripts/battle-ai.js` | Full rewrite — chunks 1 + 2 complete |
| `scripts/battle-engine.js` | `applyEndOfRoundStatuses` now includes `side` in tick results (poison KO fix); utility `all_enemies` AoE branch added |
| `scripts/battle-round.js` | `endRound` credits poison/burn KOs to battle stats |

## Bugs fixed in the same session (not AI-related)

- **Dust Cloud AoE bug**: `all_enemies` utility moves (status-applying) were falling through to
  the single-target path in `resolveAction`, hitting only `action.targetSlot`. Added explicit
  `all_enemies` branch inside the `damageClass === 'utility'` block in `battle-engine.js`.
- **Poison KO not counted on results screen**: `applyEndOfRoundStatuses` didn't know which side
  each creature was on (used `getAllCreatures` which flattens both sides). Fixed by iterating
  with explicit `['player', 'opponent']` loop and including `side` in each tick result.
  `endRound` now credits the KO to the opposing side's `battleStats.kos`.
