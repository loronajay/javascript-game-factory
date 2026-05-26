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

test("index mounts the shared mobile controller before game init", () => {
  const source = read("index.html");
  assert(source.includes("viewport-fit=cover"), "expected safe-area aware viewport");
  assert(source.includes("from '../../js/mobile-controller.mjs'"), "expected shared mobile controller import");
  assert(source.includes("from './scripts/mobile-ui.js'"), "expected Bird Duty mobile UI import");
  assert(source.includes("id: 'bird-duty-touch'"), "expected Bird Duty-specific mobile profile");
  assert(source.includes("forceMobileControls"), "expected desktop QA force switch");
  assert(source.includes("directionMode: 'horizontal'"), "expected left/right-only mobile movement pad");
  assert(source.includes("{ id: 'drop', label: 'DROP', key: KEY.space }"), "expected drop button to emit Space");

  const gateCall = source.indexOf("initMobileLandscapeGate({ force: forceMobileControls })");
  const controllerCall = source.indexOf("mountMobileController({ profile: BIRD_DUTY_MOBILE_PROFILE, force: forceMobileControls })");
  const initCall = source.indexOf("initGame();");
  assert(
    gateCall >= 0 && controllerCall >= 0 && initCall >= 0 &&
      gateCall < controllerCall && controllerCall < initCall,
    "expected gate/controller setup before game initialization",
  );
});

test("game module lets the shell own initialization order", () => {
  const source = read("game.js");
  assert(!source.includes('addEventListener("DOMContentLoaded"'), "expected index shell to call initGame after mobile setup");
});

test("mobile styles include landscape gate and shared controller overrides", () => {
  const source = read("style.css");
  assert(source.includes(".mobile-landscape-gate"), "expected mobile landscape gate styles");
  assert(source.includes(".mobile-play-gated .bird-duty-shell"), "expected game shell dimming while gated");
  assert(source.includes("(pointer: coarse)"), "expected touch-specific media query");
  assert(source.includes('data-mobile-controller-root="bird-duty-touch"'), "expected Bird Duty controller overrides");
  assert(source.includes("env(safe-area-inset-bottom)"), "expected safe-area inset handling");
});

test("game wires the focusable join-code input for mobile keyboards", () => {
  const source = read("game.js");
  assert(source.includes("createJoinCodeInput"), "expected join-code input helper");
  assert(source.includes("setJoinCodeInputActive"), "expected join-code active state sync");
  assert(source.includes("focusJoinCodeInput"), "expected mobile keyboard focus path");
  assert(source.includes("resolveOnlineJoinCodeInputAtCanvasPoint"), "expected tappable join-code box");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
