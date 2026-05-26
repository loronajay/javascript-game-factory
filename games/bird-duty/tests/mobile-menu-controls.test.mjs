import fs from "node:fs";
import path from "node:path";

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

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("renderer uses a shorter mobile controls hint instead of the full desktop string", () => {
  const source = read("scripts/renderer.js");
  assert(source.includes("mobileControlsActive"), "expected renderer to receive mobile controls state");
  assert(source.includes("TAP PAD: LEFT / RIGHT"), "expected compact mobile movement hint");
  assert(source.includes("DROP BUTTON"), "expected mobile drop hint");
});

test("menu controls hint is drawn above the mobile safe edge", () => {
  const source = read("scripts/renderer.js");
  assert(source.includes("const controlsY = mobileControlsActive ? 334 : 348"), "expected raised mobile controls baseline");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
