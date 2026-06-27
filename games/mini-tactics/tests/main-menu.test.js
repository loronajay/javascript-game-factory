import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ARCADE_GRID_URL, goBackToArcade } from "../src/ui/screens/mainMenuScreen.js";

test("main menu exposes a Back to Arcade button", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(
    html,
    /<button\s+[^>]*data-action="backArcade"[^>]*class="menu-btn ghost"[^>]*>\s*Back to Arcade\s*<\/button>/,
  );
});

test("Back to Arcade routes to the arcade grid", () => {
  assert.equal(ARCADE_GRID_URL, "../../grid.html");

  let assigned = null;
  goBackToArcade({
    location: {
      assign(url) {
        assigned = url;
      },
    },
  });

  assert.equal(assigned, "../../grid.html");
});
