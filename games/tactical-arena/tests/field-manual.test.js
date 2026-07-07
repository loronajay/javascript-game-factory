import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const INDEX_HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("the Field Manual includes a synergy tips tab with exploratory guidance", () => {
  assert.match(INDEX_HTML, /data-tab="synergy"[^>]*>Synergy Tips</);
  assert.match(INDEX_HTML, /data-panel="synergy"/);
  assert.match(INDEX_HTML, /Count the support turn/);
  assert.match(INDEX_HTML, /Try Father Time with Sniper or Angel as a super carry/);
  assert.doesNotMatch(INDEX_HTML, /Pick this team/i);
});
