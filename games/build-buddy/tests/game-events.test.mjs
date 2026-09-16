import { Game } from "../js/game.js";
import { VIEW_MODES } from "../js/view-modes.js";
import { makeTool } from "../js/tools.js";

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
  assertEqual(game.consumeAudioEvents().some((event) => event.type === "goal"), true);
});

test("game exposes jump and spring audio events with the real bounce power", () => {
  const game = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });
  game.runner.grounded = true;
  game.input.taps.add("jump");
  game.update(1 / 60);
  assertEqual(game.consumeAudioEvents().some((event) => event.type === "jump"), true);

  const spring = game.registry.tools.find((tool) => tool.kind === "spring")
    ?? makeTool("springBlue", 500, 500);
  if (!game.registry.tools.includes(spring)) game.registry.tools.push(spring);
  game.runner.prevX = spring.x;
  game.runner.prevY = spring.y - game.runner.h - 2;
  game.runner.x = spring.x;
  game.runner.y = spring.y - game.runner.h + 2;
  game.runner.vy = 100;
  game.runner.resolveCollisions(1 / 60, game.input, game.registry);
  const event = game.consumeAudioEvents().find((item) => item.type === "spring");
  assertEqual(event?.bounceVy, spring.bounceVy);
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

test("remote snapshots exactly reconcile placed tools instead of leaving ghost platforms", () => {
  const host = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });
  const guest = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });
  host.runner.x = guest.runner.x = 1000;
  host.runner.y = guest.runner.y = 1000;

  const placed = host.applyBuilderCommand({
    action: "place",
    toolType: "platform",
    gridX: 520,
    gridY: 960,
  });
  guest.applyStateSnapshot(host.createStateSnapshot(1));
  assertEqual(guest.registry.tools.some((tool) => tool.id === placed.tool.id && tool.active), true);

  host.applyBuilderCommand({ action: "recall" });
  guest.applyStateSnapshot(host.createStateSnapshot(2));
  assertEqual(guest.registry.tools.some((tool) => tool.id === placed.tool.id && tool.active), false);
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
  assertEqual(game.consumeAudioEvents().some((event) => event.type === "toolAction"), true);
});

test("game result counts successful placements even when a placed tool is later deleted", () => {
  const game = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER });
  game.runner.x = 1000;
  game.runner.y = 1000;

  assertEqual(game.stageStats().toolUseCount, 0);
  const placed = game.applyBuilderCommand({
    action: "place",
    toolType: "platform",
    gridX: 520,
    gridY: 960,
  });
  assertEqual(placed.valid, true);
  const deleted = game.applyBuilderCommand({
    action: "delete",
    gridX: placed.tool.x + 1,
    gridY: placed.tool.y + 1,
  });

  assertEqual(deleted.deleted, true);
  assertEqual(game.stageStats().toolUseCount, 1);
  const toolActionEvents = game.consumeAudioEvents().filter((event) => event.type === "toolAction");
  assertEqual(toolActionEvents.length, 2);
});

test("game can recall every reusable tool with one builder command", () => {
  const game = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER });
  game.runner.x = 1000;
  game.runner.y = 1000;
  const first = game.applyBuilderCommand({ action: "place", toolType: "platform", gridX: 520, gridY: 960 });
  const second = game.applyBuilderCommand({ action: "place", toolType: "springGreen", gridX: 720, gridY: 960 });

  assertEqual(first.valid, true);
  assertEqual(second.valid, true);
  const recalled = game.applyBuilderCommand({ action: "recall" });

  assertEqual(recalled.recalled, true);
  assertEqual(recalled.count >= 2, true);
  assertEqual(game.registry.countTotalNonCheckpoint(), 0);
});

test("invalid builder actions emit the error sound event", () => {
  const game = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER });
  const result = game.applyBuilderCommand({
    action: "place",
    toolType: "platform",
    gridX: -1000,
    gridY: -1000,
  });
  assertEqual(result.valid, false);
  assertEqual(game.consumeAudioEvents().some((event) => event.type === "error"), true);
});

test("game can drive runner movement from remote runner input", () => {
  const game = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });
  const startX = game.runner.x;
  game.applyRunnerInputCommand({ right: true });
  game.update(1 / 60);

  assertEqual(game.runner.x > startX, true);
});

test("held remote jump input creates one press instead of retriggering every network tick", () => {
  const game = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });

  game.applyRunnerInputCommand({ jump: true });
  assertEqual(game.remoteRunnerInput.consumeJumpPressed(), true);
  game.applyRunnerInputCommand({ jump: true });
  assertEqual(game.remoteRunnerInput.consumeJumpPressed(), false);
  game.applyRunnerInputCommand({ jump: false });
  game.applyRunnerInputCommand({ jump: true });
  assertEqual(game.remoteRunnerInput.consumeJumpPressed(), true);
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

test("online Runner control ignores Builder placement", () => {
  const game = new Game(createCanvasStub(), {
    viewMode: VIEW_MODES.RUNNER,
    localControlRole: "runner",
  });
  const before = game.registry.tools.filter((tool) => tool.active).length;
  game.input.mouse.justClicked = true;
  game.update(1 / 60);

  assertEqual(game.viewMode, VIEW_MODES.RUNNER);
  assertEqual(game.registry.tools.filter((tool) => tool.active).length, before);
});

test("unknown online control role is inert instead of local", () => {
  const game = new Game(createCanvasStub(), {
    viewMode: VIEW_MODES.RUNNER,
    localControlRole: "",
  });
  const startX = game.runner.x;
  const before = game.registry.tools.filter((tool) => tool.active).length;
  game.input.keys.add("ArrowRight");
  game.input.mouse.justClicked = true;
  game.update(1 / 60);

  assertEqual(game.runner.x, startX);
  assertEqual(game.registry.tools.filter((tool) => tool.active).length, before);
  assertEqual(game.viewMode, VIEW_MODES.RUNNER);
});

test("online placements are named by their command so both chairs agree on identity", () => {
  const runnerSide = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER, localControlRole: "runner" });
  const builderSide = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER, localControlRole: "builder" });
  runnerSide.runner.x = builderSide.runner.x = 1000;
  runnerSide.runner.y = builderSide.runner.y = 1000;
  const command = { commandId: "cmd_12_place_520_960", action: "place", toolType: "platform", gridX: 520, gridY: 960 };

  const authoritative = runnerSide.applyBuilderCommand(command);
  const predicted = builderSide.applyBuilderCommand(command, { predicted: true });

  assertEqual(authoritative.tool.id, "cmd_12_place_520_960");
  assertEqual(predicted.tool.id, "cmd_12_place_520_960");
  assertEqual(predicted.tool.pendingSnapshots > 0, true);
  assertEqual(authoritative.tool.pendingSnapshots, 0);
  assertEqual(runnerSide.registry.tools.every((tool) => !tool.id.startsWith("tool_")), true, "online stages never mint counter ids");
});

test("preplaced tools carry the same ids on every client", () => {
  const stageWithKit = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });
  const twin = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER });
  const ids = stageWithKit.registry.tools.map((tool) => tool.id);
  assertEqual(JSON.stringify(ids), JSON.stringify(twin.registry.tools.map((tool) => tool.id)));
});

test("a predicted placement survives world syncs that predate it, then settles when the Runner confirms", () => {
  const builderSide = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER, localControlRole: "builder" });
  builderSide.runner.x = 1000;
  builderSide.runner.y = 1000;
  const command = { commandId: "cmd_20_place_520_960", action: "place", toolType: "platform", gridX: 520, gridY: 960 };
  const { tool } = builderSide.applyBuilderCommand(command, { predicted: true });
  const isActive = () => builderSide.registry.tools.some((entry) => entry.id === tool.id && entry.active);

  // Syncs the Runner sent before the command reached them do not list it.
  builderSide.applyStateSnapshot({ tick: 18, runner: { x: 1000, y: 1000 }, tools: [] });
  builderSide.applyStateSnapshot({ tick: 21, runner: { x: 1000, y: 1000 }, tools: [] });
  assertEqual(isActive(), true, "prediction was thrown away by a stale sync");

  // The Runner confirms it; the prediction is now settled and follows authority.
  builderSide.applyStateSnapshot({ tick: 24, runner: { x: 1000, y: 1000 }, tools: [{ id: tool.id, toolType: "platform", x: 520, y: 960, active: true }] });
  assertEqual(tool.pendingSnapshots, 0);
  builderSide.applyStateSnapshot({ tick: 27, runner: { x: 1000, y: 1000 }, tools: [] });
  assertEqual(isActive(), false, "a settled tool ignored the Runner removing it");
});

test("a predicted placement the Runner never confirms is withdrawn after the grace window", () => {
  const builderSide = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER, localControlRole: "builder" });
  builderSide.runner.x = 1000;
  builderSide.runner.y = 1000;
  const { tool } = builderSide.applyBuilderCommand(
    { commandId: "cmd_30_place_520_960", action: "place", toolType: "platform", gridX: 520, gridY: 960 },
    { predicted: true },
  );
  let syncs = 0;
  while (builderSide.registry.tools.some((entry) => entry.id === tool.id && entry.active) && syncs < 100) {
    builderSide.applyStateSnapshot({ tick: syncs * 3, runner: { x: 1000, y: 1000 }, tools: [] });
    syncs += 1;
  }
  assertEqual(syncs > 3, true, "grace window is too short to survive a round trip");
  assertEqual(syncs < 100, true, "a rejected prediction was never withdrawn");
});

test("a predicted delete is not resurrected by a sync the Runner sent before it", () => {
  const builderSide = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER, localControlRole: "builder" });
  builderSide.runner.x = 1000;
  builderSide.runner.y = 1000;
  const remoteTool = { id: "cmd_5_place_520_960", toolType: "platform", x: 520, y: 960, active: true };
  builderSide.applyStateSnapshot({ tick: 6, runner: { x: 1000, y: 1000 }, tools: [remoteTool] });
  const isActive = () => builderSide.registry.tools.some((entry) => entry.id === remoteTool.id && entry.active);
  assertEqual(isActive(), true);

  const deleted = builderSide.applyBuilderCommand({ commandId: "cmd_40_delete_520_960", action: "delete", gridX: 521, gridY: 961 }, { predicted: true });
  assertEqual(deleted.deleted, true);
  builderSide.applyStateSnapshot({ tick: 9, runner: { x: 1000, y: 1000 }, tools: [remoteTool] });
  assertEqual(isActive(), false, "stale sync resurrected a tool the Builder just deleted");
  builderSide.applyStateSnapshot({ tick: 12, runner: { x: 1000, y: 1000 }, tools: [] });
  assertEqual(isActive(), false);
});

test("world syncs carry timer, elapsed time and Runner tallies so the Builder's HUD matches", () => {
  const runnerSide = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER, localControlRole: "runner" });
  const builderSide = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER, localControlRole: "builder" });
  runnerSide.timeRemainingMs = 40000;
  runnerSide.elapsedMs = 20000;
  runnerSide.runner.deaths = 3;
  runnerSide.runner.repositions = 2;

  builderSide.applyStateSnapshot(runnerSide.createStateSnapshot(60));

  assertEqual(builderSide.timeRemainingMs, 40000);
  assertEqual(builderSide.elapsedMs, 20000);
  assertEqual(builderSide.runner.deaths, 3);
  assertEqual(builderSide.runner.repositions, 2);
});

test("a Builder without builder actions only previews and never places on its own", () => {
  const game = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER, localControlRole: "builder" });
  const before = game.registry.tools.filter((tool) => tool.active).length;
  game.input.mouse.justClicked = true;
  game.update(1 / 60, { skipEndFrame: true, builderActions: false });

  assertEqual(game.registry.tools.filter((tool) => tool.active).length, before);
  assertEqual(game.input.mouse.justClicked, true, "the click must survive for the online command path");
  assertEqual(typeof game.builder.hover.valid, "boolean");
});

test("both chairs converge on the Runner's world when they disagree about a placement", () => {
  const runnerSide = new Game(createCanvasStub(), { viewMode: VIEW_MODES.RUNNER, localControlRole: "runner" });
  const builderSide = new Game(createCanvasStub(), { viewMode: VIEW_MODES.BUILDER, localControlRole: "builder" });
  const activeIds = (game) => game.registry.tools.filter((tool) => tool.active).map((tool) => tool.id).sort().join(",");
  let tick = 0;
  const sync = () => {
    tick += 3;
    builderSide.applyStateSnapshot(runnerSide.createStateSnapshot(tick));
  };

  // Case 1: the Builder's replica has the Runner far away, so it predicts the
  // placement fine — but the real Runner is standing right there and rejects it.
  builderSide.runner.x = 1000;
  builderSide.runner.y = 1000;
  runnerSide.runner.x = 520;
  runnerSide.runner.y = 940;
  const rejectedByRunner = { commandId: "cmd_1_place_520_960", action: "place", toolType: "platform", gridX: 520, gridY: 960 };
  assertEqual(builderSide.applyBuilderCommand(rejectedByRunner, { predicted: true }).valid, true);
  assertEqual(runnerSide.applyBuilderCommand(rejectedByRunner).valid, false);
  for (let index = 0; index < 20; index += 1) sync();
  assertEqual(activeIds(builderSide), activeIds(runnerSide), "builder kept a platform the runner refused");

  // Case 2: the Builder's replica thinks the Runner is in the way and rejects
  // locally, but the real Runner has moved on and accepts. The command is sent
  // regardless, and the sync brings the platform to the Builder.
  runnerSide.runner.x = 1000;
  runnerSide.runner.y = 1000;
  builderSide.runner.x = 520;
  builderSide.runner.y = 940;
  const acceptedByRunner = { commandId: "cmd_2_place_520_960", action: "place", toolType: "platform", gridX: 520, gridY: 960 };
  assertEqual(builderSide.applyBuilderCommand(acceptedByRunner, { predicted: true }).valid, false);
  assertEqual(runnerSide.applyBuilderCommand(acceptedByRunner).valid, true);
  sync();
  assertEqual(activeIds(builderSide), activeIds(runnerSide), "builder never received a platform the runner accepted");
  assertEqual(activeIds(builderSide).includes("cmd_2_place_520_960"), true);

  // Case 3: a recall reaches the Runner and the Builder's prediction settles.
  const recall = { commandId: "cmd_3_recall", action: "recall" };
  builderSide.applyBuilderCommand(recall, { predicted: true });
  runnerSide.applyBuilderCommand(recall);
  sync();
  assertEqual(activeIds(builderSide), activeIds(runnerSide));
  assertEqual(activeIds(runnerSide).includes("cmd_2_place_520_960"), false);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
