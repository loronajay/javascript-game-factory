import test from "node:test";
import assert from "node:assert/strict";

import { MATCH_TYPES, normalizeMatchType, matchTypeConfigFor, isDraftMatchType } from "../src/ui/onlineMatchTypes.js";

test("normalizeMatchType keeps known types and falls back to duel", () => {
  assert.equal(normalizeMatchType("teams4"), "teams4");
  assert.equal(normalizeMatchType("draft1v1"), "draft1v1");
  assert.equal(normalizeMatchType("bogus"), "duel");
  assert.equal(normalizeMatchType(undefined), "duel");
});

test("matchTypeConfigFor returns the format/count/label for each type", () => {
  assert.equal(matchTypeConfigFor("teams4").format, "teams");
  assert.equal(matchTypeConfigFor("teams4").maxPlayers, 4);
  assert.equal(matchTypeConfigFor("teams4").label, "2v2 Teams");
  assert.equal(matchTypeConfigFor("duel").maxPlayers, 2);
  // Unknown types resolve to duel's config.
  assert.equal(matchTypeConfigFor("bogus"), MATCH_TYPES.duel);
});

test("isDraftMatchType is true only for the draft format", () => {
  assert.equal(isDraftMatchType("draft1v1"), true);
  assert.equal(isDraftMatchType("duel"), false);
  assert.equal(isDraftMatchType("ffa4"), false);
  assert.equal(isDraftMatchType("teams4"), false);
});
