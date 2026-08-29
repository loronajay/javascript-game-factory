// How the CPU answers a shot it could never have invented.
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
import { horseMotionPeriod } from "./horse-shot.js";
import { normalizeProvenPull, requiredPieceIds } from "./horse.js";

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
 * The pull the CPU should take at a standing trick shot, and when.
 *
 * @param makes whether this CPU is converting this one — `cpuMakesHorseShot`.
 * @param stray a signed jitter, the same one the direct shots use.
 * @returns `{ pull, atSeconds }`, or null if there is nothing recorded to repeat.
 */
export function provenPullShot(setup, { makes = true, stray = () => 1 } = {}) {
  if (!needsProvenPull(setup)) return null;
  const pull = normalizeProvenPull(setup.provenPull);
  return {
    atSeconds: provenPullPhase(setup),
    pull: {
      power: pull.power + (makes ? 0 : stray() * 0.06),
      aimX: pull.aimX + (makes ? 0 : stray() * 70),
      loft: pull.loft,
    },
  };
}
