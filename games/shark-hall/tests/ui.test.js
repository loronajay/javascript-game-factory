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

finish();
