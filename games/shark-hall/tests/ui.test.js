// The pure parts of the interface: screen navigation and settings normalization.
//
// Neither touches an element, which is the reason both were split out of the
// files that do. Rendering is not tested (repo rule); the RULES behind the
// rendering are.

import { assert, assertEqual, finish, suite, test } from "./harness.js";
import {
  LAYER_MENU,
  LAYER_PAUSE,
  LAYER_RESULT,
  LAYER_TABLE,
  PANEL_MAIN,
  PANEL_RULES,
  PANEL_SETTINGS,
  backTarget,
  escapeTarget,
  normalizeLayer,
  normalizePanel,
} from "../scripts/ui/screens.js";
import { createFullscreen, fullscreenLabel } from "../scripts/ui/fullscreen.js";
import { CAMERA_MODES, DEFAULT_SETTINGS, GUIDE_MODES, normalizeSettings } from "../scripts/store/settings.js";
import { DIFFICULTIES } from "../scripts/sim/cpu.js";

suite("ui — screens and settings");

// --- navigation ------------------------------------------------------------

test("back from a front-door panel returns to the main menu", () => {
  const target = backTarget(LAYER_MENU);
  assertEqual(target.layer, LAYER_MENU);
  assertEqual(target.panel, PANEL_MAIN);
});

test("back from settings reached mid-rack returns to the pause modal", () => {
  // The rule this whole module exists for: a player who opened settings from a
  // paused match is not trying to abandon it.
  const target = backTarget(LAYER_PAUSE);
  assertEqual(target.layer, LAYER_PAUSE, "back must not strand a live rack on the main menu");
});

test("escape pauses a live table and resumes a paused one", () => {
  assertEqual(escapeTarget(LAYER_TABLE, { started: true, paused: false }), LAYER_PAUSE);
  assertEqual(escapeTarget(LAYER_PAUSE, { started: true, paused: true }), LAYER_TABLE);
});

test("escape does nothing on the result screen", () => {
  assertEqual(escapeTarget(LAYER_RESULT, { started: true, paused: true }), null, "a finished rack needs a decision, not a dismissal");
});

test("escape does nothing at the front door before a match", () => {
  assertEqual(escapeTarget(LAYER_MENU, { started: false, paused: true }), null);
});

test("escape from the front door returns to a match that is waiting", () => {
  assertEqual(escapeTarget(LAYER_MENU, { started: true, paused: true }), LAYER_PAUSE);
});

test("the rules panel is a real panel, reachable from both sides", () => {
  // It is opened from the front door AND from a paused rack. If it ever fell out
  // of PANELS it would normalize to main and the button would silently do
  // nothing, which is exactly the failure that is hard to see from the markup.
  assertEqual(normalizePanel(PANEL_RULES), PANEL_RULES);
  assertEqual(backTarget(LAYER_PAUSE).layer, LAYER_PAUSE, "rules read mid-rack must go back to the match");
});

test("unknown layers and panels resolve to something real", () => {
  assertEqual(normalizeLayer("nonsense"), LAYER_MENU, "an unknown layer must never mean a blank screen");
  assertEqual(normalizeLayer(undefined), LAYER_MENU);
  assertEqual(normalizePanel("nonsense"), PANEL_MAIN);
  assertEqual(normalizePanel(PANEL_SETTINGS), PANEL_SETTINGS);
});

// --- settings --------------------------------------------------------------

test("stored settings are normalized, never trusted", () => {
  const settings = normalizeSettings({ guide: "hologram", camera: 12, difficulty: "godlike", muted: "yes" });
  assert(GUIDE_MODES.includes(settings.guide), "a guide mode from an older build must not survive");
  assert(CAMERA_MODES.includes(settings.camera));
  assert(DIFFICULTIES.some((rung) => rung.id === settings.difficulty));
  assertEqual(settings.muted, true, "muted is coerced to a real boolean");
});

test("garbage in gives the defaults, not a partial object", () => {
  for (const input of [null, undefined, 42, "settings", []]) {
    const settings = normalizeSettings(input);
    assertEqual(settings.guide, DEFAULT_SETTINGS.guide);
    assertEqual(settings.camera, DEFAULT_SETTINGS.camera);
    assertEqual(settings.difficulty, DEFAULT_SETTINGS.difficulty);
    assertEqual(typeof settings.muted, "boolean");
  }
});

test("a valid setting survives normalization untouched", () => {
  const settings = normalizeSettings({ guide: "off", camera: "over", difficulty: "sharp", muted: true });
  assertEqual(settings.guide, "off");
  assertEqual(settings.camera, "over");
  assertEqual(settings.difficulty, "sharp");
  assertEqual(settings.muted, true);
});

test("the default settings are themselves valid", () => {
  const normalized = normalizeSettings(DEFAULT_SETTINGS);
  assertEqual(JSON.stringify(normalized), JSON.stringify(DEFAULT_SETTINGS), "the defaults must survive their own validator");
});

// --- fullscreen ------------------------------------------------------------

/** A document with just enough of the Fullscreen API to be asked. */
function fakeDocument({ supported = true, refuse = false } = {}) {
  const classes = new Set();
  const listeners = new Map();
  const doc = {
    fullscreenElement: null,
    body: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } },
    documentElement: {},
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    classes,
    /** The browser leaving fullscreen on its own — Escape, or a tab switch. */
    browserExits() {
      doc.fullscreenElement = null;
      listeners.get("fullscreenchange")?.();
    },
  };
  if (supported) {
    doc.documentElement.requestFullscreen = async () => {
      if (refuse) throw new Error("denied");
      doc.fullscreenElement = doc.documentElement;
    };
    doc.exitFullscreen = async () => {
      doc.fullscreenElement = null;
    };
  }
  return doc;
}

test("the fullscreen button reads the state it will change to", () => {
  assertEqual(fullscreenLabel(false), "Fullscreen");
  assertEqual(fullscreenLabel(true), "Exit fullscreen");
});

test("fullscreen goes through the document and lays the cabinet out with one class", async () => {
  const doc = fakeDocument();
  const seen = [];
  const fullscreen = createFullscreen({ doc, onChange: (active) => seen.push(active) });
  await fullscreen.toggle();
  assertEqual(doc.fullscreenElement, doc.documentElement, "the DOCUMENT goes fullscreen, so the modals outside #app stay visible");
  assert(doc.classes.has("fullscreen"));
  await fullscreen.toggle();
  assertEqual(doc.fullscreenElement, null);
  assert(!doc.classes.has("fullscreen"));
  assertEqual(seen.join(","), "true,false");
});

test("the class follows the document when the browser leaves fullscreen on its own", async () => {
  const doc = fakeDocument();
  const fullscreen = createFullscreen({ doc });
  await fullscreen.enter();
  doc.browserExits();
  assertEqual(fullscreen.isActive(), false, "Escape left fullscreen; the button must not say otherwise");
  assert(!doc.classes.has("fullscreen"));
});

test("without the API, or when it says no, the same class pins the cabinet to the viewport", async () => {
  for (const doc of [fakeDocument({ supported: false }), fakeDocument({ refuse: true })]) {
    const fullscreen = createFullscreen({ doc });
    await fullscreen.toggle();
    assertEqual(fullscreen.isActive(), true, "an iPhone still gets a fullscreen table");
    assert(doc.classes.has("fullscreen"));
    await fullscreen.toggle();
    assertEqual(fullscreen.isActive(), false);
    assert(!doc.classes.has("fullscreen"));
  }
});

finish();
