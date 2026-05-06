import {
  createBoardInputState,
  buildIntentFromCell,
  selectTool
} from "../../scripts/client/board-input-controller.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\nboard-input-controller");

test("createBoardInputState starts with a simple default tool", () => {
  const state = createBoardInputState();
  assertEqual(state.selectedTool, "straight-h");
});

test("selectTool swaps the active tool", () => {
  const next = selectTool(createBoardInputState(), "rotate");
  assertEqual(next.selectedTool, "rotate");
});

test("buildIntentFromCell creates PLACE_TILE for local editable holes", () => {
  const result = buildIntentFromCell({
    cell: {
      slotId: "blue_route_01_rp_1",
      slotType: "hole",
      editableByLocalPlayer: true,
      locked: false,
      placedMask: null
    },
    inputState: { selectedTool: "straight-v" }
  });

  assertEqual(result.ok, true);
  assertEqual(result.intent.intentType, "PLACE_TILE");
  assertEqual(result.intent.pieceType, "straight");
  assertEqual(result.intent.rotation, 90);
});

test("buildIntentFromCell creates REPLACE_TILE for refactor slots", () => {
  const result = buildIntentFromCell({
    cell: {
      slotId: "blue_route_02_rp_2",
      slotType: "refactor",
      editableByLocalPlayer: true,
      locked: false,
      placedMask: "NS"
    },
    inputState: { selectedTool: "corner" }
  });

  assertEqual(result.ok, true);
  assertEqual(result.intent.intentType, "REPLACE_TILE");
  assertEqual(result.intent.pieceType, "corner");
  assertEqual(result.intent.rotation, 0);
});

test("buildIntentFromCell creates ROTATE_TILE when rotate is selected on a placed slot", () => {
  const result = buildIntentFromCell({
    cell: {
      slotId: "blue_route_02_rp_2",
      slotType: "refactor",
      editableByLocalPlayer: true,
      locked: false,
      placedMask: "NS"
    },
    inputState: { selectedTool: "rotate" }
  });

  assertEqual(result.ok, true);
  assertEqual(result.intent.intentType, "ROTATE_TILE");
});

test("buildIntentFromCell rejects non-editable or locked cells", () => {
  const wrongOwner = buildIntentFromCell({
    cell: {
      slotId: "red_route_01_rp_1",
      slotType: "hole",
      editableByLocalPlayer: false,
      locked: false,
      placedMask: null
    },
    inputState: { selectedTool: "straight-h" }
  });

  const locked = buildIntentFromCell({
    cell: {
      slotId: "blue_route_01_rp_1",
      slotType: "hole",
      editableByLocalPlayer: true,
      locked: true,
      placedMask: "EW"
    },
    inputState: { selectedTool: "straight-h" }
  });

  assertEqual(wrongOwner.ok, false);
  assertEqual(wrongOwner.reason, "not-editable");
  assertEqual(locked.ok, false);
  assertEqual(locked.reason, "locked");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
