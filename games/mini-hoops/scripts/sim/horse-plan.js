// How the CPU INVENTS a trick shot, rather than answering one.
//
// `sim/horse-cpu.js` is the other half of this and the two are opposites. There
// the CPU is handed an apparatus somebody else built and a pull that is already
// known to route through it, and all it has to do is repeat the shot. Here it
// has neither, and has to end up holding both: an apparatus of its own, and a
// pull it has PROVED against it, because the mode's own rule is that the setter
// shoots first.
//
// SEARCHING FOR A TRICK SHOT IS NOT AVAILABLE. A pull is three numbers and a
// tool is nine more; sweeping that space until something goes in is thousands of
// replays inside one turn of a court running at 60Hz. So nothing here searches
// for a shot. It BUILDS one onto a shot it already has:
//
//   1. Take the plain lead pull `sim/horse-cpu.js` would have taken anyway and
//      PULL IT SHORT, then replay it at the bare target with the path recorded.
//   2. Drop a cannon's mouth onto a point on the DESCENDING half of that path.
//      The incoming half of the trick shot is then proved by construction — the
//      ball falls exactly where it was always going to fall, and a cannon has no
//      collider but its mouth, so nothing before the catch has changed at all.
//   3. Solve the OUTGOING half, which is the whole reason this works. A cannon
//      fires on its own authored yaw/pitch/speed from its own position, so the
//      flight out of it does not depend on the pull that went in. The two halves
//      are genuinely independent, and only the second one has to be solved.
//
// THE SEED IS PULLED SHORT ON PURPOSE, and that is the step that makes the whole
// thing work rather than a saving. A pull that converts the target bare descends
// for a few hundredths of a second, from its apex into the rim — measured, there
// is not one point on it low enough to stand a cannon under. A pull that lands
// short comes down through the whole room, which is a long descent full of
// places a cannon can be. The CPU is not aiming at the target and being helped;
// it is deliberately shooting somewhere else and letting the cannon finish, and
// that is what a trick shot IS. Some of the seeds miss SIDEWAYS as well, for a
// reason that is not obvious until a near bin refuses to cooperate — see `SEEDS`.
//
// A pad or a springboard would not decompose like that: deflect a ball and the
// rest of the flight is a function of the pull again, so both halves move at
// once and there is nothing left but the search this cannot afford. The cannon
// is the one tool in the Lab that CUTS THE SHOT IN TWO, which is why it is the
// one tool the CPU builds with.
//
// EVERY CANDIDATE IS REPLAYED AND ONLY A MADE ONE IS RETURNED. The ballistic
// solve below ignores drag, exactly as `sim/launch.js` does and for a weaker
// reason — there is no player here to learn a ball's own number — so it is a
// seed and never an answer. A plan that does not convert in the real sim is
// discarded, and a turn with no plan is the bare target the CPU has always set.
// THE CPU MAY NEVER SET A SHOT IT HAS NOT ITSELF MADE, which is the rule the
// human setter already plays under.

import { ballFlight } from "../assets/ball-catalog.js";
import { AIM_MAX_X, AIM_MIN_X, GRAVITY, TICK_SECONDS } from "./constants.js";
import { PIECE_BOUNDS, cannonDirection, createSandboxPiece } from "./trick-shot.js";
import { CANNON_MOUTH_HEIGHT, CANNON_MUZZLE_CLEARANCE } from "./trick-shot-physics.js";
import { HOOP_TARGET } from "./trick-shot-target.js";
import { hoopWorldState } from "./hoop.js";
import { horseTargetAt, horseTargetKind } from "./horse-shot.js";
import { leadPull } from "./horse-cpu.js";
import { HORSE_LAB_TOOLS_ENABLED } from "./horse.js";
import { replayHorseShot } from "./horse-replay.js";

/**
 * The moment on the turn's motion clock the plan is both proved and released at.
 *
 * It has to be ONE moment for both, and it has to be past the court's own
 * thinking pause, or the CPU would prove a shot at a phase of the target's sweep
 * it then has to sit through before it can take it — which for a moving target
 * is a different shot entirely.
 */
export const PLAN_RELEASE_SECONDS = 1;

const CANNON_DELAY = 0.5;
// How the seed is pulled OFF the lead that would have converted the target on
// its own: a fraction of its power, and an offset on its aim, in the screen
// pixels a reticle actually moves in.
//
// Both are needed, and the aim is the one that is not obvious. Pulling short is
// enough at a far target, but a bin near the player's feet has a power window so
// wide that every short pull still drops through it — and a seed that goes in is
// not a seed. Missing SIDEWAYS is the answer that works everywhere.
const SEEDS = Object.freeze([
  Object.freeze({ power: 0.78, aim: 0 }),
  Object.freeze({ power: 0.66, aim: 0 }),
  Object.freeze({ power: 0.82, aim: -120 }),
  Object.freeze({ power: 0.82, aim: 120 }),
  Object.freeze({ power: 0.55, aim: 0 }),
  Object.freeze({ power: 0.95, aim: -170 }),
]);
const SEED_POWER = Object.freeze([0.2, 1]);
// Flight times out of the muzzle. Short enough to still read as a shot, long
// enough to arc; the clamps on a cannon's own speed and pitch throw most of them
// out for any given site, which is part of what keeps the sweep cheap.
const MUZZLE_SECONDS = Object.freeze([0.45, 0.6, 0.75, 0.95, 1.15]);
// The drag the ballistic seed does not know about, handed back to the muzzle as
// speed. Ordered, so the first that converts is the least correction that works.
const DRAG_SCALES = Object.freeze([1, 1.08, 1.16, 1.25]);
const CANNON_SPEED = Object.freeze([2.5, 7.5]);
// Shorter than the cabinet's own 7-second give-up, and it may only be shorter:
// abandoning a lob early can lose the planner a shot it would have found, never
// hand it one the court will not then play out the same way. The seed is cut
// harder still, because all that is wanted from it is where the ball comes down.
const PLAN_SECONDS = 3.2;
const SEED_SECONDS = 2.2;
// A candidate is replayed only until the shot it is testing has had time to
// happen: the catch, the hold, the flight out, and a little slack for a ball
// that rattles in. Anything still in the air past that is a miss whether it is
// watched or not — and the two balls that bounce forever would otherwise be
// watched to the timeout on every single candidate.
const PLAN_TAIL_SECONDS = 0.4;
const CANNON_PITCH = Object.freeze([Math.PI / 36, Math.PI * 0.44]);
// How near the end of the seed flight a cannon may still be dropped. Closer than
// this and it is not intercepting the shot, it is standing in the target.
const INTERCEPT_MARGIN_SECONDS = 0.18;
// Every eighth substep of the descent, four sites at most: adjacent samples are
// about a centimetre apart and two cannons a centimetre apart are the same plan
// replayed twice.
const SITE_STRIDE = 8;
const MAX_SITES = 4;
/**
 * How much SIMULATED time the planner may spend, in seconds of ball flight.
 *
 * Bounded because this runs inside one tick of a live court, and bounded in
 * flight seconds rather than in attempts because the two are not proportional:
 * a ball that drops straight through costs a fraction of a second, and one of
 * the two balls that bounce forever costs the whole give-up timeout every single
 * time. Counting attempts, the same budget was 15ms on one target and 500 on
 * another — which is the difference between a CPU that thinks and one that hangs.
 *
 * It is a count of simulated seconds and NOT a stopwatch, which matters: the sim
 * reads no clock anywhere, and a planner that gave up on wall time would set a
 * different shot on a fast machine than on a slow one.
 */
export const PLAN_FLIGHT_BUDGET = 90;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const within = (value, [min, max]) => value >= min && value <= max;

/** The point a shot at this target has to arrive at, in world units. */
export function horseTargetPoint(setup, seconds = 0) {
  const target = horseTargetAt(setup, seconds);
  if (horseTargetKind(setup) === HOOP_TARGET) {
    const rim = hoopWorldState(target.hoop);
    return { x: rim.rimX, y: rim.rimY, z: rim.rimZ };
  }
  return { x: target.bin.x, y: target.bin.topY, z: target.bin.z };
}

/**
 * Plan one trick shot for the CPU to set.
 *
 * @param setup  the bare target it has already chosen — kind, motion, placement.
 * @param ballId the ball it has already chosen; a plan is only true for that one.
 * @returns `{ pieces, requiredPieces, pull }`, or null when nothing converted.
 *          `pull` carries `motionSeconds`, so it is exactly the recipe shape
 *          `sim/horse-cpu.js` takes a human setter's proven pull in.
 */
export function planCpuTrickShot({ setup, ballId, budget = PLAN_FLIGHT_BUDGET } = {}) {
  if (!HORSE_LAB_TOOLS_ENABLED) return null;
  if (!setup) return null;
  const bare = { ...setup, pieces: [], requiredPieces: [] };
  const weight = ballFlight(ballId).weight;
  // The CPU's own honest lead is where every seed starts, so a target it could
  // not convert bare is one it will not dress up either.
  const lead = leadPull(bare, ballId, PLAN_RELEASE_SECONDS);

  let left = Math.max(0, budget);
  const replay = (intent, pieces, { trace = false, maxSeconds = PLAN_SECONDS, at = PLAN_RELEASE_SECONDS } = {}) => {
    if (left <= 0) return null;
    const result = replayHorseShot({
      setup: { ...bare, pieces },
      intent,
      motionSeconds: at,
      maxSeconds,
      trace,
    });
    left -= result.seconds;
    return result;
  };
  // A PLAN HAS TO SURVIVE ONE TICK OF SLOP, and this is the one place the
  // planner has to know something about the court. It releases on the first tick
  // whose clock has reached the recipe's moment, which is at or just past it and
  // never exactly on it — so a moving target is up to a tick further along than
  // the plan was proved against. A shot that only converts on the exact frame it
  // was found on is one the CPU would set and then miss.
  const survivesRelease = (intent, pieces, maxSeconds) => {
    const later = replay(intent, pieces, { at: PLAN_RELEASE_SECONDS + TICK_SECONDS, maxSeconds });
    return Boolean(later?.made && later.touched.includes(pieces[0].id));
  };

  for (const seed_ of SEEDS) {
    const seedPull = {
      ...lead,
      power: clamp(lead.power * seed_.power, ...SEED_POWER),
      // Clamped to the reticle's own reach, so a seed is always a pull a player
      // could have taken — the CPU does not get an aim nobody else has.
      aimX: clamp(lead.aimX + seed_.aim, AIM_MIN_X, AIM_MAX_X),
      ballId,
    };
    const seed = replay(seedPull, [], { trace: true, maxSeconds: SEED_SECONDS });
    if (!seed?.path?.length) return null;
    // A seed that goes in on its own is not a seed. It cannot be caught on the
    // way — its whole descent is inside the target — and shipping it would be
    // the CPU calling a plain shot a trick shot.
    if (seed.made) continue;

    for (const [index, site] of interceptSites(seed.path).entries()) {
      const cannon = { id: `cpu-cannon-${index + 1}`, delay: CANNON_DELAY };
      for (const seconds of MUZZLE_SECONDS) {
        const aimed = aimCannon({ setup, site, cannon, weight, seconds });
        if (!aimed) continue;
        for (const speedScale of DRAG_SCALES) {
          const speed = aimed.speed * speedScale;
          if (!within(speed, CANNON_SPEED)) continue;
          const piece = createSandboxPiece("cannon", { ...aimed.piece, speed });
          const deadline = site.t + cannon.delay + seconds + PLAN_TAIL_SECONDS;
          const result = replay(seedPull, [piece], { maxSeconds: deadline });
          if (!result) return null;
          if (result.made && result.touched.includes(piece.id) && survivesRelease(seedPull, [piece], deadline)) {
            return {
              pieces: [piece],
              requiredPieces: [piece.id],
              pull: { ...seedPull, motionSeconds: PLAN_RELEASE_SECONDS },
            };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Where on a proven flight a cannon may be dropped.
 *
 * DESCENDING ONLY, and never in the last stretch before the target: a cannon
 * catches a ball whose centre crosses its mouth on the way DOWN, so a rising
 * sample is a mouth the ball would fly straight past, and a sample at the target
 * is a cannon standing in the hole.
 *
 * Ordered latest-first. A late interception leaves most of the original flight
 * intact and asks the muzzle for the shortest, flattest shot, which is the one
 * most likely to fall inside a cannon's own speed and pitch clamps — so the
 * cheapest plans are tried first and the sweep usually stops on the first site.
 */
export function interceptSites(path = []) {
  const last = path[path.length - 1]?.t ?? 0;
  const sites = [];
  const descending = path.filter((point) => point.vy < 0
    && point.t <= last - INTERCEPT_MARGIN_SECONDS
    && within(point.x, PIECE_BOUNDS.x)
    && within(point.z, PIECE_BOUNDS.z)
    && within(point.y - CANNON_MOUTH_HEIGHT, PIECE_BOUNDS.y));
  for (let index = descending.length - 1; index >= 0 && sites.length < MAX_SITES; index -= SITE_STRIDE) {
    sites.push(descending[index]);
  }
  return sites;
}

/**
 * Point one cannon at the target and say how fast it has to fire.
 *
 * The muzzle is offset from the mouth ALONG THE BARREL, so where the ball
 * actually leaves from depends on the answer — solved once from the mouth to
 * learn the direction, then again from the muzzle that direction implies. Two
 * passes rather than a loop: the clearance is 0.17 and a third pass moves the
 * answer by less than the sim's own substep.
 *
 * @returns `{ piece, speed }`, or null when no cannon can be pointed that way.
 */
export function aimCannon({ setup, site, cannon, weight = 1, seconds }) {
  const gravity = GRAVITY * Math.max(0.05, weight);
  const mouth = { x: site.x, y: site.y, z: site.z };
  // Fired `delay` after the catch, and it arrives `seconds` after that — so a
  // moving target has moved on twice over by the time the ball reaches it.
  const arrival = site.t + cannon.delay + seconds;
  const target = horseTargetPoint(setup, PLAN_RELEASE_SECONDS + arrival);

  let from = mouth;
  let solved = null;
  for (let pass = 0; pass < 2; pass += 1) {
    const vx = (target.x - from.x) / seconds;
    const vy = (target.y - from.y) / seconds + 0.5 * gravity * seconds;
    const vz = (target.z - from.z) / seconds;
    const speed = Math.hypot(vx, vy, vz);
    if (!(speed > 0)) return null;
    const pitch = Math.asin(clamp(vy / speed, -1, 1));
    if (!within(pitch, CANNON_PITCH)) return null;
    solved = { speed, pitch, yaw: Math.atan2(vx, vz) };
    const direction = cannonDirection(solved);
    from = {
      x: mouth.x + direction.x * CANNON_MUZZLE_CLEARANCE,
      y: mouth.y + direction.y * CANNON_MUZZLE_CLEARANCE,
      z: mouth.z + direction.z * CANNON_MUZZLE_CLEARANCE,
    };
  }

  return {
    speed: solved.speed,
    piece: {
      id: cannon.id,
      x: mouth.x,
      // A cannon's `y` is its foot; its mouth sits above that, and the mouth is
      // the part that has to be where the ball is.
      y: mouth.y - CANNON_MOUTH_HEIGHT,
      z: mouth.z,
      yaw: solved.yaw,
      pitch: solved.pitch,
      delay: cannon.delay,
    },
  };
}
