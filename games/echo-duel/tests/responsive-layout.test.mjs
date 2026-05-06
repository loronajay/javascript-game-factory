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

console.log("\necho-duel responsive-layout");

test("match layout has a medium-width breakpoint before mobile to prevent panel overflow", () => {
  const css = fs.readFileSync(path.join(gameRoot, "styles", "match.css"), "utf8");
  assert(css.includes("@media (max-width: 980px)"), "expected a medium-width breakpoint for the match layout");
  assert(css.includes(".match-stage-shell"), "expected match stage shell styles");
});

test("menu and pad helper copy stays functional instead of tagline-like", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  assert(!html.includes("Trade patterns, read the room"), "expected flavor tagline copy to be removed from the menu note");
  assert(!html.includes("Four tones. One mistake. Everybody sees it."), "expected dramatic helper tagline to be removed from the match pad");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
