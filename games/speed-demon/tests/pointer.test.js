import { suite, test, assert, assertEqual, assertDeepEqual, assertClose, finish } from "./harness.js";

import { toWorld } from "../scripts/pointer.js";
import { MENU_LAYOUT, hitMenuList, menuListBox, menuListHeight } from "../scripts/render/menus.js";
import { SCREENS, createShell, enterScreen, isMenuScreen, menuFor } from "../scripts/ui/shell.js";
import { WORLD } from "../scripts/render/scene.js";
import {
  hitSetup,
  modelCellRect,
  presetRowRect,
  trackCardRect,
  objectiveCardRect,
  startButtonRect,
} from "../scripts/render/setup.js";
import {
  createSetup,
  setupView,
  setupTrack,
  setupModel,
  focusSetup,
  TARGET_START,
} from "../scripts/ui/setup-menu.js";
import { emptyGarage } from "../scripts/garage/garage.js";
import { TRACKS } from "../scripts/ui/track-layout.js";

const EMPTY_GARAGE = emptyGarage();

suite("pointer — mapping the mouse onto the world, and onto menu items");

// The canvas is drawn at 1280x720 but displayed at whatever fits the window, so
// every event has to be mapped back before it means anything.
const rect = (left, top, width, height) => ({ left, top, width, height });

test("a pixel on a full-size canvas is the same pixel in the world", () => {
  const point = toWorld(rect(0, 0, WORLD.width, WORLD.height), WORLD, 640, 360);
  assertDeepEqual(point, { x: 640, y: 360 });
});

test("a shrunken canvas maps back up", () => {
  // Half size: a click at 320,180 on screen is the middle of the world.
  const point = toWorld(rect(0, 0, WORLD.width / 2, WORLD.height / 2), WORLD, 320, 180);
  assertClose(point.x, 640, 0.001);
  assertClose(point.y, 360, 0.001);
});

test("a letterboxed canvas subtracts its offset", () => {
  // The stage centres the canvas, so the rect rarely starts at the origin — and
  // ignoring that puts every click a fixed distance from where it was made.
  const point = toWorld(rect(200, 90, WORLD.width, WORLD.height), WORLD, 200, 90);
  assertDeepEqual(point, { x: 0, y: 0 });
});

test("a canvas with no size yet maps to nothing rather than to infinity", () => {
  assertEqual(toWorld(rect(0, 0, 0, 0), WORLD, 10, 10), null);
  assertEqual(toWorld(null, WORLD, 10, 10), null);
});

// --- menu lists --------------------------------------------------------------

const itemsOn = (screen) => menuFor(enterScreen(createShell(), screen)).items;

test("every menu screen offers the mouse a box to aim at", () => {
  for (const screen of SCREENS.filter(isMenuScreen)) {
    assert(menuListBox(screen), `${screen} has no list geometry, so it cannot be clicked`);
  }
});

test("a click in the middle of each row picks that row, on every menu screen", () => {
  for (const screen of SCREENS.filter(isMenuScreen)) {
    const box = menuListBox(screen);
    const items = itemsOn(screen);
    items.forEach((item, index) => {
      const y = box.y + index * (box.itemHeight + box.gap) + box.itemHeight / 2;
      assertEqual(hitMenuList(items.length, box, box.x + box.width / 2, y), index, `${screen}/${item.id}`);
    });
  }
});

test("the gaps between rows are dead, so a click never picks the wrong neighbour", () => {
  const box = menuListBox("paused");
  const gapY = box.y + box.itemHeight + box.gap / 2;
  assertEqual(hitMenuList(5, box, box.x + 10, gapY), -1);
});

test("clicks outside the list miss", () => {
  const box = menuListBox("paused");
  assertEqual(hitMenuList(5, box, box.x - 5, box.y + 10), -1, "left of the list");
  assertEqual(hitMenuList(5, box, box.x + box.width + 5, box.y + 10), -1, "right of the list");
  assertEqual(hitMenuList(5, box, box.x + 10, box.y - 5), -1, "above the list");
});

test("a click past the last row misses rather than wrapping to it", () => {
  const box = menuListBox("paused");
  const belowEverything = box.y + menuListHeight(5, box) + 40;
  assertEqual(hitMenuList(5, box, box.x + 10, belowEverything), -1);
});

test("a nonsense point does not throw", () => {
  assertEqual(hitMenuList(3, menuListBox("title"), NaN, NaN), -1);
  assertEqual(hitMenuList(3, null, 10, 10), -1);
});

test("the race and setup screens are not clickable, and say so by having no box", () => {
  // The mouse must not reach into a live run, and the setup screen owns its own
  // grid rather than a list.
  assertEqual(menuListBox("race"), null);
  assertEqual(menuListBox("setup"), null);
  assertEqual(menuListBox("radio"), null, "the radio has its own hit test, not a menu list");
});

test("every clickable list stays inside the panel drawn around it", () => {
  // The geometry is shared with the renderer precisely so these cannot drift —
  // this is the test that says the shared copy is the correct one.
  for (const [screen, panel] of [["paused", MENU_LAYOUT.pause], ["results", MENU_LAYOUT.results]]) {
    const box = menuListBox(screen);
    const bottom = box.y + menuListHeight(itemsOn(screen).length, box);
    assert(box.x >= panel.x && box.x + box.width <= panel.x + panel.width, `${screen} list is wider than its panel`);
    assert(bottom <= panel.y + panel.height, `${screen} list ends at ${bottom}, past its panel`);
  }
});

// ---------------------------------------------------------------------------
// The setup screen
//
// The picker used to be keyboard-only. Now that a model, a saved config, a track
// and an objective are all clickable, the same rule the radio faceplate follows
// applies: whatever lights up under the pointer must be what pressing there
// does, which is only guaranteed while one function answers both questions.
// ---------------------------------------------------------------------------

test("every model cell is clickable at its centre, and reports its own position", () => {
  const view = setupView(createSetup(), EMPTY_GARAGE);
  for (const group of view.groups) {
    for (const cell of group.cells) {
      const box = modelCellRect(cell.row, cell.column);
      const hit = hitSetup(view, box.x + box.width / 2, box.y + box.height / 2);
      assert(hit, `${cell.id} is not clickable`);
      assertEqual(hit.pane, "model");
      assertEqual(hit.row, cell.row, `${cell.id} reports the wrong row`);
      assertEqual(hit.column, cell.column, `${cell.id} reports the wrong column`);
    }
  }
});

test("every config row, track card and objective card is clickable", () => {
  const view = setupView(createSetup(), EMPTY_GARAGE);
  for (const option of view.presets.options) {
    const box = presetRowRect(option.index);
    const hit = hitSetup(view, box.x + box.width / 2, box.y + box.height / 2);
    assertEqual(hit?.pane, "preset");
    assertEqual(hit.index, option.index);
  }
  for (const track of view.tracks) {
    const box = trackCardRect(track.index);
    const hit = hitSetup(view, box.x + box.width / 2, box.y + box.height / 2);
    assertEqual(hit?.pane, "track");
    assertEqual(hit.index, track.index);
  }
  for (const option of view.objective.options) {
    const box = objectiveCardRect(option.index);
    const hit = hitSetup(view, box.x + box.width / 2, box.y + box.height / 2);
    assertEqual(hit?.pane, "objective");
    assertEqual(hit.index, option.index);
  }
});

test("no two setup targets claim the same pixel", () => {
  // Two panes overlapping would make a click ambiguous and the hover highlight
  // land on something other than what fires.
  const view = setupView(createSetup(), EMPTY_GARAGE);
  const seen = new Map();
  const record = (what, box) => {
    for (const [x, y] of [
      [box.x + 1, box.y + 1],
      [box.x + box.width - 1, box.y + box.height - 1],
      [box.x + box.width / 2, box.y + box.height / 2],
    ]) {
      const key = `${Math.round(x)},${Math.round(y)}`;
      assert(!seen.has(key) || seen.get(key) === what, `${what} collides with ${seen.get(key)}`);
      seen.set(key, what);
    }
  };
  for (const group of view.groups) {
    for (const cell of group.cells) record(`car ${cell.id}`, modelCellRect(cell.row, cell.column));
  }
  for (const option of view.presets.options) record(`preset ${option.index}`, presetRowRect(option.index));
  for (const track of view.tracks) record(`track ${track.id}`, trackCardRect(track.index));
  for (const option of view.objective.options) record(`obj ${option.id}`, objectiveCardRect(option.index));
  record("start", startButtonRect());
});

test("the START button is clickable and is not a pane", () => {
  // The keyboard starts a race by locking the last pane. A mouse has no ENTER,
  // and if the only way to start were clicking an objective card then looking at
  // a distance would launch you — so START is its own target.
  const view = setupView(createSetup(), EMPTY_GARAGE);
  const box = startButtonRect();
  const hit = hitSetup(view, box.x + box.width / 2, box.y + box.height / 2);
  assertEqual(hit?.target, TARGET_START);
  assertEqual(hit.pane, undefined, "START must not read as a pane, or it would move the cursor");
});

// ---------------------------------------------------------------------------
// Hover highlights; it does not choose
//
// The setup cursor is also the pick, so a hover that moved it changed your car
// for sweeping the mouse across the grid — and, re-applied every frame, put the
// pane back under the pointer straight after a click had advanced it, which made
// clicking a car, a paint or a track look like a dead control.
// ---------------------------------------------------------------------------

test("hovering marks the cell under the pointer and nothing else", () => {
  const view = setupView(createSetup(), EMPTY_GARAGE, { hover: { pane: "model", row: 2, column: 1 } });
  const hovered = view.groups.flatMap((group) => group.cells).filter((cell) => cell.hovered);
  assertEqual(hovered.length, 1);
  assertEqual(hovered[0].row, 2);
  assertEqual(hovered[0].column, 1);
});

test("hovering a car does not change which car is chosen", () => {
  const setup = createSetup();
  const before = setupModel(setup).id;
  const view = setupView(setup, EMPTY_GARAGE, { hover: { pane: "model", row: 3, column: 0 } });
  assertEqual(setupModel(setup).id, before, "hovering must not touch the setup at all");
  assertEqual(view.chosenModel.id, before, "the preview follows the pick, not the pointer");
});

test("every pane and the START button can be hovered", () => {
  const hovers = [
    [{ pane: "preset", index: 0 }, (v) => v.presets.options.some((o) => o.hovered)],
    [{ pane: "track", index: 1 }, (v) => v.tracks.some((t) => t.hovered)],
    [{ pane: "objective", index: 1 }, (v) => v.objective.options.some((o) => o.hovered)],
    [{ target: TARGET_START }, (v) => v.start.hovered],
  ];
  for (const [hover, marked] of hovers) {
    assert(marked(setupView(createSetup(), EMPTY_GARAGE, { hover })), `${JSON.stringify(hover)} lights nothing up`);
  }
  const none = setupView(createSetup(), EMPTY_GARAGE);
  assert(!none.start.hovered, "nothing is hovered without a pointer");
  assert(!none.tracks.some((t) => t.hovered), "nothing is hovered without a pointer");
});

test("empty space on the setup screen is not a target", () => {
  const view = setupView(createSetup(), EMPTY_GARAGE);
  assertEqual(hitSetup(view, 4, WORLD.height - 4), null);
});

test("clicking a target puts the cursor on it, changing pane if it has to", () => {
  // A direction key can never leave its pane, but a click carries its own pane —
  // pointing at a track means you want that track.
  const setup = createSetup();
  const view = setupView(setup, EMPTY_GARAGE);
  const box = trackCardRect(2);
  const target = hitSetup(view, box.x + box.width / 2, box.y + box.height / 2);
  const focused = focusSetup(setup, target, EMPTY_GARAGE);
  assertEqual(focused.pane, "track");
  assertEqual(setupTrack(focused).id, TRACKS[2].id);
});

test("clicking a model selects it without disturbing the other panes", () => {
  const setup = createSetup();
  const before = setupTrack(setup).id;
  const view = setupView(setup, EMPTY_GARAGE);
  const box = modelCellRect(2, 0);
  const focused = focusSetup(setup, hitSetup(view, box.x + box.width / 2, box.y + box.height / 2), EMPTY_GARAGE);
  assertEqual(focused.pane, "model");
  assertEqual(focused.model.row, 2);
  assertEqual(setupTrack(focused).id, before);
});

test("focusing an unknown target leaves the setup alone", () => {
  const setup = createSetup();
  assertDeepEqual(focusSetup(setup, null, EMPTY_GARAGE), setup);
  assertDeepEqual(focusSetup(setup, { pane: "nonsense" }, EMPTY_GARAGE), setup);
});

test("an out-of-range click index clamps rather than selecting nothing", () => {
  const setup = createSetup();
  const focused = focusSetup(setup, { pane: "track", index: 99 }, EMPTY_GARAGE);
  assertEqual(setupTrack(focused).id, TRACKS[TRACKS.length - 1].id);
});

finish();
