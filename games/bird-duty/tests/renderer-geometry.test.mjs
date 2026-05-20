import { PLAYER_RENDER_SCALE, createPlayerState } from "../scripts/player.js";
import { buildCenteredImageRect } from "../scripts/renderer.js";

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

function assertClose(actual, expected, message, epsilon = 0.001) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(message || `expected ${actual} to be close to ${expected}`);
  }
}

test("player bird renders near the canon top-center placement", () => {
  const player = createPlayerState();
  const rect = buildCenteredImageRect(
    { width: 49, height: 144 },
    {
      x: player.x,
      y: player.y,
      scale: PLAYER_RENDER_SCALE,
    }
  );

  assertClose(rect.x, 566.5);
  assertClose(rect.y, 109);
  assertClose(rect.width, 147);
  assertClose(rect.height, 432);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
