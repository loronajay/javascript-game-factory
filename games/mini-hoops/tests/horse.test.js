import { suite, test, assert, assertClose, assertEqual, finish } from "./harness.js";

import {
  AIM_MAX_X,
  AIM_MIN_X,
  BALL_RADIUS_WORLD,
  TICK_SECONDS,
} from "../scripts/sim/constants.js";
import {
  BIN_BODY_HEIGHT,
  BIN_MOTIONS,
  EYE_LEVEL_Y,
  PLACEMENT_BOUNDS,
  clampPlacement,
  motionEnvelope,
  horizontalBoundsAt,
  maxMouthHeightAt,
  normalizeBinSetup,
  placedBinAt,
  placementFromFractions,
} from "../scripts/sim/bin-placement.js";
import { createHorseShot, horseAimDepth, horsePowerForDepth } from "../scripts/sim/horse-shot.js";
import {
  DEFAULT_WORD,
  MAX_WORD_LENGTH,
  PHASE_MATCH,
  PHASE_SET,
  canPlaceBin,
  chooseCpuBinSetup,
  createHorseMatch,
  letterState,
  normalizeWord,
  resolveHorseShot,
  shotSetupFor,
} from "../scripts/sim/horse.js";
import { binClearance, stepBallAgainstBins } from "../scripts/sim/bin-physics.js";
import { createBall, isBallSettled, launchBall } from "../scripts/sim/physics.js";
import { launchSpin } from "../scripts/sim/launch.js";
import { projectPoint } from "../scripts/sim/projection.js";

suite("horse — placement volume, motion, and the rules of the word");

// ---------------------------------------------------------------------------
// The word
// ---------------------------------------------------------------------------

test("a word is letters only, capped, upper-cased, and never empty", () => {
  assertEqual(normalizeWord("horse"), "HORSE");
  assertEqual(normalizeWord("h o r s e !"), "HORSE");
  assertEqual(normalizeWord("abcdefghijklmnop").length, MAX_WORD_LENGTH);
  // A word that sanitises to nothing would be a match already over before the
  // first shot, so it falls back rather than producing one.
  assertEqual(normalizeWord("12345"), DEFAULT_WORD);
  assertEqual(normalizeWord(null), DEFAULT_WORD);
});

test("the letter board shows the whole word, earned and unearned", () => {
  const match = createHorseMatch({ mode: "local", word: "PIG" });
  match.players[0].letters = 2;
  assertEqual(letterState(match, 0).map(({ earned }) => earned).join(","), "true,true,false");
  assertEqual(letterState(match, 1).every(({ earned }) => !earned), true);
});

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

test("a setter who misses their own shot sets nothing and loses nothing", () => {
  const match = createHorseMatch({ mode: "local", word: "PIG" });
  assertEqual(canPlaceBin(match), true);
  resolveHorseShot(match, false, { x: 0, y: 0.36, z: 0.5, motionId: "still" });
  assertEqual(match.players[0].letters, 0, "no letter for missing your own setup");
  assertEqual(match.turn, 1, "control passes");
  assertEqual(match.phase, PHASE_SET, "the next player sets rather than matching");
  assertEqual(match.standingShot, null);
});

test("a made setup becomes a standing shot the other player owes", () => {
  const match = createHorseMatch({ mode: "local", word: "PIG" });
  const setup = { x: 0.2, y: 0.5, z: 0.6, motionId: "sideways" };
  resolveHorseShot(match, true, setup);
  assertEqual(match.phase, PHASE_MATCH);
  assertEqual(match.turn, 1);
  assertEqual(match.setter, 0);
  assertEqual(match.standingShot, setup);
  assertEqual(canPlaceBin(match), false, "the matcher does not get to place a bin");
  // The matcher shoots at the setter's bin, not at whatever they had arranged.
  assertEqual(shotSetupFor(match, { x: 9, y: 9, z: 9 }), setup);
});

test("matching a standing shot buys safety, not the initiative", () => {
  // Answering a shot costs the matcher nothing and gains them nothing. The
  // setter keeps dictating until they miss a shot of their own.
  const match = createHorseMatch({ mode: "local", word: "PIG" });
  resolveHorseShot(match, true, { motionId: "still" });
  resolveHorseShot(match, true, null);
  assertEqual(match.players[1].letters, 0);
  assertEqual(match.turn, 0, "the setter sets again");
  assertEqual(match.setter, 0);
  assertEqual(match.phase, PHASE_SET);
  assertEqual(match.standingShot, null);
});

test("the turn only changes hands when a setter misses their own shot", () => {
  const match = createHorseMatch({ mode: "local", word: "PIG" });
  // Set, matched, set, missed by the matcher: player 0 still has the ball.
  resolveHorseShot(match, true, { motionId: "still" });
  resolveHorseShot(match, true, null);
  assertEqual(match.turn, 0);
  resolveHorseShot(match, true, { motionId: "still" });
  resolveHorseShot(match, false, null);
  assertEqual(match.turn, 0, "a matcher who misses hands it straight back");
  assertEqual(match.players[1].letters, 1);
  // Only now, on the setter's own miss.
  resolveHorseShot(match, false, { motionId: "still" });
  assertEqual(match.turn, 1);
  assertEqual(match.phase, PHASE_SET);
});

test("missing a standing shot takes a letter and leaves the setter in control", () => {
  const match = createHorseMatch({ mode: "local", word: "PIG" });
  resolveHorseShot(match, true, { motionId: "still" });
  resolveHorseShot(match, false, null);
  assertEqual(match.players[1].letters, 1);
  assertEqual(match.turn, 0, "the setter keeps the initiative");
  assertEqual(match.phase, PHASE_SET);
});

test("spelling the whole word loses the match for the player who spelled it", () => {
  const match = createHorseMatch({ mode: "local", word: "PIG" });
  for (let i = 0; i < 3; i++) {
    resolveHorseShot(match, true, { motionId: "still" });
    resolveHorseShot(match, false, null);
  }
  assertEqual(match.players[1].letters, 3);
  assertEqual(match.status, "won");
  assertEqual(match.winner, 0);
  // A finished match refuses further shots rather than running past the end.
  assertEqual(resolveHorseShot(match, true, null).accepted, false);
});

// ---------------------------------------------------------------------------
// The placement volume
// ---------------------------------------------------------------------------

test("a bin resting on the floor is exactly the tic-tac-toe bin", () => {
  const bin = placedBinAt({ x: 0, y: BIN_BODY_HEIGHT, z: 0.6, motionId: "still" }, 0);
  assertClose(bin.baseY, 0, 1e-9, "its foot is on the floor");
  assertClose(bin.topY - bin.baseY, BIN_BODY_HEIGHT, 1e-9);
  assert(bin.mouthTilt.angle > 0, "and it still leans onto its own painted mouth");
});

test("a raised bin is lifted whole, never stretched", () => {
  const low = placedBinAt({ x: 0, y: BIN_BODY_HEIGHT, z: 0.5, motionId: "still" }, 0);
  const high = placedBinAt({ x: 0, y: 0.7, z: 0.5, motionId: "still" }, 0);
  assertClose(high.topY - high.baseY, low.topY - low.baseY, 1e-9,
    "the drum is the same height at both — stretching it would break its agreement with the sprite");
  assert(high.baseY > 0.3, "and its foot has genuinely left the floor");
});

test("the height limit is the ART, not the ceiling — and it falls with depth", () => {
  const near = maxMouthHeightAt(PLACEMENT_BOUNDS.minZ);
  const far = maxMouthHeightAt(PLACEMENT_BOUNDS.maxZ);
  assert(near > far, "a bin further away is seen from a shallower angle, so it may not go as high");
  assert(far > BIN_BODY_HEIGHT, "but there is real height to play with at every depth");
  assert(near < EYE_LEVEL_Y,
    "and nothing may reach eye level, where the mouth draws edge-on and the sprite starts lying");
});

test("a bin at the height limit still has a solvable mouth lean", () => {
  // The limit IS the height at which no lean is needed; a hair below it, one is.
  for (const z of [PLACEMENT_BOUNDS.minZ, 0.6, PLACEMENT_BOUNDS.maxZ]) {
    const bin = placedBinAt({ x: 0, y: maxMouthHeightAt(z) - 0.02, z, motionId: "still" }, 0);
    assert(Number.isFinite(bin.mouthTilt.angle) && bin.mouthTilt.angle >= 0,
      `mouth lean unsolvable at z=${z}`);
    assert(binClearance(bin) > BALL_RADIUS_WORLD * 0.5, `no make window left at z=${z}`);
  }
});

test("every motion's whole sweep stays inside the legal volume", () => {
  for (const motion of BIN_MOTIONS) {
    // Placed hard against every corner, so the clamp is the only thing keeping
    // the sweep legal.
    for (const corner of [
      { x: 99, y: 99, z: 99 }, { x: -99, y: -99, z: -99 },
      { x: 99, y: -99, z: -99 }, { x: -99, y: 99, z: 99 },
    ]) {
      const setup = normalizeBinSetup({ ...corner, motionId: motion.id });
      for (let t = 0; t < 8; t += 0.01) {
        const bin = placedBinAt(setup, t);
        assert(bin.z >= PLACEMENT_BOUNDS.minZ - 1e-6 && bin.z <= PLACEMENT_BOUNDS.maxZ + 1e-6,
          `${motion.id} left the room in depth at t=${t.toFixed(2)} (z=${bin.z.toFixed(3)})`);
        assert(bin.topY >= PLACEMENT_BOUNDS.minY - 1e-6,
          `${motion.id} sank through the floor at t=${t.toFixed(2)}`);
        assert(bin.topY <= maxMouthHeightAt(bin.z) + 1e-6,
          `${motion.id} rose past what the sprite can draw at t=${t.toFixed(2)}`);
        const screen = projectPoint({ x: bin.x, y: bin.topY, z: bin.z });
        assert(screen.x >= AIM_MIN_X - 1e-6 && screen.x <= AIM_MAX_X + 1e-6,
          `${motion.id} swept out of the reticle's reach at t=${t.toFixed(2)} (x=${screen.x.toFixed(1)})`);
      }
    }
  }
});

test("a motion reports the velocity it is actually travelling at", () => {
  // Finite-differenced against the real path, the same guarantee `hoop.test.js`
  // holds the rim modes to: the colliders resolve the ball against a MOVING bin,
  // so a velocity that disagrees with the path is a lip that hits the ball as
  // though it were somewhere else.
  const h = 1e-5;
  for (const motion of BIN_MOTIONS) {
    for (let t = 0.1; t < 6; t += 0.13) {
      const before = motion.path(t - h);
      const after = motion.path(t + h);
      const now = motion.path(t);
      for (const axis of ["x", "y", "z"]) {
        const measured = (after[`d${axis}`] - before[`d${axis}`]) / (2 * h);
        assertClose(now[`v${axis}`], measured, 1e-3,
          `${motion.id} misreports v${axis} at t=${t.toFixed(2)}`);
      }
    }
  }
});

test("choosing a motion re-clamps the position it has to fit into", () => {
  // Parked hard against the back wall, then handed a motion that runs down the
  // room: the bin has to step forward far enough for its whole run to fit.
  const parked = normalizeBinSetup({ x: 0, y: BIN_BODY_HEIGHT, z: 99, motionId: "still" });
  const moving = normalizeBinSetup({ ...parked, motionId: "inout" });
  assert(moving.z < parked.z, "it did not step in off the wall");
  assertClose(moving.z, PLACEMENT_BOUNDS.maxZ - motionEnvelope("inout").maxDz, 1e-6);
});

test("the placement volume never exceeds what the reticle can reach", () => {
  // The bug this pins: the visible floor is wider than the aiming gesture. A bin
  // in the gap was drawn, was legal, and could not be aimed at by any pull —
  // a ring of dead placements around the back corners of the room.
  for (let z = PLACEMENT_BOUNDS.minZ; z <= PLACEMENT_BOUNDS.maxZ; z += 0.02) {
    const { minX, maxX } = horizontalBoundsAt(z);
    for (const x of [minX, 0, maxX]) {
      const screen = projectPoint({ x, y: BIN_BODY_HEIGHT, z });
      assert(screen.x >= AIM_MIN_X - 1e-6 && screen.x <= AIM_MAX_X + 1e-6,
        `a legal bin at z=${z.toFixed(2)} x=${x.toFixed(2)} sits at screen ${screen.x.toFixed(1)}, outside the aim band`);
    }
  }
});

test("fractional placement spans the volume without ever leaving it", () => {
  for (const motion of BIN_MOTIONS) {
    const low = placementFromFractions({ lateral: -1, depth: 0, height: 0 }, motion.id);
    const high = placementFromFractions({ lateral: 1, depth: 1, height: 1 }, motion.id);
    assert(high.z > low.z, `${motion.id}: depth fraction did nothing`);
    assertEqual(JSON.stringify(low), JSON.stringify(clampPlacement(low, motion.id)),
      `${motion.id}: the low corner was not already legal`);
    assertEqual(JSON.stringify(high), JSON.stringify(clampPlacement(high, motion.id)),
      `${motion.id}: the high corner was not already legal`);
  }
});

test("the CPU's boldness decides how adventurous a bin it sets", () => {
  const fixed = () => 0.99;
  const easy = chooseCpuBinSetup("easy", fixed, BIN_MOTIONS.map(({ id }) => id));
  const hard = chooseCpuBinSetup("hard", fixed, BIN_MOTIONS.map(({ id }) => id));
  assert(hard.height > easy.height, "a hard CPU raises the bin further");
  assert(Math.abs(hard.lateral) > Math.abs(easy.lateral), "and pushes it further off centre");
  assertEqual(easy.motionId, "still", "a timid CPU never moves the bin");
});

// ---------------------------------------------------------------------------
// The shot
// ---------------------------------------------------------------------------

test("pull strength spans exactly the placeable depth, in a room of any depth", () => {
  assert(horseAimDepth(0) <= PLACEMENT_BOUNDS.minZ, "the softest pull reaches the front of the volume");
  assert(horseAimDepth(1) >= PLACEMENT_BOUNDS.maxZ, "the hardest reaches the back of it");
  for (const z of [PLACEMENT_BOUNDS.minZ, 0.5, PLACEMENT_BOUNDS.maxZ]) {
    assertClose(horseAimDepth(horsePowerForDepth(z)), z, 1e-9, "the mapping does not round-trip");
  }
});

test("the shot is solved against the bin's REST height, never its live one", () => {
  // A moving bin is not tracked, exactly as the classic cabinet's reticle never
  // tracks the moving rim: leading it is the skill the motion exists to ask for.
  const setup = normalizeBinSetup({ x: 0, y: 0.6, z: 0.6, motionId: "updown" });
  const ball = createBall();
  const pull = { power: 0.5, aimX: 480, loft: 1 };
  const early = createHorseShot(pull, ball, setup);
  const late = createHorseShot(pull, ball, setup);
  assertClose(early.aim.y, late.aim.y, 1e-9);
  // And the height it IS solved against is the placed one.
  const flat = createHorseShot(pull, ball, { ...setup, y: BIN_BODY_HEIGHT });
  assert(early.aim.y < flat.aim.y, "a higher bin is aimed at higher up the screen");
});

test("every corner of every motion's volume can actually be made", () => {
  // THE GUARANTEE THAT MATTERS. A placement that no pull can convert is not a
  // hard shot, it is a broken one — and it is invisible to every other test
  // here, because the geometry is all perfectly legal. Coarse on purpose: this
  // asks whether a window exists, not how wide it is.
  for (const motion of BIN_MOTIONS) {
    for (const depth of [0, 1]) {
      for (const lateral of [-1, 0, 1]) {
        const setup = {
          ...placementFromFractions({ lateral, depth, height: depth === 0 ? 1 : 0 }, motion.id),
          motionId: motion.id,
        };
        assert(anyMakeExists(setup), `${motion.id} d${depth} l${lateral} cannot be made by any pull`);
      }
    }
  }
});

/** Fire a coarse grid of pulls at a setup and report whether any of them drop. */
function anyMakeExists(setup) {
  for (let power = 0.06; power <= 1; power += 0.06) {
    for (let aimX = AIM_MIN_X; aimX <= AIM_MAX_X; aimX += 24) {
      if (playShot(setup, power, aimX)) return true;
    }
  }
  return false;
}

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

finish();
