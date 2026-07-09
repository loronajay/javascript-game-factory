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
