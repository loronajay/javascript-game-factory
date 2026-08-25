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
  "scripts/assets/room-geometry.js",
  "scripts/assets/loader.js",
  "scripts/effects/splat-field.js",
  "scripts/audio/sound-catalog.js",
  "scripts/audio/music-catalog.js",
  "scripts/audio/playlist.js",
  "scripts/audio/audio-engine.js",
  "scripts/audio/music-player.js",
  "scripts/audio/game-audio.js",
  "scripts/store/boards.js",
  "scripts/store/boards-store.js",
  "scripts/store/local-storage.js",
  "scripts/store/preferences.js",
  "scripts/render/scene.js",
  "scripts/render/hoop.js",
  "scripts/render/ball.js",
  "scripts/render/aim.js",
  "scripts/render/frame.js",
  "scripts/render/splats.js",
  "scripts/ui/screens.js",
  "scripts/ui/pointer.js",
  "scripts/ui/hud.js",
  "scripts/ui/overlays.js",
  "scripts/ui/setup-view.js",
  "scripts/ui/boards-view.js",
  "scripts/ui/menu-view.js",
  "scripts/ui/practice-view.js",
  "scripts/ui/sound-toggle.js",
  "scripts/practice-court.js",
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
    // The room's own measurements are presentation. A sim that read them would
    // make the shot depend on which backdrop is loaded, and one leaderboard
    // would stop meaning one thing — see `assets/room-geometry.js`.
    assert(!code.includes("room-geometry"), `scripts/sim/${name} reads a room's geometry`);
  }
});

test("the effects layer holds state but stays as pure as the sim", () => {
  // `effects/` is the one layer that is neither: it holds positions and
  // lifetimes that have to be advanced on the tick clock, which `render/` may
  // not do, but nothing in it can change a score, which is why it is not in
  // `sim/`. It earns that place by being as testable as the sim is — so it may
  // not reach for a store, a view, a canvas or the DOM either.
  const effectsDir = path.join(gameRoot, "scripts", "effects");
  for (const name of fs.readdirSync(effectsDir)) {
    const code = stripComments(fs.readFileSync(path.join(effectsDir, name), "utf8"));
    for (const forbidden of ["../store/", "../ui/", "../render/", "document.", "window.", "getContext"]) {
      assert(!code.includes(forbidden), `scripts/effects/${name} reaches for ${forbidden}`);
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

test("only the audio engine touches the Web Audio API", () => {
  // Same rule as localStorage below, for the same reason. Autoplay policy,
  // decoding and gain nodes are a browser concern, and one adapter is what keeps
  // `sound-catalog.js` testable under node and `game-audio.js` about meaning.
  const offenders = [];
  walk(path.join(gameRoot, "scripts"), (file) => {
    if (file.endsWith(path.join("audio", "audio-engine.js"))) return;
    const code = stripComments(fs.readFileSync(file, "utf8"));
    if (/AudioContext|decodeAudioData|createBufferSource/.test(code)) {
      offenders.push(path.relative(gameRoot, file));
    }
  });
  assertEqual(offenders.join(", "), "", "Web Audio access must stay behind one adapter");
});

test("only the music player streams through an <audio> element", () => {
  // The soundtrack is the one thing in the cabinet that is streamed rather than
  // decoded, and that difference is the whole reason it has its own adapter. If
  // an element gets constructed anywhere else, the split has already leaked.
  const offenders = [];
  walk(path.join(gameRoot, "scripts"), (file) => {
    if (file.endsWith(path.join("audio", "music-player.js"))) return;
    const code = stripComments(fs.readFileSync(file, "utf8"));
    if (/new Audio\(|globalThis\.Audio(?![A-Za-z])|HTMLAudioElement/.test(code)) {
      offenders.push(path.relative(gameRoot, file));
    }
  });
  assertEqual(offenders.join(", "), "", "music playback must stay behind one adapter");
});

test("the music catalog and the playlist stay pure — no element, no DOM", () => {
  // Same rule the sound catalog lives by: the ordering rules are only cheap to
  // test while nothing in them needs a browser to run.
  for (const name of ["music-catalog.js", "playlist.js"]) {
    const code = stripComments(fs.readFileSync(path.join(gameRoot, "scripts", "audio", name), "utf8"));
    for (const forbidden of ["music-player", "Audio(", "fetch(", "document.", "window."]) {
      assert(!code.includes(forbidden), `${name} reaches for ${forbidden}`);
    }
  }
});

test("the sound catalog stays pure data — no engine, no DOM", () => {
  // It is the half of the audio layer that can be tested, and it only stays
  // that way while it refuses to touch anything that needs a browser.
  const code = stripComments(fs.readFileSync(path.join(gameRoot, "scripts", "audio", "sound-catalog.js"), "utf8"));
  for (const forbidden of ["audio-engine", "AudioContext", "fetch(", "document.", "window."]) {
    assert(!code.includes(forbidden), `sound-catalog.js reaches for ${forbidden}`);
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
