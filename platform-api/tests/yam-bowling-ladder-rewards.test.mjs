import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  entitlementRewardsBetween,
  getProgression,
  inventoryRewardsBetween,
  xpForLevel,
} from "../src/services/progression-catalog.mjs";
import {
  validateYamBowlingPublicClaim,
  validateYamBowlingSkinVoucherTarget,
} from "../src/services/yam-bowling-reward-catalog.mjs";
import { normalizeYamBowlingGarage } from "../src/services/yam-bowling-loadout-catalog.mjs";

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

// A level-earned cosmetic is a durable entitlement for the same reason a
// voucher is a durable inventory row: the garage validator trusts
// game_entitlements and nothing else, so a reward that mints no row can be
// equipped on the device and then stripped on save.
test("crossing a player level grants that level's cosmetic entitlement", () => {
  const definition = getProgression("yam-bowling");
  const at = (level) => xpForLevel(definition.curves.player, level);

  assert.deepEqual(entitlementRewardsBetween(definition, "player", at(1), at(2)), [
    { level: 2, entitlementId: "ball-trail:lime-shock", kind: "ball-trail" },
  ]);
  assert.deepEqual(
    entitlementRewardsBetween(definition, "player", at(1), at(3)).map((entry) => entry.entitlementId),
    ["ball-trail:lime-shock", "strike-burst:gold-star"],
  );
  assert.deepEqual(entitlementRewardsBetween(definition, "player", at(3), at(3)), []);
});

test("crossing a bowler mastery level grants that level's cosmetic entitlement", () => {
  const definition = getProgression("yam-bowling");
  const at = (level) => xpForLevel(definition.curves.track, level);

  assert.deepEqual(entitlementRewardsBetween(definition, "track", at(12), at(13)), [
    { level: 13, entitlementId: "badge:laser-focus", kind: "badge" },
  ]);
  assert.deepEqual(
    entitlementRewardsBetween(definition, "track", at(1), at(30)).map((entry) => entry.entitlementId),
    [
      "ball-trail:red-neon", "strike-burst:ember", "ball-trail:orange-flare",
      "ball-trail:sky-blue", "badge:laser-focus", "ball-trail:gold-rush",
      "title:pin-chaser", "badge:precision-bowler", "ball-trail:diamond-white",
      "badge:lane-legend",
    ],
  );
});

// The two ladders are scored on different curves, so reading one with the
// other's curve would pay out at the wrong level rather than failing loudly.
test("each ladder is measured on its own curve", () => {
  const definition = getProgression("yam-bowling");
  assert.notEqual(definition.curves.player.base, definition.curves.track.base);

  const trackXpForLevel13 = xpForLevel(definition.curves.track, 13);
  assert.deepEqual(entitlementRewardsBetween(definition, "track", 0, trackXpForLevel13).at(-1), {
    level: 13,
    entitlementId: "badge:laser-focus",
    kind: "badge",
  });
  // The same XP is a lower player level, so it must not pay the level-13 node.
  assert.ok(
    entitlementRewardsBetween(definition, "player", 0, trackXpForLevel13)
      .every((entry) => entry.level < 13),
  );
});

test("an unknown ladder scope pays nothing rather than defaulting to a ladder", () => {
  const definition = getProgression("yam-bowling");
  assert.deepEqual(entitlementRewardsBetween(definition, "bowler", 0, 999999), []);
  assert.deepEqual(entitlementRewardsBetween(null, "player", 0, 999999), []);
});

// The end of the defect this milestone opened with: a reward the ladders can
// grant has to be a reward the garage validator will keep. The two registries
// are separate files by design, so nothing but a test stops them drifting.
test("every level-granted cosmetic survives a save once its entitlement exists", () => {
  const definition = getProgression("yam-bowling");
  const slotForKind = {
    "ball-trail": "ballTrail",
    "strike-burst": "strikeBurst",
    title: "title",
    badge: "badge",
  };
  const rewards = [
    ...definition.levelEntitlements.player,
    ...definition.levelEntitlements.track,
  ];
  assert.ok(rewards.length >= 30, "both ladders contribute");

  for (const reward of rewards) {
    const slotName = slotForKind[reward.kind];
    assert.ok(slotName, `unmapped reward kind ${reward.kind}`);

    const saved = normalizeYamBowlingGarage(
      { version: 1, global: { [slotName]: reward.entitlementId } },
      { ownedEntitlementIds: new Set([reward.entitlementId]) },
    );
    assert.equal(
      saved.global[slotName],
      reward.entitlementId,
      `${reward.entitlementId} is granted at level ${reward.level} but stripped on save`,
    );
  }
});

test("a level cosmetic is still stripped for a player who has not earned it", () => {
  const saved = normalizeYamBowlingGarage(
    { version: 1, global: { badge: "badge:lane-legend" } },
    { ownedEntitlementIds: new Set() },
  );
  assert.equal(saved.global.badge, undefined);
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

test("the level-entitlement migration backfills every node on both ladders", async () => {
  const definition = getProgression("yam-bowling");
  const sql = await readFile(
    new URL("../src/db/migrations/041-yam-bowling-level-entitlements.sql", import.meta.url),
    "utf8",
  );

  // A node added to a ladder without a backfill leaves existing accounts owing
  // a reward they have already earned, which is the failure 040 exists to avoid.
  for (const reward of [...definition.levelEntitlements.player, ...definition.levelEntitlements.track]) {
    assert.ok(
      sql.includes(`'${reward.entitlementId}'`),
      `${reward.entitlementId} is granted at level ${reward.level} but never backfilled`,
    );
  }

  // The player ladder reads the account total; the bowler ladder reads the best
  // single track, since its bound rewards are global and earned with any bowler.
  assert.match(sql, /from game_xp_profiles/);
  assert.match(sql, /max\(xp\)[\s\S]*from game_xp_tracks/);
  assert.match(sql, /on conflict \(player_id, game_slug, entitlement_id\) do nothing/);

  // Thresholds are literals so the migration keeps its meaning after a retune;
  // spot-check two against the curves they were derived from today.
  assert.ok(sql.includes(`${xpForLevel(definition.curves.player, 2)}`), "player level 2");
  assert.ok(sql.includes(`${xpForLevel(definition.curves.track, 13)}`), "bowler level 13");
});

test("the voucher migration backfills existing level 10 and 25 players", async () => {
  const sql = await readFile(new URL("../src/db/migrations/040-yam-bowling-skin-vouchers.sql", import.meta.url), "utf8");
  assert.match(sql, /xp\s*>=\s*9000/i);
  assert.match(sql, /xp\s*>=\s*51000/i);
  assert.match(sql, /skin-voucher/i);
});
