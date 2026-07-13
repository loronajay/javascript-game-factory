import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FIELD_MANUAL_HTML = readFileSync(new URL("../html/field-manual.html", import.meta.url), "utf8");

test("the Field Manual includes a synergy tips tab with exploratory guidance", () => {
  assert.match(FIELD_MANUAL_HTML, /data-tab="synergy"[^>]*>Synergy Tips</);
  assert.match(FIELD_MANUAL_HTML, /data-panel="synergy"/);
  assert.match(FIELD_MANUAL_HTML, /Count the support turn/);
  assert.match(FIELD_MANUAL_HTML, /Try Father Time with Sniper or Angel as a super carry/);
  assert.doesNotMatch(FIELD_MANUAL_HTML, /Pick this team/i);
});
