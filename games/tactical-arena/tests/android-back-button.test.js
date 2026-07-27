import test from "node:test";
import assert from "node:assert/strict";

import { decideBackAction } from "../src/ui/androidBackButton.js";

test("an open overlay is closed before anything else", () => {
  // Even in a match, and even on the title screen, the overlay wins.
  assert.equal(decideBackAction({ modalOpen: true, activeScreen: "match" }), "closeModal");
  assert.equal(decideBackAction({ modalOpen: true, activeScreen: "title" }), "closeModal");
  assert.equal(decideBackAction({ modalOpen: true, activeScreen: "spSetup" }), "closeModal");
});

test("back never abandons a live match", () => {
  // A stray edge-swipe must not throw away a match in progress. Leaving is
  // deliberate, through the in-match Menu button.
  assert.equal(decideBackAction({ modalOpen: false, activeScreen: "match" }), "none");
});

test("title screen backs out of the app", () => {
  assert.equal(decideBackAction({ modalOpen: false, activeScreen: "title" }), "minimize");
});

test("main menu steps back to the title screen", () => {
  assert.equal(decideBackAction({ modalOpen: false, activeScreen: "mainMenu" }), "toTitle");
});

test("every other screen steps back to the main menu", () => {
  for (const screen of [
    "spSetup",
    "hsSetup",
    "onlineSetup",
    "tempoMenu",
    "tempoSpSetup",
    "tutorialSelect",
    "campaign",
    "results",
    "tutorialComplete",
  ]) {
    assert.equal(
      decideBackAction({ modalOpen: false, activeScreen: screen }),
      "toMainMenu",
      `wrong action for ${screen}`,
    );
  }
});

test("an unknown or missing screen does nothing rather than guessing", () => {
  assert.equal(decideBackAction({ modalOpen: false, activeScreen: "" }), "none");
  assert.equal(decideBackAction({ modalOpen: false, activeScreen: null }), "none");
  assert.equal(decideBackAction({}), "none");
  assert.equal(decideBackAction(), "none");
});
