import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import {
  MODEL_SHEETS,
  MODEL_GROUPS,
  DEFAULT_MODEL_ID,
  bandsFromCounts,
  columnCounts,
  rowCounts,
  tightBounds,
  framesFromAlpha,
  frameById,
  sheetById,
  modelById,
  defaultModel,
  modelsByGroup,
  allModels,
} from "../scripts/assets/car-atlas.js";

suite("car-atlas — sprite frame measurement");

/** Builds a synthetic alpha buffer with opaque rectangles painted into it. */
function alphaSheet(width, height, rects, value = 255) {
  const alpha = new Uint8Array(width * height);
  for (const [x0, y0, w, h] of rects) {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        alpha[y * width + x] = value;
      }
    }
  }
  return alpha;
}

// ---------------------------------------------------------------------------
// Band splitting
// ---------------------------------------------------------------------------

test("bands are the runs of non-empty counts", () => {
  assertDeepEqual(bandsFromCounts([0, 0, 3, 4, 5, 0, 0, 2, 2, 0], 1), [
    [2, 4],
    [7, 8],
  ]);
});

test("a band running to the end of the buffer is still closed", () => {
  assertDeepEqual(bandsFromCounts([0, 1, 1], 1), [[1, 2]]);
});

test("runs shorter than the minimum are discarded as noise", () => {
  assertDeepEqual(bandsFromCounts([5, 0, 0, 9, 9, 9, 9], 3), [[3, 6]]);
});

test("an empty projection yields no bands", () => {
  assertDeepEqual(bandsFromCounts([0, 0, 0], 1), []);
});

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

test("column and row counts only tally pixels at or above the threshold", () => {
  const alpha = alphaSheet(4, 3, [[1, 0, 2, 2]], 200);
  assertDeepEqual(Array.from(columnCounts(alpha, 4, 3, 128)), [0, 2, 2, 0]);
  assertDeepEqual(Array.from(rowCounts(alpha, 4, 3, 128)), [2, 2, 0]);
  assertDeepEqual(Array.from(columnCounts(alpha, 4, 3, 220)), [0, 0, 0, 0], "faint pixels are ignored");
});

// ---------------------------------------------------------------------------
// Tight bounds
// ---------------------------------------------------------------------------

test("tight bounds shrink to the painted pixels, not the search rect", () => {
  const alpha = alphaSheet(10, 10, [[3, 4, 2, 3]]);
  assertDeepEqual(tightBounds(alpha, 10, { sx: 0, sy: 0, sw: 10, sh: 10 }, 128), {
    sx: 3,
    sy: 4,
    sw: 2,
    sh: 3,
  });
});

test("tight bounds of an empty region are null rather than a zero-size rect", () => {
  const alpha = alphaSheet(10, 10, []);
  assertEqual(tightBounds(alpha, 10, { sx: 0, sy: 0, sw: 10, sh: 10 }, 128), null);
});

// ---------------------------------------------------------------------------
// Whole-sheet measurement
// ---------------------------------------------------------------------------

test("a gridded sheet resolves into one frame per blob, row-major", () => {
  //  two columns x two rows of blobs, with gutters, offset from the edges
  const alpha = alphaSheet(
    40,
    30,
    [
      [4, 3, 8, 6],
      [22, 4, 9, 5],
      [5, 18, 7, 7],
      [21, 17, 10, 8],
    ],
  );
  const frames = framesFromAlpha(alpha, 40, 30, { threshold: 128, minRun: 2 });
  assertEqual(frames.length, 4);
  assertDeepEqual(frames[0], { sx: 4, sy: 3, sw: 8, sh: 6, col: 0, row: 0 });
  assertDeepEqual(frames[1], { sx: 22, sy: 4, sw: 9, sh: 5, col: 1, row: 0 });
  assertDeepEqual(frames[2], { sx: 5, sy: 18, sw: 7, sh: 7, col: 0, row: 1 });
  assertDeepEqual(frames[3], { sx: 21, sy: 17, sw: 10, sh: 8, col: 1, row: 1 });
});

test("frames are measured tightly even when a row band is taller than one blob", () => {
  // The right blob is shorter; its frame must not inherit the band's height.
  const alpha = alphaSheet(30, 20, [
    [2, 2, 6, 12],
    [18, 5, 6, 4],
  ]);
  const frames = framesFromAlpha(alpha, 30, 20, { threshold: 128, minRun: 2 });
  assertEqual(frames.length, 2);
  assertEqual(frames[0].sh, 12);
  assertEqual(frames[1].sh, 4, "the short blob keeps its own height");
  assertEqual(frames[1].sy, 5);
});

test("an empty sheet measures no frames instead of throwing", () => {
  assertDeepEqual(framesFromAlpha(alphaSheet(8, 8, []), 8, 8, { threshold: 128, minRun: 1 }), []);
});

// ---------------------------------------------------------------------------
// The committed manifest for the authored sheets
// ---------------------------------------------------------------------------

test("the roster is two sheets of twelve models", () => {
  assertEqual(MODEL_SHEETS.length, 2);
  for (const sheet of MODEL_SHEETS) {
    assertEqual(sheet.frames.length, 12, `${sheet.id} should hold twelve models`);
  }
  assertEqual(allModels().length, 24);
});

test("model ids are unique across the whole roster, not just within a sheet", () => {
  // An id is what a garage preset and a server entitlement row both store, so a
  // duplicate between sheets would make the stored value ambiguous.
  const ids = new Set(allModels().map((model) => model.id));
  assertEqual(ids.size, 24);
});

test("every sheet id is unique", () => {
  assertEqual(new Set(MODEL_SHEETS.map((sheet) => sheet.id)).size, MODEL_SHEETS.length);
});

test("every frame sits inside its sheet", () => {
  for (const sheet of MODEL_SHEETS) {
    for (const frame of sheet.frames) {
      assert(frame.sx >= 0 && frame.sy >= 0, `${frame.id} has a negative origin`);
      assert(frame.sx + frame.sw <= sheet.width, `${frame.id} overruns ${sheet.id}'s width`);
      assert(frame.sy + frame.sh <= sheet.height, `${frame.id} overruns ${sheet.id}'s height`);
      assert(frame.sw > 0 && frame.sh > 0, `${frame.id} is empty`);
    }
  }
});

test("no two frames on a sheet overlap", () => {
  for (const sheet of MODEL_SHEETS) {
    const frames = sheet.frames;
    for (let i = 0; i < frames.length; i += 1) {
      for (let j = i + 1; j < frames.length; j += 1) {
        const a = frames[i];
        const b = frames[j];
        const disjoint =
          a.sx + a.sw <= b.sx || b.sx + b.sw <= a.sx || a.sy + a.sh <= b.sy || b.sy + b.sh <= a.sy;
        assert(disjoint, `${a.id} overlaps ${b.id} on ${sheet.id}`);
      }
    }
  }
});

test("frames are close to a consistent size, as rear-view cars on one sheet should be", () => {
  // These are 24 different models rather than 45 recolours of one body, so the
  // spread is genuinely wider than it used to be — a mid-engined exotic is not
  // the same shape as a hot hatch. The bound still catches a merged or clipped
  // frame, which is what it is for.
  for (const sheet of MODEL_SHEETS) {
    const widths = sheet.frames.map((frame) => frame.sw);
    const heights = sheet.frames.map((frame) => frame.sh);
    assert(Math.max(...widths) - Math.min(...widths) < 40, `${sheet.id} car widths drifted apart`);
    assert(Math.max(...heights) - Math.min(...heights) < 40, `${sheet.id} car heights drifted apart`);
  }
});

test("every car is taller than it is wide, as a rear view of a car is", () => {
  // A frame measured wider than it is tall means the measurer merged two cars
  // or clipped one, which is the failure mode worth catching automatically.
  for (const model of allModels()) {
    const aspect = model.sw / model.sh;
    assert(aspect > 0.5 && aspect < 0.95, `${model.id} measured at aspect ${aspect.toFixed(3)}`);
  }
});

test("the default model resolves to a real car", () => {
  const found = defaultModel();
  assert(found, "the default model must exist in the manifest");
  assertEqual(found.id, DEFAULT_MODEL_ID);
});

test("an unknown model id resolves to null rather than undefined behaviour", () => {
  assertEqual(frameById(MODEL_SHEETS[0], "monster-truck"), null);
  assertEqual(sheetById("models-z"), null);
  assertEqual(modelById("monster-truck"), null);
});

test("a model id resolves on its own, without naming a sheet", () => {
  // The paint manifest this replaced needed a sheet id to disambiguate. Model
  // ids are globally unique, so the id alone is the whole key — which is what
  // makes it safe to store in a save file and a server entitlement row.
  assertEqual(modelById("kaido-gts").sheetId, "models-a");
  assertEqual(modelById("kaido-r").sheetId, "models-b");
});

test("every model carries the sheet it came from, so one lookup is enough to draw it", () => {
  for (const model of allModels()) {
    assert(model.sheetId, `${model.id} has no sheet id`);
    assert(model.src.endsWith(".png"), `${model.id} has no image source`);
    assert(sheetById(model.sheetId), `${model.id} points at a sheet that does not exist`);
  }
});

test("every model lands in exactly one archetype group", () => {
  // A model whose group is missing from MODEL_GROUPS would not be reachable in
  // the picker at all — it would simply never be drawn, with nothing to notice.
  const groupIds = new Set(MODEL_GROUPS.map((group) => group.id));
  for (const model of allModels()) {
    assert(groupIds.has(model.group), `${model.id} is in unknown group '${model.group}'`);
  }
  const grouped = modelsByGroup().flatMap((group) => group.models);
  assertEqual(grouped.length, 24, "grouping must account for every model exactly once");
});

test("no archetype group is empty", () => {
  for (const group of modelsByGroup()) {
    assert(group.models.length > 0, `group '${group.id}' has no models and would draw as a gap`);
  }
});

test("grouping preserves roster order within a group", () => {
  const order = allModels().map((model) => model.id);
  for (const group of modelsByGroup()) {
    const indices = group.models.map((model) => order.indexOf(model.id));
    const sorted = [...indices].sort((a, b) => a - b);
    assert(
      indices.every((value, index) => value === sorted[index]),
      `group '${group.id}' reorders the roster`,
    );
  }
});

finish();
