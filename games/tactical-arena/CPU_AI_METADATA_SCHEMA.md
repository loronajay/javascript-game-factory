# Tactical Arena — CPU AI Metadata Schema (draft)

Status: **design draft**, drafted against the as-built roster (Swordsman, Archer,
Mystic, Magician, Paladin, Necromancer, Sniper + summoned Ghoul). No code yet.

## Why this exists

The CPU follows Mini-Tactics' pattern: a pure `src/ai/` package (`evaluate.js`,
`plans.js`, `cpuController.js`) that plans against **expected values**, never rolls
a die, and emits commands through the **same reducer** a human's clicks do. Mini-
Tactics could hardcode its AI because it had 4 fixed archetypes and 4 verbs. Tactical
Arena's whole identity is a **data-driven `arts` system**, so a hardcoded
`switch (artId)` in the AI would mean every new unit silently breaks/limits the CPU
until someone remembers to hand-edit `plans.js` + `evaluate.js`.

This schema moves that knowledge **onto the art/unit data** so plan generation and
EV scoring are shape-driven. The authoring guide then gets one mandatory step —
"declare the art's `ai` block" — and CPU support becomes structural, not an
afterthought.

**Design rule: derive first, declare only what can't be inferred.** Most of what
the AI needs is already in the art data (`targeting.shape`, `effect.type`,
`damage`/`damageType`, `mpCost`, `rageLocked`, `bonusActionGroup`, `selfCast`).
The `ai` block adds the one categorical field that can't be reliably inferred
(`intent`) plus a few tuning knobs. Status/MP/role *values* live in shared tables in
`evaluate.js`, keyed off existing fields — they are **not** re-declared per art.

---

## 1. The intent taxonomy (covers 100% of current arts)

`ai.intent` is the single required field. It selects both the **plan family** (which
rules helper enumerates candidates + how the plan projects onto the board) and the
**EV recipe**. Every current active art maps cleanly:

| intent        | plan enumerator (rules/)                         | EV recipe (evaluate.js)                                   | current arts |
|---------------|-------------------------------------------------|----------------------------------------------------------|--------------|
| `strike`      | enemies in `attackRange` (LOS-culled if physical via `isShotBlocked`) | `resolvePhysicalStrike`/magic EV + optional rider value (status/heal from `effect`) | *basic attack*, moonstrike, mage-killer, life-sap, poison-arrow, leg-shot, spark, banish, wither |
| `statusCast`  | enemies in `attackRange` (no LOS cull — casts reach through bodies) | status value only (no damage)                            | silence, smoke-bomb |
| `coneAoe`     | `getVolleyShotAimOptions` → 4 dirs, `getVolleyShotCells` | Σ true-damage EV over enemies in the chosen cone         | volley-shot |
| `selfBlast`   | none — cast in place (`selfCast`)               | Σ magic-damage EV over enemies in `targeting.radius`; gated by `evHints.minTargets` | nuke, dark-bomb |
| `healAllies`  | none — cast in place (`selfAura`/`globalAllies`)| Σ expected effective heal (no overheal) over allies in range; +bonus for threatened/key allies | pray, wish |
| `tilePulse`   | none — cast in place (bonus action)             | Σ true-damage over enemies on matching affinity tiles (`getTilePulseTargets`) | lightseeker, darkseeker |
| `reposition`  | `getLegalFleeTiles`                             | threat reduction at destination (`incomingThreat` delta) | flee |
| `rush`        | `getFootworkSteps`/`validateFootworkPath` (bounded path search) | Σ true-damage to enemies passed through + reposition value of the end tile | footwork |
| `summon`      | `getSummonPlacementTiles`                       | summoned piece's own `ai.threatValue` + aura/zone value at the chosen tile | summon-ghoul |
| `placeObject` | `getWallPlacementTiles` / `getFirePlacementTiles` | `evHints.zoneValue` shaped by `evHints.placeNear` (LOS block for wall, DoT for fire) | build-cover, throw-cigar |
| `defend`      | none — implicit brace                           | threat-reduction at current tile (defend halves incoming) | *implicit, every unit* |

Notes:
- **Basic attack and Defend are not arts** — they're implicit primaries the planner
  always considers (intent `strike` / `defend`), exactly as Mini-Tactics did.
- **`strike` is physical OR magic** — already distinguished by `damageType`. The
  planner LOS-culls physical strikes (`isShotBlocked`) and lets magic reach through;
  the EV uses the right resolver. No new field.
- **Riders are read from `effect`** — `effect.type` ∈ {`status`, `heal`} on a
  `strike` art adds the rider's value (gated by the art's `chance`, since attacking
  ARTs roll a second time for the rider). No per-art rider declaration needed.
- **Bonus actions** (`bonusActionGroup` present) don't spend the activation, so the
  planner offers them *in addition* to a primary. Inferred from the existing field;
  `ai.tags: ["bonus"]` is documentation only.

---

## 2. Art-level `ai` block

```js
ai: Object.freeze({
  intent: "strike",          // REQUIRED — see taxonomy. The only must-author field.

  // OPTIONAL — all default sensibly from intent + existing art fields:
  targetClass: "enemy",      // enemy | ally | self | tile | emptyTile | direction | path
                             //   default inferred from intent; declare only to be explicit
  priority: 1.0,             // tie-break / soft nudge vs sibling arts. Keep near 1.0.
  tags: [],                  // behavioral hints: "finisher" | "control" | "escape" |
                             //   "zone" | "setup" | "amplifiesAllies" | "bonus" | "rageOnly"
                             //   (rageOnly/bonus are inferable; list for readability)

  evHints: {                 // per-intent tuning the engine genuinely can't infer:
    minTargets: 2,           //   selfBlast/coneAoe: don't spend the MP unless it hits
                             //     this many enemies OR the shot is lethal
    zoneValue: 6,            //   placeObject: base tactical worth of the placed object
    placeNear: "enemy",      //   placeObject/summon: "enemy" | "threatenedAlly" |
                             //     "chokepoint" | "self" — steers tile choice
    purpose: "escape",       //   reposition: "escape" (threat-min) | "reposition" (advance)
  }
})
```

Defaults by intent (so a minimal `ai: { intent: "..." }` already works):

| intent       | targetClass | default evHints                               |
|--------------|-------------|-----------------------------------------------|
| strike       | enemy       | —                                             |
| statusCast   | enemy       | —                                             |
| coneAoe      | direction   | `minTargets: 2`                               |
| selfBlast    | self        | `minTargets: 2` (override per art)            |
| healAllies   | ally        | —                                             |
| tilePulse    | self        | — (bonus action; always offered free)         |
| reposition   | emptyTile   | `purpose: "escape"`                           |
| rush         | path        | —                                             |
| summon       | emptyTile   | `placeNear: "enemy"`                          |
| placeObject  | tile        | `zoneValue` REQUIRED, `placeNear` REQUIRED    |

---

## 3. Unit-level `ai` block

Replaces Mini-Tactics' hardcoded `UNIT_VALUE`/`isKeyUnit` tables — the unit
self-declares its worth so a new unit needs no edit to `evaluate.js`.

```js
ai: Object.freeze({
  threatValue: 12,    // tactical worth alive, before HP. Casters/healers/snipers high.
  role: "ranged",     // bruiser | skirmisher | ranged | caster | support | controller | summon
  protect: true,      // key unit: bias toward safety, allies prefer to screen it.
                      //   defaults true for support/caster, false otherwise.
})
```

`role` biases the difficulty weights (advance vs exposure): `bruiser`/`skirmisher`
push forward harder; `support`/`caster`/`ranged` weight exposure (crossfire
avoidance) higher; `summon` is excluded from activation scoring (it takes no turns)
and contributes only board-presence/aura value.

---

## 4. Shared tables in `evaluate.js` (NOT per-art)

These are keyed off existing fields so authors never re-declare them:

- **`STATUS_VALUE`** — base worth of landing each status, scaled contextually:
  - `blind` ≈ the target's expected damage for one turn (deny ~1 attack).
  - `silence` ≈ value of the target's best art, weighted up vs high-`maxMp`/`caster` targets.
  - `slow` ≈ fraction of mobility denied × turns (`durationTurns`).
  - `poison` ≈ `turnStartDamage` × expected remaining activations (DoT).
  - All multiplied by the art's `chance` (the rider's effect roll) and the target's
    immunity (`statusImmunities` → 0 if immune, so the CPU won't waste Silence on a
    Mystic or any status on a Paladin).
- **`MP_VALUE`** — value per MP point, so EV nets the `mpCost`. MP barely regens
  (Magic Pipe only), so spending is a real cost — this is what keeps the CPU from
  blowing 16 MP on a marginal Nuke.
- **Difficulty `WEIGHTS`** — ported from Mini-Tactics (`kill`, `killKey`, `damage`,
  `heal`, `defendBase`, `exposure`, `advance`) + new terms: `control` (status value),
  `zone` (placed-object/aura value), `summonValue`. Easy = softmax/blunder, Normal =
  greedy competent, Hard = stronger threat-avoidance + key-unit hunting/protecting.

---

## 5. What's derived vs. authored (authoring burden)

**Derived automatically (author writes nothing):** target enumeration, LOS rules,
damage EV, crit/miss probabilities, status duration/chance, rider value, immunity
gating, MP cost, rage/bonus/silence legality (all via `canUseArt` + existing fields).

**Authored per art:** just `ai.intent`, plus — only for `placeObject` —
`evHints.zoneValue` + `placeNear`, and — only where a default is wrong —
`evHints.minTargets`/`priority`/`tags`.

**Authored per unit:** `ai.threatValue` + `role` (one line each).

So a brand-new "deal damage + apply X" art needs literally `ai: { intent: "strike" }`
and nothing else, because the rider, LOS, and EV all fall out of fields it already
has. That is the property that lets the authoring guide stay short.

---

## 6. Drafted `ai` blocks for every current art

### Swordsman (`role: "bruiser"`, `threatValue: 10`, `protect: false`)
- *basic attack* → `{ intent: "strike" }` (implicit)
- **footwork** → `{ intent: "rush", tags: ["setup"] }`
- **moonstrike** → `{ intent: "strike", tags: ["control"] }` (rider: blind, read from `effect`)
- **mage-killer** → `{ intent: "strike", tags: ["control"] }` (rider: silence)
- **life-sap** → `{ intent: "strike", tags: ["sustain"] }` (rider: self-heal)

### Archer (`role: "ranged"`, `threatValue: 12`, `protect: true`)
- *basic attack* → `{ intent: "strike" }`
- **volley-shot** → `{ intent: "coneAoe", evHints: { minTargets: 2 } }`
- **poison-arrow** → `{ intent: "strike", tags: ["control"] }` (rider: poison DoT)
- **leg-shot** → `{ intent: "strike", tags: ["control"] }` (rider: slow)

### Mystic (`role: "support"`, `threatValue: 14`, `protect: true`)
- *basic attack* → `{ intent: "strike" }`
- **pray** → `{ intent: "healAllies" }` (radius 3, +3)
- **wish** → `{ intent: "healAllies" }` (global, +1)
- **silence** → `{ intent: "statusCast", tags: ["control"] }`

### Magician (`role: "caster"`, `threatValue: 13`, `protect: true`)
- *basic attack* → `{ intent: "strike" }`
- **spark** → `{ intent: "strike" }` (magic; LOS reach-through inferred from `damageType`)
- **flee** → `{ intent: "reposition", evHints: { purpose: "escape" }, tags: ["escape"] }`
- **banish** → `{ intent: "strike", tags: ["control"] }` (magic; rider: silence)
- **nuke** → `{ intent: "selfBlast", evHints: { minTargets: 2 }, tags: ["finisher", "rageOnly"] }`

### Paladin (`role: "bruiser"`, `threatValue: 12`, `protect: false`)
- *basic attack* → `{ intent: "strike" }`
- **lightseeker** → `{ intent: "tilePulse", tags: ["bonus"] }`
- **darkseeker** → `{ intent: "tilePulse", tags: ["bonus", "rageOnly"] }`

### Necromancer (`role: "controller"`, `threatValue: 13`, `protect: true`)
- *basic attack* → `{ intent: "strike" }`
- **wither** → `{ intent: "strike", tags: ["control"] }` (magic; rider: slow)
- **dark-bomb** → `{ intent: "selfBlast", evHints: { minTargets: 2 } }`
- **summon-ghoul** → `{ intent: "summon", evHints: { placeNear: "enemy" }, tags: ["zone"] }`

### Sniper (`role: "ranged"`, `threatValue: 13`, `protect: true`)
- *basic attack* → `{ intent: "strike" }` (pierce/flat/min folded by `resolvePhysicalStrike`, so EV is honest)
- **smoke-bomb** → `{ intent: "statusCast", tags: ["control"] }`
- **build-cover** → `{ intent: "placeObject", evHints: { zoneValue: 5, placeNear: "threatenedAlly" }, tags: ["zone", "setup"] }`
- **throw-cigar** → `{ intent: "placeObject", evHints: { zoneValue: 6, placeNear: "enemy" }, tags: ["zone"] }`

### Ghoul (summon-only) (`role: "summon"`, `threatValue: 5`, `protect: false`)
- no arts; `takesTurns` already excludes it from activation scoring. Its
  `threatValue` + carried `enemyAura` are what `summon-ghoul`'s EV reads.

---

## 7. Resolved decisions (2026-06-27)

1. **Rider value cap — RESOLVED.** Three universal rules: (a) a **lethal strike makes
   the rider worth 0** (target's dead, the status/heal adds nothing); (b) **status
   value is capped at `target.threatValue`** (disabling can never beat killing); (c)
   **poison uses a fixed horizon, not "permanent":**
   `turnStartDamage × min(3, target.hp_after_strike)`. Blind/silence/slow are already
   bounded by `durationTurns` under the same threatValue ceiling.
2. **`rush`/`placeObject` search bounds — RESOLVED.** They're different problems.
   **`rush` (footwork)** is the only exponential one → **greedy bounded candidate
   generation** (paths threading the most enemies + one toward / one away from the
   front, cap ~8 endpoints, validate each). **`placeObject`** is ≤~25-49 tiles at
   current sizes → **evaluate all legal placement tiles** with a cheap per-tile score
   (fire: occupant + adjacency; wall: breaks the highest-threat enemy→key-ally
   sightline). Add a cap constant only if boards grow.
3. **`zoneValue` units — RESOLVED.** One currency: same units as `threatValue`/HP,
   defined as "expected HP/damage swing the object creates." Keeps `WEIGHTS` legible.
4. **Unit/art `ai` defaults — RESOLVED (option C: normalize AND enforce).**
   `normalizeUnitAi()`/`normalizeArtAi()` in `unitCatalog.js` give safe runtime
   defaults (`intent: "strike"` for an active art missing `ai`; unit default
   `role: "skirmisher", threatValue: 10, protect: false`) so the planner never
   crashes — **and** `tests/ai-metadata.test.js` asserts every drafted unit + active
   art carries an *explicit* `ai` block, so a forgotten annotation fails the suite
   rather than silently degrading.
5. **Self-blast escape valuation — DROPPED.** Blast damage lands immediately on cast,
   so escape is irrelevant to its value; `minTargets` guards MP waste. Value-over-time
   (poison/fire) is handled by the fixed horizons in #1/#3. v1 stays strictly one-ply.
6. **Difficulty model — RESOLVED.** Port Mini-Tactics' three tiers verbatim (Easy =
   softmax/blunder, Normal = greedy competent, Hard = greedy + heavier
   threat-avoidance/key-unit weighting), extending the weight set with `control`
   (status value), `zone` (placed-object/aura value), and `summonValue`. No 4th tier.

---

## 8. Authoring-guide hook (the follow-up the user flagged)

Add a required step to `UNIT_AUTHORING_GUIDE.md`: **"Every active art declares an
`ai` block (`intent` + any `evHints`); every unit declares `ai.threatValue` + `role`.
If your art's shape isn't in the intent taxonomy, you're adding a new plan family —
extend `src/ai/plans.js` + `evaluate.js` and add the intent here first."** That last
clause is the guardrail: a genuinely novel mechanic still forces an explicit AI
decision instead of silently shipping a unit the CPU can't use.
```
