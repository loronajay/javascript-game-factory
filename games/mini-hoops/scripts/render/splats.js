// Splat decals and the powder they throw.
//
// Draw calls only, like everything else in here — the field arrives already
// advanced by `effects/splat-field.js`, and nothing in this file writes to it.
//
// Both live in world space and go through the one projection, so a splat high
// on the back wall sits smaller and higher than one at the player's feet
// without this file knowing anything about perspective.

import { BALL_RADIUS_WORLD } from "../sim/constants.js";
import { floorScreenY, projectPoint, worldToScreenLength } from "../sim/projection.js";

/**
 * The marks stuck to the room, oldest first.
 *
 * `imagesFor` is asked PER DECAL, with that decal's own ball id, and returns
 * `{ wall, ground }` from the loader or null for a ball that does not splat.
 * It is a lookup rather than one resolved pair because the field outlives the
 * ball selection — the wall keeps its snowball marks after the player has
 * picked up the meatball, and a single pair would re-dress every mark in the
 * room in whatever is in hand now. Missing or still-decoding art falls back to
 * a painted blob rather than a hole, per the repo's placeholder rule: the ball
 * has already vanished by the time this draws, so drawing nothing would look
 * like the shot did.
 */
export function drawSplatDecals(ctx, field, { imagesFor = () => null } = {}) {
  for (const decal of field.decals) {
    const screen = projectPoint({ x: decal.x, y: decal.y, z: decal.z });
    // Sized in WORLD units and projected, not scaled off the ball sprite. The
    // ball's draw radius carries a minimum so a ball that overshoots the room
    // never shrinks to nothing, and borrowing that floor here would quietly
    // hold every distant splat too large — which is the one thing a mark
    // painted onto the room cannot do. A splat at the back wall is half the
    // size of the same splat at the player's feet because it IS half the size.
    const ballRadius = worldToScreenLength(BALL_RADIUS_WORLD, decal.z);
    const size = ballRadius * 2 * decal.scale;
    const images = imagesFor(decal.ballId);
    const image = decal.surface === "floor" ? images?.ground : images?.wall;

    // The projection puts a ground-level CENTRE on the floor line, so a pile
    // lying on the floor belongs one projected radius lower — the same
    // correction the ball's shadow makes, for the same reason.
    const y = decal.surface === "floor" ? floorScreenY(decal.z) + ballRadius * 0.92 : screen.y;

    ctx.save();
    ctx.translate(screen.x, y);
    if (decal.rotation) ctx.rotate(decal.rotation);
    if (decal.flip) ctx.scale(-1, 1);

    if (image && image.complete && image.naturalWidth) {
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
    } else {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = decal.color;
      ctx.beginPath();
      // The stand-in is squashed on the floor and round on the wall, so even
      // the fallback reads as lying down rather than stuck up.
      ctx.ellipse(0, 0, size * 0.32, size * (decal.surface === "floor" ? 0.12 : 0.3), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * The powder in the air.
 *
 * Drawn as flat discs with no art behind them: at this size a grain is three or
 * four pixels across, and a sprite would be a download spent on something no
 * one can resolve.
 */
export function drawSplatParticles(ctx, field) {
  ctx.save();
  for (const particle of field.particles) {
    const alpha = Math.max(0, 1 - particle.age / particle.life);
    if (alpha <= 0) continue;

    const screen = projectPoint(particle);
    const radius = Math.max(0.9, particle.size * 390 * screen.scale);

    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
