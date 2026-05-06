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

console.log("\necho-duel style-modules");

test("root stylesheet imports the focused CSS modules", () => {
  const css = fs.readFileSync(path.join(gameRoot, "style.css"), "utf8");
  const expectedImports = [
    '@import url("./styles/tokens.css");',
    '@import url("./styles/base.css");',
    '@import url("./styles/shell.css");',
    '@import url("./styles/menu.css");',
    '@import url("./styles/forms.css");',
    '@import url("./styles/lobby.css");',
    '@import url("./styles/match.css");',
    '@import url("./styles/end-screen.css");',
    '@import url("./styles/transitions.css");',
  ];

  for (const line of expectedImports) {
    assert(css.includes(line), `expected style.css to include ${line}`);
  }
});

test("all imported stylesheet modules exist", () => {
  const modules = [
    "tokens.css",
    "base.css",
    "shell.css",
    "menu.css",
    "forms.css",
    "lobby.css",
    "match.css",
    "end-screen.css",
    "transitions.css",
  ];

  for (const name of modules) {
    const filePath = path.join(gameRoot, "styles", name);
    assert(fs.existsSync(filePath), `expected ${name} to exist`);
  }
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
