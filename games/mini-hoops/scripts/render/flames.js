// The flame trail and the fires it leaves: draw calls only.
//
// The field arrives already advanced by `effects/flame-trail.js`, and nothing
// in this file writes to it — the same rule the rest of `render/` lives by. The
// one thing here that looks like state is the flicker, and it is not: it is a
// pure function of a fire's own age and its stored phase, so two frames drawn
// at the same tick draw the same fire.
//
// FIRE IS ADDITIVE. `lighter` is what makes overlapping grains build toward
// white at the core instead of stacking into a flat orange blob — it is the
// whole difference between this reading as fire and reading as confetti. Smoke
// is the exception and is drawn normally, underneath, because smoke is the one
// part of a flame that makes the room DARKER.
//
// Everything lives in world space and goes through the one projection, so a
// grain shed at the back wall is smaller than one at the player's feet because
// it genuinely is.

import { floorScreenY, projectPoint, worldToScreenLength } from "../sim/projection.js";

/** Where in a grain's life it stops being flame and starts being smoke. */
const SMOKE_FROM = 0.45;

/**
 * The fires burning on the room's surfaces.
 *
 * Drawn with the decals, under everything else painted onto the room: a fire on
 * the back wall belongs behind the backboard bolted over it, exactly as a splat
 * does. A floor fire is squashed and a wall fire is round, which is the same
 * distinction the splat fallback makes and for the same reason — one is lying
 * down and the other is stuck up.
 */
export function drawFlameFires(ctx, field) {
  if (!field.fires.length) return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const fire of field.fires) {
    const remaining = Math.max(0, 1 - fire.age / fire.life);
    // Flicker is a pure function of the fire's own clock and its stored phase.
    // Nothing random happens in a draw call: the same tick drawn twice on a
    // slow frame has to come out identical, or the fire strobes.
    const flicker = 0.82 + 0.18 * Math.sin(fire.age * 17 + fire.phase);
    const radius = worldToScreenLength(fire.radius, fire.z) * flicker;
    if (!(radius > 0)) continue;

    const screen = projectPoint({ x: fire.x, y: fire.y, z: fire.z });
    // The projection puts a ground-level CENTRE on the floor line, so a patch
    // lying on the floor sits there rather than hovering above it.
    const y = fire.surface === "floor" ? floorScreenY(fire.z) : screen.y;
    const squash = fire.surface === "floor" ? 0.34 : 1;

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, fire.style.core);
    gradient.addColorStop(0.42, fire.style.flame);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.save();
    ctx.translate(screen.x, y);
    ctx.scale(1, squash);
    // Squared, so a fire spends most of its life bright and then goes out
    // quickly rather than dimming linearly for two and a half seconds.
    ctx.globalAlpha = 0.55 * remaining * remaining + 0.1 * remaining;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * The grains in the air, in two passes.
 *
 * Smoke first and normally composited — it is the half of a flame that darkens
 * what is behind it — then the flame itself additively on top. One pass with
 * one composite operation cannot do both: additive smoke lightens the room,
 * which is precisely backwards, and a normally-composited flame never builds
 * to a white core.
 */
export function drawFlameEmbers(ctx, field) {
  if (!field.embers.length) return;

  ctx.save();
  for (const ember of field.embers) {
    const t = ember.age / ember.life;
    if (t < SMOKE_FROM) continue;
    // Ramped in from where the grain starts cooling, and out again as it
    // disperses, so smoke arrives rather than appearing.
    const fade = (t - SMOKE_FROM) / (1 - SMOKE_FROM);
    const alpha = 0.3 * Math.sin(fade * Math.PI);
    if (alpha <= 0.004) continue;

    // Smoke swells as it cools — the one thing here that grows with age.
    const radius = worldToScreenLength(ember.size * (1 + fade * 2.2), ember.z);
    if (!(radius > 0.4)) continue;
    const screen = projectPoint(ember);

    const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, radius);
    gradient.addColorStop(0, ember.style.smoke);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "lighter";
  for (const ember of field.embers) {
    const t = ember.age / ember.life;
    // Cubed: a grain is at its brightest for a moment and then is gone, which
    // is what stops a trail reading as a solid painted stripe behind the ball.
    const alpha = Math.pow(Math.max(0, 1 - t), 3);
    if (alpha <= 0.01) continue;

    // Flame SHRINKS as it burns out, the opposite of the smoke above it.
    const radius = worldToScreenLength(ember.size * (1 - t * 0.45), ember.z);
    if (!(radius > 0.4)) continue;
    const screen = projectPoint(ember);

    const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, radius);
    // The core cools out of the middle of the grain rather than the grain
    // changing colour all at once, so the hot centre is the first thing to go.
    gradient.addColorStop(0, t < 0.35 ? ember.style.core : ember.style.flame);
    gradient.addColorStop(0.5, ember.style.flame);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
