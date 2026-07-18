import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const featuresCss = readFileSync(new URL("../styles/screens/features.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = featuresCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

test("skin pack detail tiles keep fixed rows instead of stretching with the viewer", () => {
  const contentsRule = ruleBody(".shop-pack-contents");
  const tileRule = ruleBody(".shop-pack-skin");

  assert.match(contentsRule, /grid-auto-rows\s*:\s*6\.85rem/);
  assert.match(contentsRule, /align-content\s*:\s*start/);
  assert.match(tileRule, /height\s*:\s*6\.85rem/);
  assert.match(tileRule, /grid-template-rows\s*:\s*3\.9rem auto auto/);
});

test("shop purchase controls keep Valor prices readable on cramped mobile layouts", () => {
  const buyRule = ruleBody(".shop-buy-btn");
  const priceRule = ruleBody(".shop-buy-btn .shop-price");
  const amountRule = ruleBody(".shop-buy-btn .valor-amount");

  assert.match(buyRule, /line-height\s*:\s*1\.05/);
  assert.match(buyRule, /overflow-wrap\s*:\s*anywhere/);
  assert.match(priceRule, /white-space\s*:\s*normal/);
  assert.match(priceRule, /overflow\s*:\s*visible/);
  assert.match(amountRule, /overflow\s*:\s*visible/);
  assert.match(amountRule, /text-overflow\s*:\s*clip/);
});
