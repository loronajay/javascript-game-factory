// The architecture, enforced mechanically.
//
// This file is the reason the layering survives. Every rule the header comments
// claim is checked here as a fact about the source, so the next feature cannot
// quietly reach across a boundary and leave the comments lying.
//
// It also does the boring wiring check the unit tests cannot: that every module
// imports cleanly, and that every element id `elements.js` looks up is actually
// in `index.html`. Both are defects that otherwise cost a browser round-trip to
// find, and neither is worth finding that way twice.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, assertEqual, asyncTest, finish, suite, test } from "./harness.js";
import { ELEMENT_IDS, SELECTORS } from "../scripts/ui/elements.js";

suite("modules — layering, wiring and markup coherence");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(gameRoot, relative), "utf8");
const html = read("index.html");

/**
 * A file with its comments removed.
 *
 * Every layer check below has to run against this rather than the raw source,
 * because the header comments in this cabinet SAY the rule out loud — `sim/aim.js`
 * opens with "no THREE, no DOM" — and a check that scanned the raw text would
 * flag every file that documents the rule it obeys.
 *
 * The stripping is deliberately crude and can eat the tail of a string
 * containing `//`. That direction is safe: it can only hide a violation, never
 * invent one, and the one place a URL matters (the pinned THREE import) is
 * checked against the raw source instead.
 */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*/g, "$1");

/** Every .js under `scripts/`, as repo-relative paths. */
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

// ---------------------------------------------------------------------------
// The layer rules
// ---------------------------------------------------------------------------

const inLayer = (file, layer) => file.startsWith(`scripts/${layer}/`);

test("the sim never touches THREE, the DOM, or a clock", () => {
  // The load-bearing rule of the whole cabinet. It is what makes the physics and
  // the rules testable under node, and what would let a server mirror them.
  for (const file of FILES.filter((f) => inLayer(f, "sim"))) {
    const source = code(file);
    assert(!/\bTHREE\b/.test(source), `${file} references THREE`);
    assert(!/\bdocument\b|\bwindow\b/.test(source), `${file} touches the DOM`);
    assert(!/performance\.now|Date\.now|setTimeout|setInterval/.test(source), `${file} reads a clock`);
    assert(!/Math\.random/.test(source) || file.endsWith("cpu.js"), `${file} uses an ambient random source`);
  }
});

test("the sim imports nothing from outside the sim", () => {
  for (const file of FILES.filter((f) => inLayer(f, "sim"))) {
    for (const specifier of importsOf(code(file))) {
      assert(specifier.startsWith("./"), `${file} imports "${specifier}" from outside sim/`);
    }
  }
});

test("the match layer holds no DOM and no THREE", () => {
  for (const file of FILES.filter((f) => inLayer(f, "match"))) {
    const source = code(file);
    assert(!/\bTHREE\b/.test(source), `${file} references THREE`);
    assert(!/\bdocument\b|getElementById|classList/.test(source), `${file} touches the DOM`);
  }
});

test("only the render layer names THREE, and only init-game imports it", () => {
  for (const file of FILES) {
    const source = code(file);
    if (!/\bTHREE\b/.test(source)) continue;
    assert(inLayer(file, "render") || file === "scripts/init-game.js", `${file} references THREE outside render/`);
  }

  const importers = FILES.filter((file) => /three@/.test(read(file)));
  assertEqual(importers.join(","), "scripts/init-game.js", "the CDN URL must be pinned in exactly one place");
});

test("the render layer never reads the match or the rules", () => {
  // Views mirror state; they do not ask questions about it. The render layer may
  // read `sim/` for GEOMETRY — that is deliberate, and is what stops the meshes
  // and the collider from drifting apart — but never the match or the rules.
  for (const file of FILES.filter((f) => inLayer(f, "render"))) {
    for (const specifier of importsOf(code(file))) {
      assert(!specifier.includes("/match/"), `${file} imports from match/`);
      assert(!specifier.includes("rules.js"), `${file} imports the rules`);
      assert(!specifier.includes("/audio/"), `${file} imports the audio layer`);
    }
  }
});

test("only the audio adapters touch Web Audio or an <audio> element", () => {
  const adapters = new Set([
    "scripts/audio/audio-engine.js",
    "scripts/audio/music-player.js",
    "scripts/audio/ambience.js",
  ]);
  for (const file of FILES) {
    if (adapters.has(file)) continue;
    const source = code(file);
    assert(!/AudioContext|createGain|decodeAudioData/.test(source), `${file} touches Web Audio directly`);
    assert(!/new Audio\b|globalThis\.Audio/.test(source), `${file} creates an audio element directly`);
  }
});

test("only local-storage.js touches localStorage", () => {
  for (const file of FILES) {
    if (file === "scripts/store/local-storage.js") continue;
    assert(!/localStorage/.test(code(file)), `${file} touches localStorage directly`);
  }
});

test("the audio catalogs stay pure data", () => {
  for (const file of ["scripts/audio/sound-catalog.js", "scripts/audio/music-catalog.js"]) {
    const source = code(file);
    assert(!/fetch\(|AudioContext|new Audio/.test(source), `${file} is doing work, not describing sounds`);
  }
});

test("nothing imports the composition root", () => {
  // `init-game.js` is the top of the graph. Anything importing it has created a
  // cycle and, worse, a second place that knows how the cabinet is assembled.
  for (const file of FILES) {
    if (file === "scripts/init-game.js") continue;
    for (const specifier of importsOf(code(file))) {
      assert(!specifier.includes("init-game"), `${file} imports the composition root`);
    }
  }
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

for (const file of FILES) {
  await asyncTest(`${file} imports cleanly`, async () => {
    // The DOM-touching modules only reach for elements inside their factories,
    // which is exactly what makes importing them safe under node.
    await import(`../${file}`);
  });
}

test("every element id the code looks up exists in index.html", () => {
  for (const [key, id] of Object.entries(ELEMENT_IDS)) {
    assert(html.includes(`id="${id}"`), `elements.${key} looks up #${id}, which is not in index.html`);
  }
});

test("every class selector the code queries exists in the markup", () => {
  for (const [key, selector] of Object.entries(SELECTORS)) {
    const needle = selector.startsWith(".") ? `class="${selector.slice(1)}` : selector.slice(1, -1);
    assert(html.includes(needle) || html.includes(selector.slice(1)), `SELECTORS.${key} (${selector}) matches nothing`);
  }
});

test("index.html boots the cabinet through the composition root", () => {
  assert(html.includes('from "./scripts/init-game.js"'), "the page must boot through init-game.js");
  assert(html.includes('type="module"'), "the cabinet is ES modules; a classic script would not load it");
});

test("both stylesheets are linked", () => {
  assert(html.includes('href="styles/table.css"'));
  assert(html.includes('href="styles/menu.css"'));
});

test("the splash the menu is built around is on disk and referenced by the CSS", () => {
  assert(fs.existsSync(path.join(gameRoot, "assets/splashes/menu.png")), "the menu splash is missing");
  assert(read("styles/menu.css").includes("assets/splashes/menu.png"), "the front door does not use the splash");
});

test("there is exactly one page", () => {
  // Mini Hoops learned this the hard way: a second document destroys the <audio>
  // element streaming the soundtrack and the room tone, and the music restarts
  // from silence on every visit. Every screen here is a layer, not a page.
  // `reference/` is excluded because it is not part of the cabinet: it holds the
  // original single-file demo this build was extracted from, kept for archaeology
  // and never served.
  const pages = fs.readdirSync(gameRoot).filter((name) => name.endsWith(".html"));
  assertEqual(pages.join(","), "index.html", "a second page would kill the soundtrack on every navigation");
});

/** Every module specifier in a source file. */
function importsOf(source) {
  return [...source.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+["']([^"']+)["']/g)].map((match) => match[1]);
}

finish();
