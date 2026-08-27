// What a burst ball leaves behind: the decal stuck to the surface, and the
// powder thrown off the moment it hit.
//
// This is a fourth layer, and it exists because neither of the two it sits
// between would take it honestly. It is not `sim/` — nothing here can change a
// score, and a run replayed tick-for-tick must be able to skip it entirely. It
// is not `render/` either, because `render/` is a rule about *drawing only*:
// these things have positions, velocities and lifetimes that have to be
// advanced, and a renderer that advanced them would be mutating state on the
// frame clock rather than the tick clock.
//
// So: pure state with a tick, the same shape as the sim, drawn by
// `render/splats.js` and owned by whichever composition root spawned it.
//
// Everything is in WORLD coordinates, not screen ones. A splat on the back wall
// is genuinely further away than one at the player's feet, and handing world
// points to the one projection everything else uses is what makes it read that
// way for free.

import { GRAVITY } from "../sim/constants.js";

/**
 * How many decals a surface holds before the oldest is painted over.
 *
 * Decals do NOT expire on a timer. A splat on the wall is the record of a shot
 * that missed, and a room that slowly fills up over a 60-second round is the
 * point — a snowball that faded out after two seconds would just be a longer
 * particle. The cap is what stops the wall going solid white instead.
 */
export const MAX_DECALS = 12;

/** Powder thrown by a dead-on hit. Scaled down for a glancing one. */
const PARTICLE_COUNT = 20;
const PARTICLE_LIFE = 0.62;
// Powder is light: it falls, but nothing like the ball that threw it.
const PARTICLE_GRAVITY = GRAVITY * 0.34;
const PARTICLE_DRAG = 0.12;
// Impact speed that throws a full burst. Anything harder is clamped.
const FULL_BURST_SPEED = 3.2;

export function createSplatField({ maxDecals = MAX_DECALS } = {}) {
  return { maxDecals, decals: [], particles: [] };
}

/** Wipe the room clean. Every run starts on an unmarked wall. */
export function clearSplatField(field) {
  field.decals.length = 0;
  field.particles.length = 0;
}

/**
 * Record a splat: one decal, plus a burst of powder.
 *
 * `random` is injected so the tests can pin the shape of a burst instead of
 * sampling it — the same reason `audio/playlist.js` takes its shuffle source.
 *
 * @param surface "wall" or "floor", straight from the physics report
 * @param speed   how fast the ball was going when it burst
 * @param ballId  which ball burst — see the note on the decal below
 * @param scale   decal width in ball diameters, from the ball catalog
 * @param color   powder tint, from the ball catalog
 */
export function addSplat(field, { surface, x, y, z, speed = 0, ballId = null, scale = 3, color = "#ffffff", random = Math.random }) {
  const onFloor = surface === "floor";
  const force = Math.max(0.25, Math.min(1, speed / FULL_BURST_SPEED));

  field.decals.push({
    surface,
    x,
    // A DECAL REMEMBERS THE BALL THAT MADE IT, and this is the only thing about
    // it that is not geometry. The field outlives the ball selection: a player
    // who splatters a wall with snowballs and then switches to the meatball
    // still has those snowball marks on the wall, and had this not been
    // recorded the renderer would have had one ball id to work from and would
    // have re-dressed every existing mark in the new ball's art — or, for a
    // ball that does not splat at all, in no art, which is how a wall full of
    // snow quietly emptied itself the instant someone picked the basketball.
    // Storing an ID rather than the images is what keeps this layer as free of
    // the browser as the sim is.
    ballId,
    // A floor decal lies ON the floor, whatever height the ball's centre was
    // corrected to. A wall decal keeps the height it struck at.
    y: onFloor ? 0 : y,
    z,
    // SIZE CARRIES DEPTH AND NOTHING ELSE RANDOM. The projection shrinks a
    // decal by about a third across the useful depth of the room, so a random
    // size jitter of even ten percent is the same order as the perspective and
    // reads as noise rather than as distance — a splat at the far wall came out
    // the same size as one at the player's feet. Variety comes from rotation
    // and mirroring below, which cost nothing and cannot lie about depth. The
    // one non-random term left is impact: a hard hit genuinely spreads wider.
    scale: scale * (0.9 + 0.2 * force),
    // Only a WALL decal is rotated. The ground art is painted in perspective —
    // it is a pile seen from the player's eye line — so spinning it would tilt
    // a horizon that is baked into the image. Both may be mirrored, which
    // costs nothing and doubles the number of distinct marks.
    rotation: onFloor ? 0 : random() * Math.PI * 2,
    flip: random() < 0.5,
    color,
  });

  // Oldest out. `shift` on a 12-item array once a shot is not worth a ring
  // buffer, and this way the array is already in paint order.
  while (field.decals.length > field.maxDecals) field.decals.shift();

  const count = Math.round(PARTICLE_COUNT * force);
  for (let index = 0; index < count; index++) {
    field.particles.push(spawnParticle({ surface, x, y, z, force, color, random }));
  }
}

/**
 * One grain of powder.
 *
 * The two surfaces throw in different directions and that is the whole
 * difference between them: a wall burst sprays back into the room off a plane
 * the ball drove into, a floor burst throws up and outward from underneath.
 */
function spawnParticle({ surface, x, y, z, force, color, random }) {
  const spread = 1.5 + 1.9 * force;
  const angle = random() * Math.PI * 2;
  const reach = Math.sqrt(random());

  if (surface === "floor") {
    return {
      x,
      y: Math.max(y, 0.02),
      z,
      vx: Math.cos(angle) * reach * spread * 0.42,
      vy: (0.35 + random() * 0.85) * spread * 0.45,
      vz: Math.sin(angle) * reach * spread * 0.22,
      age: 0,
      life: PARTICLE_LIFE * (0.7 + random() * 0.6),
      size: 0.008 + random() * 0.016,
      color,
    };
  }

  return {
    x,
    y,
    z,
    vx: Math.cos(angle) * reach * spread * 0.34,
    vy: Math.sin(angle) * reach * spread * 0.34 + 0.25 * spread * 0.3,
    // Back off the wall, always — nothing sprays deeper into a solid plane.
    vz: -(0.3 + random() * 0.8) * spread * 0.3,
    age: 0,
    life: PARTICLE_LIFE * (0.7 + random() * 0.6),
    size: 0.007 + random() * 0.014,
    color,
  };
}

/**
 * Advance the powder by one tick. Decals do not move.
 *
 * Called from the fixed-timestep tick, not from the draw, so a 144Hz monitor
 * does not blow the powder away faster — the same rule the rest of the cabinet
 * runs on.
 */
export function tickSplatField(field, dt) {
  const keep = [];
  for (const particle of field.particles) {
    particle.age += dt;
    if (particle.age >= particle.life) continue;

    particle.vy -= PARTICLE_GRAVITY * dt;
    const drag = Math.pow(PARTICLE_DRAG, dt);
    particle.vx *= drag;
    particle.vz *= drag;

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z += particle.vz * dt;
    // Powder settles on the floor rather than falling through it.
    if (particle.y < 0) {
      particle.y = 0;
      particle.vy = 0;
    }
    keep.push(particle);
  }
  field.particles = keep;
}

/** How faded a grain is, 1 fresh to 0 gone. Shared with the renderer. */
export function particleAlpha(particle) {
  return Math.max(0, 1 - particle.age / particle.life);
}
