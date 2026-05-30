# Cockpit Swarm — Boss Scope (Boss 01)

Scope-only design doc. No code written yet. Grounds the first boss in the existing
architecture (`STATE` router, `project()`, stage flow, telegraph/pending-shot pattern,
fixed-timestep dt normalization).

---

## 1. Run-structure change

Today the campaign **ends** after stage 5 (`STAGE_CLEAR` → `CLEAR` when
`hasNextStage` is false). We are changing that assumption.

- **New rule**: a boss encounter triggers after **every 5th stage clear**. Boss 01
  appears after stage 5.
- The run no longer "stops" at 5 stages. After a boss is defeated the run is meant to
  continue into the next 5-stage block (scaled stages, to be authored later).
- **For this scope**: we only build **Boss 01** and its 3 phases. Because stage 6+ does
  not exist yet, defeating Boss 01 routes to the existing `CLEAR` victory screen
  (re-themed as a boss-kill). Wiring "continue to next block" is deferred and called out
  in §10.

### Trigger flow
```
stage 5 cleared  →  STAGE_CLEAR (existing pause)  →  STATE.BOSS (intro)  →  fight
STATE.BOSS  →  boss defeated  →  CLEAR  (victory, for now)
STATE.BOSS  →  player health 0  →  GAME_OVER  (reuses damagePlayer path)
```

`updateStageClear` currently does: if `hasNextStage` load next, else `→ CLEAR`. We add a
check: if the cleared stage index is the last of a 5-stage block, go to `STATE.BOSS`
instead of `CLEAR`.

---

## 2. State machine integration

Add a dedicated **`STATE.BOSS`**. A dedicated state (vs. reusing `PLAYING` with a flag)
keeps the boss out of the formation/wave-behavior/row-advance pipeline cleanly — none of
`updateEnemies`, `updateWaveBehavior`, `checkRowAndEndState` should run during the boss.

`updateGame` router gains a branch:
```
if (game.state === STATE.BOSS) {
  if (game.hitFreeze > 0) { game.hitFreeze -= dt; return; }
  updatePlayer(game, input, dt);     // strafing/dodging reused as-is
  updatePowerups(game, dt);          // existing powerup timers keep ticking
  updateBoss(game, input, dt, t);    // NEW — all boss logic
  updatePlayerFire(game, input);     // gains a boss-targeting branch (§7)
  updateParticles(game, dt);
  return;
}
```

**Menu/flash invariant** (per CLAUDE.md): the boss owns `game.shake`,
`player.hurtFlash`, `player.muzzleFlash` like normal play; on boss defeat → CLEAR we
already zero those in the CLEAR transition. Confirm `goToMenu` still clears them if the
player ESCs out mid-boss.

---

## 3. Boss visual identity

A single large creature centered on the rail, living **far away on the perspective grid**
and reusing `project()` so it sits in the same world the waves occupy.

- **Body**: large rounded/organic hull centered at world `x ≈ 0`, anchored high (near the
  horizon) at a **far z** so the existing depth scaling makes it read as massive-but-distant.
  Its on-screen size comes from a big `bossBaseSize`, not from being close.
- **Mouth**: central maw lined with **sharp teeth**; opens for the laser phase and is the
  phase-2/3 weak point.
- **Eyes**: glowing; shift color per phase (calm → hot) as a readability cue.
- **Two arms**: segmented claw/tentacle limbs anchored at left/right "shoulders". At rest
  they hover **near the body** (far z). On attack a limb **stretches toward the player**,
  its hand growing huge as its z drops toward the player (reusing the same near=big,
  far=small depth feel as bullets/enemies).
- **Weak spots**: one glowing node per hand; armored/dim by default, exposed/bright only
  during a lunge's approach window (§5).

Rendering lives in a new `render/boss-scene.mjs` (keeps `scene.mjs` from ballooning, per
the repo's "extract before a file owns multiple layers" guardrail). Draw order inside the
shake transform, after grid/stars, before the cockpit:
```
renderBoss(body → teeth/mouth → eyes → arms → weak spots → laser/indicators → charge fx)
```
HUD (boss health bar + phase label) renders after the cockpit with reset coords, like the
existing HUD.

---

## 4. Health & phase model

One boss, **3 phases**, each phase damageable **only** through that phase's mechanic.

- Boss health bar is drawn as **3 segments** (one per phase) so the player reads progress.
- Each phase has its own hit pool. Damage from any source (normal shot, splash, rapid)
  counts only when it lands on the **currently-valid target** for the active phase.
- Phase advances when the current segment hits 0 → short **stagger/transition** beat
  (~1.2s: arms retract, eyes flare, screen shake, boss roars) → next phase.

Proposed pools (tuning, §9):

| Phase | Damageable target | Hits to clear (no powerups) |
|------:|-------------------|:---------------------------:|
| 1 | hand weak spots (during lunge) | 6 |
| 2 | mouth (post-laser window) | 5 |
| 3 | hand weak spots **and** mouth | 8 |

Splash/rapid powerups naturally shorten phases — acceptable and rewarding.

---

## 5. Phase 1 — Arms

Boss body is **invulnerable**. Damage only by hitting an exposed hand weak spot mid-lunge.

### Per-arm state machine
```
idle → telegraph → lunge → retract → idle
```
- **idle**: hand hovers near the boss (far z), weak spot armored (dim, not hittable).
- **telegraph**: hand **blinks** for `telegraphMs` (~850ms) — the "about to attack" tell.
  Picks a target rail lane (snaps toward, or leads, the player's current x).
- **lunge**: hand stretches toward the player down the chosen lane, z dropping fast over
  `lungeMs` (~520ms), growing huge. During the approach the **weak spot becomes exposed**
  (bright, pulsing, hittable) for that window.
  - If the player is still in the hand's lane at impact (z reaches the player plane,
    lane-distance ≤ `handHitWindow`) → contact damage via existing `damagePlayer`.
  - The player's window: stay in-lane long enough to shoot the weak spot, then strafe out
    before impact. Risk/reward.
- **retract**: hand pulls back to idle over `retractMs`, weak spot re-armors.

### Cadence / difficulty
- Arms alternate; a rising chance for **both** arms to telegraph together as the phase
  wears on (forces a real dodge decision).
- Lunge cadence ~1600ms between attacks. Knobs: `telegraphMs`, `lungeMs`,
  weak-spot vulnerable window, `handHitWindow`, both-arms chance.

### Damage in
Hitting an exposed weak spot (player fire aligned to the hand's lane within
`weakSpotHitWindow`) deducts from the phase-1 pool, plays a hit flash + spark, and on a
clean approach can stagger that arm early.

---

## 6. Phase 2 — Laser

Arms retracted/inactive. The **mouth** opens and runs a charge→fire→expose cycle.

### Cycle
```
closed → charging → locked → firing → vulnerable → closed (repeat)
```
- **charging** (`chargeMs` ~1500ms): mouth glows, charge particles gather. A **tracking
  indicator** (thin beam-preview line / ground reticle on the rail) **follows the player's
  x** in real time. A **light countdown** cue (shrinking ring / tick pips) shows when the
  shot lands — telegraphed but understated, per the design ask.
- **locked** (`lockMs` ~320ms): tracking **stops** — the aim snaps to its last position
  and the preview turns solid/hot. This is the player's cue to clear the lane.
- **firing** (`fireMs` ~600ms): full beam fires down the locked lane. If the player is in
  the beam's lane band → `damagePlayer`. (Beam is a lane band, dodge by strafing out.)
- **vulnerable** (`mouthVulnerableMs` ~1100ms): laser ends, mouth hangs open and exposed.
  Player shoots the **mouth** (player near center, shot aligned to mouth x) to damage the
  phase-2 pool. Then mouth closes and the cycle repeats.

### Damage in
Only during the **vulnerable** window, only on the mouth. Misses just whiff.

---

## 7. Phase 3 — Combined

Runs **both** systems concurrently with relaxed individual cadence so it stays fair:
- Arms lunge on a slower cadence (~2000ms) — weak spots are damageable as in phase 1.
- Laser cycle on a slower cadence (~3000ms) — mouth window damageable as in phase 2.
- Both damage routes feed the single phase-3 pool. Both threats can coexist (e.g., a hand
  lunges while the mouth charges), so the player chooses targets under pressure.
- On phase-3 pool → 0: **defeat sequence** (multi-blast death, `system-shutdown.wav`,
  long shake, white-out) → `CLEAR`.

---

## 8. Player interaction & fire routing

The player keeps the existing kit: strafe on the rail, fire up the center, dodge by
moving out of danger lanes. The change is **what a shot can hit** during `STATE.BOSS`.

`updatePlayerFire` gains a boss branch that replaces enemy targeting with, in priority:
1. Any **exposed hand weak spot** whose projected lane aligns with `player.x` within
   `weakSpotHitWindow` (phases 1 & 3).
2. The **mouth** when its vulnerable window is open and the shot aligns to mouth x
   (phases 2 & 3).
3. Otherwise the shot whiffs (armor spark feedback, small combo penalty as today).

Powerups still apply: rapid fire helps the tight weak-spot windows; splash can clip a
weak spot near the boss center; a held-shot is strong in the mouth window. (No powerup
*drops* during the boss — there are no chaff kills. See §10 for an optional phase-heal.)

Contact damage (hand impact, laser hit) reuses `damagePlayer` → existing hurtFlash,
shake, hitFreeze, combo reset, and the health/GAME_OVER path. No new death code.

---

## 9. Data model & tuning

### `game.boss` slice (created on entering `STATE.BOSS`)
```
boss: {
  number: 1,
  phase: 1,                 // 1..3
  sub: 'intro'|'fighting'|'transition'|'defeat',
  timer: 0,                 // intro/transition/defeat beats
  hp: [p1Hits, p2Hits, p3Hits],   // remaining per-phase pool
  bodyZ, bodyY, bob,        // body anchor + idle bob
  eyeHeat,                  // 0..1 visual escalation
  arms: [
    { side: -1|+1, state, timer, laneX, z, exposed:false } ,
    { side, state, timer, laneX, z, exposed:false }
  ],
  mouth: { state, timer, targetX, lockedX, exposed:false },
  hitFlashBody, shake
}
```

### `BOSS_TUNING` (constants.mjs) — starting values
```
introMs: 2200
transitionMs: 1200
defeatMs: 2600

phase1: { hits: 6, telegraphMs: 850, lungeMs: 520, retractMs: 600,
          cadenceMs: 1600, handHitWindow: 50, weakSpotHitWindow: 46,
          bothArmsChanceStart: 0.0, bothArmsChanceEnd: 0.5 }

phase2: { hits: 5, chargeMs: 1500, lockMs: 320, fireMs: 600,
          mouthVulnerableMs: 1100, beamLaneWidth: 70, mouthHitWindow: 54 }

phase3: { hits: 8, armCadenceMs: 2000, laserCadenceMs: 3000 }   // reuses p1/p2 timings
```
All timers tick on `dt` and decays use the `Math.pow(k, dt/16.666)` idiom already in use.

---

## 10. Open decisions (recommended defaults baked in above)

1. **Fight length** — defaults 6/5/8 hits (~90–120s). Easy to retune once it's playable.
2. **Post-boss routing** — default: route to `CLEAR` (victory). Building the scaled
   "next 5-stage block" loop is deferred.
3. **Healing during boss** — default: no powerup drops. Optional: grant +1 hull on each
   phase transition (off by default; flip on if the fight feels too punishing).
4. **Enrage/soft-fail timer** — none in v1 (consistent with the game's no-timer feel).

These are defaults, not locks — easy to flip during balancing.

---

## 11. Module / file plan

| File | Change |
|------|--------|
| `core/constants.mjs` | add `STATE.BOSS`, `BOSS_TUNING`, boss HUD layout |
| `core/state.mjs` | (boss slice created on demand in boss init; no always-on cost) |
| `entities/boss.mjs` | **new** — `makeBoss(number)`, arm/mouth factories, weak-spot & arm projection helpers, pure hit-resolution helpers |
| `systems/boss.mjs` | **new** — `updateBoss()`, arm state machine, laser cycle, phase transitions, `tryDamageBossInShotLane()`, contact-damage resolution |
| `systems/game.mjs` | route `STATE.BOSS`; trigger from `updateStageClear`; boss branch in `updatePlayerFire`; defeat → `CLEAR` |
| `render/boss-scene.mjs` | **new** — `renderBoss()` + `renderBossHud()` (3-seg health bar, phase label, charge/lock indicators) |
| `render/scene.mjs` | call `renderBoss` for `STATE.BOSS` in `renderGame` |
| `js/tests/` | boss logic tests (per repo TDD convention) |

---

## 12. Build order (implementation phases)

1. **Scaffold** — `STATE.BOSS`, boss slice, trigger after stage 5, static boss render,
   intro beat, auto-route to `CLEAR` after a timer (plumbing only, boss inert).
2. **Phase 1** — arm state machine, telegraph blink, lunge + weak-spot expose, weak-spot
   damage in, contact damage out, 3-segment HUD.
3. **Phase 2** — mouth charge/track/lock/fire, light countdown cue, post-laser mouth
   window + damage in.
4. **Phase 3** — run both systems on relaxed cadence; balance pass.
5. **Audio + polish** — wire boss sounds (§13), defeat sequence, shake/flash tuning.
6. **Tests** — phase transitions, hit gating, lock timing, lane resolution.

---

## 13. Audio (reuse existing `assets/`)

| Event | File |
|-------|------|
| Boss ambient drone | `enemy-idle.wav` |
| Arm telegraph / laser charge warning | `enemy-bomb-incoming.wav` |
| Laser fire | `big-laser.wav` / `big-beam.wav` |
| Weak-spot / mouth hit | `enemy-shot.wav` or `explosion.wav` |
| Player takes contact/beam | `player-hurt.wav` (via `damagePlayer`) |
| Boss defeat finisher | `explosion.wav` + `system-shutdown.wav` |

---

## 14. Testing notes

Extract pure helpers so they're unit-testable without canvas:
- phase transition on pool depletion (1→2→3→defeat)
- weak-spot hit only counts while `exposed` and lane-aligned
- mouth hit only counts during `vulnerable`
- laser lock freezes `targetX` at `lockedX` after `lockMs`
- contact/beam resolves `damagePlayer` only when player lane-distance ≤ window at impact
```
```

Open questions before we build are in §10 — the big one is fight length (6/5/8 hits) and
whether defeating Boss 01 just shows the victory screen for now. Everything else has a
sensible default.
