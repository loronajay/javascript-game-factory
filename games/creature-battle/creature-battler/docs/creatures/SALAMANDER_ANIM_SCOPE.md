# Salamander — Animation Identity Scope
## Creature Battle

**Status**: Scoped 2026-05-24. Implement after reading this and `ANIMATION_ENGINE_UPGRADE_SCOPE.md`.
**Engine state**: `particle_stream`, `shockwave`, `creature_tint`, `hit_stop` all implemented and ready.
**CSS state**: `anim-salamander.css` is complete — all cast poses and hit reactions already exist as detailed keyframe animations. No new CSS classes needed for Salamander.

---

## Salamander's Visual Identity

**Element**: Fire. **Role**: Magic Art pressure. **Damage class**: Magic.

Salamander is an elegant fire caster — precise, hot, quick. Not a brute. The fire feel should be sharp and controlled on basic moves, building to something genuinely dangerous at high tier. The cast poses in `anim-salamander.css` already express this well — the CSS has escalating scale+glow across the tiers. The animation timelines need to match that energy with atmospheric overlay effects.

**Palette**:
- Cast/charge embers: `#ff9900` (orange), `#ff7700` (deep orange)
- High-intensity: `#ff5500` (hot orange-red), `#ff3300` (deep red)
- Peak / magma: `#cc2200` (crimson)
- Ash/smoke: `#888888` / `#555555`
- Burn lingering: `#cc4400` (smoldering)

**New primitives to use across the set**:
- `particle_stream` at actor: embers rising during charge wind-ups
- `particle_stream` at target: lingering embers/smoke after status-applying hits
- `shockwave` at target: every fire projectile impact gets a ring
- `shockwave` at actor: AoE detonations get an outward ring from the caster
- `creature_tint` on actor: orange screen-blend during charge-ups
- `creature_tint` on target: multiply-blend orange/dark on fire hits and smoke
- `hit_stop`: heavy hits only (flare_bite, spark_flick_3, cinder_burst_2+, magma_surge)

**Timing rule for hit_stop**: fire `hit_stop` at impact frame. Fire visual effects (shockwave, creature_tint, particles) at `impact + hit_stop_duration` so they play in full after the freeze rather than spending part of their lifespan paused.

---

## Move-by-Move Scope

### `spark_flick` — Quick fire snap (Lv 1)
**What it is**: Light magic. Fast and cheap. The opener.
**Current**: Cast pose → cast aura → light projectile → fire-light hit + particles + flash. Already fine structurally.
**What it needs**: A brief burst of ember atmosphere before the shot, and a small impact ring — so even the basic move feels like fire, not just a colored circle.

**Changes**:
- `particle_stream` at actor: start at t=0, embers up, count:2, interval:75, color:'#ff9900', duration:120 — brief pre-shot shimmer
- `shockwave` at target on impact: small, size:28, color:'#ff8822', opacity:0.55, thickness:3

No creature_tint — this is a light quick move. Tints start at tier 2.

---

### `spark_flick_2` — Charged fire burst (Lv 28)
**What it is**: Heavier magic shot. More power, more MP. Visibly a step up from tier 1.
**Current**: Bigger cast class, heavier projectile. Same structure.
**What it needs**: Actor glows meaningfully during the cast. Impact ring is bigger.

**Changes**:
- `particle_stream` at actor: count:3, interval:70, color:'#ff8800', duration:140 — slightly richer pre-shot
- `creature_tint` on actor: `#ff8800`, screen blend, opacity:0.25, duration:250 — quick orange warmth
- `shockwave` at target: size:44, color:'#ff6600', opacity:0.65, thickness:3

---

### `spark_flick_3` — Full-force channeled blaze (Lv 50)
**What it is**: Heavy magic. The spark flick at full intensity. Should feel like channeling real fire.
**Current**: Biggest cast class (scale 1.13, strong glow), same structure underneath.
**What it needs**: The 510ms cast should feel alive with fire energy, not just a glowing sprite. The hit should be a real fire impact.

**Changes**:
- `particle_stream` at actor: count:4, interval:60, color:'#ff6600', duration:150, glow:true — hot embers for the full cast
- `creature_tint` on actor: `#ff5500`, screen blend, opacity:0.35, duration:300 — hot glow on actor
- `hit_stop` 60ms — this is a serious fire hit
- Fire visual effects (shockwave, tint) at impact + 60ms to play in full after freeze:
  - `shockwave` at target: size:65, color:'#ff4400', opacity:0.7, thickness:4
  - `creature_tint` on target: `#ff4400`, multiply blend, opacity:0.25, duration:360 — scorched by the hit

---

### `heat_haze` — Evasion self-buff (Lv 1)
**What it is**: Utility. Raises Evasion. Actor shimmers with heat distortion.
**Current**: Cast pose (shimmer scale pulse already in CSS), fire aura particles, field flash. Needs more presence.
**What it needs**: The creature itself should look like it's radiating heat. Warm tint + sustained embers make the "heat haze" read clearly.

**Changes**:
- `particle_stream` at actor: count:3, interval:80, color:'#ff9900', direction:'all', spread:38, duration:300 — heat radiating off creature
- `creature_tint` on actor: `#ff8800`, screen blend, opacity:0.28, duration:560 — warm heat glow for the whole move
- `status_ring` on actor: `#ffaa22`, duration:700 — evasion buff locked in

---

### `ember_trail` — Burn application (Lv 8)
**What it is**: Low damage + Burn status. The identity IS the aftermath, not the impact. The ember lingers; the burn follows.
**Current**: Slow projectile (good), burn particles rising after impact (good). Missing: lingering ember presence.
**What it needs**: After the hit, embers should continuously rise from the target for ~600ms — the target is smoldering. That's the visual proof the burn status landed.

**Changes**:
- After impact: `particle_stream` at target: direction:'up', count:2, interval:100, color:'#cc4400', size:4, glow:true, duration:620 — the burn rising
- `status_ring` on target: `#ff5500`, duration:700 — burn status on target
- `creature_tint` on target: `#cc4400`, multiply blend, opacity:0.22, duration:500 — scorched coloring

The pre-impact animation stays identical. The payload is the aftermath.

---

### `flare_bite` — Fire lunge bite (Lv 12)
**What it is**: Salamander's signature physical-feeling move. Heavy, up-close, dangerous. Chomps with a fire-wreathed jaw. Already Salamander's most distinctive move.
**Current**: Triple charge sounds, escalating `cast-flare-charge` CSS, fire aura during charge, then lunge bite animation. Already good. The lunge animation itself is beautiful in CSS.
**What it needs**: The 560ms charge should be full of fire energy building. The bite landing should feel heavy.

**Changes**:
- `particle_stream` at actor from t=0: count:4, interval:68, color:'#ff7700', direction:'up', spread:32, duration:560, glow:true — embers rising throughout the entire charge
- `creature_tint` on actor from t=0: `#ff5500`, screen blend, opacity:0.3, duration:560 — actor builds orange glow during charge
- At lunge fire (~t=560): `hit_stop` 70ms
- After hit_stop resolves: `shockwave` at target: size:72, color:'#ff4400', opacity:0.75, thickness:5 — the bite's kinetic ring
- `creature_tint` on target: `#ff3300`, multiply blend, opacity:0.30, duration:420 — fire jaw mark

---

### `ash_veil` — Spirit self-buff (Lv 18)
**What it is**: Utility. Raises Spirit. Cooling ash shrouds Salamander. Deliberate contrast to fire moves — this is the calm, defensive side of fire.
**Current**: Cast pose (ashen, desaturated CSS glow already), gray particles rising, field flash. Close but needs ash *falling*, not rising.
**What it needs**: Ash should drift down/around the actor, not up — ash settles, embers rise. The direction and color distinguish this from all the fire moves.

**Changes**:
- `particle_stream` at actor: direction:'down', count:3, interval:90, color:'#aaaaaa', size:3, duration:480 — ash settling
- `creature_tint` on actor: `#cccccc`, screen blend, opacity:0.20, duration:560 — pale ash shimmer
- `status_ring` on actor: `#bbbbaa`, duration:700 — spirit buff locked in
- Remove the upward `particle_burst` from current timeline; replace with `particle_stream` above

---

### `smoke_screen` — Blind utility (Lv 20)
**What it is**: Utility. Applies Blind to target. Target is engulfed in thick smoke.
**Current**: Cast pose, dark cast aura, dark oval projectile flies, smoky burst on target. Good concept, needs the smoke to linger.
**What it needs**: After the projectile hits, the target should stay visually obscured for a moment — the smoke doesn't just appear and vanish.

**Changes**:
- After impact: `particle_stream` at target: direction:'all', count:4, interval:75, color:'#666666', spread:55, duration:560 — smoke lingering on target
- `creature_tint` on target: `#333333`, multiply blend, opacity:0.38, duration:600 — target darkened by smoke
- `status_ring` on target: `#555555`, duration:700 — blind status applied

Pre-impact animation stays the same. The smoke lingering is the identity.

---

### `cinder_burst` — AoE ember detonation (Lv 22)
**What it is**: AoE. An ember detonating outward. The cast CSS already shows Salamander rising and glowing with fire energy — it looks like building to an explosion.
**Current**: Rise CSS + cast aura, then field effect + particles. The AoE field effect is correct but the *detonation moment* lacks impact.
**What it needs**: A shockwave ring expanding outward from actor at the detonation point — the ember going off visually. Particle embers building during the charge.

**Changes**:
- `particle_stream` at actor during charge: count:3, interval:80, color:'#ff7700', direction:'up', duration:300 — embers building
- `creature_tint` on actor: `#ff6600`, screen blend, opacity:0.28, duration:350 — actor glows at detonation
- On impact: `shockwave` at actor: size:82, color:'#ff5500', opacity:0.65, thickness:4 — the cinder going off

---

### `cinder_burst_2` — Intense detonation (Lv 42)
**What it is**: Bigger AoE. More heat, more force.
**Current**: Same structure with larger CSS scale peak. Needs particle_stream during the longer charge + heavier detonation.

**Changes**:
- `particle_stream` at actor: count:4, interval:72, color:'#ff6600', direction:'up', duration:450, glow:true
- `creature_tint` on actor: `#ff4400`, screen blend, opacity:0.35, duration:420
- `hit_stop` 60ms
- After freeze: `shockwave` at actor: size:105, color:'#ff4400', opacity:0.7, thickness:5

---

### `cinder_burst_3` — Field-scorching eruption (Lv 58)
**What it is**: Heavy AoE. Overwhelming flame. Should feel genuinely dangerous.
**Current**: Longest charge (720ms CSS), biggest glow. Needs to match that visual promise with real detonation weight.

**Changes**:
- `particle_stream` at actor: count:5, interval:65, color:'#ff5500', direction:'up', spread:40, duration:520, glow:true — heavy ember storm during charge
- `creature_tint` on actor: `#ff3300`, screen blend, opacity:0.42, duration:480
- `hit_stop` 80ms
- After freeze: `shockwave` at actor (primary): size:130, color:'#ff3300', opacity:0.75, thickness:6
- `shockwave` at actor (secondary) at +140ms: size:70, color:'#ff7700', opacity:0.5, thickness:3 — aftershock ring
- `particle_stream` at actor post-impact: count:3, interval:90, color:'#ff5500', direction:'all', duration:360 — lingering fire wash

---

### `scorch` — Two-hit combo (Lv 35)
**What it is**: Hits twice in quick succession. First hit, then second. The second should land on a target that's already been struck.
**Current**: Two projectiles, but the second hit is visual-only (creature_shake, no second impact event). Both hits look identical — clean target both times.
**What it needs**: After the first hit, embers should rise from the target (it's burning). The second projectile arrives into a smoking target. The second "hit" should have a shockwave.

**Changes**:
- First hit stays as-is (fire-light hit, particles, flash)
- Between hits (at first hit +80ms): `particle_stream` at target: direction:'up', count:2, interval:80, color:'#cc4400', duration:280 — target smoking between hits
- Second hit: `shockwave` at target: size:40, color:'#ff6600', opacity:0.60, thickness:3 — small ring on the follow-up
- Second hit: `creature_tint` on target: `#cc4400`, multiply blend, opacity:0.22, duration:300 — scorched again

---

### `magma_surge` — Ultimate AoE (Lv 65)
**What it is**: The ultimate. Ground erupting with magma. All enemies engulfed. Everything should be deployed here.
**Current**: Long charge (820ms CSS), multiple fire sounds, heavy field effect + screen shake. The charge CSS is beautiful — drops shadow with three layers. But the charge itself still has dead visual zones.
**What it needs**: The entire charge should be alive with fire. The detonation should use every available tool.

**Changes**:
- `particle_stream` at actor from t=0: count:5, interval:62, color:'#ff5500', direction:'up', spread:42, duration:540, glow:true — heavy sustained fire energy for the FULL charge
- `creature_tint` on actor from t=0: `#cc2200`, screen blend, opacity:0.45, duration:600 — deep crimson builds through charge
- On impact: `hit_stop` 100ms — the world holds
- After freeze: `shockwave` at actor (primary): size:160, color:'#ff3300', opacity:0.80, thickness:7
- `shockwave` at actor (secondary) at +200ms: size:90, color:'#ff8800', opacity:0.55, thickness:4
- `shockwave` at actor (tertiary) at +380ms: size:50, color:'#ffaa00', opacity:0.40, thickness:3 — ripple aftermath
- `particle_stream` at actor post-impact: count:4, interval:85, color:'#ff4400', direction:'all', spread:55, duration:440 — lingering magma fire

---

## What Needs No Changes

The following already work well and don't need touches:
- Cast CSS poses: all complete, beautiful, escalating correctly
- Hit reaction CSS (`anim-hit-fire-light`, `anim-hit-fire-heavy`, `anim-hit-ember-burn`, `anim-hit-smoke-blind`): all fine
- Projectile presets (`fire_projectile_light/heavy`, `fire_cast_aura`, `fire_particle_light/heavy`): fine
- Sound timings: already well-placed
- `flare_bite` charge sounds: already triple-repeating, already good

---

## Summary Table

| Move | particle_stream | shockwave | creature_tint actor | creature_tint target | hit_stop |
|------|----------------|-----------|---------------------|----------------------|----------|
| spark_flick | brief actor | small target | — | — | — |
| spark_flick_2 | brief actor | medium target | brief orange | — | — |
| spark_flick_3 | brief actor | large target | hot glow | scorched | 60ms |
| heat_haze | sustained actor | — | warm hold | — | — |
| ember_trail | sustained TARGET post-impact | — | — | scorched | — |
| flare_bite | full charge actor | large target | charge buildup | fire jaw mark | 70ms |
| ash_veil | sustained actor (DOWN) | — | ashen pale | — | — |
| smoke_screen | sustained TARGET post-impact | — | — | smoke obscured | — |
| cinder_burst | charge actor | at actor | detonation glow | — | — |
| cinder_burst_2 | charge actor | at actor | detonation glow | — | 60ms |
| cinder_burst_3 | charge + post actor | double at actor | heavy glow | — | 80ms |
| scorch | between-hits TARGET | second hit target | — | scorched second | — |
| magma_surge | full charge + post actor | triple at actor | crimson buildup | — | 100ms |
