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

console.log("\necho-duel reset-controls");

test("match html no longer exposes a reset-match button", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  assert(!html.includes("btn-reset-match"), "expected reset-match button to be removed from index.html");
});

test("init-game no longer wires a reset-match click handler", () => {
  const script = fs.readFileSync(path.join(gameRoot, "scripts", "init-game.js"), "utf8");
  assert(!script.includes("btn-reset-match"), "expected reset-match handler to be removed from init-game.js");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
