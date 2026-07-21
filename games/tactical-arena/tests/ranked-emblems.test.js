import test from "node:test";
import assert from "node:assert/strict";

import {
  getRankedTierEmblemSrc,
  normalizeRankedTierId,
} from "../src/ui/rankedEmblems.js";

test("ranked tier emblems resolve to converted WebP assets", () => {
  assert.equal(getRankedTierEmblemSrc("bronze"), "./assets/ranked-emblems/bronze.webp");
  assert.equal(getRankedTierEmblemSrc("silver"), "./assets/ranked-emblems/silver.webp");
  assert.equal(getRankedTierEmblemSrc("gold"), "./assets/ranked-emblems/gold.webp");
  assert.equal(getRankedTierEmblemSrc("platinum"), "./assets/ranked-emblems/platinum.webp");
  assert.equal(getRankedTierEmblemSrc("diamond"), "./assets/ranked-emblems/diamond.webp");
  assert.equal(getRankedTierEmblemSrc("master"), "./assets/ranked-emblems/master.webp");
  assert.equal(getRankedTierEmblemSrc("grandmaster"), "./assets/ranked-emblems/grandmaster.webp");
});

test("ranked tier ids normalize safely for server variants", () => {
  assert.equal(normalizeRankedTierId({ id: "Grand Master" }), "grandmaster");
  assert.equal(normalizeRankedTierId({ id: "grand_master" }), "grandmaster");
  assert.equal(normalizeRankedTierId("GM"), "grandmaster");
  assert.equal(normalizeRankedTierId("unknown"), "bronze");
  assert.equal(normalizeRankedTierId(null), "bronze");
});
