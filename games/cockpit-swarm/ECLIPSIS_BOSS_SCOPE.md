# Boss 03: ECLIPSIS — The Final Sovereign

**Appears after:** Stage 15 (VOIDWATCH)
**Boss number:** 3

---

## Concept

ECLIPSIS is the source of everything the player has faced. It doesn't look like the swarm — it looks like what made the swarm.

Its visual identity is a fusion of three layers that are revealed progressively as the fight strips them away:

- **Geometric crystalline shell** — angular panels, dark and iridescent, almost architectural
- **Biological-mechanical hybrid core** — organic tissue threaded with glowing circuit-like veins, hard exoskeleton plating over soft mass
- **A single enormous eye** at the center — the constant through-line across all five phases; it changes color as the creature evolves

The key design constraint: each phase should feel like the same creature deepening, not a new creature appearing. The shell cracking is not a costume change — it's a reveal.

---

## Visual Identity Per Phase

| Phase | What's visible | Eye color |
|-------|---------------|-----------|
| 1 | Crystalline shell mostly closed. Angular geometric panels are the primary silhouette. Glimpses of something behind them. | Cold blue |
| 2 | Shell cracking and partially shed. Mechanical plating and glowing veins visible through the gaps. Eye half-open. | Amber |
| 3 | More shell gone. Organic tendrils emerge. The biological-mechanical hybrid is clearly visible now. Eye fully open. | Deep orange |
| 4 | Exoskeleton drops further. Organic mass dominates. Circuit veins pulse brightly. Crystal fragments still orbit. | Burning purple |
| 5 | Full form. All three layers visible simultaneously — crystalline remnants, organic body, mechanical implants. Eye is white, almost blinding. | White-hot |

The central eye should always be visible and always readable as the thing the player is looking at. It tracks the player's position. It pulses during vulnerable windows.

---

## State Machine

```
intro (2400ms) → phase 1 → transition (1400ms) → phase 2 → transition
               → phase 3 → transition → phase 4 → transition → phase 5 → defeat (2800ms)
```

Each phase transition: shell-crack visual, screen flash, roar sound. ECLIPSIS grows slightly larger (or closer in Z) with each transition — by phase 5 it fills more of the screen than either previous boss.

Defeat: all attacks stop, eye dims, the body strobes and collapses inward with chained explosions over ~2.8s.

---

## Core Mechanics

Four unique attack mechanics, each introduced in a dedicated phase and combined in phase 5. **No attack is unavoidable — every mechanic has a clear tell and a guaranteed safe option.**

---

### Mechanic A — Sweeping Beam

A thick beam fires from the eye and traverses all 5 lanes in one direction (left-to-right or right-to-left), then stops. The beam moves at a steady readable pace. There is always a gap at the trailing edge — the player stands behind the sweep to avoid it.

- Telegraph: eye charges up, the beam's starting side glows, a direction cue signals sweep direction
- Safe option: move to the trailing side before the beam reaches you, then ride behind it
- On hit: standard damage
- Damage window: brief window after the sweep completes while the eye cools down
- Phase 5 twist: beam can reverse direction mid-sweep (sweeps left, pauses, sweeps back right) — player has to reverse their dodge

Avoidability: always has a trailing-edge gap. Sweep speed must never outrun the player's max movement speed.

---

### Mechanic B — Reflective Phase

ECLIPSIS briefly enters an immune state. During this window, player shots that hit the body bounce back as slow enemy bullets aimed at the player's current lane.

- Telegraph: body dims to near-black, eye pulses red, distinct sound cue — unmistakable signal to stop shooting
- Safe option: simply stop firing during the window
- Duration: ~2 seconds
- After the window: body flashes back to normal, ECLIPSIS is briefly vulnerable (damage window opens)
- Reflected bullets: standard enemy bullets — same lane-hit logic, same dodge options

Avoidability: 100% avoidable by not shooting. Cue must be impossible to miss.

---

### Mechanic C — Gravity Tether

ECLIPSIS fires a slow-moving projectile at the player's lane. If it reaches close range without being shot down, it attaches and applies gravitational drag toward a marked target lane for ~3 seconds.

- The drag does NOT freeze movement — the player can still move, they're fighting the pull
- The tether projectile can be shot down before it lands (counts as a hit on ECLIPSIS)
- If it lands: movement toward the target lane is assisted, movement away is resisted; player must work against the pull to reach safe positioning for follow-up attacks
- Follow-up attacks during the tether window are lane-based with clear telegraphs — a player fighting the drag can still reach safety

Avoidability: shoot the projectile down, or fight the drag with movement input. Never a guaranteed hit.

---

### Mechanic D — Zone Denial Shot

A large slow projectile fires from one of the crystal panels. When it detonates at close range, it releases a wide burst covering 3 consecutive lanes. 2 lanes are always outside the burst zone.

- Telegraph: the firing panel glows visibly; the projectile is large and clearly colored; the approximate detonation zone is indicated before arrival
- Safe option: the 2 safe lanes are always reachable if the player starts moving on the telegraph
- Detonation timing: generous enough that the player can cross from one edge to the other if they move immediately
- On hit: standard damage

Avoidability: 2 lanes always safe; telegraph must fire early enough for a full-lane cross.

---

## Phase Breakdown

### Phase 1 — Shell (hits: ~15)

**Introduction phase.** The player is learning what ECLIPSIS is.

- Primary attack: basic directional shots from crystal panel ports — readable, lane-telegraphed
- Mechanic introduced: **Sweeping Beam** — one sweep per cycle, slow enough to feel almost tutorial-pace here
- Damage window: briefly after each beam sweep completes; crystal panels are the hit targets (not the eye yet)
- Feel: imposing, deliberate; the boss is sizing the player up

---

### Phase 2 — Crack (hits: ~18)

Shell visibly fractures. Mechanical plating and glowing veins show through the gaps.

- Primary attack: directional shots continue, slightly faster cadence
- Mechanic introduced: **Reflective Phase** — cycles in between beam sweeps
- Sweeping beam continues, now slightly faster
- Damage window: after reflective phase ends, eye opens briefly (first time the eye is a hit target)
- Feel: the rhythm shifts — the player now reads "shoot" and "don't shoot" windows

---

### Phase 3 — Emerge (hits: ~20)

Tendrils visible. The biological-mechanical hybrid is clearly exposed.

- Primary attack: directional shots plus the tether projectile starts appearing between major mechanics
- Mechanic introduced: **Gravity Tether** — fired once per cycle, telegraphed clearly
- Sweeping beam and reflective phase continue
- Damage window: tether projectile shot down counts as a hit; eye exposed after sweep and after reflective phase
- Feel: movement becomes a resource — the player is managing their position more actively

---

### Phase 4 — Core (hits: ~24)

Exoskeleton mostly gone. The creature is rawer, more exposed.

- Primary attack: directional shots accelerate; zone denial shots begin appearing
- Mechanic introduced: **Zone Denial Shot** — 1–2 per cycle
- All previous mechanics continue
- Damage window: briefly after zone denial detonates; eye also exposed after beam sweeps
- Feel: the arena starts feeling crowded — multiple threat types active simultaneously

---

### Phase 5 — Revelation (hits: ~30)

Full form. All three visual layers visible. Eye white-hot.

- All four mechanics active at elevated cadence
- Sweeping beam can now reverse mid-sweep
- Zone denial frequency increases; tether fires more aggressively
- Reflective phase windows are shorter but the telegraph remains just as clear
- Directional shots fill every gap between mechanics
- Damage window: eye exposed more frequently but for shorter durations
- Feel: everything the player has learned gets tested at once — readable, fair, demanding

---

## Design Constraints

- **No unavoidable attacks.** Every mechanic has a guaranteed safe response. Reflective phase: stop shooting. Sweeping beam: stay behind the sweep. Tether: shoot it down or fight the drag. Zone denial: move to a safe lane on the telegraph.
- **ECLIPSIS should feel like a revelation, not a gauntlet.** The difficulty comes from reading multiple systems simultaneously, not from any single mechanic being cheap.
- **The eye is the constant.** Whatever else changes visually, the eye always communicates state — charging, vulnerable, immune, cooling down.

---

## Implementation Notes (for fresh chat)

**Boss number:** 3. Hook into `startBossEncounter(game, 3)` and `updateBoss` / `tryDamageBossInShotLane` in `systems/boss.mjs`. Update `TOTAL_BOSSES` from 2 to 3 in `constants.mjs`.

**Existing patterns to reuse:**
- Phase state machine structure → match Dreadmaw or Arbiter pattern in `systems/boss.mjs`
- Sweeping beam render → closest reference is Arbiter laser + overseer laser in `render/boss-scene.mjs` and `render/scene.mjs`
- Reflected bullets → push into `game.enemyBullets` with standard shape targeting player's current lane
- Tether projectile → custom bullet on `game.enemyBullets` with `isTether: true` flag; resolve landing in bullet update loop
- Zone denial shot → large slow bullet; on detonation, check player lane against the 3 covered lanes and apply damage if inside
- Gravity drag during tether → `game.player.tetherTimer` + `game.player.tetherTargetX`; apply as a resistive force in `updatePlayer` opposing movement away from `tetherTargetX`

**New state on `game.player`:**
- `tetherTimer: 0` — counts down while tether active
- `tetherTargetX: 0` — the lane being pulled toward

**New constants block:** Add `ECLIPSIS_TUNING` to `constants.mjs` with per-phase hit counts, beam sweep speed, tether drag force, tether duration, zone denial detonation lane count, reflective phase duration, and cadence timings per phase.

**Entity factory:** `makeBoss(3)` in `entities/boss.mjs`. Boss object needs: `phase`, `sub`, `timer`, `hp[]` (5 entries), `shellCrack` (0–1, used for render layering), `eyeColor` (set per phase), and per-mechanic state sub-objects for `beam`, `reflectPhase`, `tether`, and `zoneDenial`.

**Rendering:** New `renderEclipsis(ctx, game, t)` in `boss-scene.mjs`. Build in layers: crystal shell panels (fade as shellCrack increases) → organic mass (fades in) → mechanical plating elements → tendrils → central eye. Eye color interpolates per phase from the table above.
