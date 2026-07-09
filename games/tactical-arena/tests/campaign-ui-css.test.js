import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menusCss = readFileSync(new URL("../menus.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = menusCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

test("campaign node hover preserves map anchoring instead of inheriting generic button lift", () => {
  const hoverRule = ruleBody(".campaign-node:hover:not(:disabled)");

  assert.match(hoverRule, /transform\s*:/);
  assert.match(hoverRule, /translate\(-50%,\s*calc\(-50% \+ var\(--node-lift\)\)\)/);
});

test("campaign map uses the painted image and hides scrollbars for drag panning", () => {
  const mapRule = ruleBody(".campaign-map");
  const canvasRule = ruleBody(".campaign-map-canvas");

  assert.match(mapRule, /cursor\s*:\s*grab/);
  assert.match(mapRule, /scrollbar-width\s*:\s*none/);
  assert.match(mapRule, /overflow\s*:\s*hidden/);
  assert.match(canvasRule, /campaign-map\.png/);
});

test("campaign locked nodes defer to the painted map instead of drawing token clutter", () => {
  const lockedRule = ruleBody(".campaign-node.is-locked");
  const lockedChildrenRule = ruleBody(".campaign-node.is-locked > *");
  const panelRule = ruleBody(".campaign-panel");

  assert.match(lockedRule, /background\s*:\s*transparent/);
  assert.match(lockedRule, /pointer-events\s*:\s*none/);
  assert.match(lockedChildrenRule, /display\s*:\s*none/);
  assert.match(panelRule, /grid-template-rows\s*:\s*auto auto auto/);
});
