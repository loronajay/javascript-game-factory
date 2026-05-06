import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCircuitSiegeAppController } from "../../scripts/client/app-controller.js";
import { createSessionRuntimeState } from "../../scripts/client/session-runtime-state.js";
import { loadBoardDefinition } from "../../scripts/shared/circuit-board.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => {
          console.log(`  PASS ${name}`);
          passed++;
        })
        .catch((error) => {
          console.log(`  FAIL ${name}: ${error.message}`);
          failed++;
        });
    }

    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }

  return Promise.resolve();
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gameRoot = path.resolve(__dirname, "..", "..");
const boardPath = path.join(gameRoot, "data", "authored-board.v1.json");
const board = loadBoardDefinition(JSON.parse(fs.readFileSync(boardPath, "utf8")));

function createHarness() {
  const runtime = createSessionRuntimeState();
  const renders = [];
  const controllerCalls = [];

  const sessionController = {
    startPublicMatch(args) {
      controllerCalls.push(["startPublicMatch", args]);
      return Promise.resolve(true);
    },
    startPrivateCreate(args) {
      controllerCalls.push(["startPrivateCreate", args]);
      return Promise.resolve(true);
    },
    startPrivateJoin(args) {
      controllerCalls.push(["startPrivateJoin", args]);
      return Promise.resolve(true);
    },
    requestReady(ready) {
      controllerCalls.push(["requestReady", ready]);
      return true;
    },
    requestStartNow() {
      controllerCalls.push(["requestStartNow"]);
      return true;
    },
    submitIntent(intent) {
      controllerCalls.push(["submitIntent", intent]);
      return true;
    },
    disconnect() {
      controllerCalls.push(["disconnect"]);
    }
  };

  const app = createCircuitSiegeAppController({
    board,
    runtime,
    sessionController,
    renderApp(viewModel) {
      renders.push(viewModel);
    }
  });

  return { app, runtime, renders, controllerCalls };
}

console.log("\napp-controller");

await test("boot renders an initial shell state from the board and runtime", async () => {
  const harness = createHarness();

  await harness.app.boot();

  assertEqual(harness.renders.length, 1);
  assertEqual(harness.renders[0].screen, "menu");
  assertEqual(harness.renders[0].board.cells.length, 820);
});

await test("public/private actions delegate to the session controller and refresh the view model", async () => {
  const harness = createHarness();
  await harness.app.boot();

  await harness.app.startPublicBlue();
  await harness.app.startPrivateHost();
  await harness.app.joinPrivateRoom("ROOM9");

  assertEqual(harness.controllerCalls[0][0], "startPublicMatch");
  assertEqual(harness.controllerCalls[0][1].side, "blue");
  assertEqual(harness.controllerCalls[1][0], "startPrivateCreate");
  assertEqual(harness.controllerCalls[2][0], "startPrivateJoin");
  assertEqual(harness.controllerCalls[2][1].roomCode, "ROOM9");
});

await test("session updates re-render the combined app and board state", async () => {
  const harness = createHarness();
  await harness.app.boot();

  harness.runtime.matchmakingMode = "public";
  harness.runtime.selectedSide = "blue";
  harness.runtime.queueCounts = { blue: 1, red: 4 };
  harness.runtime.lobby = { roomCode: "CS01", playerCount: 2 };
  harness.runtime.snapshot = {
    phase: "live",
    timerMsRemaining: 120000,
    scores: { blue: 1, red: 0 },
    routes: {},
    terminals: {},
    slots: {},
    result: null
  };

  harness.app.handleRuntimeChanged();

  const latest = harness.renders.at(-1);
  assertEqual(latest.screen, "match");
  assertEqual(latest.queueStatusText, "4 red players waiting.");
  assertEqual(latest.board.timerText, "2:00");
});

await test("ready/start/leave actions delegate cleanly without owning session details", async () => {
  const harness = createHarness();
  await harness.app.boot();

  harness.app.requestReady(true);
  harness.app.requestStartNow();
  harness.app.leaveMatchmaking();

  assertEqual(harness.controllerCalls[0][0], "requestReady");
  assertEqual(harness.controllerCalls[1][0], "requestStartNow");
  assertEqual(harness.controllerCalls[2][0], "disconnect");
});

await test("tool selection and board slot clicks delegate through the input layer", async () => {
  const harness = createHarness();
  await harness.app.boot();
  harness.runtime.selectedSide = "blue";
  harness.runtime.snapshot = {
    phase: "live",
    timerMsRemaining: 180000,
    scores: { blue: 0, red: 0 },
    routes: {},
    terminals: {},
    slots: {
      blue_route_01_rp_1: { placedMask: null, locked: false }
    },
    result: null
  };

  harness.app.selectTool("straight-v");
  assertEqual(harness.renders.at(-1).selectedTool, "straight-v");

  assertEqual(harness.app.handleBoardSlot("blue_route_01_rp_1"), true);
  assertEqual(harness.controllerCalls.at(-1)[0], "submitIntent");
  assertEqual(harness.controllerCalls.at(-1)[1].intentType, "PLACE_TILE");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
