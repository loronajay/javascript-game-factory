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
  "scripts/assets/car-atlas.js",
  "scripts/render/livery.js",
  "scripts/ui/shifter-gate.js",
  "scripts/ui/radio-panel.js",
  "scripts/ui/track-layout.js",
  "scripts/ui/gauges.js",
  "scripts/ui/setup-menu.js",
  "scripts/ui/garage-editor.js",
  "scripts/ui/shell.js",
  "scripts/ui/coach.js",
  "scripts/ui/text-entry.js",
  "scripts/ui/online-menu.js",
  "scripts/render/scene.js",
  "scripts/render/car.js",
  "scripts/render/setup.js",
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
  const view = menu.setupView(menu.createSetup({ modeId }));

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
  const { grid, presets, tracks, objective, title, mode } = setup.SETUP_LAYOUT;
  assert(grid.y - 13 > mode.y, "the CAR heading collides with the mode badge");
  assert(mode.y > title.y, "the mode badge collides with the wordmark");
  for (const [name, pane] of [["presets", presets], ["tracks", tracks], ["objective", objective]]) {
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
  assert(fs.existsSync(path.join(gameRoot, "styles/game.css")), "missing stylesheet");
  for (const src of Object.values(loaded["scripts/audio.js"].SOUND_SOURCES)) {
    assert(fs.existsSync(path.join(gameRoot, src)), `missing sound at ${src}`);
  }
});

finish();
