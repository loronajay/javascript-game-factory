// The architecture, enforced mechanically.
//
// `scripts/sim/` is Bird Duty's pure layer, and its purity is not a style preference: the layer is
// copied byte for byte into `factory-network-server` so the server can be the authority for an
// online match. A DOM reference, a clock read or an ambient random in any of these files would fail
// on the server — or worse, would not fail, and would quietly make the two copies disagree about a
// match in progress.
//
// Every rule the header comments in this cabinet claim is checked here as a fact about the source,
// so the next feature cannot reach across a boundary and leave the comments lying.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  if (!condition) throw new Error(message || "expected truthy");
}

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(gameRoot, relative), "utf8");

/**
 * A file with its comments removed.
 *
 * The layer checks have to run against this rather than the raw source, because the header comments
 * in these files SAY the rule out loud — `match-sim.js` opens by explaining it has no clock — and a
 * check that scanned raw text would flag every file that documents the rule it obeys.
 */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*/g, "$1");

function scriptFiles(dir = "scripts") {
  const out = [];
  for (const entry of fs.readdirSync(path.join(gameRoot, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...scriptFiles(relative));
    else if (entry.name.endsWith(".js")) out.push(relative);
  }
  return out.sort();
}

const FILES = scriptFiles();
const SIM_FILES = FILES.filter((file) => file.startsWith("scripts/sim/"));

test("the sim layer exists and holds the match", () => {
  assert(SIM_FILES.length >= 9, `expected a populated sim layer, found ${SIM_FILES.length} files`);
  assert(SIM_FILES.includes("scripts/sim/match-sim.js"), "the authoritative match must live in the sim");
});

test("the sim never touches the DOM", () => {
  for (const file of SIM_FILES) {
    const source = code(file);
    assert(!/\bdocument\b|\bwindow\b|\blocalStorage\b/.test(source), `${file} touches the DOM`);
    assert(!/\bAudio\b|\bImage\b|\bfetch\b|\bWebSocket\b/.test(source), `${file} reaches for a browser API`);
  }
});

test("the sim never reads a clock", () => {
  // A clock is what makes a simulation unreplayable. The server owns time here and hands the sim
  // whole ticks; nothing inside may ask what time it is.
  for (const file of SIM_FILES) {
    const source = code(file);
    assert(
      !/performance\.now|Date\.now|new Date|setTimeout|setInterval|requestAnimationFrame/.test(source),
      `${file} reads a clock`,
    );
  }
});

test("the sim never uses an ambient random source", () => {
  for (const file of SIM_FILES) {
    assert(!/Math\.random/.test(code(file)), `${file} uses an ambient random source`);
  }
});

test("the sim imports nothing from outside itself", () => {
  // The mirror copies this folder and nothing else. An import that escaped it would resolve here and
  // fail on the server, which is a deploy-time failure for something the tests should have caught.
  for (const file of SIM_FILES) {
    for (const [, specifier] of code(file).matchAll(/from\s+"([^"]+)"/g)) {
      assert(
        specifier.startsWith("./") && !specifier.startsWith("./sim/"),
        `${file} imports ${specifier} from outside the sim layer`,
      );
    }
  }
});

test("nothing outside the sim is imported into it by mistake", () => {
  const simNames = new Set(SIM_FILES.map((file) => path.basename(file)));
  for (const file of SIM_FILES) {
    for (const [, specifier] of code(file).matchAll(/from\s+"\.\/([^"]+)"/g)) {
      assert(simNames.has(specifier), `${file} imports ./${specifier}, which is not a sim module`);
    }
  }
});

test("the online client is transport only and never decides a rule", () => {
  const source = code("scripts/online-client.js");
  assert(!/processNpcHits|addScore|updatePlaySession|updateNpcState/.test(source),
    "the socket client must not run gameplay");
});

test("no client-side code adjudicates an online match", () => {
  // The whole point of the server-authority pass. `game.js` may render a snapshot and predict
  // presentation between them, but it must not be the thing that decides a score or a winner.
  const source = code("game.js");
  assert(!/addOnlineMatchScore|finishOnlineMatchTurn|startOnlineMatchTurn/.test(source),
    "game.js must not run the online match state machine — the server owns it");
  assert(!/onlineLobby\.ownerId === onlineClient/.test(source),
    "online play must not branch on who owns the lobby; there is no host any more");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
