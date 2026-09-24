import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createMatchEndView } from "../src/ui/match-end.js";

test("offline match end offers an immediate rematch as the primary action", () => {
  assert.deepEqual(createMatchEndView("cpu", "Nova"), {
    eyebrow: "Match complete",
    title: "Nova wins",
    primaryLabel: "Play Again",
    primaryAction: "rematch",
  });
});

test("online match end offers another opponent without calling it an exit", () => {
  assert.deepEqual(createMatchEndView("online", "Nova"), {
    eyebrow: "Match complete",
    title: "Nova wins",
    primaryLabel: "Find Another Match",
    primaryAction: "find-another-match",
  });
});

test("production markup has match-end actions and no visible debug button", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /data-match-end/);
  assert.match(html, /data-action="match-end-primary"/);
  assert.match(html, /data-action="match-end-menu"/);
  assert.match(html, /data-hud="speed"/);
  assert.doesNotMatch(html, /data-action="toggle-debug"/);
});
