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

console.log("\necho-duel ui-polish");

test("menu copy stays player-facing and does not include internal design notes", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  assert(!html.includes("social standoff, not a form flow"), "expected internal design note copy to be removed");
  assert(html.includes("Trade patterns, read the room"), "expected menu note to speak to players");
});

test("match screen includes richer framing containers for the play experience", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  assert(html.includes('class="players-strip-frame"'), "expected framed player area in the match layout");
  assert(html.includes('class="match-stage-shell"'), "expected framed match stage shell in the match layout");
  assert(html.includes('class="input-deck"'), "expected framed input deck in the match layout");
});

test("renderer outputs decorative player badge markup for player cards", () => {
  const script = fs.readFileSync(path.join(gameRoot, "scripts", "renderer.js"), "utf8");
  assert(script.includes("player-card__badge"), "expected renderer to output a player badge for cards");
  assert(script.includes("player-card__meta"), "expected renderer to group player name and role into a meta block");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
