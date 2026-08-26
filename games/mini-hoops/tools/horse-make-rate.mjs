// One-off measurement tool: how hard is a HORSE bin to hit, and from where?
//
//   node tools/horse-make-rate.mjs [--samples coarse|fine]
//
// For every motion, at every corner of the legal placement volume, it fires a
// grid of pulls across power and aim, plays each one out through the real sim
// against the real MOVING bin, and reports two numbers per motion: how many of
// those placements can be made at all, and how wide the average make window is.
//
// It is `make-rate.mjs` for the mode where the player chooses the target. The
// classic cabinet has one difficulty because it has one rim; HORSE has a whole
// volume of them, and the question is not "how hard is the shot" but "is the
// hardest thing a player is ALLOWED to build still a shot".
//
// It is what found the bug the placement volume shipped with: the visible floor
// is wider than the reticle can swing, so a ring of placements around the back
// corners of the room were legal, drawn, and impossible — 8 of 12 corners
// makeable for a still bin, and the four that failed were all at the back
// corners. Intersecting the placement band with `AIM_MIN_X..AIM_MAX_X` took it
// to 12 of 12. `tests/horse.test.js` now pins the "makeable at all" half of
// that; this tool owns the half that is a judgement rather than a rule.
//
// RUN IT BEFORE AND AFTER any change to `sim/bin-placement.js`,
// `sim/horse-shot.js` or the bin colliders, and put the two tables in the commit
// message. Not part of `npm test`, for the same reason `make-rate.mjs` is not: a
// window width is a thing to compare across a change, not to pin to a number.

import { AIM_MAX_X, AIM_MIN_X, TICK_SECONDS } from "../scripts/sim/constants.js";
import { BIN_MOTIONS, placedBinAt, placementFromFractions } from "../scripts/sim/bin-placement.js";
import { createHorseShot } from "../scripts/sim/horse-shot.js";
import { stepBallAgainstBins } from "../scripts/sim/bin-physics.js";
import { createBall, isBallSettled, launchBall } from "../scripts/sim/physics.js";
import { launchSpin } from "../scripts/sim/launch.js";

const args = process.argv.slice(2);
const fine = args[args.indexOf("--samples") + 1] === "fine";

const POWER_STEP = fine ? 0.025 : 0.05;
const AIM_STEP = fine ? 10 : 20;
const DEPTHS = fine ? [0, 0.5, 1] : [0, 1];
const HEIGHTS = fine ? [0, 0.5, 1] : [0, 1];
const LANES = [-1, 0, 1];

/** One shot, played out through the real sim against the real moving bin. */
function playShot(setup, power, aimX) {
  const ball = createBall();
  const shot = createHorseShot({ power, aimX, loft: 1 }, ball, setup);
  launchBall(ball, shot.launch, launchSpin(shot.launch));
  let clock = 0;
  let age = 0;
  let captured = null;
  while (age < 3) {
    const result = stepBallAgainstBins(ball, [placedBinAt(setup, clock)], TICK_SECONDS, {
      ballId: "basketball",
      capturedBin: captured,
    });
    if (result.capturedBin !== null) captured = result.capturedBin;
    if (result.scoredBin !== null) return true;
    if (age > 0.45 && isBallSettled(ball)) return false;
    clock += TICK_SECONDS;
    age += TICK_SECONDS;
  }
  return false;
}

const rows = [];
for (const motion of BIN_MOTIONS) {
  let placements = 0;
  let makeable = 0;
  let windowSum = 0;
  const dead = [];

  for (const depth of DEPTHS) {
    for (const height of HEIGHTS) {
      for (const lateral of LANES) {
        const setup = {
          ...placementFromFractions({ lateral, depth, height }, motion.id),
          motionId: motion.id,
        };
        placements++;
        let hits = 0;
        let total = 0;
        for (let power = POWER_STEP; power <= 1; power += POWER_STEP) {
          for (let aimX = AIM_MIN_X; aimX <= AIM_MAX_X; aimX += AIM_STEP) {
            total++;
            if (playShot(setup, power, aimX)) hits++;
          }
        }
        if (hits) makeable++; else dead.push(`d${depth} h${height} l${lateral}`);
        windowSum += hits / total;
      }
    }
  }

  rows.push({
    motion: motion.id,
    makeable: `${makeable}/${placements}`,
    avgWindow: `${((windowSum / placements) * 100).toFixed(2)}%`,
    unmakeable: dead.join(", ") || "-",
  });
}

console.table(rows);
console.log(
  "\nmakeable  — placements where SOME pull drops the ball. Anything but n/n is a bug:",
  "\n            a legal placement that no pull can convert is not a hard shot.",
  "\navgWindow — share of the whole (power x aim) grid that drops. This is the",
  "\n            difficulty dial; compare it across a change rather than reading it alone.",
);
