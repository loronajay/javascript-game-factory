import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MatchInput } from "../src/controllers/match-input.mjs";
import { actionForGuard, guardBlendForElapsed, updateGuardState } from "../src/core/guard-state.mjs";

test("guard state toggles only when requested", () => {
  assert.equal(updateGuardState(false, false), false);
  assert.equal(updateGuardState(false, true), true);
  assert.equal(updateGuardState(true, true), false);
});

test("guard state selects the matching Maddie action", () => {
  assert.equal(actionForGuard(false), "idle");
  assert.equal(actionForGuard(true), "guard");
});

test("guard transitions crossfade briefly instead of popping", () => {
  assert.equal(guardBlendForElapsed(0), 0);
  assert.equal(guardBlendForElapsed(60), 0.5);
  assert.equal(guardBlendForElapsed(120), 1);
  assert.equal(guardBlendForElapsed(500), 1);
});

test("the match view exposes a guard button and keyboard hint", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /data-action=["']guard["']/i);
  assert.match(html, /<b>Guard:<\/b>\s*G/i);
  assert.match(html, /src=["']\.\/src\/match\.mjs\?v=4["']/i);
});

test("the match loader uses the consistency-locked guard revision", () => {
  const source = readFileSync(new URL("../src/data/maddie-assets.mjs", import.meta.url), "utf8");
  assert.match(source, /sprites\/guard-v3\//);
  assert.match(source, /guard-review-v3/);
});

test("G requests one toggle and ignores held-key repeats", () => {
  const listeners = new Map();
  globalThis.window = {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
  };
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
  };
  const controlsRoot = {
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
  const input = new MatchInput(canvas, controlsRoot);
  const keydown = listeners.get("keydown")[0];

  keydown({ code: "KeyG", repeat: false, preventDefault() {} });
  assert.equal(input.sample().guardToggleRequested, true);
  assert.equal(input.sample().guardToggleRequested, false);

  keydown({ code: "KeyG", repeat: true, preventDefault() {} });
  assert.equal(input.sample().guardToggleRequested, false);
});
