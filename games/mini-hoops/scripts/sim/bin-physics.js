// Reusable trash-bin geometry and ball integration. A bin is not a score zone:
// it is a tapered body plus a torus lip, with a descending mouth-plane crossing
// registering the make. The same target objects can be reused by later modes.
//
// THE BIN IS THE ONLY DEFINITION OF ITSELF. `render/bin.js` draws every one of
// these numbers rather than sizing a sprite next to them — the mouth the player
// aims at is the mouth `detectBinScore` tests, at every row's depth, because the
// two are the same record read twice. That is the bug this file was rewritten
// against: an open-bin PNG whose painted mouth was a 9px slot standing in for a
// 55px physical opening, drawn from a near-horizontal camera in a room this
// camera looks steeply DOWN on. Nothing about that was fixable by nudging the
// sprite; the mouth had to be projected, not painted.
//
// THE ROOM IS THE CLASSIC ROOM. Floor, ceiling and back wall resolve through
// `sim/collision.js` — the same resolvers the classic cabinet runs — rather than
// through a private copy. The copy this replaced scrubbed 28% of the ball's
// horizontal speed EVERY SUBSTEP it spent on the floor, which is 125 times a
// second: a ball that landed anywhere but in a bin stopped dead on the spot
// instead of rolling out, and that alone is most of what read as the physics
// being wrong.

import { ballFlight, rollPhasePerRadian } from "../assets/ball-catalog.js";
import {
  BALL_RADIUS_WORLD,
  BOARD_Z,
  GRAVITY,
  PHYSICS_SUBSTEP_SECONDS,
  SPIN_DECAY_PER_TICK,
  WALL_RESTITUTION,
} from "./constants.js";
import { resolveCeilingContact, resolveFloorContact } from "./collision.js";

// The mouth a ball has to find. The ball is 0.078 across the radius, so the
// clear opening `binClearance` leaves is a little under one ball-radius of slack
// on either side.
//
// THE MOUTH IS AS WIDE AS THE ROOM ALLOWS, AND THE BINS TOUCH. Widening it looks
// like the obvious kindness and it is not available: the rows sit 0.27 apart,
// which is all the depth there is between a ball resting at z=0 and a back wall
// the ball cannot pass at z=0.92, and at this width neighbouring lips already
// overlap by about 0.098. Every non-overlapping layout that fits in the room
// leaves a clearance of 0.035 or less — half of what is here — so a bin grid
// with gaps between the bins is a strictly harder game, not a fairer one. The
// overlap is therefore deliberate, and `nearestBinTo` below is what keeps it
// honest.
//
// So the difficulty is fixed by the room, and the thing that was actually wrong
// was never this number: it was that the number appeared nowhere the player
// could see. The sprite this shipped with drew a 71px-wide bin around a 94px
// physical mouth at the front row, from a near-horizontal camera, in a room this
// camera looks steeply down on — a painted 9px slot standing in for a 55px
// opening. `render/bin.js` now draws these constants instead.
export const BIN_MOUTH_Y = 0.36;
export const BIN_MOUTH_RADIUS = 0.16;
export const BIN_BOTTOM_RADIUS = 0.133;
export const BIN_RIM_TUBE_RADIUS = 0.022;
export const BIN_WALL_THICKNESS = 0.016;

// The front row deliberately starts at z=.33. A target body has real depth and
// the held ball has real radius; moving it closer would make the ball begin its
// shot already intersecting the front wall of the nearest bin.
const ROW_Z = Object.freeze([0.87, 0.60, 0.33]);
const COLUMN_X = Object.freeze([-0.5, 0, 0.5]);
const SEPARATION = 0.0015;

/**
 * How far from a bin's axis the ball has to be before that bin cannot possibly
 * be touching it. A cheap reject in front of the two real resolvers.
 *
 * Nine bins by two resolvers by 125 substeps a second is not expensive, but the
 * reject buys something better than speed: it is a single statement of a bin's
 * reach, so a ball flying between two of them is provably clear of both, rather
 * than being separately declared clear by two solvers that each nearly matched.
 */
const BIN_REACH = BIN_MOUTH_RADIUS + BIN_WALL_THICKNESS + BIN_RIM_TUBE_RADIUS + BALL_RADIUS_WORLD;

export function createBinTargets() {
  return ROW_Z.flatMap((z, row) => COLUMN_X.map((x, column) => Object.freeze({
    index: row * 3 + column,
    row,
    column,
    x,
    z,
    topY: BIN_MOUTH_Y,
    mouthRadius: BIN_MOUTH_RADIUS,
    bottomRadius: BIN_BOTTOM_RADIUS,
    rimTubeRadius: BIN_RIM_TUBE_RADIUS,
    wallThickness: BIN_WALL_THICKNESS,
  })));
}

/** Is the ball anywhere near enough to this bin for a contact to be possible? */
export function withinBinReach(ball, bin) {
  if (ball.y > bin.topY + BALL_RADIUS_WORLD + bin.rimTubeRadius) return false;
  return Math.hypot(ball.x - bin.x, ball.z - bin.z) <= BIN_REACH;
}

/**
 * The one bin the ball is touching, if any: the nearest whose reach it is inside.
 *
 * ONE BIN PER SUBSTEP, and this is the rule that makes the deliberate overlap
 * above liveable. Neighbouring lips share about 0.098 of world space, so a ball
 * descending near a row boundary is genuinely inside two tori at once — and two
 * resolvers each correcting it out of their own ring, in list order, hand it an
 * impulse from a collision that never happened. That is what a rattle between
 * rows used to be: not a bounce off a rim, but the same contact solved twice.
 *
 * Nearest-by-axis is the honest reading of an overlap, because the deeper of two
 * intersecting bins is behind the shallower one — the lip the ball can actually
 * reach is the near one, and the far one's is buried inside it.
 */
export function nearestBinTo(ball, bins) {
  let nearest = null;
  let best = Infinity;
  for (const bin of bins) {
    if (!withinBinReach(ball, bin)) continue;
    const distance = Math.hypot(ball.x - bin.x, ball.z - bin.z);
    if (distance < best) {
      best = distance;
      nearest = bin;
    }
  }
  return nearest;
}

/**
 * The clear opening: how far off-axis the ball's CENTRE may be at the mouth
 * plane and still drop in.
 *
 * Exported because `render/bin.js` shades exactly this circle. The player is
 * entitled to see the hole they have to find rather than the lip around it, and
 * a renderer that computed its own version of it would be the sprite mismatch
 * back in a new form.
 */
export function binClearance(bin) {
  return bin.mouthRadius - BALL_RADIUS_WORLD - bin.rimTubeRadius * 0.55;
}

export function detectBinScore(ball, previous, bin) {
  if (ball.vy >= 0 || previous.y <= bin.topY || ball.y > bin.topY) return false;
  const drop = previous.y - ball.y;
  if (drop <= 1e-7) return false;
  const t = (previous.y - bin.topY) / drop;
  const x = previous.x + (ball.x - previous.x) * t;
  const z = previous.z + (ball.z - previous.z) * t;
  return Math.hypot(x - bin.x, z - bin.z) < binClearance(bin);
}

export function resolveBinRimContact(ball, bin, flight = { bounce: 1, grip: 1 }) {
  const dx = ball.x - bin.x;
  const dz = ball.z - bin.z;
  const radial = Math.hypot(dx, dz);
  if (radial < 1e-7) return null;
  const cx = bin.x + (bin.mouthRadius * dx) / radial;
  const cz = bin.z + (bin.mouthRadius * dz) / radial;
  let nx = ball.x - cx;
  let ny = ball.y - bin.topY;
  let nz = ball.z - cz;
  const distance = Math.hypot(nx, ny, nz);
  const contact = BALL_RADIUS_WORLD + bin.rimTubeRadius;
  if (distance >= contact || distance < 1e-7) return null;
  nx /= distance; ny /= distance; nz /= distance;
  const penetration = contact - distance + SEPARATION;
  ball.x += nx * penetration;
  ball.y += ny * penetration;
  ball.z += nz * penetration;
  const normalSpeed = ball.vx * nx + ball.vy * ny + ball.vz * nz;
  if (normalSpeed < 0) {
    // Plastic, not the classic cabinet's steel: deader than RIM_RESTITUTION, so
    // a lip strike drops toward the floor instead of pinballing across the board
    // and falling into somebody else's cell.
    const restitution = Math.max(0, Math.min(0.86, 0.46 * (flight.bounce ?? 1)));
    ball.vx -= (1 + restitution) * normalSpeed * nx;
    ball.vy -= (1 + restitution) * normalSpeed * ny;
    ball.vz -= (1 + restitution) * normalSpeed * nz;
    const grip = Math.min(0.3, 0.12 * (flight.grip ?? 1));
    ball.vx *= 1 - grip;
    ball.vz *= 1 - grip;
  }
  return "bin-rim";
}

export function resolveBinWallContact(ball, previous, bin, flight = { bounce: 1 }) {
  if (ball.y <= BALL_RADIUS_WORLD || ball.y >= bin.topY + BALL_RADIUS_WORLD) return null;
  const height = Math.max(0, Math.min(1, ball.y / bin.topY));
  const bodyRadius = bin.bottomRadius + (bin.mouthRadius - bin.bottomRadius) * height;
  const dx = ball.x - bin.x;
  const dz = ball.z - bin.z;
  const radial = Math.hypot(dx, dz);
  if (radial < 1e-7) return null;
  const insideLimit = bodyRadius - BIN_WALL_THICKNESS - BALL_RADIUS_WORLD;
  const outsideLimit = bodyRadius + BIN_WALL_THICKNESS + BALL_RADIUS_WORLD;
  if (radial < insideLimit || radial > outsideLimit) return null;

  const previousRadial = Math.hypot(previous.x - bin.x, previous.z - bin.z);
  const fromInside = previousRadial < bodyRadius;
  const ux = dx / radial;
  const uz = dz / radial;
  const normalSign = fromInside ? -1 : 1;
  const nx = ux * normalSign;
  const nz = uz * normalSign;
  const target = fromInside ? insideLimit - SEPARATION : outsideLimit + SEPARATION;
  ball.x = bin.x + ux * target;
  ball.z = bin.z + uz * target;
  const normalSpeed = ball.vx * nx + ball.vz * nz;
  if (normalSpeed < 0) {
    const bounce = Math.min(0.72, 0.3 * (flight.bounce ?? 1));
    ball.vx -= (1 + bounce) * normalSpeed * nx;
    ball.vz -= (1 + bounce) * normalSpeed * nz;
    // A glancing scrape down the outside of a bin should not eat the fall. This
    // was 0.88 and fired once per substep, so a ball brushing past a bin lost
    // most of its descent to a contact the player could not even see.
    ball.vy *= 0.94;
  }
  return "bin-wall";
}

export function stepBallAgainstBins(ball, bins, tickSeconds, { ballId = "basketball", capturedBin = null } = {}) {
  const substeps = Math.max(1, Math.ceil(tickSeconds / PHYSICS_SUBSTEP_SECONDS));
  const dt = tickSeconds / substeps;
  const flight = ballFlight(ballId);
  const gravity = GRAVITY * flight.weight;
  const dragKeep = flight.drag > 0 ? Math.exp(-flight.drag * dt) : 1;
  const phasePerRadian = rollPhasePerRadian(ballId);
  const contacts = [];
  let scoredBin = null;
  let capture = capturedBin;

  for (let step = 0; step < substeps; step++) {
    const previous = { x: ball.x, y: ball.y, z: ball.z };
    ball.vy -= gravity * dt;
    ball.vx *= dragKeep; ball.vy *= dragKeep; ball.vz *= dragKeep;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
    ball.omegaX *= Math.pow(SPIN_DECAY_PER_TICK, dt * 60);
    ball.rollPhase += ball.omegaX * dt * phasePerRadian;

    if (capture === null) {
      // Asked FIRST, for the reason `sim/physics.js` asks it first: a clean drop
      // must never be stolen by a lip resolver nudging the ball a fraction wide.
      for (const bin of bins) {
        if (detectBinScore(ball, previous, bin)) {
          scoredBin = bin.index;
          capture = bin.index;
          contacts.push("bin-score");
          break;
        }
      }
    }

    if (capture === null) {
      // One bin, chosen before either resolver runs. See `nearestBinTo`.
      const bin = nearestBinTo(ball, bins);
      if (bin) {
        const rim = resolveBinRimContact(ball, bin, flight);
        if (rim) contacts.push(rim);
        const wall = resolveBinWallContact(ball, previous, bin, flight);
        if (wall) contacts.push(wall);
      }
    } else {
      // A ball a bin already has is inside that bin, and nothing outside it can
      // reach through the wall to touch it.
      const target = bins.find((bin) => bin.index === capture);
      if (target) containCapturedBall(ball, target, dt);
    }

    // The room, through the classic cabinet's own resolvers. A ball that missed
    // every bin bounces and rolls exactly the way it does on the hoop court.
    const ceiling = resolveCeilingContact(ball, flight);
    if (ceiling) contacts.push(ceiling);
    const backWall = resolveBackWall(ball, flight);
    if (backWall) contacts.push(backWall);
    const floor = resolveFloorContact(ball, dt, flight);
    if (floor) contacts.push(floor);
  }
  return { contacts, scoredBin, capturedBin: capture };
}

/**
 * The ball, once a bin has it.
 *
 * Held on the bin's axis and pushed down: the shot is over, and what the player
 * is watching from here is a ball dropping into a hole. It keeps stepping only
 * so a turn takes the same time whether the make was clean or a rattle.
 */
function containCapturedBall(ball, bin, dt) {
  const dx = ball.x - bin.x;
  const dz = ball.z - bin.z;
  const radial = Math.hypot(dx, dz);
  const limit = Math.max(0.015, bin.bottomRadius - BALL_RADIUS_WORLD);
  if (radial > limit) {
    const scale = limit / radial;
    ball.x = bin.x + dx * scale;
    ball.z = bin.z + dz * scale;
  }
  const keep = Math.pow(0.035, dt);
  ball.vx *= keep;
  ball.vz *= keep;
  ball.vy = Math.min(ball.vy, -0.45);
}

/**
 * The back wall.
 *
 * The classic cabinet's `resolveBackWallContact` is welded to the backboard, and
 * there is no backboard on this floor — so the bare plaster is resolved here,
 * against the same `WALL_RESTITUTION` the classic room uses, so a ball coming
 * off the wall behaves identically in both modes.
 */
function resolveBackWall(ball, flight) {
  const limit = BOARD_Z - BALL_RADIUS_WORLD;
  if (ball.z <= limit) return null;
  ball.z = limit - SEPARATION;
  ball.vz = -Math.abs(ball.vz) * Math.min(1, WALL_RESTITUTION * (flight.bounce ?? 1));
  return "wall";
}
