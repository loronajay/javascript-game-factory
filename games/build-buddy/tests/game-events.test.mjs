import { Game } from "../js/game.js";
import { VIEW_MODES } from "../js/view-modes.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
  }
}

function installDomStubs() {
  globalThis.window = {
    addEventListener() {},
  };
  globalThis.document = {
    querySelectorAll() {
      return [];
    },
  };
}

function createCanvasStub() {
  return {
    width: 1280,
    height: 720,
    addEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1280, height: 720 };
    },
    getContext() {
      return {};
    },
  };
}

installDomStubs();

test("game reports stage clear once when the runner reaches the goal", () => {
  const events = [];
  const game = new Game(createCanvasStub(), {
    viewMode: VIEW_MODES.RUNNER,
    onStageClear: (result) => events.push(result),
  });

  game.runner.x = game.stage.goal.x;
  game.runner.y = game.stage.goal.y;
  game.update(1 / 60);
  game.update(1 / 60);

  assertEqual(events.length, 1);
  assertEqual(events[0].stageId, game.currentStageId());
  assertEqual(events[0].outcome, "clear");
});

test("game reports timer expiry as a stage failure instead of killing the runner", () => {
  const events = [];
  const game = new Game(createCanvasStub(), {
    viewMode: VIEW_MODES.RUNNER,
    onStageFailure: (result) => events.push(result),
  });

  game.timeRemainingMs = 1;
  game.update(1 / 60);
  game.update(1 / 60);

  assertEqual(events.length, 1);
  assertEqual(events[0].outcome, "fail");
  assertEqual(events[0].reason, "timer");
  assertEqual(game.runner.deaths, 0);
});

test("game exposes host state snapshots and applies remote snapshots", () => {
  const host = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });
  const guest = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });

  host.runner.x = 321;
  host.runner.y = 654;
  host.timeRemainingMs = 12345;
  const snapshot = host.createStateSnapshot(42);
  guest.applyStateSnapshot(snapshot);

  assertEqual(snapshot.tick, 42);
  assertEqual(snapshot.runner.x, 321);
  assertEqual(guest.runner.x, 321);
  assertEqual(guest.runner.y, 654);
  assertEqual(guest.timeRemainingMs, 12345);
});

test("game applies remote builder commands to the host registry", () => {
  const game = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });
  game.runner.x = 1000;
  game.runner.y = 1000;
  const before = game.registry.tools.filter((tool) => tool.active).length;
  const result = game.applyBuilderCommand({
    action: "place",
    toolType: "platform",
    gridX: 520,
    gridY: 960,
  });

  assertEqual(result.valid, true);
  assertEqual(game.registry.tools.filter((tool) => tool.active).length, before + 1);
});

test("game can drive runner movement from remote runner input", () => {
  const game = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });
  const startX = game.runner.x;
  game.applyRunnerInputCommand({ right: true });
  game.update(1 / 60);

  assertEqual(game.runner.x > startX, true);
});

test("online Builder control does not locally drive Runner movement", () => {
  const game = new Game(createCanvasStub(), {
    viewMode: VIEW_MODES.BUILDER,
    localControlRole: "builder",
  });
  const startX = game.runner.x;
  game.input.keys.add("ArrowRight");
  game.update(1 / 60);

  assertEqual(game.runner.x, startX);
});

test("online Runner control ignores manual view switching and Builder placement", () => {
  const game = new Game(createCanvasStub(), {
    viewMode: VIEW_MODES.RUNNER,
    localControlRole: "runner",
  });
  const before = game.registry.tools.filter((tool) => tool.active).length;
  game.input.viewModeRequest = VIEW_MODES.HYBRID;
  game.input.mouse.justClicked = true;
  game.update(1 / 60);

  assertEqual(game.viewMode, VIEW_MODES.RUNNER);
  assertEqual(game.registry.tools.filter((tool) => tool.active).length, before);
});

test("unknown online control role is inert instead of debug", () => {
  const game = new Game(createCanvasStub(), {
    viewMode: VIEW_MODES.RUNNER,
    localControlRole: "",
  });
  const startX = game.runner.x;
  const before = game.registry.tools.filter((tool) => tool.active).length;
  game.input.keys.add("ArrowRight");
  game.input.mouse.justClicked = true;
  game.input.viewModeRequest = VIEW_MODES.HYBRID;
  game.update(1 / 60);

  assertEqual(game.runner.x, startX);
  assertEqual(game.registry.tools.filter((tool) => tool.active).length, before);
  assertEqual(game.viewMode, VIEW_MODES.RUNNER);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
