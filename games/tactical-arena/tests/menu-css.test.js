import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const polishCss = readFileSync(new URL("../styles/screens/polish.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = polishCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

test("main menu secondary actions keep long labels readable", () => {
  const rowRule = ruleBody(".menu-secondary-actions");
  const buttonRule = ruleBody(".menu-secondary-actions .menu-btn");

  assert.match(rowRule, /grid-template-columns\s*:\s*repeat\(auto-fit,\s*minmax\(6\.6rem,\s*1fr\)\)/);
  assert.match(buttonRule, /white-space\s*:\s*normal/);
  assert.match(buttonRule, /overflow-wrap\s*:\s*normal/);
  assert.doesNotMatch(buttonRule, /text-overflow\s*:\s*ellipsis/);
});
