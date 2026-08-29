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
import { HOOP_MODES, HOOP_TRAVEL_BOUNDS } from "../scripts/sim/hoop.js";
import {
  HOOP_PLACEMENT_BOUNDS,
  clampHoopPlacement,
  defaultHoopPlacement,
  hoopMotionEnvelope,
  hoopPlacementBoundsFor,
  hoopPlacementFromFractions,
  placedHoopAt,
  placementIsWithinAimReach,
} from "../scripts/sim/hoop-placement.js";
import { HOOP_TARGET, normalizeTrickShotTarget } from "../scripts/sim/trick-shot-target.js";
import { BALLS, ballById } from "../scripts/assets/ball-catalog.js";
import { createHorseShot, horseAimDepth, horsePowerForDepth, horseTargetKind } from "../scripts/sim/horse-shot.js";
import {
  DEFAULT_WORD,
  MAX_WORD_LENGTH,
  PHASE_MATCH,
  PHASE_SET,
  canPlaceBin,
  chooseCpuBinSetup,
  chooseCpuTargetKind,
  chooseCpuTurnBall,
  cpuSetsTrickShot,
  createHorseMatch,
  judgeHorseShot,
  letterState,
  normalizeWord,
  requiredPieceIds,
  resolveHorseShot,
  shotSetupFor,
  unmetPieceIds,
} from "../scripts/sim/horse.js";
import { leadPull, needsProvenPull, provenPullPhase, provenPullShot, recipeShot } from "../scripts/sim/horse-cpu.js";
import {
  PLAN_RELEASE_SECONDS,
  aimCannon,
  interceptSites,
  planCpuTrickShot,
} from "../scripts/sim/horse-plan.js";
import { replayHorseShot } from "../scripts/sim/horse-replay.js";
import { createSandboxPiece } from "../scripts/sim/trick-shot.js";
import { binClearance, stepBallAgainstBins } from "../scripts/sim/bin-physics.js";
import { createBall, isBallSettled, launchBall, stepBall, worldFor } from "../scripts/sim/physics.js";
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
  // The limit is the height at which the honest mouth has fallen to
  // MOUTH_ASPECT_TOLERANCE of the painted one, so at the very top the solve
  // returns a flat mouth rather than a lean — what has to hold either way is
  // that it SOLVES and still leaves a ball-sized hole.
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

test("the CPU picks a ball for a shot it sets, and boldness widens the choice", () => {
  const ballIds = BALLS.map(({ id }) => id);
  const reach = (difficulty) => new Set(
    // Sample the whole unit interval: the choice is one uniform draw over the
    // ids this difficulty may reach for.
    Array.from({ length: 200 }, (_, index) => chooseCpuTurnBall(difficulty, () => index / 200, ballIds)),
  );
  const easy = reach("easy");
  const hard = reach("hard");
  assertEqual(easy.size, 1, "a timid CPU stays on one ball");
  assertEqual([...easy][0], ballIds[0], "and that ball is the reference one");
  assert(hard.size > reach("medium").size, "a bolder CPU reaches further down the catalog");
  assertEqual(hard.size, ballIds.length, "the boldest reaches every shipped ball");
  for (const ballId of hard) assertEqual(ballById(ballId).id, ballId, `${ballId} is not a catalog ball`);
  assertEqual(chooseCpuTurnBall("hard", () => 0, []), null, "no catalog, no choice");
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

// ------------------------------------------------------------- the wall hoop

test("the hoop's placement volume is the cabinet's own travel, not a new number", () => {
  // Adopting `HOOP_TRAVEL_BOUNDS` whole rather than inventing a wider box is
  // what makes a HORSE hoop shot one the classic cabinet has already proved
  // makeable, at a height it is already calibrated for. It is imported, not
  // copied, so a change to the portrait crop moves this with it.
  assertEqual(HOOP_PLACEMENT_BOUNDS, HOOP_TRAVEL_BOUNDS);

  // And the cabinet's own peg is legal on every motion, so a turn that opens on
  // the hoop opens on the one rim position everything else is calibrated to.
  for (const mode of HOOP_MODES) {
    const clamped = clampHoopPlacement(defaultHoopPlacement(), mode.id);
    assertClose(clamped.cx, defaultHoopPlacement().cx, 1e-9, `${mode.id} moved the base lane`);
    assertClose(clamped.rimY, defaultHoopPlacement().rimY, 1e-9, `${mode.id} moved the base height`);
  }
});

test("a motion's reach is measured off its own path, not declared beside it", () => {
  // `circle` is authored as `(cos - 1)`, so it starts where the hoop was hung and
  // travels TWICE its amplitude, entirely to one side. A hand-written +/-94 would
  // be wrong in both directions at once — and the asymmetry is what lets a circle
  // hung on the right be limited only on its left.
  const circle = hoopMotionEnvelope("circle");
  assertClose(circle.maxDx, 0, 1e-6, "the circle does not start at the placement");
  assert(circle.minDx < -180, `the circle's reach was under-measured: ${circle.minDx}`);

  const bounds = hoopPlacementBoundsFor("circle");
  assertClose(bounds.minCx, HOOP_TRAVEL_BOUNDS.minX - circle.minDx, 1e-9);
  assertClose(bounds.maxCx, HOOP_TRAVEL_BOUNDS.maxX, 1e-9, "a one-sided sweep must not cost the other side");
});

test("every point a hung hoop VISITS stays inside the crop", () => {
  // The clamp subtracts the sweep, so this is the whole claim: not that the
  // placement is legal, but that the sweep from it is. The failure is invisible
  // on the desktop browser a mode is authored in and obvious on a phone.
  for (const mode of HOOP_MODES) {
    for (const wild of [
      { cx: -9e3, rimY: -9e3 }, { cx: 9e3, rimY: -9e3 },
      { cx: -9e3, rimY: 9e3 }, { cx: 9e3, rimY: 9e3 },
    ]) {
      const setup = { motionId: mode.id, ...clampHoopPlacement(wild, mode.id) };
      for (let step = 0; step <= 600; step++) {
        const hoop = placedHoopAt(setup, step * 0.1);
        assert(hoop.cx >= HOOP_TRAVEL_BOUNDS.minX - 1e-9 && hoop.cx <= HOOP_TRAVEL_BOUNDS.maxX + 1e-9,
          `${mode.id} leaves the crop at x=${hoop.cx.toFixed(1)}`);
        assert(hoop.rimY >= HOOP_TRAVEL_BOUNDS.minY - 1e-9 && hoop.rimY <= HOOP_TRAVEL_BOUNDS.maxY + 1e-9,
          `${mode.id} leaves the crop at y=${hoop.rimY.toFixed(1)}`);
      }
    }
  }
});

test("you may only hang a hoop you could shoot at", () => {
  // The bin's third constraint, and here it is free rather than enforced: the
  // reticle swings across 292..668 and the crop stops at 588, so every placement
  // is already inside the band a pull can reach. It is free by ARITHMETIC, not by
  // guarantee — the day the crop or the aim gain moves is the day it stops being
  // true, which is why the module asks the question and this pins the answer.
  assert(placementIsWithinAimReach(), "the hoop's placement volume outran the reticle");
  assert(HOOP_PLACEMENT_BOUNDS.minX >= AIM_MIN_X && HOOP_PLACEMENT_BOUNDS.maxX <= AIM_MAX_X);
});

test("fractional placement spans the hoop's band without ever leaving it", () => {
  for (const mode of HOOP_MODES) {
    const bounds = hoopPlacementBoundsFor(mode.id);
    for (const lateral of [-1, -0.5, 0, 0.5, 1]) {
      for (const height of [0, 0.5, 1]) {
        const { cx, rimY } = hoopPlacementFromFractions({ lateral, height }, mode.id);
        assert(cx >= bounds.minCx - 1e-9 && cx <= bounds.maxCx + 1e-9, `${mode.id} lane ${lateral}`);
        assert(rimY >= bounds.minRimY - 1e-9 && rimY <= bounds.maxRimY + 1e-9, `${mode.id} height ${height}`);
      }
    }
  }
  // The extremes really are the extremes, or the CPU's boldness would be capped
  // well short of the volume it is supposed to be reaching into.
  const still = hoopPlacementBoundsFor("still");
  assertClose(hoopPlacementFromFractions({ lateral: -1 }, "still").cx, still.minCx, 1e-9);
  assertClose(hoopPlacementFromFractions({ lateral: 1 }, "still").cx, still.maxCx, 1e-9);
});

test("a hoop shot is aimed at the rim's own REST height, never the reticle's line", () => {
  // `sim/pull.js` pins `aimY` to `HOOP_BASE_RIM_Y`, because until the hoop was
  // placeable there was only one peg. A hoop the setter has raised makes that
  // line wrong, and a player left to correct for it by hand would be inverting a
  // ballistic arc in their head — arithmetic, not a skill. So the line follows
  // the hoop and `pull.aimY` is deliberately not read.
  const ball = createBall();
  const pull = { power: 0.8, aimX: 480, aimY: 224, loft: 1 };
  const high = createHorseShot(pull, ball, { kind: HOOP_TARGET, motionId: "still", placement: { cx: 480, rimY: 180 } });
  const low = createHorseShot(pull, ball, { kind: HOOP_TARGET, motionId: "still", placement: { cx: 480, rimY: 260 } });
  assert(high.aim.y < low.aim.y, "a higher hoop is aimed at higher up the screen");

  // And it is the REST height: a moving hoop is not tracked, exactly as the
  // classic cabinet's reticle never tracks the moving rim.
  const moving = { kind: HOOP_TARGET, motionId: "vertical", placement: { cx: 480, rimY: 222 } };
  assertClose(createHorseShot(pull, ball, moving).aim.y, createHorseShot(pull, ball, moving).aim.y, 1e-9);
});

test("a HORSE setup with no kind is a bin, not the target catalog's own default", () => {
  // `trickShotTargetKind` opens on the hoop because the Trick Shot Lab does. A
  // HORSE setup written before HORSE had targets carries no kind and was a bin
  // every time, so an online match in flight must not change target underneath
  // its players. Both halves of a ruling read this — the solve and the colliders
  // — which is exactly why it is said in one place.
  assertEqual(horseTargetKind({ x: 0, y: 0.36, z: 0.6, motionId: "still" }), "bin");
  assertEqual(horseTargetKind({}), "bin");
  assertEqual(horseTargetKind(null), "bin");
  assertEqual(horseTargetKind({ kind: HOOP_TARGET }), HOOP_TARGET);
});

test("the CPU reaches for the hoop only as it gets bold", () => {
  const kinds = ["bin", "hoop"];
  const always = (value) => () => value;
  // Easy never leaves the bin the mode has been teaching all match.
  assertEqual(chooseCpuTargetKind("easy", always(0.99), kinds), "bin");
  // Hard reaches the whole list.
  assertEqual(chooseCpuTargetKind("hard", always(0.99), kinds), "hoop");
  assertEqual(chooseCpuTargetKind("hard", always(0), kinds), "bin");
  // And it owns no catalog: an empty list is no choice rather than a guess.
  assertEqual(chooseCpuTargetKind("hard", always(0), []), null);
});

test("every corner of every hoop motion's band can actually be made", () => {
  // THE GUARANTEE THAT MATTERS, and it is the bin's own. A placement no pull can
  // convert is not a hard shot, it is a broken one — and it is invisible to every
  // other test here, because the geometry is all perfectly legal.
  //
  // Coarse on purpose: this asks whether a window exists, not how wide it is.
  // `tools/horse-make-rate.mjs --target hoop` is where the width is measured, and
  // where the rest of the ball roster is walked.
  for (const mode of HOOP_MODES) {
    const bounds = hoopPlacementBoundsFor(mode.id);
    for (const cx of [bounds.minCx, (bounds.minCx + bounds.maxCx) / 2, bounds.maxCx]) {
      for (const rimY of [bounds.minRimY, (bounds.minRimY + bounds.maxRimY) / 2, bounds.maxRimY]) {
        const setup = { kind: HOOP_TARGET, motionId: mode.id, placement: { cx, rimY } };
        assert(anyHoopMakeExists(setup),
          `${mode.id} at ${Math.round(cx)},${Math.round(rimY)} cannot be made by any pull`);
      }
    }
  }
});

/**
 * Fire a coarse grid of pulls at a hung hoop and report whether any of them drop.
 *
 * TWO RELEASE PHASES, which the bin's sweep does not need. A hoop's motions reach
 * much further across the screen than a bin's do through the room, so a shot at a
 * moving rim genuinely has to be led — and a sweep pinned to one release moment
 * would be asking whether the placement is makeable WITHOUT the skill the motions
 * exist to ask for. A player may watch the rim for as long as they like.
 */
function anyHoopMakeExists(setup) {
  for (const motionSeconds of [0, 0.9]) {
    for (let power = 0.4; power <= 1; power += 0.075) {
      for (let aimX = AIM_MIN_X; aimX <= AIM_MAX_X; aimX += 24) {
        for (const loft of [0.4, 1]) {
          if (playHoopShot(setup, { power, aimX, loft }, motionSeconds)) return true;
        }
      }
    }
  }
  return false;
}

/** One shot, played out through the real sim against the real moving rim. */
function playHoopShot(setup, pull, motionSeconds) {
  const ball = createBall();
  const shot = createHorseShot(pull, ball, setup);
  launchBall(ball, shot.launch, launchSpin(shot.launch));
  let clock = motionSeconds;
  let age = 0;
  while (age < 3) {
    clock += TICK_SECONDS;
    age += TICK_SECONDS;
    if (stepBall(ball, worldFor(placedHoopAt(setup, clock)), TICK_SECONDS, { ballId: "basketball" }).scored) {
      return true;
    }
    if (age > 0.45 && isBallSettled(ball)) return false;
  }
  return false;
}

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


// ---------------------------------------------------------------------------
// The tools a matcher owes
// ---------------------------------------------------------------------------

const pad = (id, at) => createSandboxPiece("board", { id, ...at }, id);

/** A setter's turn with an apparatus on the floor, ready to be made or missed. */
function matchWithApparatus(pieces) {
  const match = createHorseMatch({ word: "HORSE", names: ["One", "Two"] });
  return { match, setup: { kind: "bin", motionId: "still", pieces } };
}

test("the duty is the tools the setter TOUCHED, not the tools they put down", () => {
  const pieces = [pad("a", { x: -0.3 }), pad("b", { x: 0 }), pad("c", { x: 0.3 })];
  const { match, setup } = matchWithApparatus(pieces);
  resolveHorseShot(match, true, setup, { touched: ["a", "c"], pull: { power: 0.5, aimX: 480 } });
  assertEqual(requiredPieceIds(match.standingShot).join(","), "a,c",
    "a pad the setter flew past is not part of the shot they proved");
});

test("a duty naming a tool the setup does not carry is discarded", () => {
  // Nothing could ever discharge it, so it cannot be allowed to stand as a duty
  // — this is what stops a stale or crafted standing shot being unanswerable.
  assertEqual(requiredPieceIds({ pieces: [pad("a", {})], requiredPieces: ["a", "ghost"] }).join(","), "a");
});

test("a matcher who goes in having skipped a tool takes the letter, and the HUD is told why", () => {
  const pieces = [pad("a", { x: -0.3 }), pad("b", { x: 0.3 })];
  const { match, setup } = matchWithApparatus(pieces);
  resolveHorseShot(match, true, setup, { touched: ["a", "b"], pull: { power: 0.5, aimX: 480 } });
  assertEqual(match.phase, PHASE_MATCH, "the shot is now owed");

  const judged = judgeHorseShot(match, { scored: true, touched: ["a"] });
  assertEqual(judged.made, false, "going in is necessary and not sufficient while matching");
  assertEqual(judged.unmet.join(","), "b");
  const outcome = resolveHorseShot(match, judged.made, match.standingShot, { unmet: judged.unmet });
  assertEqual(outcome.letter, true);
  assertEqual(outcome.skipped, true, "a clean make that cost a letter reads as a bug unless it is named");
  assertEqual(match.players[1].letters, 1);
  assertEqual(match.turn, match.setter, "the setter sets again");
});

test("a matcher who uses every required tool matches it", () => {
  const pieces = [pad("a", { x: -0.3 }), pad("b", { x: 0.3 })];
  const { match, setup } = matchWithApparatus(pieces);
  resolveHorseShot(match, true, setup, { touched: ["a", "b"], pull: { power: 0.5, aimX: 480 } });
  // Order is deliberately not part of the duty: touch them all and it stands.
  const judged = judgeHorseShot(match, { scored: true, touched: ["b", "a", "b"] });
  assertEqual(judged.made, true);
  const outcome = resolveHorseShot(match, judged.made, match.standingShot, { unmet: judged.unmet });
  assertEqual(outcome.kind, "matched");
  assertEqual(match.players[1].letters, 0);
});

test("a setter is never held to a duty", () => {
  const { match, setup } = matchWithApparatus([pad("a", {})]);
  // They are inventing the shot — whatever their ball touches BECOMES the duty,
  // so there is nothing yet to check them against.
  const judged = judgeHorseShot(match, { scored: true, touched: [] });
  assertEqual(judged.made, true);
  assertEqual(judged.unmet.length, 0);
  resolveHorseShot(match, judged.made, setup, { touched: [] });
  assertEqual(requiredPieceIds(match.standingShot).length, 0, "an untouched apparatus owes nobody anything");
});

test("unmet tools are only the missing ones", () => {
  const setup = { pieces: [pad("a", {}), pad("b", {})], requiredPieces: ["a", "b"] };
  assertEqual(unmetPieceIds(setup, ["a"]).join(","), "b");
  assertEqual(unmetPieceIds(setup, ["a", "b"]).length, 0);
});

test("the pull that proved a trick shot travels with it, and only with it", () => {
  const withTools = matchWithApparatus([pad("a", {})]);
  resolveHorseShot(withTools.match, true, withTools.setup, {
    touched: ["a"],
    pull: { power: 0.62, aimX: 470, loft: 1, motionSeconds: 9.4 },
  });
  assertClose(withTools.match.standingShot.provenPull.power, 0.62, 1e-9,
    "the CPU has no hands, so the one pull known to route the apparatus is kept");

  const plain = matchWithApparatus([]);
  resolveHorseShot(plain.match, true, plain.setup, { touched: [], pull: { power: 0.62, aimX: 470 } });
  assertEqual(plain.match.standingShot.provenPull, undefined,
    "a shot the CPU's own lead already answers carries no recipe");
});

test("the CPU repeats a proven trick shot at the same phase of the same sweep", () => {
  const setup = {
    kind: "bin",
    motionId: "sideways",
    pieces: [pad("a", {})],
    requiredPieces: ["a"],
    provenPull: { power: 0.62, aimX: 470, loft: 1, motionSeconds: 9.4 },
  };
  assert(needsProvenPull(setup), "a duty with a recipe is repeated rather than solved");
  const shot = provenPullShot(setup, { makes: true });
  assertEqual(shot.pull.power, 0.62);
  assertEqual(shot.pull.aimX, 470);
  // Modulo the period: one period later the target is in the identical place,
  // so a CPU that sat out the setter's whole wait would only look hung.
  assertClose(shot.atSeconds, provenPullPhase(setup), 1e-9);
  assert(shot.atSeconds < 9.4, "the wait is a phase, not a stopwatch");

  const missed = provenPullShot(setup, { makes: false, stray: () => 1 });
  assert(missed.pull.aimX !== 470, "a CPU handed the recipe still misses at its own difficulty");
  assertEqual(provenPullShot({ pieces: [], requiredPieces: [] }), null, "nothing to repeat without a duty");
});

test("a ball that goes straight in without the apparatus is ruled a skip, through the real sim", () => {
  // End to end rather than by hand: the pad stands well out of the lane, the
  // pull is one found by a real sweep, and the replay reports what the ball
  // really touched on the way — which is nothing.
  const bare = { kind: "bin", motionId: "still", placement: placementFromFractions({ lateral: 0, depth: 0.5 }) };
  const direct = findDirectMake(bare);
  assert(direct, "a still bin at mid depth has to be makeable, or this test proves nothing");

  const setup = { ...bare, pieces: [pad("a", { x: 0.62, y: 0.9, z: 0.2 })] };
  const replay = replayHorseShot({ setup, intent: { ...direct, ballId: "basketball" } });
  assertEqual(replay.made, true, "the pad is out of the lane; the shot still drops");
  assertEqual(replay.touched.length, 0);

  const match = createHorseMatch({ word: "HORSE", names: ["One", "Two"] });
  resolveHorseShot(match, true, { ...setup, requiredPieces: ["a"] }, { touched: ["a"], pull: direct });
  const judged = judgeHorseShot(match, { scored: replay.made, touched: replay.touched });
  assertEqual(judged.made, false, "the ball went in and the shot was not matched");
  assertEqual(judged.unmet.join(","), "a");
});

/*
 * The CPU SETTING a trick shot.
 *
 * The rule these all serve is the mode's own: the setter shoots first, so a shot
 * the CPU has not made is not a shot anybody owes. The planner may therefore
 * decline — every one of these asserts what a plan MEANS, never that one exists
 * for some particular target.
 */

/** A target the planner is known to solve, so the assertions below have a subject. */
function plannedTrickShot(overrides = {}, ballId = "basketball") {
  const setup = normalizeTrickShotTarget({ kind: "hoop", motionId: "figure8", ...overrides });
  return { setup, plan: planCpuTrickShot({ setup, ballId }), ballId };
}

test("a planned trick shot is one the CPU has actually made, in the real sim", () => {
  const { setup, plan, ballId } = plannedTrickShot();
  assert(plan, "the planner has to solve at least one shipped target, or nothing below is tested");
  assertEqual(plan.pieces.length, 1);
  assertEqual(plan.pieces[0].type, "cannon");
  assertEqual(plan.requiredPieces.join(","), plan.pieces[0].id);

  const shot = replayHorseShot({
    setup: { ...setup, pieces: plan.pieces },
    intent: { ...plan.pull, ballId },
    motionSeconds: plan.pull.motionSeconds,
  });
  assertEqual(shot.made, true, "the recipe converts");
  assert(shot.touched.includes(plan.pieces[0].id), "and it converts THROUGH the cannon");
});

test("a planned trick shot is a trick shot — the pull does not work without the tool", () => {
  const { setup, plan, ballId } = plannedTrickShot();
  const bare = replayHorseShot({
    setup: { ...setup, pieces: [] },
    intent: { ...plan.pull, ballId },
    motionSeconds: plan.pull.motionSeconds,
  });
  assertEqual(bare.made, false,
    "the seed is deliberately pulled short; take the cannon away and it lands nowhere");
});

test("a planned trick shot survives the tick of slop between proving it and releasing it", () => {
  const { setup, plan, ballId } = plannedTrickShot();
  // The court releases on the first tick whose clock has REACHED the recipe's
  // moment, which is never exactly on it. A plan that only worked on the frame
  // it was found on would be one the CPU sets and then misses.
  const later = replayHorseShot({
    setup: { ...setup, pieces: plan.pieces },
    intent: { ...plan.pull, ballId },
    motionSeconds: plan.pull.motionSeconds + TICK_SECONDS,
  });
  assertEqual(later.made, true);
  assert(later.touched.includes(plan.pieces[0].id));
});

test("a plan is the same recipe shape a human setter's make leaves behind", () => {
  const { setup, plan } = plannedTrickShot();
  const standing = { ...setup, pieces: plan.pieces, requiredPieces: plan.requiredPieces, provenPull: plan.pull };
  assert(needsProvenPull(standing), "the opponent's CPU repeats it exactly as it would a person's");
  assertClose(provenPullShot(standing, { makes: true }).pull.power, plan.pull.power, 1e-9);
  assertClose(recipeShot(plan.pull, { periodSeconds: 60 }).atSeconds, PLAN_RELEASE_SECONDS, 1e-9);
});

test("a cannon is only ever dropped where a ball is falling, and where it fits", () => {
  const rising = { x: 0, y: 0.8, z: 0.4, vy: 2, t: 0.2 };
  const falling = { x: 0, y: 0.8, z: 0.4, vy: -2, t: 0.2 };
  const outOfRoom = { x: 4, y: 0.8, z: 0.4, vy: -2, t: 0.2 };
  const tooHigh = { x: 0, y: 4, z: 0.4, vy: -2, t: 0.2 };
  const tail = { x: 0, y: 0.8, z: 0.4, vy: -2, t: 1.2 };
  assertEqual(interceptSites([rising, outOfRoom, tooHigh, falling, tail]).length, 1,
    "descending, inside the piece bounds, and clear of the target");
  assertEqual(interceptSites([]).length, 0);
});

test("a cannon that cannot be pointed at the target is refused rather than clamped", () => {
  const setup = normalizeTrickShotTarget({ kind: "hoop", motionId: "still" });
  // Standing well above the rim and asked to reach it quickly: the only velocity
  // that does it points DOWN, and a cannon fires up. Refused rather than clamped,
  // because a clamped answer is a cannon aimed somewhere nobody asked for — and
  // `createSandboxPiece` would take it without complaint.
  const site = { x: 0, y: 2.4, z: 0.5, vy: -2, t: 0.4 };
  assertEqual(aimCannon({ setup, site, cannon: { id: "c", delay: 0.5 }, seconds: 0.25 }), null);
});

test("the easy CPU never sets an apparatus", () => {
  // Nothing in a trick shot teaches the meter, which is the first thing a new
  // player has to learn — so this is a floor, not a low point on a curve.
  for (let roll = 0; roll < 1; roll += 0.05) {
    assertEqual(cpuSetsTrickShot("easy", () => roll), false);
  }
  assertEqual(cpuSetsTrickShot("hard", () => 0), true);
  assertEqual(cpuSetsTrickShot("hard", () => 0.99), false);
});

test("the CPU's lead is one statement, shared by the court and the planner", () => {
  for (const setup of [
    normalizeTrickShotTarget({ kind: "hoop", motionId: "still" }),
    normalizeTrickShotTarget({ kind: "bin", motionId: "still" }),
  ]) {
    const lead = leadPull(setup, "basketball", 0);
    assert(Number.isFinite(lead.power) && Number.isFinite(lead.aimX));
    assertEqual(replayHorseShot({ setup, intent: { ...lead, ballId: "basketball" } }).made, true,
      "a lead that does not convert a still target is not a lead");
  }
});

/** The first pull in a coarse sweep that drops through a still bin. */
function findDirectMake(setup) {
  for (let power = 0.1; power <= 1; power += 0.05) {
    for (let aimX = AIM_MIN_X; aimX <= AIM_MAX_X; aimX += 16) {
      const intent = { power, aimX, loft: 1, ballId: "basketball" };
      if (replayHorseShot({ setup, intent, maxSeconds: 4 }).made) return { power, aimX, loft: 1 };
    }
  }
  return null;
}

finish();
