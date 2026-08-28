import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertClose, assertEqual, finish } from "./harness.js";

import {
  BIN_TARGET,
  HOOP_TARGET,
  TRICK_SHOT_TARGETS,
  defaultTrickShotTarget,
  normalizeTrickShotTarget,
  trickShotTargetAt,
  trickShotTargetMotions,
} from "../scripts/sim/trick-shot-target.js";
import { HOOP_MODES, HOOP_TRAVEL_BOUNDS } from "../scripts/sim/hoop.js";
import { BIN_MOTIONS, clampPlacement, motionEnvelope } from "../scripts/sim/bin-placement.js";
import { normalizeTrickShot } from "../scripts/sim/trick-shot.js";
import { createTrickShotStore } from "../scripts/store/trick-shots-store.js";

suite("trick-shot lab — the target is part of the shot");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "scripts", "trick-shot-game.js"), "utf8");
const view = fs.readFileSync(path.join(root, "scripts", "ui", "trick-shot-view.js"), "utf8");

test("both target kinds offer the full motion catalog their own mode uses", () => {
  assertEqual(TRICK_SHOT_TARGETS.length, 2);
  const hoop = trickShotTargetMotions(HOOP_TARGET).map(({ id }) => id);
  const bin = trickShotTargetMotions(BIN_TARGET).map(({ id }) => id);
  assertEqual(hoop.join(","), HOOP_MODES.map(({ id }) => id).join(","));
  assertEqual(bin.join(","), BIN_MOTIONS.map(({ id }) => id).join(","));
  assert(hoop.includes("still") && hoop.includes("horizontal") && hoop.includes("vertical"));
  assert(bin.includes("still") && bin.includes("sideways") && bin.includes("updown"));
  for (const motion of [...trickShotTargetMotions(HOOP_TARGET), ...trickShotTargetMotions(BIN_TARGET)]) {
    assert(motion.label && motion.blurb, `${motion.id} needs a label and a blurb for the picker`);
  }
});

test("the two motion catalogs do not cross, and a wrong-catalog id falls back", () => {
  // "horizontal" is a hoop mode and "sideways" is a bin motion; they mean the
  // same thing to a player and nothing to each other. An id from the wrong
  // catalog must land on that kind's default rather than be mapped across.
  assertEqual(normalizeTrickShotTarget({ kind: BIN_TARGET, motionId: "horizontal" }).motionId, "still");
  assertEqual(normalizeTrickShotTarget({ kind: HOOP_TARGET, motionId: "sideways" }).motionId, "still");
  assertEqual(normalizeTrickShotTarget({ kind: "nonsense" }).kind, HOOP_TARGET);
});

test("a hoop target carries no placement and a bin target always carries a legal one", () => {
  const hoop = normalizeTrickShotTarget({ kind: HOOP_TARGET, motionId: "circle", placement: { x: 9, y: 9, z: 9 } });
  assertEqual(hoop.placement, null, "a hoop cannot be stood in the middle of the floor");

  const wild = normalizeTrickShotTarget({ kind: BIN_TARGET, motionId: "carousel", placement: { x: 99, y: 99, z: 99 } });
  const legal = clampPlacement({ x: 99, y: 99, z: 99 }, "carousel");
  assertClose(wild.placement.x, legal.x, 1e-9);
  assertClose(wild.placement.y, legal.y, 1e-9);
  assertClose(wild.placement.z, legal.z, 1e-9);
});

test("every hoop motion stays inside the mobile crop, and every bin sweep inside the legal volume", () => {
  // The Lab does not get its own envelope: it borrows the two the shipped modes
  // are already held to, so a new mode is checked here for free.
  for (const mode of HOOP_MODES) {
    const target = normalizeTrickShotTarget({ kind: HOOP_TARGET, motionId: mode.id });
    for (let step = 0; step <= 200; step++) {
      const { hoop } = trickShotTargetAt(target, step * 0.05);
      assert(
        hoop.cx >= HOOP_TRAVEL_BOUNDS.minX && hoop.cx <= HOOP_TRAVEL_BOUNDS.maxX,
        `${mode.id} leaves the portrait crop at x=${hoop.cx.toFixed(1)}`,
      );
      assert(hoop.rimY >= HOOP_TRAVEL_BOUNDS.minY && hoop.rimY <= HOOP_TRAVEL_BOUNDS.maxY);
    }
  }

  for (const motion of BIN_MOTIONS) {
    const envelope = motionEnvelope(motion.id);
    const target = normalizeTrickShotTarget({
      kind: BIN_TARGET,
      motionId: motion.id,
      placement: { x: 99, y: 99, z: 99 },
    });
    for (let step = 0; step <= 200; step++) {
      const { bin } = trickShotTargetAt(target, step * 0.05);
      assert(Number.isFinite(bin.x) && Number.isFinite(bin.topY) && Number.isFinite(bin.z));
      assert(
        bin.z <= target.placement.z + envelope.maxDz + 1e-9 && bin.z >= target.placement.z + envelope.minDz - 1e-9,
        `${motion.id} left its own measured envelope`,
      );
    }
  }
});

test("the target is a pure function of the motion clock, so a layout replays identically", () => {
  const target = normalizeTrickShotTarget({ kind: BIN_TARGET, motionId: "circle", placement: { x: 0.1, y: 0.4, z: 0.5 } });
  const a = trickShotTargetAt(target, 1.37).bin;
  const b = trickShotTargetAt(target, 1.37).bin;
  assertEqual(a.x, b.x);
  assertEqual(a.topY, b.topY);
  assertEqual(a.z, b.z);
  // Both offset-cosine paths start where the bin was placed, so t=0 is the
  // placement itself — the bin the player lined up is the bin the shot begins on.
  const rest = trickShotTargetAt(target, 0).bin;
  assertClose(rest.x, target.placement.x, 1e-9);
  assertClose(rest.z, target.placement.z, 1e-9);
});

test("exactly one target is ever live", () => {
  const hoop = trickShotTargetAt(defaultTrickShotTarget(HOOP_TARGET), 2);
  assert(hoop.hoop && hoop.bin === null, "a hoop run has no bin standing on the floor");
  const bin = trickShotTargetAt(defaultTrickShotTarget(BIN_TARGET), 2);
  assert(bin.bin && bin.hoop === null, "a bin run does not leave a second target on the wall");
});

test("a saved layout remembers its target, and one saved before targets existed still loads", () => {
  const shot = normalizeTrickShot({
    id: "s", name: "Bin bounce",
    target: { kind: BIN_TARGET, motionId: "inout", placement: { x: 0.2, y: 0.5, z: 0.6 } },
    pieces: [],
  });
  assertEqual(shot.target.kind, BIN_TARGET);
  assertEqual(shot.target.motionId, "inout");

  const legacy = normalizeTrickShot({ id: "old", name: "v1 layout", pieces: [] });
  assertEqual(legacy.target.kind, HOOP_TARGET, "a record from before targets takes the hoop it was authored against");
  assertEqual(legacy.target.motionId, "still");
  assertEqual(legacy.target.placement, null);
});

test("the bank round-trips a target through storage", () => {
  const backing = new Map();
  const storage = {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, value),
    removeItem: (key) => backing.delete(key),
  };
  const store = createTrickShotStore({ storage, now: () => 1, makeId: () => "shot-1" });
  store.save({ name: "Moving bin", target: { kind: BIN_TARGET, motionId: "updown" }, pieces: [] });

  const reopened = createTrickShotStore({ storage, now: () => 2, makeId: () => "shot-2" });
  const loaded = reopened.get("shot-1");
  assertEqual(loaded.target.kind, BIN_TARGET);
  assertEqual(loaded.target.motionId, "updown");
});

test("the Lab picks an integrator from the target rather than colliding twice", () => {
  // `stepBall` and `stepBallAgainstBins` are both complete integrators, so
  // running both in one substep would apply gravity and drag twice.
  assert(game.includes("stepBall(ball, world, dt"), "the hoop path steps through sim/physics.js");
  assert(game.includes("stepBallAgainstBins(ball, bins, dt"), "the bin path steps through sim/bin-physics.js");
  assert(/\?\s*stepBall\(ball, world, dt[\s\S]{0,120}:\s*stepBallAgainstBins/.test(game),
    "the two integrators must be alternatives, not both");
});

test("the target clock is the second clock, and it is not the shot's", () => {
  assert(game.includes("motionSeconds += TICK_SECONDS"), "the target has to move before a shot is taken");
  const tick = game.slice(game.indexOf("function tick()"));
  const clockAt = tick.indexOf("motionSeconds += TICK_SECONDS");
  const guardAt = tick.indexOf("if (!shotActive) return;");
  assert(clockAt >= 0 && guardAt >= 0 && clockAt < guardAt,
    "the motion clock must advance above the shot guard, or a moving target freezes between attempts");
  // The sweep survives a shot ending: it is restarted only by re-placing the bin
  // or by choosing a new target, both of which are edits to the placement the
  // motion is an offset FROM.
  const resetBody = /function resetShot\([\s\S]*?\n  \}/.exec(game)?.[0] || "";
  assert(resetBody && !resetBody.includes("motionSeconds"),
    "resetting a shot must not restart the target's sweep");
  assert(/function setTarget\([\s\S]{0,600}motionSeconds = 0/.test(game),
    "adopting a target must restart its sweep from the placement it is an offset from");
});

test("the target picker is built from the catalog and the bin is placed on the court", () => {
  for (const id of ["trickTargetKinds", "trickTargetMotion", "trickTargetBlurb"]) {
    assert(html.includes(`id="${id}"`), `missing #${id}`);
  }
  assert(view.includes("TRICK_SHOT_TARGETS") && view.includes("trickShotTargetMotions"),
    "the picker must read the catalogs rather than a second list in the markup");
  assert(!/<option value="still"/.test(html), "motions must not be hand-listed in the markup");
  assert(game.includes("clampPlacement("), "a dragged bin has to go back through HORSE's legal-volume clamp");
  assert(game.includes("trickShotTargetAtPoint(") && game.includes("binDepthHandleAt("),
    "the bin needs both a body grab and its own depth handle");
});

finish();
