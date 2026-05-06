import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "assertion failed");
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gameRoot = path.resolve(__dirname, "..");

console.log("\necho-duel screen-transitions");

test("screen sections use stateful screen classes instead of hidden by default", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  assert(html.includes('id="screen-menu" class="screen screen-menu screen--active"'), "expected menu screen to start active");
  assert(!html.includes('id="screen-online-config" class="screen screen-panel hidden"'), "expected screen sections to stop relying on hidden classes");
  assert(!html.includes('id="screen-online-lobby" class="screen screen-panel hidden"'), "expected online lobby screen to stop relying on hidden classes");
  assert(!html.includes('id="screen-match" class="screen screen-match hidden"'), "expected match screen to stop relying on hidden classes");
});

test("renderer showScreen toggles screen-active state instead of hidden classes", () => {
  const script = fs.readFileSync(path.join(gameRoot, "scripts", "renderer.js"), "utf8");
  const showScreenBlock = script.match(/export function showScreen\(name\) \{[\s\S]*?\n\}/);
  assert(showScreenBlock, "expected showScreen function to exist");
  assert(script.includes("screen--active"), "expected renderer to use screen--active class");
  assert(!showScreenBlock[0].includes("classList.add('hidden')"), "expected renderer showScreen to stop hiding screens with the hidden class");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
