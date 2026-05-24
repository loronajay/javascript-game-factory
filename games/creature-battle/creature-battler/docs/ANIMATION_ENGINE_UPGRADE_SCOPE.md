# Animation Engine Upgrade Scope — Arts Visual Identity
## Creature Battle

**Status**: Scoped 2026-05-24. Start here before any engine addition work.
**Read first**: `ANIMATION_ENGINE_SCOPE.md` (architecture), `ANIMATION_IDENTITY_SCOPE.md` (skills pass, creature hit list).

---

## The Core Problems

After reading every creature anim file the patterns are clear. Arts share five structural issues that make even "finished" animations look generic:

### 1. Charges feel empty
`cast_aura` fires once at t=0 and fades in ~420ms. A 700ms charge has 280ms of visual nothing. There is no sense of energy *building* — the creature sits still while power supposedly grows. Every long charge in the game has this dead zone.

### 2. Projectiles are colored circles
Fire fireball, ice shard, dark orb, water bubble — all rendered identically as a circle div with a glow. No element-specific shape, no texture, no behavior. A fire fireball should leave trailing embers. An ice shard should be pointed and crystalline. A dark orb should have shadow tendrils reaching off it. Currently they're all `border-radius: 50%`.

### 3. Impacts have no weight
Big hits — `phantom_strike_2`, `void_collapse`, `torrent`, `absolute_zero` — use screen shake + particle burst. That's it. There's no hit-stop (the brief freeze that lets the brain register the force), no shockwave ring (the energy radiating outward from the point of impact). The world doesn't *react* to these hits. Compare to a fighting game: heavy hits make the entire world hold for 80ms and then send a ring outward. That's the missing ingredient.

### 4. Dark energy is wrong direction
The preset library explicitly notes: "dark particles ideally swirl INWARD." Currently they burst outward, identical in behavior to every other element. Dark moves should *consume*, not radiate — the void pulls things in. `soul_rend`, `life_drain`, `curse`, `void_collapse` should all feel like gravity, not explosion.

### 5. Lifesteal is invisible
`life_drain` and `soul_rend` are Nocthorn's defining moves — stealing HP is supposed to feel tangible. Currently: dark orb flies to target → particle burst at actor afterward. The energy "returns" via a static particle burst with no directional connection to the target. It doesn't look like draining — it looks like the actor randomly generates particles.

---

## Engine Additions — Priority Order

### Priority 1 — Maximum impact, implement first

---

#### `particle_stream` — Sustained particle emitter

**What it does**: Continuously emits particles at regular intervals for a set duration. Unlike `particle_burst` (one-shot), this runs throughout a charge, a sustained beam, a buff effect, a status duration.

**Why it matters**: Eliminates the dead-zone problem entirely. A 700ms fire charge becomes 700ms of continuously rising embers. An ice creature channeling absolute zero has ice crystals continuously forming around it for the whole charge. This single addition transforms every charge-up move in the game.

**API**:
```js
{ type:'particle_stream', origin:'actor'|'target', 
  color, count, interval, spread, direction, size, glow, duration }
// count    = particles per interval (default 3)
// interval = ms between emissions (default 80)
// duration = total stream time in ms
```

**Implementation**: `animParticleStream(originEl, options)` — runs `setInterval` calling `animParticleStream` on each tick, stores interval ID, clears after `duration` ms. Returns a `{ clear }` controller like `animStatusRing` (non-blocking). The engine fires it and moves on; the stream runs in parallel.

**Engine case**: `wave_sweep`-style — resolves direction, calls component, returns immediately.

**What it unlocks**:
- Fire charge: embers continuously rising off actor for the entire cast window
- Ice charge: crystals forming around actor throughout the wind-up
- Dark charge: shadow wisps continuously bleeding off actor
- Water heal: bubbles continuously rising from the target during the recovery animation
- Any buff: sustained particle aura for the duration of the stat change visual
- Beam moves: particles continuously traveling along the beam while it's active

---

#### `shockwave` — Expanding impact ring

**What it does**: Spawns a circular ring at a point that expands outward and fades. The canonical "kinetic energy radiating from impact" visual from every good fighting game.

**Why it matters**: Every heavy impact in the game is currently particles + shake. A shockwave ring adds the *spatial* component — the energy radiates visibly outward from the exact point of contact. It makes the hit feel like it happened *at a place*, not just as a screen event.

**API**:
```js
{ type:'shockwave', origin:'actor'|'target',
  color, size, thickness, duration, opacity }
// size      = max radius in px (default 60)
// thickness = ring border thickness (default 4)
// duration  = expand + fade time in ms (default 400)
```

**CSS**: A div with `border: Npx solid color; border-radius: 50%` starting at `width/height: 10px` and expanding via keyframe to `width/height: size*2` while `opacity` fades to 0. Positioned at the origin element's center.

**What it unlocks**:
- Every major impact gets a ring: phantom_strike, void_collapse, torrent, absolute_zero, magma_surge, flare_bite
- AoE land points: rings at actor position when AoE field effect fires
- Buff moments: a subtle ring expanding from the actor when a stat change locks in (distinct from `status_ring` which is persistent glow)
- Healing: a soft green/teal ring expanding from the healed creature

---

#### `creature_tint` — Elemental color overlay on creature

**What it does**: Temporarily places a colored transparent overlay on a creature element, tinting the sprite. Auto-clears after duration.

**Why it matters**: Right now creature sprites never change color. A fire creature charging a fire move looks exactly the same as at rest. Adding an orange-red tint during fire charges, a blue-white shimmer during ice charges, a purple-black shadow during dark charges — this gives every elemental move a *creature* signature, not just a field effect. The creature itself becomes part of the visual.

**API**:
```js
{ type:'creature_tint', target:'actor'|'target',
  color, opacity, duration, blend }
// blend = CSS mix-blend-mode (default 'screen'; try 'multiply' for darker)
```

**Implementation**: Creates a `div.anim-creature-tint` positioned absolutely over the creature element (creature needs `position:relative` or use a wrapper). Animates in quickly (100ms), holds, fades out. The overlay inherits the creature element's dimensions.

**CSS approach**: `.anim-creature-tint` positioned absolute, inset:0, using CSS keyframe for fade-in hold fade-out pattern. `mix-blend-mode: screen` for additive glows (fire, light, ice); `mix-blend-mode: multiply` for darkening (dark, poison).

**What it unlocks**:
- Fire cast: actor gets warm orange screen-blend tint during charge
- Ice cast: actor gets pale blue-white tint, fades on launch
- Dark cast: actor darkens with multiply-blend deep purple tint
- Water heal: target gets soft teal screen-blend tint as healing lands
- Void collapse: target gets a deep void-purple tint on hit (the soul being drained)
- Status effects visually on creature (burn = orange tint, poison = green, freeze = blue-white)
- Buff moves: actor glows element color while the aura effect is active

---

#### `hit_stop` — Impact freeze frame

**What it does**: Briefly pauses all CSS animations in the battle field for a set duration. Creates the fighting-game "freeze frame" effect on heavy impacts — the world holds for a moment so the brain registers the force.

**Why it matters**: Currently heavy hits are: screen shake starts, particles fly, everything continues. The brain never gets a moment to register "something catastrophic happened." Hit-stop at 60-100ms gives the player's nervous system that moment. It's subtle but transforms feel at a visceral level.

**API**:
```js
{ type:'hit_stop', duration }
// duration = ms to freeze (default 80; 50 = light, 80 = medium, 120 = heavy)
```

**Implementation**: Sets `animation-play-state: paused` on `#battle-field` and `#battle-anim-overlay` (and all children). After duration, removes the property. The timeline scheduler itself continues running via `setTimeout`, so events that were scheduled during hit_stop still fire at their absolute timestamps. Only visual animations pause, not game logic.

**Placement rule**: Add `hit_stop` immediately after `impact` on heavy moves. Do not add to light/medium moves — it should feel earned and rare.

**What it unlocks**:
- Ultimates (magma_surge, absolute_zero, void_collapse, etc.) feel catastrophic
- Signature power moves (phantom_strike_2, torrent, flare_bite) gain weight
- Healing ultimates can use a gentle 40ms version for a "time stood still" moment

---

### Priority 2 — High impact, implement second

---

#### `projectile_fan` — Multiple projectiles in a spread pattern

**What it does**: Fires N projectiles from the same origin to the same destination, each offset by a small angle, creating a spread/fan visual.

**Why it matters**: Many moves conceptually need multiple things flying. `life_drain` should be dark tendrils (3 thin ones), shadow_claw should show multiple claw marks, some ice moves should scatter multiple shards. Currently every projectile move fires exactly one projectile.

**API**:
```js
{ type:'projectile_fan', from:'actor', to:'target',
  count, spreadAngle, color, size, arc, duration, trail, stagger }
// count       = number of projectiles (default 3)
// spreadAngle = total fan angle in degrees (default 30)
// stagger     = ms delay between each projectile (default 0 = all simultaneous)
// arc, arc values stagger around center arc value
```

**Implementation**: Computes N evenly-spaced arc values centered on the base arc, fires N `animProjectile` calls with those arc offsets. If `stagger > 0`, staggers each with `setTimeout`.

**What it unlocks**:
- `life_drain` → 3 thin dark tendrils fly simultaneously to target
- Shadow claw → 3 dark slash marks fan out toward target, offset by 15°
- Ice multi-hit → 3 sharp shards scatter in a narrow spread
- Gaia spore shot → 5 tiny spores spread in a wide fan
- Multi-hit Arts can show each hit as a separate projectile

---

#### Inward particle direction — `'inward'` on `particle_burst`/`particle_stream`

**What it does**: Adds a new `direction: 'inward'` option to `animParticleBurst` and `animParticleStream`. Particles start spread around the origin and travel inward toward it, rather than outward from it.

**Why it matters**: Dark element's entire identity depends on this. Void energy should converge, not radiate. Currently `dark_cast_aura`, `dark_particle_light`, `dark_particle_heavy`, and all dark presets burst outward. `shadow_surge`, `void_collapse`, and `dark_eruption` should feel like darkness being pulled *into* the creature, not expelled from it. Lifesteal mechanics are the same — energy returning from target to actor.

**Implementation**: `animParticleBurst` currently uses `Math.random()` for velocity direction. For inward: particles start at a point spread around the origin (rather than at the origin) and travel inward. Or: start at origin but reverse the velocity direction so particles end at their starting positions at the center. The simplest implementation: spawn particles at `center + spread * direction`, animate to `center`.

**Also used for**: lifesteal return visuals, healing particles converging on the healed creature, absorption mechanics.

---

#### `return_projectile` — Projectile from target back to actor

**What it does**: A projectile that travels from target → actor, opposite direction from normal. Used for lifesteal return, healing pull, and any "energy returning" effect.

**Why it matters**: `life_drain` and `soul_rend` currently have a particle burst at actor to imply the drain return, but there's no visual *connection* between target and actor. A dim purple tendril flying back from target to actor makes the drain mechanically legible.

**Implementation**: This is just `animProjectile(targetEl, actorEl, options)` — swap from/to. The engine already has the component; just need a timeline event type that resolves the direction correctly (`from:'target', to:'actor'`).

**API**:
```js
{ type:'projectile', from:'target', to:'actor', color, size, arc, duration, trail }
// 'target' as from, 'actor' as to — existing engine resolves these already.
// Actually already works! Just use type:'projectile' with from:'target', to:'actor'.
// _resolveEl handles both strings. Test this first.
```

**Discovery**: `return_projectile` may not need a new event type at all — just `{ type:'projectile', from:'target', to:'actor', ... }` if `_resolveEl('target', ...)` correctly returns the target element even when used as origin. Verify this works.

---

### Priority 3 — Quality improvements

---

#### Beam pulse/crackle — `pulse` option on `beam`

**What it does**: Adds a flickering/crackling animation to beam moves, making them feel like channeled energy rather than a static laser line.

**API addition**: `{ type:'beam', ..., pulse:true, pulseRate:120 }` — makes the beam opacity oscillate during its duration.

**CSS**: Add an additional keyframe class `.anim-beam-pulse` that animates `opacity: 1 → 0.3 → 1 → 0.4 → 1` with a short period overlaid on the existing extend animation.

**Used for**: Whiteout (ice beam), water beam moves, lightning (Voltwing), light beams (Lumora).

---

#### Projectile shape improvements

The preset library specifies visual identities for each element's projectile but the renderer only supports `circle`, `oval`, `shard`. Add:

- **`'ember'`** — elongated teardrop, fire-colored. CSS: `border-radius: 50% 50% 50% 50% / 30% 30% 70% 70%`
- **`'crystal'`** — angular diamond. CSS: `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)`
- **`'wisp'`** — irregular blob with box-shadow spread for tentacle feel. Dark element.
- **`'droplet'`** — teardrop. CSS: `border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%`
- **`'bolt'`** — very narrow tall rectangle with slight rotation, lightning element

Update `fire_projectile_*` presets to use `'ember'`, `ice_projectile_*` to use `'crystal'`, `water_projectile_*` to use `'droplet'`, `dark_projectile_*` to use `'wisp'`, `lightning_projectile_*` to use `'bolt'`.

---

#### Projectile trail — `trail_particles` option

The current `trail:true` adds a static `box-shadow` to the projectile div. A true particle trail would continuously spawn small particles behind the projectile as it travels.

**Implementation challenge**: The projectile position changes continuously during its CSS animation, but JS can't read the mid-animation CSS position directly. Options:
1. **CSS-only trail**: Add `::before` and `::after` pseudo-elements as ghost copies of the projectile at increasing opacity, offset behind the travel direction. Limited but zero JS cost.
2. **Step-based emission**: Fire a `particle_stream` at actor position with very low count and matched duration — particles that "chase" the projectile visually.

CSS-only approach is the right call here — implement as additional shadow layers or pseudo-elements on `.anim-projectile[trail]`.

---

## What Becomes Possible

After Priority 1 (particle_stream, shockwave, creature_tint, hit_stop), here's what moves look like:

### `void_collapse` (Nocthorn's ultimate) — Before vs After

**Before**: Dark cast aura (one burst) → charge → dark lunge → hit → screen shake → dark particles → field flash → done.

**After**:
- t=0: `particle_stream` with `direction:'inward'` — shadow wisps continuously spiral INTO actor for 580ms. Actor gets dark purple `creature_tint` that deepens throughout.
- t=200: Screen starts darkening — a slow `field_flash` with very low opacity that holds (not flashing).
- t=580: Lunge fires — actor's tint flares to full purple intensity.
- t=780: `hit_stop` 100ms — world freezes.
- t=880: `shockwave` at target — massive ring expands. `creature_tint` slams onto target in void purple (multiply blend). `particle_stream` at target direction:'inward' for 400ms (void pulling at target's life force).
- t=880: screen shake, dark particle heavy, field effect.
- t=980: `return_projectile` — three dim purple wisps fly from target back to actor (the drained HP returning).

This is a genuinely cinematic animation sequence. The charge *looks* like building darkness. The hit *feels* catastrophic. The drain is *visible*.

### `absolute_zero` (Pengun's ultimate) — After

- `particle_stream` of ice crystals forming around actor for 520ms (continuous, not just one burst)
- `creature_tint` blue-white building in intensity
- At lunge: tint flares white
- `hit_stop` 100ms
- `shockwave` at target — white ring
- `creature_tint` on target: deep ice blue (freeze visual)
- `particle_stream` at target direction:'inward' or 'down' as crystals form over the target post-hit

### `life_drain` (Nocthorn) — After

- `particle_stream` inward at actor during cast (pulling power inward)
- `projectile_fan` (3 thin dark tendrils) fly to target
- On impact: `shockwave` at target
- `creature_tint` on target (multiply dark purple — HP being consumed)
- 200ms later: `return_projectile` from target back to actor (3 tendrils returning)
- `creature_tint` on actor briefly brightens (regaining HP)

### `healing_wave` (Aquaphant) — After

- `particle_stream` at target, direction:'down', teal-cyan, for 400ms (healing raining down)
- `shockwave` at target — soft teal expanding ring
- `creature_tint` on target — screen-blend teal
- `particle_stream` at target direction:'up' after the impact (health restored, rising)

---

## New Event Types Summary

| Event type | Component | Returns | Priority |
|------------|-----------|---------|----------|
| `particle_stream` | `animParticleStream` | `{ clear }` controller (non-blocking) | 1 |
| `shockwave` | `animShockwave` | Promise (self-resolving) | 1 |
| `creature_tint` | `animCreatureTint` | Promise | 1 |
| `hit_stop` | `animHitStop` | Promise | 1 |
| `projectile_fan` | (calls animProjectile N times) | Promise.all | 2 |
| `particle_stream` with `direction:'inward'` | animParticleBurst extension | — | 2 |
| `beam` with `pulse:true` | animBeam extension | — | 3 |

**Already works, just needs testing**:
- `{ type:'projectile', from:'target', to:'actor' }` — test that `_resolveEl('target')` works as a `from` origin. If so, return_projectile is free.

---

## Implementation Order

1. ✅ **`particle_stream`** — `animParticleStream` in components; `particle_stream` engine case. Non-blocking, fires and continues.
2. ✅ **`shockwave`** — CSS keyframe + `animShockwave` component; `shockwave` engine case. `--shock-scale` unitless var (base div 10px, scale = size*2/10).
3. ✅ **`creature_tint`** — CSS for `.anim-creature-tint` + `position:relative` on `.creature-breathe-wrapper`; `animCreatureTint` component (targets breathe-wrapper inside creature el); `creature_tint` engine case.
4. ✅ **`hit_stop`** — `animHitStop` pauses `animation-play-state` on field + overlay; `hit_stop` engine case.
5. ✅ **`return_projectile`** — already free: `{ type:'projectile', from:'target', to:'actor' }` works through existing projectile case since `_resolveEl` handles both 'actor' and 'target' as from/to.
6. **`inward` particle direction** — modify `animParticleBurst` only. Next.
7. **`projectile_fan`** — composites existing component, relatively simple.
8. **Update presets** — update projectile preset shapes after shape improvements.
9. **Creature anim pass** — with all primitives available, rewrite every creature's move animations starting with Salamander.

---

## Key Files

```
creature-battler/scripts/
  animation-components.js    ← add animParticleStream, animShockwave, animCreatureTint, animHitStop
  animation-engine.js        ← add particle_stream, shockwave, creature_tint, hit_stop cases
  animation-presets.js       ← update projectile preset shapes after shape improvements
  animations/                ← creature rewrites come after engine upgrades complete

creature-battler/styles/
  animation-overlay.css      ← add CSS for shockwave ring, creature tint overlay, stream particles
```
