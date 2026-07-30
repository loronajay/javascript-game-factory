import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menusCss = readFileSync(new URL("../styles/screens/campaign.css", import.meta.url), "utf8");

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
  assert.match(canvasRule, /campaign-map\.webp/);
});

test("empty campaign squad slots show the full choose-unit prompt", () => {
  const squadRule = ruleBody(".campaign-squad");
  const emptyPromptRule = ruleBody(".campaign-squad-slot.is-empty .campaign-squad-slot-main i");

  assert.match(squadRule, /minmax\(min\(100%,10\.5rem\),1fr\)/);
  assert.match(emptyPromptRule, /text-overflow\s*:\s*clip/);
  assert.match(emptyPromptRule, /white-space\s*:\s*normal/);
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

test("the node the player is reading stacks above its neighbours", () => {
  const baseZ = Number(ruleBody(".campaign-node").match(/z-index\s*:\s*(\d+)/)?.[1]);
  const selectedZ = Number(ruleBody(".campaign-node.is-selected").match(/z-index\s*:\s*(\d+)/)?.[1]);
  const hoverZ = Number(ruleBody(".campaign-node:hover:not(:disabled)").match(/z-index\s*:\s*(\d+)/)?.[1]);

  // Nodes overlap on the painted map and the name label hangs below the circle, so a
  // resting neighbour must never clip the selected mission's label.
  assert.ok(selectedZ > baseZ, "selected nodes must sit above resting ones");
  assert.ok(hoverZ >= selectedZ, "hover must not drop behind the selection");
});

test("touch devices get smaller campaign nodes but keep the 44px tap floor", () => {
  const coarse = menusCss.match(/@media \(pointer: coarse\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const restingSize = Number(ruleBody(".campaign-node").match(/width\s*:\s*([\d.]+)rem/)?.[1]);
  const touchSize = Number(coarse.match(/\.campaign-node \{[^}]*width\s*:\s*([\d.]+)rem/)?.[1]);

  assert.ok(touchSize < restingSize, "the map is cramped on touch; nodes must shrink");
  // responsive/touch.css floors every button at 44px — 2.75rem at the 16px root is
  // exactly that, so going smaller would silently be ignored anyway.
  assert.ok(touchSize * 16 >= 44, "nodes must stay at or above the coarse-pointer tap floor");
  // The old max-width rule grew nodes instead; leaving it would win by source order.
  assert.doesNotMatch(
    menusCss.match(/@media \(max-width:760px\) \{([\s\S]*?)\n\}/)?.[1] ?? "",
    /\.campaign-node \{/,
  );
});

test("formation editor buttons stay fixed and use tap-friendly click input", () => {
  const modalHoverRule = ruleBody(".draft-formation-modal button:hover:not(:disabled)");
  const slotRule = ruleBody(".draft-formation-slot");

  assert.match(modalHoverRule, /transform\s*:\s*none/);
  assert.match(slotRule, /touch-action\s*:\s*manipulation/);
  assert.match(slotRule, /transform\s*:\s*translate\(-50%,\s*-63%\)\s*!important/);
  assert.doesNotMatch(menusCss, /\.draft-formation-slot\.is-dragging/);
});
