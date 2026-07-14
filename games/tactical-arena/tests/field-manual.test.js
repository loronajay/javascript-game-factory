import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FIELD_MANUAL_HTML = readFileSync(new URL("../html/field-manual.html", import.meta.url), "utf8");

// Return the inner HTML of a single <div class="ref-panel" data-panel="NAME"> block,
// so a test can assert what a specific tab does — and does not — contain.
function panelHtml(name) {
  const start = FIELD_MANUAL_HTML.indexOf(`data-panel="${name}"`);
  assert.notEqual(start, -1, `panel "${name}" should exist`);
  const rest = FIELD_MANUAL_HTML.slice(start);
  const next = rest.indexOf('data-panel="', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

test("the Field Manual includes a synergy tips tab with exploratory guidance", () => {
  assert.match(FIELD_MANUAL_HTML, /data-tab="synergy"[^>]*>Synergy Tips</);
  assert.match(FIELD_MANUAL_HTML, /data-panel="synergy"/);
  assert.match(FIELD_MANUAL_HTML, /Count the support turn/);
  assert.match(FIELD_MANUAL_HTML, /Try Father Time with Sniper or Angel as a super carry/);
  assert.doesNotMatch(FIELD_MANUAL_HTML, /Pick this team/i);
});

test("the Field Manual exposes the five expected tabs in order", () => {
  const tabs = [...FIELD_MANUAL_HTML.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ["basics", "systems", "codex", "advanced", "synergy"]);
  // main.js opens the manual by these ids; keep them stable.
  assert.match(FIELD_MANUAL_HTML, /data-panel="basics"/);
  assert.match(FIELD_MANUAL_HTML, /data-panel="systems"/);
});

test("the Systems tab documents the cross-unit board mechanics", () => {
  const systems = panelHtml("systems");
  for (const topic of [/Status effects/, /True damage/i, /Auras/, /Summoned units/, /Weather/, /Board polarity/]) {
    assert.match(systems, topic);
  }
});

test("Basics stays scoped to the turn ruleset, not board/piece mechanics", () => {
  const basics = panelHtml("basics");
  // These belong in Systems now; a regression that pushes them back into Basics
  // (the original scope creep) should fail here.
  assert.doesNotMatch(basics, /Summoned units/);
  assert.doesNotMatch(basics, /always-on\s+<strong>aura/);
  assert.doesNotMatch(basics, /non-combatant commanders/i);
});

test("Advanced carries tactics without hard-coded balance numbers", () => {
  const advanced = panelHtml("advanced");
  // The old copy pinned specific durations/values ("last 1 turn", "2 true damage")
  // that rot when a unit is retuned. Keep tactics general.
  assert.doesNotMatch(advanced, /last 1 turn/i);
  assert.doesNotMatch(advanced, /2 true damage/i);
  assert.match(advanced, /Kill before spreading/);
});
