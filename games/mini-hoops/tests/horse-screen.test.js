import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertDeepEqual, assertEqual, finish } from "./harness.js";

import { bootHorse, horseTurnBallId } from "../scripts/horse-game.js";
import { BOARD_PIECE } from "../scripts/sim/trick-shot.js";
import { BIN_TARGET, HOOP_TARGET } from "../scripts/sim/trick-shot-target.js";
import { PHASE_MATCH, PHASE_SET } from "../scripts/sim/horse.js";
import { HOOP_TRAVEL_BOUNDS } from "../scripts/sim/hoop.js";
import { defaultHoopPlacement } from "../scripts/sim/hoop-placement.js";
import { restingBallPosition } from "../scripts/render/frame.js";
import { createMemoryStorage } from "../scripts/store/local-storage.js";
import { createTrickShotStore } from "../scripts/store/trick-shots-store.js";

// A HORSE turn is a two-phase state machine — arrange a bin, shoot at it, hand
// over — and the browser is the one place that cannot be checked. The failure
// mode is a loop that quietly stops advancing: nothing throws, the court goes on
// rendering, and the ball simply hangs in the air. A hidden tab does exactly
// that on its own (rAF is throttled to nothing), so a manual pass through the
// screen can neither confirm nor deny it. It is pinned here instead, on the same
// seam and for the same reason as `practice-court.test.js`.
//
// The DOM is stubbed to the shallowest thing the root actually uses.

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

suite("horse screen — a turn resolves, changes hands, and comes back");

function stubElement() {
  const classes = new Set();
  return {
    hidden: false,
    textContent: "",
    title: "",
    dataset: {},
    style: {},
    className: "",
    type: "",
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    addEventListener() {},
    setAttribute() {},
    append() {},
    appendChild() {},
    replaceChildren() {},
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

/**
 * A 2D context that swallows everything and returns itself.
 *
 * Returning ITSELF is the load-bearing part: `createLinearGradient(...)` is
 * followed by `.addColorStop(...)` on whatever came back, so a stub that hands
 * out a bare object dies one call later.
 *
 * Worth having rather than skipping the draw: the root renders from several
 * places outside its loop, so these tests run the REAL render path, and a crash
 * in a renderer surfaces here instead of in a browser.
 */
function noopContext() {
  const context = new Proxy({}, {
    get: (target, key) => {
      if (!(key in target)) target[key] = () => context;
      return target[key];
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
  return context;
}

function stubCanvas() {
  const listeners = new Map();
  const element = stubElement();
  return Object.assign(element, {
    width: 0,
    height: 0,
    // A no-op 2D context rather than a bare object. The root draws from several
    // places outside the loop, so an empty `{}` throws on the first `clearRect`
    // — and a context that swallows everything means these tests run the REAL
    // render path too, which is how a crash in a renderer gets caught here
    // rather than in a browser.
    getContext: () => noopContext(),
    addEventListener: (type, handler) => listeners.set(type, handler),
    setPointerCapture: () => {},
    // Read through `ui/pointer.js`, so a 1:1 rect makes pointer coordinates
    // canvas coordinates.
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 760 }),
    fire(type, point) {
      listeners.get(type)?.({
        pointerId: 1,
        clientX: point.x,
        clientY: point.y,
        preventDefault: () => {},
        target: { closest: () => null },
      });
    },
  });
}

function harness(options = {}) {
  const canvas = stubCanvas();
  // `document.createElement` is used to build the motion chips and the letter
  // board. Neither is read back here, so a bare stub is enough.
  globalThis.document = { createElement: () => stubElement() };
  const elements = new Map();
  const root = {
    querySelector: (selector) => {
      if (selector === "#horseCourt") return canvas;
      if (!elements.has(selector)) elements.set(selector, stubElement());
      return elements.get(selector);
    },
    querySelectorAll: () => [],
  };
  const horse = bootHorse(root, {
    random: () => 0.5,
    // The loader builds `Image` objects, which node has none of. Nothing here
    // renders, so the art is stubbed out entirely.
    assets: { backdrop: () => null, image: () => null, ballFrames: () => [], ballSplats: () => null },
    ...options,
  });
  return { canvas, horse, elements };
}

/** Drag straight back from the resting ball by `distance` canvas pixels. */
function shoot({ canvas }, distance, sideways = 0) {
  const rest = restingBallPosition();
  canvas.fire("pointerdown", rest);
  canvas.fire("pointermove", { x: rest.x + sideways, y: rest.y + distance });
  canvas.fire("pointerup", { x: rest.x + sideways, y: rest.y + distance });
}

/** Run forward until the shot in the air has resolved and the ball is back. */
function settle(horse, maxTicks = 900) {
  for (let i = 0; i < maxTicks; i++) {
    horse.tick();
    if (!horse.isBusy()) return i;
  }
  return -1;
}

test("a set shot resolves and hands the ball back rather than latching", () => {
  const { horse, canvas } = harness({ mode: "local" });
  horse.enter({ mode: "local", word: "PIG" });
  horse.setShot();
  shoot({ canvas }, 84);
  assert(horse.isBusy(), "the shot did not start");
  assert(settle(horse) >= 0, "the shot never resolved — the turn would hang forever");
  assertEqual(horse.match.shots, 1);
});

test("a made setup passes the turn and the matcher inherits the bin", () => {
  const { horse, canvas } = harness({ mode: "local" });
  horse.enter({ mode: "local", word: "PIG" });
  // Straight down the middle of the room, on the floor: reliably makeable.
  horse.placeTarget({ x: 0, y: 0.36, z: 0.6, motionId: "still" });
  const placed = { ...horse.setup };
  assertEqual(placed.kind, BIN_TARGET, "a turn opens on the bin");
  horse.setShot();

  // Walk the pull until one drops, so the test does not depend on a magic number.
  let made = false;
  for (let pull = 40; pull <= 105 && !made; pull += 2) {
    shoot({ canvas }, pull);
    settle(horse);
    made = horse.match.phase === PHASE_MATCH;
    if (!made && horse.match.phase === PHASE_SET) horse.setShot();
  }
  assert(made, "no pull in the whole range could make a floor bin in the middle of the room");
  assertEqual(horse.match.turn, 1, "the other player did not inherit the turn");
  assertEqual(horse.match.standingShot.placement.z, placed.placement.z,
    "the standing shot is not the bin that was set");
  assertEqual(horse.match.standingShot.motionId, placed.motionId);
});

test("HORSE offers every saved shot and loads its target, tools, room, and ball", () => {
  const store = createTrickShotStore({ storage: createMemoryStorage(), makeId: (() => {
    let id = 0;
    return () => `saved-${++id}`;
  })() });
  const binShot = store.save({
    name: "Bank off the pad",
    locationId: "warehouse",
    ballId: "paper",
    target: {
      kind: BIN_TARGET,
      motionId: "sideways",
      placement: { x: 0.2, y: 0.4, z: 0.62 },
    },
    pieces: [{ type: BOARD_PIECE, id: "bank-pad", x: 0.72, y: 1.2, z: 0.5, yaw: 0.4 }],
  });
  const hoopShot = store.save({
    name: "Hoop only",
    target: { kind: HOOP_TARGET, motionId: "horizontal", placement: { cx: 452, rimY: 214 } },
    pieces: [],
  });

  const { horse } = harness({ mode: "local", store });
  horse.enter({ mode: "local", word: "PIG" });

  // The bank used to be filtered down to bin layouts, because a bin was the only
  // target HORSE had. It places both now, so it offers both — a saved layout
  // missing from a list the player authored it into is the worst shape a filter
  // can take.
  assertDeepEqual(
    horse.savedShots().map(({ id }) => id).sort(),
    [binShot.id, hoopShot.id].sort(),
    "the HORSE bank is not the whole bank",
  );

  assert(horse.useSavedShot(binShot.id), "the bin layout was refused");
  assertEqual(horse.setup.kind, BIN_TARGET);
  assertEqual(horse.setup.motionId, "sideways");
  assertEqual(horse.setup.placement.x, binShot.target.placement.x);
  assertEqual(horse.locationId, "warehouse");
  assertEqual(horse.pieces.length, 1);
  assertEqual(horse.pieces[0].id, "bank-pad");
  assertEqual(horse.currentBallId(), "paper");

  // And the hoop layout brings its whole target across, motion and all — the
  // point of allowing it at all.
  assert(horse.useSavedShot(hoopShot.id), "a hoop layout was refused");
  assertEqual(horse.setup.kind, HOOP_TARGET);
  assertEqual(horse.setup.motionId, "horizontal");
  assertEqual(horse.setup.placement.cx, hoopShot.target.placement.cx);
  assertEqual(horse.setup.placement.rimY, hoopShot.target.placement.rimY);
});

test("the wall hoop is a HORSE target, and its shot is the cabinet's classic pull", () => {
  const { horse, canvas } = harness({ mode: "local" });
  horse.enter({ mode: "local", word: "PIG" });
  horse.placeTarget({ kind: HOOP_TARGET });
  assertEqual(horse.setup.kind, HOOP_TARGET);
  // Hung at the cabinet's own peg to start with, which is the one rim position
  // the classic run is calibrated against.
  assertDeepEqual(horse.setup.placement, defaultHoopPlacement());

  horse.setShot();
  let made = false;
  for (let pull = 40; pull <= 115 && !made; pull += 2) {
    shoot({ canvas }, pull);
    settle(horse);
    made = horse.match.phase === PHASE_MATCH;
    if (!made && horse.match.phase === PHASE_SET) horse.setShot();
  }
  assert(made, "no pull in the whole range could make the hoop at its own base position");
  assertEqual(horse.match.standingShot.kind, HOOP_TARGET, "the standing shot is not the hoop that was set");
});

test("a hung hoop stays on the wall, and its lane and height are the only choices", () => {
  const { horse } = harness({ mode: "local" });
  horse.enter({ mode: "local", word: "PIG" });
  horse.placeTarget({ kind: HOOP_TARGET });

  // Shoved past every edge of the room in turn, it stays inside the crop the
  // classic cabinet's own modes are held to — that box IS the placement volume.
  for (const wild of [{ cx: -9e3 }, { cx: 9e3 }, { rimY: -9e3 }, { rimY: 9e3 }]) {
    horse.placeTarget(wild);
    const { cx, rimY } = horse.setup.placement;
    assert(cx >= HOOP_TRAVEL_BOUNDS.minX - 1e-9 && cx <= HOOP_TRAVEL_BOUNDS.maxX + 1e-9, `lane escaped: ${cx}`);
    assert(rimY >= HOOP_TRAVEL_BOUNDS.minY - 1e-9 && rimY <= HOOP_TRAVEL_BOUNDS.maxY + 1e-9, `height escaped: ${rimY}`);
  }

  // A depth is not a thing a hoop has. Handing it one changes nothing — there is
  // no field for it to land in and no translation of it that would mean anything.
  horse.placeTarget({ cx: 430, rimY: 210 });
  const before = { ...horse.setup.placement };
  horse.placeTarget({ z: 0.2 });
  assertDeepEqual(horse.setup.placement, before, "a depth moved a hoop");
});

test("the two targets remember their own placement across a swap", () => {
  const { horse } = harness({ mode: "local" });
  horse.enter({ mode: "local", word: "PIG" });
  horse.placeTarget({ x: 0.3, y: 0.4, z: 0.55, motionId: "still" });
  const bin = { ...horse.setup.placement };

  horse.placeTarget({ kind: HOOP_TARGET });
  horse.placeTarget({ cx: 420, rimY: 200 });
  const hoop = { ...horse.setup.placement };

  // Nothing is carried across a swap: the two placements do not share a shape
  // and the two motion catalogs do not share an id, so each kind picks up where
  // it was left rather than being handed a guess at the other one.
  horse.placeTarget({ kind: BIN_TARGET });
  assertDeepEqual(horse.setup.placement, bin, "the bin forgot where it was standing");
  horse.placeTarget({ kind: HOOP_TARGET });
  assertDeepEqual(horse.setup.placement, hoop, "the hoop forgot where it was hanging");
});

test("a saved tool layout becomes part of the standing shot the matcher inherits", () => {
  const store = createTrickShotStore({ storage: createMemoryStorage(), makeId: () => "bin-bank" });
  store.save({
    name: "Safe side pad",
    target: {
      kind: BIN_TARGET,
      motionId: "still",
      placement: { x: 0, y: 0.36, z: 0.6 },
    },
    pieces: [{ type: BOARD_PIECE, id: "side-pad", x: 0.9, y: 1.5, z: 0.1 }],
  });
  const view = harness({ mode: "local", store });
  view.horse.enter({ mode: "local", word: "PIG" });
  view.horse.useSavedShot("bin-bank");
  view.horse.setShot();

  let made = false;
  for (let pull = 40; pull <= 105 && !made; pull += 2) {
    shoot(view, pull);
    settle(view.horse);
    made = view.horse.match.phase === PHASE_MATCH;
    if (!made && view.horse.match.phase === PHASE_SET) {
      view.horse.useSavedShot("bin-bank");
      view.horse.setShot();
    }
  }

  assert(made, "the saved bin shot could not be set");
  assertDeepEqual(view.horse.match.standingShot.pieces, view.horse.pieces,
    "the matching player did not inherit the setter's tools");
});

test("the matcher may not re-place the bin", () => {
  const { horse } = harness({ mode: "local" });
  horse.enter({ mode: "local", word: "PIG" });
  horse.placeTarget({ x: 0, y: 0.36, z: 0.6, motionId: "still" });
  horse.setShot();
  // Force the standing shot without shooting, then start the matcher's turn.
  horse.match.phase = PHASE_MATCH;
  horse.match.standingShot = { ...horse.setup };
  horse.match.turn = 1;
  horse.newMatch();
  assertEqual(horse.phase, "placing", "a fresh match always opens on a placement");
});

test("the motion clock restarts every turn, so both players face the same bin", () => {
  // The whole claim of "the same shot" for a MOVING bin rests on this. If the
  // clock ran on across the handover, the matcher would arrive mid-sweep and be
  // shown a bin somewhere the setter never saw it.
  const { horse, canvas } = harness({ mode: "local" });
  horse.enter({ mode: "local", word: "PIG" });
  horse.placeTarget({ x: 0, y: 0.36, z: 0.6, motionId: "sideways" });
  horse.setShot();
  const atRest = horse.targetNow().bin.x;

  // Run the sweep well away from its start, then take the shot.
  for (let i = 0; i < 54; i++) horse.tick();
  assert(Math.abs(horse.targetNow().bin.x - atRest) > 0.1, "the bin never actually moved — the test proves nothing");
  shoot({ canvas }, 84);
  settle(horse);

  // Whatever the outcome, the next turn opens with the bin back at the start of
  // its sweep. Read through the bin the court is DRAWING, not through a stored
  // setup, because the drawn bin is what the player has to lead.
  assert(Math.abs(horse.targetNow().bin.x - atRest) < 1e-9,
    `the sweep carried on across the handover: ${horse.targetNow().bin.x} vs ${atRest}`);
});

test("a CPU opponent takes its own turn without a human touching anything", () => {
  const { horse } = harness({ mode: "cpu", difficulty: "hard" });
  horse.enter({ mode: "cpu", difficulty: "hard", word: "PIG" });
  // Player 1 (human) misses, handing the turn to the CPU.
  horse.setShot();
  horse.match.turn = 1;
  horse.match.phase = PHASE_SET;

  // From here nothing but time should be required.
  let placed = false;
  for (let i = 0; i < 1200; i++) {
    horse.tick();
    if (horse.match.shots > 0) { placed = true; break; }
  }
  assert(placed, "the CPU never placed a bin and shot at it — its turn would hang");
});

test("a hotseat turn waits for its player and never shoots on its own", () => {
  // The CPU test above proves an unattended turn advances. This is its opposite
  // and it matters just as much: in hotseat, BOTH turns are human, so a root
  // that let the clock take a shot would fire the moment a player looked away.
  const { horse } = harness({ mode: "local" });
  horse.enter({ mode: "local", word: "PIG" });
  horse.setShot();
  for (let i = 0; i < 1200; i++) horse.tick();
  assertEqual(horse.match.shots, 0, "twenty seconds of idling took a shot by itself");
  assertEqual(horse.match.turn, 0, "and the turn wandered off to the other player");
});

test("a spelled word ends in a card, and the card is the only rematch", () => {
  // It used to end in a status line: the HUD said who had won, and the court
  // then sat there with nothing to do and no way on but the MENU button. The
  // `New match` button that WAS in the HUD only ever appeared once the match was
  // over — which is now exactly when the card's scrim is over the top of it.
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  const source = fs.readFileSync(path.join(gameRoot, "scripts", "horse-game.js"), "utf8");
  assert(html.includes('id="horseResultsOverlay"'), "the court needs a results overlay");
  for (const intent of ["horse-rematch", "horse-lobby", "leave-horse"]) {
    assert(html.includes(`data-intent="${intent}"`), `the card must offer ${intent}`);
  }
  assert(!html.includes("horseNewMatch"), "the HUD's dead rematch button must stay gone");
  assert(!source.includes("horseNewMatch"), "and nothing may still reach for it");

  // GATED ON THE BALL. `syncPanels` runs the instant a shot resolves, and the
  // shot that spells the last letter is the one shot of the match worth
  // watching — a card thrown up over it would hide it.
  const card = source.slice(source.indexOf("function syncResults()"));
  assert(/match\?\.status !== "won" \|\| flight/.test(card), "the card must wait for the ball to be handed back");
  assert(source.includes("hideResults();"), "a new match must put the card away");
});

test("each HORSE turn has a ball picker, and the losing player gets the word popup first", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  const source = fs.readFileSync(path.join(gameRoot, "scripts", "horse-game.js"), "utf8");
  const css = fs.readFileSync(path.join(gameRoot, "styles", "game.css"), "utf8");

  assert(html.includes('id="horseBallChoices"'), "the turn needs a ball picker");
  assert(source.includes("createTurnBallPicker"), "HORSE must build the shared picker");
  assert(/ballId:\s*selectedBallId/.test(source), "the selected ball must be frozen onto the flight");

  assert(html.includes('id="horseLoserPopup"'), "the court needs the loser's popup");
  assert(html.includes('id="horseLoserPopupText"'), "the popup text must carry the chosen word");
  assert(source.includes('`YOU ARE A ${match.word}!`'), "the popup must use the actual game word");
  assert(/@keyframes horse-loser-pop/.test(css), "the popup needs its fade/grow/fade animation");
  assert(/opacity:\s*0[\s\S]*opacity:\s*1[\s\S]*opacity:\s*0/.test(css.slice(css.indexOf("@keyframes horse-loser-pop"))),
    "the popup must fade in and back out");
});

test("the ball is a phase-two control and is put away while the bin is being placed", () => {
  // A HORSE turn is arrange-a-target then take-a-shot. The picker used to sit
  // under the placement panel through both, which put two unrelated decisions
  // in one panel and made the court pay 112px of chrome for a control the
  // player could not usefully act on yet.
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  const source = fs.readFileSync(path.join(gameRoot, "scripts", "horse-game.js"), "utf8");
  const css = fs.readFileSync(path.join(gameRoot, "styles", "game.css"), "utf8");

  assert(html.includes('id="horseBallPanel"'), "the picker needs a panel the court can hide");
  assert(/el\.ballPanel\.hidden = isPlacing\(\)/.test(source), "the picker must be hidden for the placing phase");
  // `.turn-ball-picker` is `display: grid`, which beats the UA stylesheet's
  // `[hidden] { display: none }` — without this rule the hide above is a
  // property nobody reads and the picker stays on screen.
  assert(/\.turn-ball-picker\[hidden\]\s*\{\s*display:\s*none/.test(css),
    "hidden must actually hide a display:grid picker");

  // The reservation has to come down with it, or the court pays for a panel
  // that is not on screen — which is the whole reason `is-placing` exists.
  const aiming = Number(/#horseScreen \.court \{ --chrome: (\d+)px; \}/.exec(css)[1]);
  const placing = Number(/#horseScreen \.court\.is-placing \{ --chrome: (\d+)px; \}/.exec(css)[1]);
  assert(placing < aiming + 112, `placing chrome (${placing}px) still reserves the hidden ball picker`);
});

test("the HORSE placement panel exposes the lab tool tray and saved-shot bank", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  for (const id of [
    "horseSavedShots", "horseUseSavedShot", "horseAddBoard", "horseAddSpring",
    "horseAddCannon", "horseToolInspector", "horseToolDepth", "horseToolDirection",
  ]) {
    assert(html.includes(`id="${id}"`), `HORSE is missing ${id}`);
  }
});

test("a matcher inherits the exact ball used to set the standing shot", () => {
  const match = {
    phase: PHASE_MATCH,
    turn: 1,
    standingShot: { x: 0, y: 0.36, z: 0.6, motionId: "carousel", ballId: "bowling-ball" },
  };
  assertEqual(
    horseTurnBallId(match, ["paper", "snowball"]),
    "bowling-ball",
    "the responding player's own last choice replaced the setter's ball",
  );
});

test("the loser popup plays before the results card, then yields to it", () => {
  const view = harness({ mode: "local" });
  view.horse.enter({ mode: "local", word: "P" });
  view.horse.placeTarget({ x: 0, y: 0.36, z: 0.87, motionId: "still" });
  view.horse.setShot();

  // Make this the last owed shot. A weak pull at the far bin misses, giving the
  // shooter the one-letter word and making Player 2 the winner.
  view.horse.match.phase = PHASE_MATCH;
  view.horse.match.setter = 1;
  view.horse.match.standingShot = { ...view.horse.setup };
  shoot(view, 40);
  assert(settle(view.horse) >= 0, "the losing shot never resolved");
  assertEqual(view.horse.match.status, "won");

  const popup = view.elements.get("#horseLoserPopup");
  const popupText = view.elements.get("#horseLoserPopupText");
  const results = view.elements.get("#horseResultsOverlay");
  assertEqual(popupText.textContent, "YOU ARE A P!");
  assert(popup.classList.contains("is-shown"), "the loser popup did not start");
  assert(!results.classList.contains("is-shown"), "the result card covered the popup");

  for (let tick = 0; tick < 310; tick += 1) view.horse.tick();
  assert(!popup.classList.contains("is-shown"), "the loser popup did not fade away");
  assert(results.classList.contains("is-shown"), "the result card did not follow the popup");
});

finish();
