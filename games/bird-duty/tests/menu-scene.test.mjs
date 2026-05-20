import {
  buildMenuSprites,
  getBirdDutyMenuTargetNames,
  getJayArcadeShellTargetNames,
} from "../scripts/menu-scene.js";
import { MENU_ACTIONS } from "../scripts/menu-input.js";

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

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${actual} to equal ${expected}`);
  }
}

function createManifest(names) {
  return {
    targets: names.map((name, index) => ({
      name,
      x: index * 10,
      y: index * -5,
      size: 100 + index,
      currentCostume: 0,
      costumes: [{ name: `${name} costume`, file: `${name}.svg` }],
    })),
  };
}

test("menu scene includes the Bird Duty menu sprites", () => {
  const names = getBirdDutyMenuTargetNames();

  assert(names.includes("SINGLE PLAYER"), "expected single-player button");
  assert(names.includes("MULTIPLAYER"), "expected multiplayer button");
  assert(names.includes("Back to Homepage"), "expected canon homepage button art");
  assert(names.includes("Back to Arcade"), "expected canon arcade button art");
  assert(names.includes("reset pb"), "expected reset score button art");
});

test("menu scene leaves animated menu birds to the menu-birds module", () => {
  const menuNames = getBirdDutyMenuTargetNames();

  assert(!menuNames.includes("Bird-Menu"), "expected left menu bird to animate outside static scene");
  assert(!menuNames.includes("Bird-Menu2"), "expected right menu bird to mirror the shared animation");
});

test("menu scene excludes JayArcade shell sprites", () => {
  const menuNames = getBirdDutyMenuTargetNames();

  for (const shellName of getJayArcadeShellTargetNames()) {
    assert(!menuNames.includes(shellName), `expected menu to exclude ${shellName}`);
  }
});

test("menu scene excludes non-menu selection state sprites", () => {
  const menuNames = getBirdDutyMenuTargetNames();

  assert(!menuNames.includes("PLAYER?"), "expected player-selection badge to stay hidden");
  assert(!menuNames.includes("ROUND?"), "expected round-selection badge to stay hidden");
  assert(!menuNames.includes("SCORES"), "expected old Scratch score chips to stay hidden");
  assert(!menuNames.includes("reset all"), "expected reset-game button to stay hidden");
});

test("buildMenuSprites preserves Scratch position and size metadata", () => {
  const manifest = createManifest(getBirdDutyMenuTargetNames());
  const sprites = buildMenuSprites(manifest);
  const first = sprites[0];

  assertEqual(sprites.length, getBirdDutyMenuTargetNames().length);
  assertEqual(first.targetName, "BirdDUTYmenutext");
  assertEqual(first.x, 0);
  assertEqual(first.y, 0);
  assertEqual(first.size, 100);
  assertEqual(first.costumeName, "BirdDUTYmenutext costume");
});

test("buildMenuSprites annotates actionable buttons", () => {
  const manifest = createManifest(getBirdDutyMenuTargetNames());
  const sprites = buildMenuSprites(manifest);

  assertEqual(sprites.find((sprite) => sprite.targetName === "SINGLE PLAYER").action, MENU_ACTIONS.SINGLE_PLAYER);
  assertEqual(sprites.find((sprite) => sprite.targetName === "MULTIPLAYER").action, MENU_ACTIONS.TWO_PLAYERS);
  assertEqual(sprites.find((sprite) => sprite.targetName === "reset pb").action, MENU_ACTIONS.RESET_SCORE);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
