// One-off measurement tool: how often does a shot go in?
//
//   node tools/make-rate.mjs [--samples coarse|fine]
//
// It fires a grid of shots across power, loft and reticle position at a still
// rim, plays each one out through the real sim, and reports the make rate plus a
// breakdown of what each make touched on the way in.
//
// It exists because the cabinet's difficulty is an emergent property of five
// colliders and a solver, and "did that change just make the game easier?" is
// otherwise unanswerable except by feel. It is what settled whether the ceiling
// should be a live surface or a dead one: 9.30% with it against 9.16% without,
// which said the ceiling re-routes shots the back wall used to save rather than
// handing out new ones — so calling a ceiling contact a dead miss would have
// been throwing away real makes.
//
// RUN IT BEFORE AND AFTER any change to `sim/collision.js`, `sim/constants.js`
// or `sim/launch.js`, and put the two numbers in the commit message. It is not
// part of `npm test`: it takes a few seconds, and a make rate is a thing to
// compare across a change rather than to pin to a number.

import { hoopAt } from "../scripts/sim/hoop.js";
import { createBall, isBallSettled, launchBall, stepBall, worldFor } from "../scripts/sim/physics.js";
import { launchSpin, solveLaunch } from "../scripts/sim/launch.js";
import { TICK_SECONDS } from "../scripts/sim/constants.js";

const args = process.argv.slice(2);
const fine = args.includes("--samples") && args[args.indexOf("--samples") + 1] === "fine";

const POWERS = [];
for (let power = 0.4; power <= 1.001; power += fine ? 0.005 : 0.01) POWERS.push(Number(power.toFixed(3)));
const LOFTS = fine ? [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] : [0, 0.25, 0.5, 0.75, 1];
const AIM_X = fine ? [380, 420, 440, 460, 480, 500, 520, 540, 580] : [400, 440, 480, 520, 560];
const AIM_Y = fine ? [190, 200, 210, 222, 230, 240] : [195, 210, 222, 235];

// Every surface a make can bounce off, in the order a shot meets them.
const SURFACES = ["ceiling", "wall", "backboard", "rim"];

let made = 0;
let total = 0;
const routes = new Map();

for (const power of POWERS) {
  for (const loft of LOFTS) {
    for (const x of AIM_X) {
      for (const y of AIM_Y) {
        total += 1;
        const { scored, touched } = fire({ aim: { x, y }, power, loft });
        if (!scored) continue;
        made += 1;
        const route = SURFACES.filter((surface) => touched.has(surface)).join("+") || "clean";
        routes.set(route, (routes.get(route) ?? 0) + 1);
      }
    }
  }
}

console.log(`${POWERS.length} powers x ${LOFTS.length} lofts x ${AIM_X.length * AIM_Y.length} reticle positions`);
console.log(`made ${made} / ${total}  (${((100 * made) / total).toFixed(2)}%)`);
for (const [route, count] of [...routes].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${route}`);
}

/** One shot, played out to a conclusion against a still rim. */
function fire({ aim, power, loft, ballId = "basketball" }) {
  const ball = createBall();
  const launch = solveLaunch({ origin: { x: ball.x, y: ball.y, z: ball.z }, aim, power, loft });
  launchBall(ball, launch, launchSpin(launch));

  const touched = new Set();
  let scored = false;
  for (let tick = 0; tick < 400; tick++) {
    const stepped = stepBall(ball, worldFor(hoopAt("still", tick * TICK_SECONDS)), TICK_SECONDS, {
      ballId,
      alreadyScored: scored,
    });
    for (const contact of stepped.contacts) touched.add(contact);
    if (stepped.scored) scored = true;
    if (isBallSettled(ball)) break;
  }
  return { scored, touched };
}
