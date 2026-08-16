import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getProgression,
  inventoryRewardsBetween,
  xpForLevel,
} from "../src/services/progression-catalog.mjs";
import {
  validateYamBowlingPublicClaim,
  validateYamBowlingSkinVoucherTarget,
} from "../src/services/yam-bowling-reward-catalog.mjs";

test("Yam Bowling awards one skin voucher at player levels 10 and 25", () => {
  const definition = getProgression("yam-bowling");
  assert.ok(definition);

  assert.deepEqual(
    inventoryRewardsBetween(definition, xpForLevel(definition.curves.player, 9), xpForLevel(definition.curves.player, 10)),
    [{ itemId: "skin-voucher", quantity: 1, level: 10 }],
  );
  assert.deepEqual(
    inventoryRewardsBetween(definition, xpForLevel(definition.curves.player, 9), xpForLevel(definition.curves.player, 25)),
    [
      { itemId: "skin-voucher", quantity: 1, level: 10 },
      { itemId: "skin-voucher", quantity: 1, level: 25 },
    ],
  );
  assert.deepEqual(
    inventoryRewardsBetween(definition, xpForLevel(definition.curves.player, 25), xpForLevel(definition.curves.player, 26)),
    [],
  );
});

test("fixed match-achievement claims grant only the catalogued cosmetic", () => {
  const verdict = validateYamBowlingPublicClaim({
    playerId: "player-1",
    gameSlug: "yam-bowling",
    kind: "match-achievement",
    claimId: "match-achievement:perfect-game",
    sourceId: "perfect-game",
    payload: { achievementId: "perfect-game", entitlementId: "title:forged" },
  });

  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.entitlementGrants, [{ entitlementId: "badge:perfect-game", kind: "badge" }]);
  assert.equal(validateYamBowlingPublicClaim({
    gameSlug: "yam-bowling",
    kind: "match-achievement",
    claimId: "match-achievement:invented",
    sourceId: "invented",
    payload: { achievementId: "invented" },
  }).ok, false);
});

test("promotion clears grant a fixed room pair and the circuit summit grants its penthouse", () => {
  const local = validateYamBowlingPublicClaim({
    gameSlug: "yam-bowling",
    kind: "circuit-clear",
    claimId: "circuit-clear:local-talia-dodson",
    sourceId: "local-talia-dodson",
    payload: { matchId: "local-talia-dodson", activeBowlerSlug: "daisy-monroe" },
  });
  assert.deepEqual(local.entitlementGrants.slice(1), [
    { entitlementId: "room:teal-lounge", kind: "room" },
    { entitlementId: "room:hot-pink-hideout", kind: "room" },
  ]);

  const summit = validateYamBowlingPublicClaim({
    gameSlug: "yam-bowling",
    kind: "circuit-clear",
    claimId: "circuit-clear:championship-reina-sato",
    sourceId: "championship-reina-sato",
    payload: { matchId: "championship-reina-sato", activeBowlerSlug: "daisy-monroe" },
  });
  assert.deepEqual(summit.entitlementGrants.slice(1).map((entry) => entry.entitlementId), [
    "room:black-gothic", "room:circuit-red", "room:tower-penthouse",
  ]);
});

test("voucher targets are restricted to alternate skins on canonical bowlers", () => {
  assert.deepEqual(validateYamBowlingSkinVoucherTarget("yam-bowling", "skin:daisy-monroe:maid"), {
    entitlementId: "skin:daisy-monroe:maid",
    bowlerSlug: "daisy-monroe",
    skinId: "maid",
  });
  assert.equal(validateYamBowlingSkinVoucherTarget("yam-bowling", "skin:daisy-monroe:canon"), null);
  assert.equal(validateYamBowlingSkinVoucherTarget("yam-bowling", "skin:not-a-bowler:maid"), null);
  assert.equal(validateYamBowlingSkinVoucherTarget("another-game", "skin:daisy-monroe:maid"), null);
});

test("the voucher migration backfills existing level 10 and 25 players", async () => {
  const sql = await readFile(new URL("../src/db/migrations/040-yam-bowling-skin-vouchers.sql", import.meta.url), "utf8");
  assert.match(sql, /xp\s*>=\s*9000/i);
  assert.match(sql, /xp\s*>=\s*51000/i);
  assert.match(sql, /skin-voucher/i);
});
