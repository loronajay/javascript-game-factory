import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, asyncTest, assert, assertEqual, finish } from "./harness.js";

import {
  SCREENS,
  SCREEN_BOARDS,
  SCREEN_GAME,
  SCREEN_HOWTO,
  SCREEN_MENU,
  SCREEN_SETUP,
  backTarget,
  isScreen,
  normalizeScreen,
} from "../scripts/ui/screens.js";

// Smoke coverage for the layers the unit tests deliberately do not reach.
// Rendering itself is not tested (repo rule), but a broken import path or an
// element id that exists in one file and not the other is a real defect that
// otherwise costs a manual browser round-trip to find.

suite("modules — wiring and markup coherence");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");

// ---------------------------------------------------------------------------
// Every module imports cleanly
// ---------------------------------------------------------------------------

/**
 * Modules with no DOM dependency at import time. The `ui/` and `render/` modules
 * only touch the DOM inside their factories, so importing them is safe too —
 * which is the point of keeping the factories lazy.
 */
const MODULES = [
  "scripts/sim/constants.js",
  "scripts/sim/projection.js",
  "scripts/sim/hoop.js",
  "scripts/sim/pull.js",
  "scripts/sim/launch.js",
  "scripts/sim/collision.js",
  "scripts/sim/physics.js",
  "scripts/sim/shot.js",
  "scripts/sim/run.js",
  "scripts/assets/ball-catalog.js",
  "scripts/assets/location-catalog.js",
  "scripts/assets/loader.js",
  "scripts/store/boards.js",
  "scripts/store/boards-store.js",
  "scripts/store/local-storage.js",
  "scripts/store/preferences.js",
  "scripts/render/scene.js",
  "scripts/render/hoop.js",
  "scripts/render/ball.js",
  "scripts/render/aim.js",
  "scripts/render/frame.js",
  "scripts/ui/screens.js",
  "scripts/ui/pointer.js",
  "scripts/ui/hud.js",
  "scripts/ui/overlays.js",
  "scripts/ui/setup-view.js",
  "scripts/ui/boards-view.js",
  "scripts/ui/menu-view.js",
  "scripts/init-game.js",
];

await asyncTest("every module resolves and imports without side effects", async () => {
  for (const relative of MODULES) {
    const full = path.join(gameRoot, relative);
    assert(fs.existsSync(full), `missing module ${relative}`);
    await import(new URL(`file://${full.replace(/\\/g, "/")}`).href);
  }
});

// ---------------------------------------------------------------------------
// Layering
// ---------------------------------------------------------------------------

test("the sim layer never imports the DOM, the stores, or the renderers", () => {
  // The sim is the part that has to stay pure and testable. If it ever reaches
  // sideways into a store or a view, every physics test becomes a browser test.
  const simDir = path.join(gameRoot, "scripts", "sim");
  for (const name of fs.readdirSync(simDir)) {
    const code = stripComments(fs.readFileSync(path.join(simDir, name), "utf8"));
    for (const forbidden of ["../store/", "../ui/", "../render/", "document.", "window."]) {
      assert(!code.includes(forbidden), `scripts/sim/${name} reaches for ${forbidden}`);
    }
  }
});

test("the render layer draws and nothing else — it never writes game state", () => {
  const renderDir = path.join(gameRoot, "scripts", "render");
  for (const name of fs.readdirSync(renderDir)) {
    const code = stripComments(fs.readFileSync(path.join(renderDir, name), "utf8"));
    for (const forbidden of ["../store/", "localStorage"]) {
      assert(!code.includes(forbidden), `scripts/render/${name} reaches for ${forbidden}`);
    }
  }
});

test("only the storage adapter touches localStorage", () => {
  const offenders = [];
  walk(path.join(gameRoot, "scripts"), (file) => {
    if (file.endsWith(path.join("store", "local-storage.js"))) return;
    if (stripComments(fs.readFileSync(file, "utf8")).includes("localStorage")) {
      offenders.push(path.relative(gameRoot, file));
    }
  });
  assertEqual(offenders.join(", "), "", "storage access must stay behind one adapter");
});

/**
 * Drop comments before scanning for forbidden references.
 *
 * Without this the layering checks match English: `sim/pull.js` explains a "loft
 * window." in prose and gets accused of reaching for `window.`. The checks are
 * about what the code does, so they have to read the code.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ---------------------------------------------------------------------------
// Markup coherence
// ---------------------------------------------------------------------------

test("every element id the scripts query actually exists in the markup", () => {
  const ids = new Set();
  walk(path.join(gameRoot, "scripts"), (file) => {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/querySelector\(\s*["'`]#([A-Za-z0-9_-]+)["'`]\s*\)/g)) {
      ids.add(match[1]);
    }
  });

  assert(ids.size > 10, "the scan found suspiciously few ids");
  const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
  assertEqual(missing.join(", "), "", "ids queried by script but absent from index.html");
});

test("every screen the router knows about has a section in the markup", () => {
  for (const screen of SCREENS) {
    const id = { menu: "menuScreen", setup: "setupScreen", game: "gameScreen", boards: "boardsScreen", howto: "howToScreen" }[screen];
    assert(html.includes(`id="${id}"`), `no section for the ${screen} screen`);
  }
});

test("every button intent in the markup is handled by the composition root", () => {
  // The delegated-intent pattern is easy to extend and just as easy to leave a
  // dead button behind in. This is the check that keeps it honest.
  const source = fs.readFileSync(path.join(gameRoot, "scripts", "init-game.js"), "utf8");
  const intents = new Set([...html.matchAll(/data-intent="([a-z-]+)"/g)].map((match) => match[1]));
  assert(intents.size > 4, "the scan found suspiciously few intents");
  const unhandled = [...intents].filter((intent) => !source.includes(`case "${intent}"`));
  assertEqual(unhandled.join(", "), "", "buttons in the markup that do nothing");
});

test("every menu command in the markup is handled", () => {
  const source = fs.readFileSync(path.join(gameRoot, "scripts", "init-game.js"), "utf8");
  const commands = new Set([...html.matchAll(/data-command="([a-z-]+)"/g)].map((match) => match[1]));
  assertEqual(commands.size, 3, "the menu has three options");
  for (const command of commands) {
    assert(source.includes(`"${command}"`), `menu command "${command}" is not handled`);
  }
});

test("the stylesheets the markup links actually exist", () => {
  for (const match of html.matchAll(/href="(styles\/[^"]+)"/g)) {
    assert(fs.existsSync(path.join(gameRoot, match[1])), `missing stylesheet ${match[1]}`);
  }
});

test("every class the scripts toggle is defined in a stylesheet", () => {
  const css = fs
    .readdirSync(path.join(gameRoot, "styles"))
    .map((name) => fs.readFileSync(path.join(gameRoot, "styles", name), "utf8"))
    .join("\n");

  // The state classes are the ones that silently do nothing if they are missing.
  for (const className of ["is-active", "is-shown", "is-hidden", "is-playing", "is-leader"]) {
    assert(css.includes(`.${className}`), `.${className} is toggled by script but never styled`);
  }
});

// ---------------------------------------------------------------------------
// Screen routing
// ---------------------------------------------------------------------------

test("the router recognises exactly the screens it declares", () => {
  for (const screen of [SCREEN_MENU, SCREEN_SETUP, SCREEN_GAME, SCREEN_BOARDS, SCREEN_HOWTO]) {
    assert(isScreen(screen), `${screen} should be a screen`);
  }
  assert(!isScreen("pause"), "the pause overlay is not a screen");
});

test("an unknown screen normalizes to the menu rather than blanking the cabinet", () => {
  assertEqual(normalizeScreen("nonsense"), SCREEN_MENU);
  assertEqual(normalizeScreen(undefined), SCREEN_MENU);
});

test("back always leads to the menu, including out of a run", () => {
  for (const screen of SCREENS) {
    assertEqual(backTarget(screen), SCREEN_MENU, `${screen} back target`);
  }
});

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else if (entry.name.endsWith(".js")) visit(full);
  }
}

finish();
