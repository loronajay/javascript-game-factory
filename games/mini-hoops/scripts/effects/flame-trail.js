// What a burning ball leaves behind: the grains streaming off it in flight, and
// the fire still going where it landed.
//
// The sibling of `splat-field.js`, in the same fourth layer and for the same
// reason. It holds positions and lifetimes that have to be advanced on the TICK
// clock, which `render/` may not do; and it can no more change a score than a
// decal on the wall can, which is why it is not `sim/`. A run replayed
// tick-for-tick must be able to skip this file entirely and come out with the
// same number.
//
// THAT IS A CONTRACT, not an accident of the current code. A ball's advantages
// come from its published `flight` block — four numbers a player can read on
// the setup picker before committing — and never from a side effect of what it
// looks like. So nothing here is consulted by the physics, nothing here is
// consulted by `sim/shot.js`, and a fire burning on the floor is scenery that
// the next shot flies straight through.
//
// Everything is in WORLD coordinates. A grain thrown off at the back wall is
// genuinely further away than one at the player's feet, and handing world
// points to the one projection everything else uses is what makes it read that
// way for free.

/**
 * The surfaces a burning ball can set alight.
 *
 * Bare wall and floor, exactly like `SPLAT_SURFACES`, and the reasoning is
 * borrowed wholesale: those are the two contacts a shot is already dead on, so
 * a fire can never be mistaken for something that changed an outcome. It is a
 * weaker rule here than it is there — a fire does not destroy the ball, so
 * lighting one on the rim would cost nothing in points — but a rim that caught
 * fire on every graze would bury the ring in glow at the exact moment the
 * player most needs to read it.
 */
export const FIRE_SURFACES = Object.freeze(["floor", "wall"]);

/**
 * How many fires burn at once before the oldest is dropped.
 *
 * Lower than the decal cap on purpose. A decal is a permanent record of a miss
 * and a room filling up over a round is the point; a fire is a live light
 * source, and twelve of them lighting the same wall is a bonfire rather than a
 * ball that landed somewhere.
 */
export const MAX_FIRES = 6;

/**
 * How near an existing fire a new one is refused, in world units.
 *
 * A ball that lands and rolls reports a floor contact every 8ms substep, so
 * without this a single landing lays down a continuous ribbon of fires and
 * blows the cap in a tenth of a second. Roughly a ball diameter: roll far
 * enough to be somewhere else and you light somewhere else.
 */
const FIRE_SPACING = 0.16;

/** Speed at which a trail streams at its authored rate. Slower smoulders. */
const TRAIL_FULL_SPEED = 6;
/** The floor of that, so a ball resting in its own fire still gives off something. */
const TRAIL_IDLE_RATE = 0.22;

/** Hot air lifts a grain far harder than gravity pulls it down. */
const EMBER_RISE = 1.15;
const EMBER_DRAG = 0.1;
/** How much of the ball's own velocity a grain keeps. It is shed, not thrown. */
const EMBER_INHERIT = 0.08;

export function createFlameTrail({ maxFires = MAX_FIRES } = {}) {
  // `pending` is the fractional part of the emission rate carried between
  // ticks. Without it a rate under 60/s rounds to zero every tick and the
  // trail simply never appears.
  return { maxFires, embers: [], fires: [], pending: 0 };
}

/** Put every fire out and clear the air. Every run starts in an unburnt room. */
export function clearFlameTrail(field) {
  field.embers.length = 0;
  field.fires.length = 0;
  field.pending = 0;
}

/** Whether a contact with `surface` can start a fire. */
export function firesOn(surface) {
  return FIRE_SURFACES.includes(surface);
}

/**
 * Shed grains off a ball in flight.
 *
 * Called once per tick from whichever root owns the ball, with the ball's own
 * position and velocity and the `trail` block from the catalog. A ball with no
 * trail block hands in `style: null` and this does nothing, which is what keeps
 * the call unconditional at every call site.
 *
 * `random` is injected so the tests can pin the shape of a trail instead of
 * sampling it — the same reason `addSplat` takes one.
 */
export function emitFlameTrail(field, { x, y, z, vx = 0, vy = 0, vz = 0, dt, style, random = Math.random }) {
  if (!style || !(dt > 0)) return 0;

  // A trail is drawn by MOTION. A ball screaming across the room streams; one
  // sitting on the floor smoulders. Scaling the rate rather than gating it is
  // what makes the transition between those two continuous.
  const speed = Math.hypot(vx, vy, vz);
  const throttle = Math.min(1, TRAIL_IDLE_RATE + (1 - TRAIL_IDLE_RATE) * (speed / TRAIL_FULL_SPEED));
  field.pending += style.rate * throttle * dt;

  let spawned = 0;
  while (field.pending >= 1) {
    field.pending -= 1;
    field.embers.push(spawnEmber({ x, y, z, vx, vy, vz, style, random }));
    spawned += 1;
  }
  return spawned;
}

/**
 * Light a fire where the ball landed.
 *
 * Returns whether one actually started, which is the caller's cue to play the
 * sizzle. That answer lives here rather than in the root because the reason a
 * fire is refused — one is already burning right there — is a fact about this
 * field, and four composition roots should not each be re-deriving it.
 */
export function addFire(field, { surface, x, y, z, style, random = Math.random }) {
  if (!style || !style.fire || !firesOn(surface)) return false;

  const onFloor = surface === "floor";
  // A floor fire burns ON the floor, whatever height the collider corrected the
  // ball's centre to; a wall fire keeps the height it struck at. Same
  // correction a decal makes, for the same reason.
  const at = { x, y: onFloor ? 0 : y, z };
  if (field.fires.some((fire) => near(fire, at))) return false;

  field.fires.push({
    surface,
    ...at,
    age: 0,
    life: style.fire.life,
    radius: style.fire.radius,
    // A little variety in how a patch flickers, so two fires side by side are
    // not one image drawn twice. Phase only — nothing here jitters a size, for
    // the reason `addSplat` refuses to jitter a decal's: at this range a random
    // size is the same order as the perspective and reads as noise.
    phase: random() * Math.PI * 2,
    style,
    pending: 0,
  });

  while (field.fires.length > field.maxFires) field.fires.shift();
  return true;
}

/**
 * Advance the grains and the fires by one tick.
 *
 * Called from the fixed-timestep tick, not from the draw, so a 144Hz monitor
 * does not blow the fire out faster — the same rule the rest of the cabinet
 * runs on.
 */
export function tickFlameTrail(field, dt, { random = Math.random } = {}) {
  const keep = [];
  for (const ember of field.embers) {
    ember.age += dt;
    if (ember.age >= ember.life) continue;

    // Buoyant, not ballistic: a grain of burning gas rises, and then loses the
    // heat that was lifting it — which the drag below does for free.
    ember.vy += EMBER_RISE * dt;
    const drag = Math.pow(EMBER_DRAG, dt);
    ember.vx *= drag;
    ember.vy *= drag;
    ember.vz *= drag;

    ember.x += ember.vx * dt;
    ember.y += ember.vy * dt;
    ember.z += ember.vz * dt;
    if (ember.y < 0) {
      ember.y = 0;
      ember.vy = 0;
    }
    keep.push(ember);
  }
  field.embers = keep;

  const burning = [];
  for (const fire of field.fires) {
    fire.age += dt;
    if (fire.age >= fire.life) continue;

    // A fire dies down rather than switching off, so it throws fewer grains as
    // it goes. The same fractional carry the trail uses, kept per fire.
    const remaining = 1 - fire.age / fire.life;
    fire.pending += fire.style.fire.rate * remaining * dt;
    while (fire.pending >= 1) {
      fire.pending -= 1;
      field.embers.push(
        spawnEmber({
          x: fire.x + (random() - 0.5) * fire.radius,
          y: fire.y,
          // A wall fire has almost no depth to spread across — it is stuck to a
          // plane — where a floor fire is a patch seen from above.
          z: fire.z + (random() - 0.5) * fire.radius * (fire.surface === "floor" ? 1 : 0.2),
          vx: 0,
          vy: 0,
          vz: 0,
          style: fire.style,
          random,
        }),
      );
    }
    burning.push(fire);
  }
  field.fires = burning;
}

/** How faded a grain is, 1 fresh to 0 gone. Shared with the renderer. */
export function emberAlpha(ember) {
  return Math.max(0, 1 - ember.age / ember.life);
}

/** How far through its life a fire is, 0 fresh to 1 out. Shared with the renderer. */
export function fireProgress(fire) {
  return Math.max(0, Math.min(1, fire.age / fire.life));
}

/** One grain of burning gas. */
function spawnEmber({ x, y, z, vx, vy, vz, style, random }) {
  const spread = 0.55;
  return {
    // Spawned inside the ball rather than at a point, so the trail has width.
    x: x + (random() - 0.5) * style.size * 1.6,
    y: Math.max(0, y + (random() - 0.5) * style.size * 1.6),
    z: z + (random() - 0.5) * style.size * 1.6,
    // Grains are SHED, not thrown: they keep a little of the ball's motion and
    // are then left behind by it, which is what makes the trail hang in the
    // room instead of travelling along with the sprite.
    vx: vx * EMBER_INHERIT + (random() - 0.5) * spread,
    vy: vy * EMBER_INHERIT + random() * spread * 0.5,
    vz: vz * EMBER_INHERIT + (random() - 0.5) * spread,
    age: 0,
    life: style.life * (0.65 + random() * 0.7),
    size: style.size * (0.5 + random() * 0.8),
    style,
  };
}

function near(fire, at) {
  return Math.hypot(fire.x - at.x, fire.y - at.y, fire.z - at.z) < FIRE_SPACING;
}
