// How the CPU answers a shot it could never have invented — and takes one it
// invented itself.
//
// `sim/horse-plan.js` is the other half. This file is what the CPU does with a
// recipe; that one is where a recipe of its own comes from. They meet at
// `recipeShot` below, so the CPU repeats a shot it built exactly the way it
// repeats one a person built, and nothing downstream learns two ways to do it.
//
// Every other CPU turn in this mode is a solve: it asks where the target will be
// when the ball gets there and aims at that. A shot with a DUTY on it cannot be
// answered that way, and that is the point of the rule rather than a gap in it —
// the ball has to go off a springboard, through a cannon, and only then in, and
// no amount of leading the target finds that route.
//
// So the CPU does what the mode asks a person to do: IT REPEATS THE SHOT. The
// setter had to make their own apparatus work before it became a shot anybody
// owed, and `recordShotDuty` kept the pull that did it. The matcher inherits the
// ball, the target, the tools and the motion clock — which restarts on every
// turn — so the same pull at the same phase of the same path is the same flight,
// and nothing has to be searched for.
//
// THE PHASE IS TAKEN MODULO THE PERIOD, which is what keeps it a shot rather
// than a wait. A player may stand and watch a moving bin for half a minute
// before releasing; a CPU sitting through that would read as a hang. One period
// later the target is in the identical place, so the CPU releases at the first
// equivalent moment.
//
// AND IT STILL MISSES ON PURPOSE. `cpuMakesHorseShot` is the difficulty, and a
// CPU that converted every trick shot handed to it merely because it had the
// recipe would be a harder opponent than any of its three settings claim. A miss
// is the proven pull with the same stray the direct shots take.
import { ballFlight } from "../assets/ball-catalog.js";
import { REFERENCE_POWER } from "./constants.js";
import { placedBinAt } from "./bin-placement.js";
import { placedHoopAt } from "./hoop-placement.js";
import { HOOP_TARGET } from "./trick-shot-target.js";
import { createHorseShot, horseMotionPeriod, horsePowerForDepth, horseTargetKind } from "./horse-shot.js";
import { createBall } from "./physics.js";
import { projectPoint } from "./projection.js";
import { normalizeProvenPull, requiredPieceIds } from "./horse.js";

/**
 * The pull the CPU takes at a target it can simply aim at.
 *
 * IT LEADS. The shot solves once to learn its own flight time, asks the motion
 * where the target will be when the ball gets there, and aims at that — without
 * which the CPU is comically bad at exactly the setups it has just chosen for
 * itself.
 *
 * The two kinds are two gestures rather than one with a field swapped: at a
 * hoop strength is POWER and the reference pull is the one that lands on the
 * reticle, where at a bin strength is DEPTH and the launch is solved at the
 * reference regardless.
 *
 * Returned WITHOUT the difficulty stray, because two callers want different
 * things from it. The court adds the stray, since missing on purpose is what
 * its difficulty setting means; `sim/horse-plan.js` wants the honest pull, since
 * it is about to build an apparatus onto the path that pull actually flies.
 */
export function leadPull(setup, ballId, clock = 0) {
  const weight = ballFlight(ballId).weight;
  const origin = createBall();
  const flightTime = (pull) =>
    Math.max(0, createHorseShot(pull, origin, setup, { weight }).launch.flightTime);

  if (horseTargetKind(setup) === HOOP_TARGET) {
    const rest = placedHoopAt(setup, clock);
    const lead = placedHoopAt(setup, clock + flightTime({ power: REFERENCE_POWER, aimX: rest.cx, loft: 1 }));
    return { power: REFERENCE_POWER, aimX: lead.cx, loft: 1 };
  }

  const rest = placedBinAt(setup, clock);
  const seconds = flightTime({ power: horsePowerForDepth(rest.z), aimX: projectPoint(rest).x, loft: 1 });
  const lead = placedBinAt(setup, clock + seconds);
  return {
    power: horsePowerForDepth(lead.z),
    aimX: projectPoint({ x: lead.x, y: lead.topY, z: lead.z }).x,
    loft: 1,
  };
}

/** Does this standing shot need the recorded pull, or can the CPU solve it? */
export function needsProvenPull(setup) {
  return requiredPieceIds(setup).length > 0 && Boolean(setup?.provenPull);
}

/**
 * The moment on this turn's motion clock the recorded pull was released at.
 *
 * Asked separately from the pull itself because the court has to WAIT for it,
 * and it is asked once a tick until it arrives — rolling the difficulty dice
 * that decide whether this shot goes in sixty times a second would make a hard
 * CPU out of an easy one.
 */
export function provenPullPhase(setup) {
  if (!needsProvenPull(setup)) return 0;
  return normalizeProvenPull(setup.provenPull).motionSeconds % horseMotionPeriod(setup);
}

/**
 * A recorded pull, and the moment to take it at.
 *
 * The one shape both halves of the CPU's trick-shot life share: `sim/horse-plan.js`
 * hands over a pull it has just proved against an apparatus of its own, and
 * `provenPullShot` below hands over the pull the human setter proved against
 * theirs. Neither is solved for at the moment of release, so neither is a lead —
 * they are recipes, and this is how a recipe is taken.
 *
 * @param makes whether this CPU is converting this one — `cpuMakesHorseShot`.
 * @param stray a signed jitter, the same one the direct shots use.
 */
export function recipeShot(pull, { periodSeconds = 1, makes = true, stray = () => 1 } = {}) {
  const recipe = normalizeProvenPull(pull);
  const period = Number.isFinite(periodSeconds) && periodSeconds > 0 ? periodSeconds : 1;
  return {
    atSeconds: recipe.motionSeconds % period,
    pull: {
      power: recipe.power + (makes ? 0 : stray() * 0.06),
      aimX: recipe.aimX + (makes ? 0 : stray() * 70),
      loft: recipe.loft,
    },
  };
}

/**
 * The pull the CPU should take at a standing trick shot, and when.
 *
 * @returns `{ pull, atSeconds }`, or null if there is nothing recorded to repeat.
 */
export function provenPullShot(setup, options = {}) {
  if (!needsProvenPull(setup)) return null;
  return recipeShot(setup.provenPull, { ...options, periodSeconds: horseMotionPeriod(setup) });
}
