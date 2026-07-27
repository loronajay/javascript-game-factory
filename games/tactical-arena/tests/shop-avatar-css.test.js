import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The Avatars shop tab shipped as a renderer with no stylesheet rules, which is not a
// visible-in-tests failure: every element was created, so the DOM assertions passed while
// the tab rendered as bare text rows. `.ranked-avatar-icon` carries no intrinsic size — each
// consumer gives it a box — so the icon collapsed to zero height and the sprite expanded to
// 108% of the card. These assertions pin the pieces that were missing.

const featuresCss = readFileSync(new URL("../styles/screens/features.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = featuresCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

test("the shop avatar icon is given an explicit box", () => {
  const rule = ruleBody(".ranked-avatar-icon.is-shop-avatar");
  assert.match(rule, /width\s*:/, "an unsized .ranked-avatar-icon collapses to zero height");
  assert.match(rule, /height\s*:/);
});

test("the shop avatar variant fits its sprite like every other avatar surface", () => {
  // Missing from this list, the sprite falls back to --avatar-sprite-width:108% and
  // overflows its card instead of fitting inside it.
  assert.match(
    featuresCss,
    /\.ranked-avatar-icon:is\([^)]*\.is-shop-avatar[^)]*\)\s*\{[^}]*--avatar-sprite-height/,
    "is-shop-avatar must be in the sprite-fitting :is() list",
  );
});

test("the avatar grid tiles into columns instead of one row per avatar", () => {
  assert.match(ruleBody(".shop-avatar-grid"), /grid-template-columns\s*:\s*repeat\(/);
});

test("the avatar card lays out its icon, copy, and buy button", () => {
  assert.match(ruleBody(".shop-avatar"), /grid-template-columns\s*:/);
  // Avatars are Valor-only, so the single button spans the card rather than sitting in a
  // premium+Valor pair like the other offer kinds.
  assert.match(ruleBody(".shop-avatar-purchase-actions"), /grid-column\s*:\s*1\s*\/\s*-1/);
});
