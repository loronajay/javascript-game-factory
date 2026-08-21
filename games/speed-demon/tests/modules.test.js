import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";

// Smoke coverage for the layers the unit tests deliberately do not reach.
// Rendering itself is not tested (repo rule), but a broken import path or a
// dashboard element positioned off-canvas is a real defect that costs a manual
// browser round-trip to find, so it is caught here instead.

suite("modules — wiring and layout coherence");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, "..");

const MODULES = [
  "scripts/sim/constants.js",
  "scripts/sim/gate.js",
  "scripts/sim/engine.js",
  "scripts/sim/grading.js",
  "scripts/sim/launch.js",
  "scripts/sim/match.js",
  "scripts/sim/modes.js",
  "scripts/sim/race.js",
  "scripts/sim/input-log.js",
  "scripts/audio.js",
  "scripts/online/session.js",
  "scripts/online/opponent.js",
  "scripts/online/net.js",
  "scripts/radio/tracks.js",
  "scripts/radio/playlist.js",
  "scripts/radio/library-status.js",
  "scripts/radio/library.js",
  "scripts/radio/stereo.js",
  "scripts/radio/preferences.js",
  "scripts/garage/livery.js",
  "scripts/garage/paint.js",
  "scripts/garage/garage.js",
  "scripts/records/records.js",
  "scripts/assets/car-atlas.js",
  "scripts/render/livery.js",
  "scripts/ui/shifter-gate.js",
  "scripts/ui/radio-panel.js",
  "scripts/ui/track-layout.js",
  "scripts/ui/gauges.js",
  "scripts/ui/circuit-hud.js",
  "scripts/ui/setup-menu.js",
  "scripts/ui/collection.js",
  "scripts/ui/boards.js",
  "scripts/ui/garage-editor.js",
  "scripts/ui/shell.js",
  "scripts/ui/coach.js",
  "scripts/ui/text-entry.js",
  "scripts/ui/online-menu.js",
  "scripts/render/scene.js",
  "scripts/render/car.js",
  "scripts/render/setup.js",
  "scripts/render/collection.js",
  "scripts/render/boards.js",
  "scripts/render/garage.js",
  "scripts/render/dashboard.js",
  "scripts/render/shifter.js",
  "scripts/render/overlay.js",
  "scripts/render/coach.js",
  "scripts/render/menus.js",
  "scripts/render/radio.js",
  "scripts/render/online.js",
  "scripts/input.js",
  "scripts/pointer.js",
  "scripts/rival/cpu-driver.js",
  "scripts/rival/rivals.js",
  "scripts/rival/ghost.js",
  "scripts/rival/lineup.js",
  "scripts/campaign/contacts.js",
  "scripts/campaign/events.js",
  "scripts/campaign/map.js",
  "scripts/campaign/progress.js",
  "scripts/ui/campaign.js",
  "scripts/render/campaign.js",
  "scripts/profile/avatars.js",
  "scripts/profile/profile.js",
  "scripts/ui/profile.js",
  "scripts/render/profile.js",
  "scripts/ui/versus.js",
  "scripts/render/versus.js",
  "scripts/init-game.js",
];

const loaded = {};

for (const relative of MODULES) {
  test(`${relative} imports cleanly`, async () => {
    const module = await import(`../${relative}`);
    loaded[relative] = module;
    assert(module, `${relative} produced no module namespace`);
  });
}

// The imports above are async; everything below runs after they settle.
await Promise.all(MODULES.map((relative) => import(`../${relative}`).then((m) => (loaded[relative] = m))));

test("the composition root exports a boot function", () => {
  assertEqual(typeof loaded["scripts/init-game.js"].boot, "function");
});

test("the sim never reaches up into the ui or the renderers", () => {
  // The boundary that keeps the tests fast, the logic deterministic, and online
  // multiplayer viable. A sim module may only import from its own folder.
  for (const relative of MODULES.filter((m) => m.startsWith("scripts/sim/"))) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    for (const [, specifier] of source.matchAll(/from\s+"([^"]+)"/g)) {
      assert(
        specifier.startsWith("./"),
        `${relative} imports ${specifier} — sim must not depend on anything outside sim/`,
      );
    }
  }
});

test("no module reaches for the DOM at import time", () => {
  // Getting here at all proves it: Node has no window or document, so a
  // top-level DOM reference would have thrown during import.
  assertEqual(typeof globalThis.document, "undefined");
});

test("the road meets the dashboard with no gap", () => {
  const scene = loaded["scripts/render/scene.js"];
  assertEqual(scene.ROAD_BOTTOM, scene.DASH_TOP, "a seam here would show as a strip of bare canvas");
});

test("the road scale is shared by everything that measures in metres", () => {
  const scene = loaded["scripts/render/scene.js"];
  const layout = loaded["scripts/ui/track-layout.js"];
  assertEqual(scene.PIXELS_PER_METRE, layout.screenPixelsPerMetre(scene.WORLD.width));
  assert(scene.PIXELS_PER_METRE > 0);
});

test("every car in the roster sits on the road, clear of the instrument cluster", () => {
  const scene = loaded["scripts/render/scene.js"];
  const car = loaded["scripts/render/car.js"];
  const atlas = loaded["scripts/assets/car-atlas.js"];
  // Sized by lane width, so a longer-proportioned frame draws a taller car. The
  // roster's tallest is the one that decides whether the sprite still fits.
  for (const frame of atlas.allModels()) {
    const box = car.carBox(frame);
    assert(box.top > 0, `${frame.id} runs off the top of the road`);
    assert(box.top + box.height < scene.ROAD_BOTTOM, `${frame.id} overlaps the dashboard`);
  }
});

test("the car's drawn proportions come from its frame, not from a fixed square", () => {
  const car = loaded["scripts/render/car.js"];
  const box = car.carBox({ sx: 0, sy: 0, sw: 100, sh: 200 });
  assertEqual(Math.round(box.height / box.width), 2, "a 1:2 frame should draw 1:2");
});

test("a missing frame still yields a box, so the fallback block can be drawn", () => {
  const car = loaded["scripts/render/car.js"];
  const box = car.carBox(null);
  assert(box.width > 0 && box.height > 0, "a null frame must not produce a zero-size box");
});

test("the tail-light glow sits on the tail lights of whatever frame is drawn", () => {
  const car = loaded["scripts/render/car.js"];
  const atlas = loaded["scripts/assets/car-atlas.js"];
  // The lamp pixels were measured at 0.77-0.83 down every frame on the sheets.
  // Anchoring off the drawn height rather than the drawn width is what keeps
  // the glow there when a frame's proportions change.
  for (const frame of atlas.allModels()) {
    const box = car.carBox(frame);
    const anchor = car.tailLightAnchor(frame);
    const fraction = (anchor.y - box.top) / box.height;
    assert(fraction > 0.77 && fraction < 0.83, `${frame.id} glows at ${fraction.toFixed(3)} of its body`);
  }
});

test("the tail-light glow follows the body when the car squats", () => {
  const car = loaded["scripts/render/car.js"];
  const frame = { sx: 0, sy: 0, sw: 120, sh: 170 };
  const level = car.tailLightAnchor(frame, { attitude: 0 });
  const squatting = car.tailLightAnchor(frame, { attitude: 1 });
  assert(squatting.y > level.y, "the glow stayed put while the body moved");
});

test("the car fits inside its lane", () => {
  const car = loaded["scripts/render/car.js"];
  const layout = loaded["scripts/ui/track-layout.js"];
  const scene = loaded["scripts/render/scene.js"];
  const laneWidthPx = layout.ROAD.laneWidth * layout.trackScale(scene.WORLD.width);
  assert(car.carWidth() < laneWidthPx, "the car is wider than its lane");
  assert(car.carWidth() > laneWidthPx * 0.5, "the car is lost in its lane");
});

test("the pulled-back race camera keeps the car visually compact", () => {
  const car = loaded["scripts/render/car.js"];
  assert(car.carWidth() <= 126, `the race car is still ${car.carWidth().toFixed(1)}px wide`);
});

test("the player's lane is on tarmac, between the painted road edges", () => {
  const scene = loaded["scripts/render/scene.js"];
  const layout = loaded["scripts/ui/track-layout.js"];
  const width = scene.WORLD.width;
  const x = layout.laneScreenX(width, 1);
  assert(x > layout.sourceScreenX(width, layout.ROAD.roadEdges.left), "the car is on the left shoulder");
  assert(x < layout.sourceScreenX(width, layout.ROAD.roadEdges.right), "the car is on the right shoulder");
});

test("the visible track slice is drawn at the full width of the frame", () => {
  const scene = loaded["scripts/render/scene.js"];
  const layout = loaded["scripts/ui/track-layout.js"];
  assertEqual(layout.trackScale(scene.WORLD.width) * layout.ROAD.view.sw, scene.WORLD.width);
});

test("both road edges stay on screen after the view crop", () => {
  const scene = loaded["scripts/render/scene.js"];
  const layout = loaded["scripts/ui/track-layout.js"];
  const width = scene.WORLD.width;
  const left = layout.sourceScreenX(width, layout.ROAD.roadEdges.left);
  const right = layout.sourceScreenX(width, layout.ROAD.roadEdges.right);
  assert(left > 0 && left < width, `left road edge at ${left} is off screen`);
  assert(right > 0 && right < width, `right road edge at ${right} is off screen`);
});

test("every dashboard element sits inside the dash panel", () => {
  const scene = loaded["scripts/render/scene.js"];
  const dash = loaded["scripts/render/dashboard.js"];

  for (const [name, dial] of [
    ["tachometer", dash.TACH],
    ["speedometer", dash.SPEEDO],
  ]) {
    assert(dial.cy - dial.radius - 8 >= scene.DASH_TOP, `${name} overlaps the road`);
    assert(dial.cy + dial.radius + 8 <= scene.WORLD.height, `${name} runs off the bottom`);
    assert(dial.cx - dial.radius - 8 >= 0, `${name} runs off the left edge`);
  }

  const box = dash.SHIFTER_BOX;
  assert(box.y >= scene.DASH_TOP, "the shifter overlaps the road");
  assert(box.y + box.height <= scene.WORLD.height, "the shifter runs off the bottom");
  assert(box.x + box.width <= scene.WORLD.width, "the shifter runs off the right edge");
});

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Every panel the setup screen draws, for the mode given, as named rects. */
function setupRects(modeId) {
  const setup = loaded["scripts/render/setup.js"];
  const menu = loaded["scripts/ui/setup-menu.js"];
  const garageModule = loaded["scripts/garage/garage.js"];
  // A ghost makes the rival strip its longest, exactly as a full garage makes
  // the config list its longest — the sweep wants the worst case, not the
  // opening one.
  const setupState = menu.createSetup({ modeId });
  const ghost = {
    boardId: menu.setupBoardId(setupState),
    value: 12000,
    modelId: "toro-sv",
    events: [{ t: 0, k: "s", v: 0 }],
  };
  const view = menu.setupView(setupState, undefined, { ghost });

  const rects = [];
  for (const group of view.groups) {
    for (const cell of group.cells) {
      rects.push({ what: `car ${cell.id}`, ...setup.modelCellRect(cell.row, cell.column) });
    }
  }
  // The config list grows with what the player has saved, so the sweep uses a
  // full one — Factory plus the per-model cap — rather than the empty default.
  for (let index = 0; index < 1 + garageModule.MAX_PRESETS_PER_MODEL; index += 1) {
    rects.push({ what: `preset ${index}`, ...setup.presetRowRect(index) });
  }
  for (const track of view.tracks) {
    rects.push({ what: `track ${track.id}`, ...setup.trackCardRect(track.index) });
  }
  for (const option of view.objective.options) {
    rects.push({ what: `objective ${option.id}`, ...setup.objectiveCardRect(option.index) });
  }
  for (const entry of view.rivals ?? []) {
    rects.push({ what: `rival ${entry.id}`, ...setup.rivalCardRect(entry.index) });
  }
  rects.push({ what: "preview", ...setup.SETUP_LAYOUT.preview });
  rects.push({ what: "summary", ...setup.SETUP_LAYOUT.summary });
  rects.push({ what: "start", ...setup.startButtonRect() });
  return rects;
}

test("every setup panel fits on screen and nothing collides, in every mode", () => {
  // The objective strip's width depends on the mode, so the mode with the most
  // options is the one that decides whether the layout still fits.
  const scene = loaded["scripts/render/scene.js"];
  for (const mode of loaded["scripts/sim/modes.js"].MODES) {
    const rects = setupRects(mode.id);
    for (const r of rects) {
      assert(r.x >= 0 && r.y >= 0, `${mode.id}: ${r.what} starts off screen`);
      assert(r.x + r.width <= scene.WORLD.width, `${mode.id}: ${r.what} runs off the right edge`);
      assert(r.y + r.height <= scene.WORLD.height, `${mode.id}: ${r.what} runs off the bottom`);
    }
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        assert(!overlaps(rects[i], rects[j]), `${mode.id}: ${rects[i].what} overlaps ${rects[j].what}`);
      }
    }
  }
});

test("the setup hint line sits below everything it explains", () => {
  const scene = loaded["scripts/render/scene.js"];
  const lowest = Math.max(...setupRects("distance").map((r) => r.y + r.height));
  assert(lowest < scene.WORLD.height - 16, "there is no room left under the panels for the hint line");
});

test("each setup pane has room for its heading above it", () => {
  // Headings are drawn 13px above their pane; a pane starting too high would
  // print its label off the top of the canvas or into the panel above.
  const setup = loaded["scripts/render/setup.js"];
  const { grid, presets, tracks, objective, rivals, title, mode } = setup.SETUP_LAYOUT;
  assert(grid.y - 13 > mode.y, "the CAR heading collides with the mode badge");
  assert(mode.y > title.y, "the mode badge collides with the wordmark");
  for (const [name, pane] of [["presets", presets], ["tracks", tracks], ["objective", objective], ["rivals", rivals]]) {
    assert(pane.y - 13 > 0, `the ${name} heading is off the top of the screen`);
  }
});

test("every menu surface fits inside the frame", () => {
  const scene = loaded["scripts/render/scene.js"];
  const menus = loaded["scripts/render/menus.js"];
  for (const [name, box] of [["pause", menus.MENU_LAYOUT.pause], ["results", menus.MENU_LAYOUT.results], ["detail", menus.MENU_LAYOUT.detail]]) {
    assert(box.x >= 0 && box.y >= 0, `${name} starts off screen`);
    assert(box.x + box.width <= scene.WORLD.width, `${name} runs off the right edge`);
    assert(box.y + box.height <= scene.WORLD.height, `${name} runs off the bottom`);
  }
});

test("the pause menu's items fit inside the panel drawn around them", () => {
  // The panel has to clear DASH_TOP, so it cannot simply grow when an item is
  // added — which is exactly what happened when RADIO joined the list.
  const menus = loaded["scripts/render/menus.js"];
  const shell = loaded["scripts/ui/shell.js"];
  const box = menus.MENU_LAYOUT.pause;
  const items = shell.menuFor(shell.enterScreen(shell.createShell(), shell.SCREEN_PAUSED)).items;
  const list = { x: box.x + 30, y: box.y + 104, width: box.width - 60, itemHeight: 40, gap: 6 };
  const bottom = list.y + menus.menuListHeight(items.length, list);
  assert(bottom <= box.y + box.height, `the pause list ends at ${bottom}, past the panel at ${box.y + box.height}`);
});

test("the title menu sits below the splash's cars and above its control legend", () => {
  const scene = loaded["scripts/render/scene.js"];
  const menus = loaded["scripts/render/menus.js"];
  const shell = loaded["scripts/ui/shell.js"];
  const { list, controls, wordmark } = menus.MENU_LAYOUT.title;
  const items = shell.menuFor(shell.createShell()).items;
  const bottom = list.y + menus.menuListHeight(items.length, list);
  // The splash is composed around an empty centre; type belongs top and bottom.
  assert(list.y > wordmark.y + 200, "the title menu is drawn over the middle of the splash");
  assert(bottom < controls.y - 8, `the title menu ends at ${bottom} and runs into the controls at ${controls.y}`);
  assert(controls.y + 22 < scene.WORLD.height, "the controls legend is off the bottom");
  assert(list.x >= 0 && list.x + list.width <= scene.WORLD.width, "the title menu is off screen");
});

test("every coaching step fits the surface it is drawn on", () => {
  // The strip is fixed-height and the words live in another module, so a step
  // with one line too many would silently print onto the instrument cluster.
  // This is the check that caught exactly that.
  const scene = loaded["scripts/render/scene.js"];
  const coachRender = loaded["scripts/render/coach.js"];
  const coach = loaded["scripts/ui/coach.js"];
  const { strip, stripText, panel, panelText } = coachRender.COACH_LAYOUT;
  const race = { car: { optimalShiftRpm: 6850 }, lastShift: { grade: "perfect", catch: { grade: "clean" } } };

  for (const [name, box, metrics] of [["strip", strip, stripText], ["panel", panel, panelText]]) {
    const lastLine = metrics.firstLine + (metrics.maxLines - 1) * metrics.lineHeight;
    assert(box.y + lastLine + 8 <= box.y + box.height, `the ${name}'s last line runs off its own panel`);
    assert(box.y + box.height <= scene.DASH_TOP, `the ${name} overlaps the dashboard`);
    assert(box.x >= 0 && box.x + box.width <= scene.WORLD.width, `the ${name} is off screen`);
  }

  for (let index = 0; index < coach.COACH_STEP_COUNT; index += 1) {
    const view = coach.coachView({ index }, race);
    const metrics = view.holding ? panelText : stripText;
    assert(
      view.lines.length <= metrics.maxLines,
      `coaching step "${view.id}" has ${view.lines.length} lines and only ${metrics.maxLines} fit`,
    );
  }
});

test("the modal menus stay clear of the instrument cluster they sit over", () => {
  // Pause and results are drawn over a live race, and `dimWorld` only dims the
  // road; a panel reaching into the lit dashboard would look like a mistake.
  const scene = loaded["scripts/render/scene.js"];
  const menus = loaded["scripts/render/menus.js"];
  for (const [name, box] of [["pause", menus.MENU_LAYOUT.pause], ["results", menus.MENU_LAYOUT.results]]) {
    assert(box.y + box.height <= scene.DASH_TOP, `${name} overlaps the dashboard`);
  }
});

test("the transport rules never reach for a browser", () => {
  // `playlist.js` and `tracks.js` are the radio's pure half — the whole point of
  // the split is that the rules can be exercised without a folder to point at.
  // `library.js` is the one module allowed to know the file system exists.
  const forbidden = [/\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /\bindexedDB\b/, /createObjectURL/, /new Audio/];
  for (const relative of ["scripts/radio/playlist.js", "scripts/radio/tracks.js"]) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    for (const pattern of forbidden) {
      assert(!pattern.test(source), `${relative} reaches for ${pattern}`);
    }
  }
});

test("the garage's rules never reach for a browser", () => {
  // Same split as the radio, and for the same reason. `livery.js`, `paint.js`
  // and `garage.js` are the half that decides what a car looks like and what a
  // saved config is; `garage-store.js` is the one module allowed to know that
  // storage and a server exist. Keeping paint.js in particular pure is what lets
  // the tint rules be tested against measured pixel values without a canvas.
  // Matched as *usage* rather than as bare words: these files legitimately
  // discuss a car's rear window and name the storage layer in prose, and a
  // purity check that fires on a comment teaches people to weaken the check.
  const forbidden = [
    /\bdocument\s*\./,
    /\bwindow\s*\./,
    /\blocalStorage\s*\./,
    /\bindexedDB\s*\./,
    /\bfetch\s*\(/,
  ];
  for (const relative of [
    "scripts/garage/livery.js",
    "scripts/garage/paint.js",
    "scripts/garage/garage.js",
  ]) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    for (const pattern of forbidden) {
      assert(!pattern.test(source), `${relative} reaches for ${pattern}`);
    }
  }
});

test("the records' rules never reach for a browser", () => {
  // The fourth instance of the same split. `records.js` decides what a board is
  // and what beats what; `records-store.js` is the one module allowed to know a
  // server and localStorage exist. Keeping the comparison pure is what lets both
  // board directions be tested without a network — and the direction is the part
  // that would silently invert a time-attack board if it went wrong.
  const forbidden = [
    /\bdocument\s*\./,
    /\bwindow\s*\./,
    /\blocalStorage\s*\./,
    /\bindexedDB\s*\./,
    /\bfetch\s*\(/,
  ];
  const source = fs.readFileSync(path.join(gameRoot, "scripts/records/records.js"), "utf8");
  for (const pattern of forbidden) {
    assert(!pattern.test(source), `records.js reaches for ${pattern}`);
  }
  assert(
    !/from\s+"[^"]*records-store\.js"/.test(source),
    "records.js imports the storage layer",
  );
});

test("the rivals' rules never reach for a browser", () => {
  // The fifth instance of the same split, after the radio, the garage, online
  // and the records. `cpu-driver.js` in particular has to stay reachable without
  // one: a difficulty tier is asserted by generating sixty runs and reading
  // their finishing times, which is only cheap because nothing here has to boot.
  const forbidden = [
    /\bdocument\s*\./,
    /\bwindow\s*\./,
    /\blocalStorage\s*\./,
    /\bindexedDB\s*\./,
    /\bfetch\s*\(/,
  ];
  for (const relative of [
    "scripts/rival/cpu-driver.js",
    "scripts/rival/rivals.js",
    "scripts/rival/ghost.js",
    "scripts/rival/lineup.js",
  ]) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    for (const pattern of forbidden) {
      assert(!pattern.test(source), `${relative} reaches for ${pattern}`);
    }
    assert(!/from\s+"[^"]*ghost-store\.js"/.test(source), `${relative} imports the storage layer`);
  }
});

test("the CPU driver is the only place in the cabinet that rolls a die", () => {
  // `sim/` contains no randomness at all, which is what makes a run reproducible
  // from its log — and the whole leaderboard rests on that. A rival needs jitter
  // to read as a person rather than a metronome, so it seeds its own generator
  // out here. `Math.random` anywhere under `sim/` would quietly make a stored
  // input log replay to a different time on the server than it did in the
  // browser, which is a leaderboard that rejects honest runs.
  for (const relative of MODULES.filter((m) => m.startsWith("scripts/sim/"))) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    assert(!/Math\.random/.test(source), `${relative} uses Math.random — the sim must stay deterministic`);
  }
  const driver = fs.readFileSync(path.join(gameRoot, "scripts/rival/cpu-driver.js"), "utf8");
  assert(!/Math\.random/.test(driver), "even the CPU driver must be seeded, or a rival cannot be tested");
});

test("the leaderboard screen decides nothing about fetching", () => {
  // `ui/boards.js` is the cursor and the view, and it is pure for the same
  // reason every other `ui/` module is: the tab rules and the scroll window are
  // testable without a browser. Only `records-store.js` may ask for a board.
  const forbidden = [/document\s*\./, /window\s*\./, /localStorage\s*\./, /fetch\s*\(/];
  const source = fs.readFileSync(path.join(gameRoot, "scripts/ui/boards.js"), "utf8");
  for (const pattern of forbidden) {
    assert(!pattern.test(source), `ui/boards.js reaches for ${pattern}`);
  }
  assert(
    !/from\s+"[^"]*records-store\.js"/.test(source),
    "ui/boards.js imports the storage layer",
  );
});

test("the leaderboard screen and the board registry are one list", () => {
  // The ids the screen offers and the ids a finished run files against are the
  // same derivation from the mode catalog. Anything else is a board a player can
  // look at but never set a time on.
  const boards = loaded["scripts/ui/boards.js"];
  const records = loaded["scripts/records/records.js"];
  for (const board of boards.allBoards()) {
    assertEqual(records.boardIdFor(board.modeId, board.objectiveId), board.id, `${board.id} is unreachable`);
  }
});

test("the debug handle can move on every screen that owns a cursor", () => {
  // `move()` on the debug handle is a *second* dispatch beside the one the key
  // takes, and it silently falls through to `moveShell` for a screen it does not
  // name — which moves a menu cursor that screen does not have, so the screen
  // looks frozen from automation while working fine under a real keyboard. That
  // happened; this is the check that would have caught it.
  const shell = loaded["scripts/ui/shell.js"];
  const source = fs.readFileSync(path.join(gameRoot, "scripts/init-game.js"), "utf8");
  const body = source.slice(source.indexOf("    move(direction) {"));
  const block = body.slice(0, body.indexOf("\n    },"));
  assert(block.length > 0, "the debug handle no longer has a move()");

  const owned = shell.SCREENS.filter((screen) => !shell.isMenuScreen(screen));
  const constants = {
    [shell.SCREEN_SETUP]: "SCREEN_SETUP",
    [shell.SCREEN_GARAGE]: "SCREEN_GARAGE",
    [shell.SCREEN_COLLECTION]: "SCREEN_COLLECTION",
    [shell.SCREEN_BOARDS]: "SCREEN_BOARDS",
    [shell.SCREEN_RADIO]: "SCREEN_RADIO",
    [shell.SCREEN_ONLINE]: "SCREEN_ONLINE",
    [shell.SCREEN_RACE]: "SCREEN_RACE",
    [shell.SCREEN_CAMPAIGN]: "SCREEN_CAMPAIGN",
    [shell.SCREEN_PROFILE]: "SCREEN_PROFILE",
    // The VS card owns no cursor, but `move()` still has to *name* it: falling
    // through to `moveShell` there would walk a menu that is not on screen.
    [shell.SCREEN_VERSUS]: "SCREEN_VERSUS",
  };
  for (const screen of owned) {
    assert(block.includes(constants[screen]), `the debug handle's move() cannot reach ${screen}`);
  }
});

test("the campaign's rules never reach for a browser", () => {
  // The fifth instance of the split, after the radio, the garage, online and
  // the records boards. The catalog, the career and the screen are pure;
  // `progress-store.js` is the one module under `campaign/` allowed to know
  // storage exists. Matched as *usage* rather than as bare words, the reason
  // the garage's sweep gives: these files legitimately name the storage layer
  // in prose, and a purity check that fires on a comment teaches people to
  // weaken the check.
  const forbidden = [
    /document\s*\./,
    /window\s*\./,
    /localStorage\s*\./,
    /indexedDB\s*\./,
    /fetch\s*\(/,
    // And no randomness: an event's difficulty is asserted from its authored
    // seed, so a `Math.random` here would make a measured ladder unmeasurable.
    /Math\.random/,
  ];
  for (const relative of [
    "scripts/campaign/contacts.js",
  "scripts/campaign/events.js",
    "scripts/campaign/map.js",
    "scripts/campaign/progress.js",
    "scripts/ui/campaign.js",
  ]) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    for (const pattern of forbidden) {
      assert(!pattern.test(source), `${relative} reaches for ${pattern}`);
    }
  }
});

test("nothing the game loads at runtime is a full-size master", () => {
  // The masters are 1254x1254 PNGs — 111MB of avatars and 23MB of portraits —
  // and the largest a face is ever drawn is the VS card's slot at ~322x362.
  // Serving one is not a slow path, it is a hundredfold one: filling the avatar
  // picker's grid from the masters pulled ~70MB for a screen of 112px cells.
  //
  // So the manifests keep the master paths for the tool and for this file, and
  // every *runtime* path resolves into `thumbs/` or `cards/`. This is the check
  // that stops one creeping back — a `.src` in a renderer looks entirely
  // reasonable right up until someone opens the network tab.
  const budgets = [
    { folder: "thumbs", limit: 60 * 1024 },
    { folder: "cards", limit: 400 * 1024 },
  ];
  const faces = [
    ...loaded["scripts/profile/avatars.js"].allAvatars().map((avatar) => ({
      what: avatar.id,
      master: avatar.src,
      thumb: avatar.thumbSrc,
      card: avatar.cardSrc,
    })),
    ...loaded["scripts/rival/rivals.js"].RIVALS.map((rival) => ({
      what: rival.id,
      master: loaded["scripts/rival/rivals.js"].rivalPortraitSrc(rival),
      thumb: loaded["scripts/rival/rivals.js"].rivalThumbSrc(rival),
      card: loaded["scripts/rival/rivals.js"].rivalCardSrc(rival),
    })),
  ];

  for (const face of faces) {
    for (const { folder, limit } of budgets) {
      const src = folder === "thumbs" ? face.thumb : face.card;
      assert(src.includes(`/${folder}/`), `${face.what}'s ${folder} path is not in the ${folder} folder`);
      const file = path.join(gameRoot, src);
      assert(fs.existsSync(file), `${face.what} has no ${folder}: run tools/make-face-thumbs.py`);
      const bytes = fs.statSync(file).size;
      assert(bytes <= limit, `${face.what}'s ${folder} is ${Math.round(bytes / 1024)}KB, over the ${limit / 1024}KB budget`);
    }
    // …and where the master is on disk, it is genuinely the heavy one, so the
    // split is worth having. Conditional because the avatar masters are
    // gitignored: a clone has the derived set and nothing else, which is the
    // whole point.
    const master = path.join(gameRoot, face.master);
    if (fs.existsSync(master)) {
      assert(fs.statSync(master).size > fs.statSync(path.join(gameRoot, face.card)).size,
        `${face.what}'s master is no bigger than its card — the derived set is not earning its place`);
    }
  }

  // No module under `scripts/` may name a master folder directly. The manifests
  // build those paths themselves and are exempt; everything else has to go
  // through them.
  const exempt = new Set(["scripts/profile/avatars.js", "scripts/rival/rivals.js"]);
  for (const relative of MODULES) {
    if (exempt.has(relative)) continue;
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    assert(!/assets\/avatars\//.test(source), `${relative} builds an avatar path of its own`);
    assert(!/rivalPortraitSrc/.test(source), `${relative} loads a full-size portrait master`);
    assert(!/\.avatar\?\.src|cell\.src\b/.test(source), `${relative} draws a face from its master`);
  }
});

test("the whole thumb set is smaller than a single master was", () => {
  // The number that decides whether the picker is usable over a network: all 59
  // faces at thumb size against one 1254px PNG. 2.3MB is what a master measures
  // — hardcoded rather than read, because the masters are gitignored and this
  // has to mean something on a clone that has none.
  const rivals = loaded["scripts/rival/rivals.js"];
  const thumbs = [
    ...loaded["scripts/profile/avatars.js"].allAvatars().map((avatar) => avatar.thumbSrc),
    ...rivals.RIVALS.map((rival) => rivals.rivalThumbSrc(rival)),
  ];
  const total = thumbs.reduce((sum, src) => sum + fs.statSync(path.join(gameRoot, src)).size, 0);
  assert(total < 2.3 * 1024 * 1024, `the whole thumb set is ${Math.round(total / 1024)}KB, more than one master`);
});

test("no derived face is stale against a master that is present", () => {
  // The tool writes them and nothing else does, so an art re-export leaves the
  // game serving the old face with nothing on screen to explain it. Compared by
  // modification time, which is exactly what `--check` does.
  //
  // Skipped per face where the master is absent: the avatar masters are
  // gitignored, so on a clone there is nothing to be stale against — and the
  // derived files' own existence is checked unconditionally above.
  const avatars = loaded["scripts/profile/avatars.js"].allAvatars();
  const rivals = loaded["scripts/rival/rivals.js"];
  const pairs = [
    ...avatars.flatMap((avatar) => [[avatar.src, avatar.thumbSrc], [avatar.src, avatar.cardSrc]]),
    ...rivals.RIVALS.flatMap((rival) => [
      [rivals.rivalPortraitSrc(rival), rivals.rivalThumbSrc(rival)],
      [rivals.rivalPortraitSrc(rival), rivals.rivalCardSrc(rival)],
    ]),
  ];
  let checked = 0;
  for (const [master, derived] of pairs) {
    const file = path.join(gameRoot, master);
    if (!fs.existsSync(file)) continue;
    checked += 1;
    const derivedTime = fs.statSync(path.join(gameRoot, derived)).mtimeMs;
    assert(derivedTime >= fs.statSync(file).mtimeMs,
      `${derived} is older than its master — run tools/make-face-thumbs.py`);
  }
  // The rival masters *are* tracked, so at least those twenty pairs must have
  // been compared. A count of zero would mean this test had quietly stopped
  // checking anything at all.
  assert(checked >= rivals.RIVALS.length * 2, `only ${checked} faces were compared against a master`);
});

test("the driver's rules never reach for a browser", () => {
  // The sixth instance of the split, after the radio, the garage, online, the
  // records and the campaign. `avatars.js` is a manifest, `profile.js` decides
  // what a driver *is*, `ui/profile.js` and `ui/versus.js` decide what is on
  // screen; `profile-store.js` is the one module under `profile/` allowed to
  // know a server and localStorage exist. Matched as *usage* rather than as bare
  // words, the garage's reason: these files legitimately name the storage layer
  // in prose.
  const forbidden = [
    /document\s*\./,
    /window\s*\./,
    /localStorage\s*\./,
    /indexedDB\s*\./,
    /fetch\s*\(/,
  ];
  for (const relative of [
    "scripts/profile/avatars.js",
    "scripts/profile/profile.js",
    "scripts/ui/profile.js",
    "scripts/ui/versus.js",
  ]) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    for (const pattern of forbidden) {
      assert(!pattern.test(source), `${relative} reaches for ${pattern}`);
    }
    assert(!/from\s+"[^"]*profile-store\.js"/.test(source), `${relative} imports the storage layer`);
  }
});

test("the driver screen's bests are the boards a run can actually reach", () => {
  // A second list of boards would be a row a player can look at but never fill.
  const profileUi = loaded["scripts/ui/profile.js"];
  const boards = loaded["scripts/ui/boards.js"];
  const view = profileUi.profileScreenView(
    profileUi.createProfileScreen(loaded["scripts/profile/profile.js"].createProfile({})),
    loaded["scripts/profile/profile.js"].createProfile({}),
  );
  assertEqual(view.bests.length, boards.allBoards().length);
  for (const best of view.bests) {
    assert(boards.boardById(best.boardId), `${best.boardId} is not a board`);
  }
});

test("the VS card is built for a rival race and never for an online round", () => {
  // The server owns an online countdown and schedules the start, so a curtain
  // held over it is a way to lose a race before seeing the strip. The guard is
  // in the composition root, where the race is built.
  const source = fs.readFileSync(path.join(gameRoot, "scripts/init-game.js"), "utf8");
  const endOfFunction = "\n  }";
  const build = source.slice(source.indexOf("function buildVersus"));
  const body = build.slice(0, build.indexOf(endOfFunction));
  assert(body.includes("if (!rivalCar) return null;"), "buildVersus no longer refuses a race with an empty lane");

  const online = source.slice(source.indexOf("function buildOnlineRace"));
  const onlineBody = online.slice(0, online.indexOf(endOfFunction));
  assert(/versus = null;/.test(onlineBody), "an online round must clear the VS card");

  const tutorial = source.slice(source.indexOf("function beginTutorial"));
  const tutorialBody = tutorial.slice(0, tutorial.indexOf(endOfFunction));
  assert(/versus = null;/.test(tutorialBody), "a guided run has nobody to face");
});

test("every path onto the race screen goes through the same door", () => {
  // `enterRaceScreen` is what decides whether the curtain is shown. A path that
  // entered `SCREEN_RACE` itself would skip it for one way of starting a run and
  // show it for the others.
  const source = fs.readFileSync(path.join(gameRoot, "scripts/init-game.js"), "utf8");
  const fn = source.slice(source.indexOf("function enterRaceScreen"));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  assert(body.includes("SCREEN_VERSUS"), "enterRaceScreen must be able to show the card");
  assert(body.includes("SCREEN_RACE"), "…and must fall through to the race without one");
});

test("the online rules never reach for a browser or a socket", () => {
  // The third instance of the same split, and the one where it matters most:
  // `session.js` holds every rule about a match, `opponent.js` reconstructs the
  // other car, and both are pure so the whole lifecycle can be exercised without
  // a network. `net.js` is the one module allowed to know a WebSocket exists.
  const forbidden = [
    /\bdocument\s*\./,
    /\bwindow\s*\./,
    /\blocalStorage\s*\./,
    /\bfetch\s*\(/,
    /new\s+WebSocket/,
  ];
  for (const relative of [
    "scripts/online/session.js",
    "scripts/online/opponent.js",
    "scripts/ui/text-entry.js",
    "scripts/ui/online-menu.js",
  ]) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    for (const pattern of forbidden) {
      assert(!pattern.test(source), `${relative} reaches for ${pattern}`);
    }
  }
});

test("the online rules do not import the socket layer", () => {
  // A pure reducer importing the transport would drag a live connection into
  // every test that touches a lobby.
  for (const relative of ["scripts/online/session.js", "scripts/online/opponent.js"]) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    assert(!/from\s+"[^"]*\/net\.js"/.test(source), `${relative} imports the socket layer`);
  }
});

test("net.js is the only module in the cabinet that opens a socket", () => {
  const offenders = [];
  for (const relative of MODULES) {
    if (relative === "scripts/online/net.js") continue;
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    if (/new\s+WebSocket/.test(source)) offenders.push(relative);
  }
  assertEqual(offenders.join(", "), "", "every socket call belongs in online/net.js");
});

test("restart and pause are both refused during an online race", () => {
  // Both are offline conveniences that would be cheats online. Restarting lets a
  // driver choose which of their attempts counted; pausing stops the clock to
  // line up a shift, which defeats the timing skill outright. The round belongs
  // to the server, so neither may reach it.
  const source = fs.readFileSync(path.join(gameRoot, "scripts/init-game.js"), "utf8");
  const raceAction = source.slice(source.indexOf("function raceAction"));
  const body = raceAction.slice(0, raceAction.indexOf("\n  }"));

  for (const [action, effect] of [["ACTION_RESTART", "restartRun()"], ["ACTION_CANCEL", "cancelScreen()"]]) {
    const start = body.indexOf(`case ${action}:`);
    assert(start >= 0, `raceAction no longer handles ${action}`);
    // Up to the next case label, so each branch is examined on its own.
    const rest = body.slice(start + 1);
    const end = rest.search(/\n\s+(case |default:)/);
    const branch = end >= 0 ? rest.slice(0, end) : rest;

    const guard = branch.indexOf("if (isOnlineRace()) break;");
    assert(guard >= 0, `${action} is not guarded against an online race`);
    assert(
      guard < branch.indexOf(effect),
      `${action}'s guard must come before ${effect}, or it does not guard anything`,
    );
  }
});

test("no server frame tears the race down without moving the screen", () => {
  // The rematch bug, as a rule.
  //
  // `endOnlineRace()` clears `opponentCar`, which is what `isOnlineRace()` reads.
  // Doing that while the shell is still on the race screen does not leave the
  // player with no race — it leaves them with a *single-player* one: the pause
  // menu comes back, `R` restarts, and the stale race steps forward again with
  // nothing on screen saying the match ended. That is what pressing REMATCH did,
  // because the server answers a completed handshake with a lobby frame and the
  // frame handler only did half the job.
  //
  // So the teardown and the screen move are one operation, and a frame handler
  // may only reach it through that.
  const source = fs.readFileSync(path.join(gameRoot, "scripts/init-game.js"), "utf8");

  const handlers = source.slice(source.indexOf("net.on({"), source.indexOf("\n  });", source.indexOf("net.on({")));
  assert(handlers.includes("onLobby"), "the frame handlers are no longer where this test looks");
  assert(
    !handlers.includes("endOnlineRace("),
    "a frame handler must go through returnToOnlineScreen, which also moves the screen",
  );

  const fn = source.slice(source.indexOf("function returnToOnlineScreen"));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  assert(body.includes("endOnlineRace()"), "returnToOnlineScreen must tear the race down");
  assert(body.includes("SCREEN_ONLINE"), "…and put the player back on the online screen");
});

test("the debug handle stages and declutches through the logged path", () => {
  // `start()` and `shift()` used to call `startRace` and `pressShift` straight,
  // which skipped `recordStart` and `recordClutch` — so every run driven from
  // automation produced a log with no start and no clutch in it, replaying to a
  // car that sits on the line forever. Nothing noticed while a log was only ever
  // posted to a server that had no replay pass yet; it broke the first time a
  // ghost was built from one. The bug is invisible from the outside, so it is
  // pinned here rather than left to the next person to rediscover.
  const source = fs.readFileSync(path.join(gameRoot, "scripts/init-game.js"), "utf8");
  for (const name of ["start", "shift"]) {
    const start = source.indexOf(`    ${name}(`, source.indexOf("window.speedDemon"));
    assert(start > 0, `the debug handle has no ${name}()`);
    const body = source.slice(start, source.indexOf("\n    },", start));
    assert(body.includes("stageOrShift("), `debug ${name}() bypasses the logged path`);
    assert(!/\b(startRace|pressShift)\s*\(/.test(body), `debug ${name}() reaches straight for the reducer`);
  }
});

test("the garage's rules do not import the storage layer", () => {
  // A pure reducer importing the sync layer would drag a server client into
  // every test that touches a preset.
  for (const relative of ["scripts/garage/livery.js", "scripts/garage/paint.js", "scripts/garage/garage.js"]) {
    const source = fs.readFileSync(path.join(gameRoot, relative), "utf8");
    assert(!/from\s+"[^"]*garage-store\.js"/.test(source), `${relative} imports the storage layer`);
  }
});

test("the paint rules are shared by the renderer rather than copied into it", () => {
  // Two copies of the body/glass/lamp thresholds is exactly the bug where the
  // picker preview and the in-race car disagree about what counts as bodywork.
  const source = fs.readFileSync(path.join(gameRoot, "scripts/render/livery.js"), "utf8");
  assert(source.includes('from "../garage/paint.js"'), "render/livery.js must use the pure classifier");
  assert(!/BODY_MAX_SATURATION\s*=/.test(source), "render/livery.js redefines a paint threshold");
});

test("the radio's display layer does not import the file-system layer", () => {
  // A pure view model importing the browser half would drag it into every test
  // that touches the display, which is why the shared statuses live on their own.
  const source = fs.readFileSync(path.join(gameRoot, "scripts/ui/radio-panel.js"), "utf8");
  assert(!source.includes('from "../radio/library.js"'), "radio-panel.js imports library.js");
});

const RADIO_PANELS = ["face", "list", "strip"];

test("every radio surface fits on screen", () => {
  const scene = loaded["scripts/render/scene.js"];
  const layout = loaded["scripts/ui/radio-panel.js"].RADIO_LAYOUT;
  for (const name of RADIO_PANELS) {
    const box = layout[name];
    assert(box.x >= 0 && box.y >= 0, `${name} starts off screen`);
    assert(box.x + box.width <= scene.WORLD.width, `${name} runs off the right edge`);
    assert(box.y + box.height <= scene.WORLD.height, `${name} runs off the bottom`);
  }
  assert(layout.hint.y < scene.WORLD.height, "the radio hint line is off the bottom");
});

test("the head unit's controls all sit inside the faceplate", () => {
  const panel = loaded["scripts/ui/radio-panel.js"];
  const { face, display, progress, buttons, volume, loop, folder } = panel.RADIO_LAYOUT;
  const inside = (box, what) => {
    assert(box.x >= face.x && box.y >= face.y, `${what} starts outside the faceplate`);
    assert(box.x + box.width <= face.x + face.width, `${what} runs off the faceplate's right edge`);
    assert(box.y + box.height <= face.y + face.height, `${what} runs off the bottom of the faceplate`);
  };
  for (const [what, box] of [
    ["display", display],
    ["progress", progress],
    ["buttons", buttons],
    ["volume", volume],
    ["repeat lamp", loop],
    ["folder slot", folder],
  ]) {
    inside(box, what);
  }
  inside(panel.buttonRect(4), "the last transport button");
});

test("nothing on the head unit collides with anything else", () => {
  const panel = loaded["scripts/ui/radio-panel.js"];
  const { display, progress, buttons, volume, loop, folder, list } = panel.RADIO_LAYOUT;
  const rects = [
    { what: "display", ...display },
    { what: "progress", ...progress },
    { what: "buttons", ...buttons },
    { what: "volume", ...volume },
    { what: "repeat lamp", ...loop },
    { what: "folder slot", ...folder },
    { what: "playlist", ...list },
  ];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      assert(!overlaps(rects[i], rects[j]), `${rects[i].what} overlaps ${rects[j].what}`);
    }
  }
});

test("the in-race now-playing strip stays on the road and clear of the tree", () => {
  // It is drawn over the world, so it must not reach into the instrument
  // cluster — and the christmas tree owns the middle of the screen.
  const scene = loaded["scripts/render/scene.js"];
  const strip = loaded["scripts/ui/radio-panel.js"].RADIO_LAYOUT.strip;
  assert(strip.y + strip.height < scene.DASH_TOP, "the strip overlaps the dashboard");
  assert(strip.x + strip.width < scene.WORLD.width / 2 - 40, "the strip runs into the christmas tree");
});

test("the mode list and its detail panel do not collide", () => {
  const menus = loaded["scripts/render/menus.js"];
  const shell = loaded["scripts/ui/shell.js"];
  const { list } = menus.MENU_LAYOUT.modes;
  const items = shell.menuFor(shell.enterScreen(shell.createShell(), shell.SCREEN_MODES)).items;
  const listRect = { x: list.x, y: list.y, width: list.width, height: menus.menuListHeight(items.length, list) };
  const detail = menus.MENU_LAYOUT.detail;
  assert(!overlaps(listRect, detail), "the mode list runs into its own description panel");
  assert(listRect.y + listRect.height <= loaded["scripts/render/scene.js"].WORLD.height, "the mode list runs off the bottom");
});

test("a car frame fits its grid cell without being stretched", () => {
  const setup = loaded["scripts/render/setup.js"];
  const atlas = loaded["scripts/assets/car-atlas.js"];
  const cell = setup.modelCellRect(0, 0);
  for (const car of atlas.allModels()) {
    const fit = setup.fitContain(car.sw, car.sh, cell, 6);
    assert(fit.width > 0 && fit.height > 0, `${car.id} fits to nothing`);
    assert(fit.x >= cell.x && fit.y >= cell.y, `${car.id} spills out of its cell`);
    assert(fit.x + fit.width <= cell.x + cell.width + 0.001, `${car.id} is wider than its cell`);
    assert(fit.y + fit.height <= cell.y + cell.height + 0.001, `${car.id} is taller than its cell`);
    const sourceAspect = car.sw / car.sh;
    const fitAspect = fit.width / fit.height;
    assert(Math.abs(sourceAspect - fitAspect) < 0.001, `${car.id} was distorted to fit`);
  }
});

test("every collection row and cell fits on screen and nothing collides", () => {
  // The widest row the garage can produce — Factory, the per-model cap, and the
  // add cell — is the one that decides whether the strip still fits beside the
  // scroll column. Eyeballing it on a car with two paints proves nothing.
  const scene = loaded["scripts/render/scene.js"];
  const render = loaded["scripts/render/collection.js"];
  const collection = loaded["scripts/ui/collection.js"];
  const garageModule = loaded["scripts/garage/garage.js"];
  const liveryModule = loaded["scripts/garage/livery.js"];

  const modelId = collection.collectionModels()[0].id;
  let garage = garageModule.emptyGarage();
  for (let i = 0; i < garageModule.MAX_PRESETS_PER_MODEL; i += 1) {
    garage = garageModule.savePreset(garage, { modelId, name: `P${i}`, livery: liveryModule.createLivery() });
  }

  const rects = [];
  for (let row = 0; row < collection.COLLECTION_VISIBLE_ROWS; row += 1) {
    rects.push({ what: `row ${row}`, ...render.collectionRowRect(row) });
  }
  // Cells are checked against the scroll arrows rather than against their own
  // row, which they sit inside by construction.
  const cells = [];
  for (let row = 0; row < collection.COLLECTION_VISIBLE_ROWS; row += 1) {
    const count = collection.collectionCells(modelId, garage).length;
    for (let column = 0; column < count; column += 1) {
      cells.push({ what: `cell ${row}/${column}`, ...render.collectionCellRect(row, column) });
    }
  }
  const arrows = [-1, 1].map((step) => ({ what: `scroll ${step}`, ...render.collectionScrollRect(step) }));

  for (const r of [...rects, ...cells, ...arrows]) {
    assert(r.x >= 0 && r.y >= 0, `${r.what} starts off screen`);
    assert(r.x + r.width <= scene.WORLD.width, `${r.what} runs off the right edge`);
    assert(r.y + r.height <= scene.WORLD.height, `${r.what} runs off the bottom`);
  }
  assert(
    render.COLLECTION_LAYOUT.legend.y > render.collectionRowRect(collection.COLLECTION_VISIBLE_ROWS - 1).y
      + render.COLLECTION_LAYOUT.rows.height,
    "the collection's legend prints over the last row",
  );
  for (const group of [rects, cells, arrows]) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        assert(!overlaps(group[i], group[j]), `${group[i].what} overlaps ${group[j].what}`);
      }
    }
  }
  for (const cell of cells) {
    for (const arrow of arrows) {
      assert(!overlaps(cell, arrow), `${cell.what} overlaps ${arrow.what}`);
    }
  }
  for (const row of rects) {
    for (const arrow of arrows) {
      assert(!overlaps(row, arrow), `${row.what} runs under ${arrow.what}`);
    }
  }
});

test("every drawn cell on the collection is clickable, and reports its own row", () => {
  // The `menuListBox` rule: the geometry the renderer draws is the geometry the
  // hit test reads, so the cell you click is the cell you saw. A cell reports an
  // *absolute* row, which is the only thing that still means something once the
  // list has scrolled.
  const render = loaded["scripts/render/collection.js"];
  const collectionModule = loaded["scripts/ui/collection.js"];
  const garageModule = loaded["scripts/garage/garage.js"];

  let state = collectionModule.createCollection({}, garageModule.emptyGarage());
  state = collectionModule.scrollCollection(state, 2, garageModule.emptyGarage());
  const view = collectionModule.collectionView(state, garageModule.emptyGarage());

  for (const row of view.rows) {
    for (const cell of row.cells) {
      const rect = render.collectionCellRect(row.screenRow, cell.column);
      const hit = render.hitCollection(view, rect.x + rect.width / 2, rect.y + rect.height / 2);
      assert(hit, `nothing is clickable at ${row.modelId} cell ${cell.column}`);
      assertEqual(hit.kind, "cell");
      assertEqual(hit.row, row.row, "a cell reported its screen position rather than its row");
      assertEqual(hit.column, cell.column);
    }
  }

  // The arrows answer only while there is somewhere to go, so a dead one cannot
  // eat a click that belonged to the row behind it.
  const down = render.collectionScrollRect(1);
  assertEqual(render.hitCollection(view, down.x + 2, down.y + 2).step, 1);
  const top = collectionModule.collectionView(
    collectionModule.createCollection({}, garageModule.emptyGarage()),
    garageModule.emptyGarage(),
  );
  const up = render.collectionScrollRect(-1);
  assertEqual(render.hitCollection(top, up.x + 2, up.y + 2), null);
});

test("every garage panel fits on screen and nothing collides", () => {
  const scene = loaded["scripts/render/scene.js"];
  const garageRender = loaded["scripts/render/garage.js"];
  const editorModule = loaded["scripts/ui/garage-editor.js"];
  const garageModule = loaded["scripts/garage/garage.js"];
  const liveryModule = loaded["scripts/garage/livery.js"];

  // A garage full of saved paints offers the most actions, so it is the case
  // that decides whether the action row still fits � and a car carrying the
  // maximum number of layers has both the most tabs and the longest section, so
  // it is the case that decides whether the *rows* do.
  let stocked = garageModule.emptyGarage();
  stocked = garageModule.savePreset(stocked, { modelId: "kaido-gts", name: "One" });

  let livery = liveryModule.createLivery();
  for (let i = 0; i < liveryModule.MAX_LAYERS; i += 1) livery = liveryModule.addLayer(livery, "stripes");
  const editor = editorModule.createEditor({
    modelId: "kaido-gts",
    presetId: stocked.presets[0].id,
    livery,
  });

  // Every section, because they are different lengths and only the longest can
  // run off the bottom of the screen.
  for (const section of editorModule.editorSections(livery)) {
    const view = editorModule.editorView(editorModule.selectSection(editor, section.id), stocked);

    const rects = [];
    for (const row of view.rows) {
      rects.push({ what: `${section.id} row ${row.id}`, ...garageRender.editorRowRect(row.index) });
    }
    view.actions.forEach((action, index) => {
      rects.push({ what: `action ${action.id}`, ...garageRender.editorActionRect(index) });
    });
    rects.push({ what: "preview", ...garageRender.GARAGE_LAYOUT.preview });

    for (const r of rects) {
      assert(r.x >= 0 && r.y >= 0, `${r.what} starts off screen`);
      assert(r.x + r.width <= scene.WORLD.width, `${r.what} runs off the right edge`);
      assert(r.y + r.height <= scene.WORLD.height, `${r.what} runs off the bottom`);
    }
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        assert(!overlaps(rects[i], rects[j]), `${rects[i].what} overlaps ${rects[j].what}`);
      }
    }
  }
});

test("every strip cell fits inside its own row and its neighbours", () => {
  // The tabs, the palette and the layer picker all divide a row into cells. A
  // cell that overhung its row would be clickable from the row above, and one
  // that overlapped its neighbour would make the hit test order-dependent.
  const garageRender = loaded["scripts/render/garage.js"];
  const editorModule = loaded["scripts/ui/garage-editor.js"];
  const garageModule = loaded["scripts/garage/garage.js"];
  const liveryModule = loaded["scripts/garage/livery.js"];

  let livery = liveryModule.createLivery();
  for (let i = 0; i < liveryModule.MAX_LAYERS - 1; i += 1) livery = liveryModule.addLayer(livery, "stripes");
  const base = editorModule.createEditor({ modelId: "kaido-gts", livery });

  for (const section of editorModule.editorSections(livery)) {
    const view = editorModule.editorView(editorModule.selectSection(base, section.id), garageModule.emptyGarage());
    for (const row of view.rows) {
      const cells = row.kind === editorModule.ROW_SECTION ? view.sections
        : row.kind === editorModule.ROW_PALETTE ? view.palette
        : row.kind === editorModule.ROW_PICK ? row.options
        : null;
      if (!cells) continue;

      const rowRect = garageRender.editorRowRect(row.index);
      const rects = cells.map((cell, index) => ({
        what: `${section.id} ${row.id} cell ${index}`,
        ...garageRender.stripCellRect(row.index, row.kind, index, cells.length),
      }));
      for (const r of rects) {
        assert(r.x >= rowRect.x && r.x + r.width <= rowRect.x + rowRect.width,
          `${r.what} runs outside its row horizontally`);
        assert(r.y >= rowRect.y && r.y + r.height <= rowRect.y + rowRect.height,
          `${r.what} runs outside its row vertically`);
        assert(r.width > 12, `${r.what} is only ${Math.round(r.width)}px wide � unclickable`);
      }
      for (let i = 0; i + 1 < rects.length; i += 1) {
        assert(!overlaps(rects[i], rects[i + 1]), `${rects[i].what} overlaps its neighbour`);
      }
    }
  }
});

test("every garage control is clickable, and the bars report where they were hit", () => {
  const garageRender = loaded["scripts/render/garage.js"];
  const editorModule = loaded["scripts/ui/garage-editor.js"];
  const garageModule = loaded["scripts/garage/garage.js"];
  const liveryModule = loaded["scripts/garage/livery.js"];
  const empty = garageModule.emptyGarage();
  const livery = liveryModule.addLayer(liveryModule.createLivery(), "stripes");
  const base = editorModule.createEditor({ modelId: "kaido-gts", livery });

  // Every section: a control nobody can click is a control that does not exist,
  // and only the paint section used to be checked.
  for (const section of editorModule.editorSections(livery)) {
    const sectionView = editorModule.editorView(
      editorModule.selectSection(base, section.id), empty,
    );
    for (const row of sectionView.rows) {
      const rect = garageRender.editorRowRect(row.index);
      for (const x of [rect.x + 20, rect.x + rect.width / 2, rect.x + rect.width - 20]) {
        const hit = garageRender.hitGarage(sectionView, x, rect.y + rect.height / 2);
        assert(hit, `${section.id} row ${row.id} is not clickable at x=${Math.round(x)}`);
      }
    }
  }

  const view = editorModule.editorView(base, empty);
  view.actions.forEach((action, index) => {
    const rect = garageRender.editorActionRect(index);
    const hit = garageRender.hitGarage(view, rect.x + rect.width / 2, rect.y + rect.height / 2);
    assert(hit && hit.kind === "action" && hit.id === action.id, `${action.id} is not clickable`);
  });

  // A hit on a bar carries how far along it landed, which is what lets one code
  // path serve both a click and a drag.
  const hueRow = view.rows.find((row) => row.id === "hue");
  const control = garageRender.rowControlRect(hueRow.index);
  const mid = garageRender.hitGarage(view, control.x + control.width / 2, control.y + control.height / 2);
  assertEqual(mid.kind, "bar");
  assert(Math.abs(mid.ratio - 0.5) < 0.05, `expected a mid-bar ratio, got ${mid.ratio}`);
});

test("a drawn stepper arrow is a pressable target that steps its own row", () => {
  // The arrows are printed on the screen, so clicking one has to work; forcing
  // the keyboard on a control that looks pressable is the bug this pins down.
  const garageRender = loaded["scripts/render/garage.js"];
  const editorModule = loaded["scripts/ui/garage-editor.js"];
  const garageModule = loaded["scripts/garage/garage.js"];
  const liveryModule = loaded["scripts/garage/livery.js"];
  const empty = garageModule.emptyGarage();
  const livery = liveryModule.addLayer(liveryModule.createLivery(), "stripes");
  const editor = editorModule.createEditor({ modelId: "kaido-gts", livery });

  const steppers = [];
  for (const section of editorModule.editorSections(livery)) {
    const sectionView = editorModule.editorView(
      editorModule.selectSection(editor, section.id), empty,
    );
    for (const row of sectionView.rows) {
      if (row.kind === editorModule.ROW_TOGGLE || row.kind === editorModule.ROW_CHOICE) {
        steppers.push({ ...row, view: sectionView });
      }
    }
  }
  assert(steppers.length > 0, "no stepper rows to check");

  for (const row of steppers) {
    for (const step of [-1, 1]) {
      const arrow = garageRender.stepperArrowRect(row.index, step);
      const hit = garageRender.hitGarage(row.view, arrow.x + arrow.width / 2, arrow.y + arrow.height / 2);
      assert(
        hit && hit.kind === "step" && hit.id === row.id && hit.step === step,
        `the ${step < 0 ? "left" : "right"} arrow on ${row.id} is not clickable`,
      );

      // Both arrows have to live inside their own row, or one row's ▶ would
      // steal the click from the row below it.
      const rowRect = garageRender.editorRowRect(row.index);
      assert(
        arrow.x >= rowRect.x
          && arrow.x + arrow.width <= rowRect.x + rowRect.width
          && arrow.y >= rowRect.y
          && arrow.y + arrow.height <= rowRect.y + rowRect.height,
        `the ${row.id} arrow escapes its row`,
      );
    }

    // The two arrows must not claim the same pixel, or one of them is dead.
    const left = garageRender.stepperArrowRect(row.index, -1);
    const right = garageRender.stepperArrowRect(row.index, 1);
    assert(left.x + left.width <= right.x, `the ${row.id} arrows overlap`);
  }

  // And pressing one moves the value it is attached to.
  const finish = steppers.find((row) => row.id === "finish");
  const before = editorModule.editorView(editor, empty).rows.find((row) => row.id === "finish").value;
  const after = editorModule.editorView(
    editorModule.adjustRow(editor, finish.id, 1),
    empty,
  ).rows.find((row) => row.id === "finish").value;
  assert(before !== after, "stepping the finish row changed nothing");
});

test("the shift light strip clears the readout column below it", () => {
  // A caption drawn under the strip once landed on top of the ELAPSED label.
  const dash = loaded["scripts/render/dashboard.js"];
  const stripBottom = dash.SHIFT_STRIP.y + dash.SHIFT_STRIP.height;
  assert(
    stripBottom < dash.READOUTS.top - 8,
    `shift light bottom ${stripBottom} crowds the readouts at ${dash.READOUTS.top}`,
  );
});

test("the shift light strip stays inside the dash and clear of the shifter", () => {
  const scene = loaded["scripts/render/scene.js"];
  const dash = loaded["scripts/render/dashboard.js"];
  assert(dash.SHIFT_STRIP.y >= scene.DASH_TOP, "the strip overlaps the road");
  assert(
    dash.SHIFT_STRIP.x + dash.SHIFT_STRIP.width < dash.SHIFTER_BOX.x,
    "the strip collides with the shifter console",
  );
  assert(dash.SHIFT_STRIP.x > dash.SPEEDO.cx + dash.SPEEDO.radius, "the strip collides with the speedometer");
});

test("the gauges do not overlap each other or the shifter", () => {
  const dash = loaded["scripts/render/dashboard.js"];
  const gap = dash.SPEEDO.cx - dash.TACH.cx;
  assert(gap > dash.TACH.radius + dash.SPEEDO.radius, "the two dials collide");
  assert(dash.SPEEDO.cx + dash.SPEEDO.radius < dash.SHIFTER_BOX.x, "the speedometer collides with the shifter");
});

test("the shifter plate keeps its knob inside the console", () => {
  const gateModule = loaded["scripts/sim/gate.js"];
  const ui = loaded["scripts/ui/shifter-gate.js"];
  const dash = loaded["scripts/render/dashboard.js"];

  const gate = gateModule.createGate(gateModule.GATE_6_SPEED);
  const layout = ui.gateLayout(gate, dash.SHIFTER_BOX);
  const box = dash.SHIFTER_BOX;
  const knobRadius = 19;

  for (const [id, point] of Object.entries(layout.nodes)) {
    assert(point.x - knobRadius >= box.x, `${id} lets the knob escape the left edge`);
    assert(point.x + knobRadius <= box.x + box.width, `${id} lets the knob escape the right edge`);
    assert(point.y - knobRadius >= box.y, `${id} lets the knob escape the top edge`);
    assert(point.y + knobRadius <= box.y + box.height, `${id} lets the knob escape the bottom edge`);
  }
});

test("the entry point wires the real module and stylesheet", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  assert(html.includes('id="game"'), "the canvas the boot call looks up must exist");
  assert(html.includes("scripts/init-game.js"), "index.html must load the composition root");
  assert(html.includes('type="module"'), "the game is ESM and needs a module script tag");
  assert(html.includes("styles/game.css"), "index.html must load the stylesheet");
});

test("referenced asset files are actually present", () => {
  for (const sheet of loaded["scripts/assets/car-atlas.js"].MODEL_SHEETS) {
    assert(fs.existsSync(path.join(gameRoot, sheet.src)), `missing car sheet at ${sheet.src}`);
  }
  assert(fs.existsSync(path.join(gameRoot, "assets/tracks/track-a.png")), "missing track texture");
  assert(
    fs.existsSync(path.join(gameRoot, loaded["scripts/render/menus.js"].MENU_SPLASH)),
    "missing menu splash",
  );
  assert(
    fs.existsSync(path.join(gameRoot, loaded["scripts/render/collection.js"].GARAGE_SPLASH)),
    "missing garage splash",
  );
  assert(
    fs.existsSync(path.join(gameRoot, loaded["scripts/render/profile.js"].PROFILE_SPLASH)),
    "missing driver-screen splash",
  );
  // The VS card *is* its frame — the two neon slots are painted into it — so
  // unlike a backdrop there is nothing to degrade to if it is missing.
  assert(
    fs.existsSync(path.join(gameRoot, loaded["scripts/render/versus.js"].VS_SPLASH)),
    "missing VS splash",
  );
  // Every face the game *loads*, in both derived sizes, because a picker cell
  // with no file behind it is a plate with a number on it and nothing to say why.
  // They come from `tools/make-face-thumbs.py`; a missing one means the tool has
  // not been re-run since the art changed.
  //
  // The **masters are deliberately not checked here**: they are gitignored
  // (~117MB the browser never requests), so a clone legitimately has none. What
  // ships is the derived set, and that is what has to be present.
  for (const avatar of loaded["scripts/profile/avatars.js"].allAvatars()) {
    assert(fs.existsSync(path.join(gameRoot, avatar.thumbSrc)), `missing avatar thumb at ${avatar.thumbSrc}`);
    assert(fs.existsSync(path.join(gameRoot, avatar.cardSrc)), `missing avatar card at ${avatar.cardSrc}`);
  }
  assert(fs.existsSync(path.join(gameRoot, "styles/game.css")), "missing stylesheet");
  for (const src of Object.values(loaded["scripts/audio.js"].SOUND_SOURCES)) {
    assert(fs.existsSync(path.join(gameRoot, src)), `missing sound at ${src}`);
  }
});

finish();
