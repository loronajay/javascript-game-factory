const { test } = require("node:test");
const assert = require("node:assert/strict");

const playerRewards = require("./player-rewards-core.js");
const masteryRewards = require("./mastery-rewards-core.js");
const cosmetics = require("./cosmetics-core.js");

test("the player cadence gives every launch level a named reward and no stat", () => {
  assert.equal(playerRewards.REWARD_CADENCE.length, 30);
  assert.deepEqual(
    playerRewards.REWARD_CADENCE.map((node) => node.level),
    Array.from({ length: 30 }, (_, index) => index + 1),
  );

  for (const node of playerRewards.REWARD_CADENCE) {
    assert.ok(node.rewards.length > 0, `level ${node.level} needs a visible reward`);
    for (const reward of node.rewards) {
      assert.match(reward.label, /\S/);
      for (const banned of ["speed", "power", "accuracy", "pins", "score"]) {
        assert.equal(banned in reward, false, `level ${node.level} must stay cosmetic`);
      }
    }
  }
});

test("reward ids are player-scoped, stable, and leave room for levels 31 through 40", () => {
  const early = playerRewards.buildRewardTree({ currentLevel: 3 });
  const capped = playerRewards.buildRewardTree({ currentLevel: 30 });

  assert.deepEqual(
    early.nodes.flatMap((node) => node.rewards.map((reward) => reward.id)),
    capped.nodes.flatMap((node) => node.rewards.map((reward) => reward.id)),
    "reaching a level must not rename any reward",
  );
  for (const node of early.nodes) {
    for (const reward of node.rewards) {
      assert.match(reward.id, /^player:level-\d{2}:[a-z0-9-]+$/);
    }
  }
  assert.ok(early.nodes.every((node) => node.level <= 30));
});

test("skin vouchers are rare, sit at the approved levels, and are not cosmetics", () => {
  const vouchers = playerRewards.listRewards().filter((reward) => reward.family === "skin-voucher");

  assert.equal(vouchers.length, 2, "vouchers stay rare in the player tree");
  assert.deepEqual(playerRewards.SKIN_VOUCHER_LEVELS, [10, 25]);
  assert.deepEqual(vouchers.map((reward) => reward.level), [10, 25]);

  for (const reward of vouchers) {
    assert.equal(reward.equipment, null, "a voucher is spent, never worn");
  }
});

test("vouchersBetween counts only the levels a gain actually crossed", () => {
  assert.equal(playerRewards.vouchersBetween({ fromLevel: 1, toLevel: 9 }), 0);
  assert.equal(playerRewards.vouchersBetween({ fromLevel: 9, toLevel: 10 }), 1);
  assert.equal(playerRewards.vouchersBetween({ fromLevel: 10, toLevel: 10 }), 0, "an unchanged level pays nothing");
  assert.equal(playerRewards.vouchersBetween({ fromLevel: 1, toLevel: 30 }), 2);
  assert.equal(playerRewards.vouchersBetween({ fromLevel: 25, toLevel: 1 }), 0, "a level can never fall into a payout");
});

test("the player tree only ever grants global equipment", () => {
  const bowlerScoped = new Set(["skin", "victoryPose", "defeatPose", "playerCard", "profileArt", "menuSplash"]);

  for (const reward of playerRewards.listRewards()) {
    if (!reward.equipment) continue;
    assert.equal(reward.equipment[0], "global", `${reward.key} must not be bowler-scoped`);
    assert.equal(bowlerScoped.has(reward.equipment[1]), false, `${reward.key} belongs to the mastery tree`);
  }
});

test("every equipment reference resolves to a real catalog item", () => {
  const tree = playerRewards.buildRewardTree({ currentLevel: 30 });

  for (const node of tree.nodes) {
    for (const reward of node.rewards) {
      if (!reward.equipment?.itemId) continue;
      assert.ok(
        cosmetics.isValidItemId(reward.equipment.itemId),
        `${reward.id} points at missing catalog item ${reward.equipment.itemId}`,
      );
    }
  }
});

test("the two trees never hand out the same item", () => {
  // Every global item, not just effects: a title or badge promised by both
  // ladders is the same broken promise as a duplicated ball trail.
  const playerItems = new Set(
    playerRewards.buildRewardTree({ currentLevel: 30 }).nodes
      .flatMap((node) => node.rewards.map((reward) => reward.equipment?.itemId))
      .filter(Boolean),
  );
  const masteryTree = masteryRewards.buildRewardTree({
    character: { slug: "reina-sato", name: "Reina Sato" },
    currentLevel: 30,
  });

  for (const node of masteryTree.nodes) {
    for (const reward of node.rewards) {
      const itemId = reward.equipment?.itemId;
      if (!itemId || reward.equipment.scope !== "global") continue;
      assert.equal(
        playerItems.has(itemId),
        false,
        `${itemId} is promised by both trees, which makes one of them worthless`,
      );
    }
  }
});

test("a level-earned reward matches the catalog's own account of how it is earned", () => {
  // The ladder that hands an item out must be the ladder the catalog says earns
  // it, or the unlock copy on the item contradicts the tree showing it. Note
  // this reads the *resolved* tree: `listRewards` returns raw cadence tuples
  // whose `equipment` is still an array, so asking it for an itemId silently
  // matches nothing.
  const rewards = playerRewards.buildRewardTree({ currentLevel: 30 }).nodes
    .flatMap((node) => node.rewards);
  let checked = 0;

  for (const reward of rewards) {
    const itemId = reward.equipment?.itemId;
    if (!itemId) continue;
    checked += 1;
    const source = cosmetics.getItem(itemId).unlock.source;
    // `founding` is legitimate at the bottom of the ladder: level 1 hands over
    // the starter title every account already has.
    assert.ok(
      source === "player-level" || source === "founding",
      `${itemId} is promised by the player ladder but catalogued as ${source}`,
    );
  }
  assert.ok(checked >= 20, "the assertion must actually be reaching the bound rewards");
});

test("the tree exposes locked, owned, equipped, and next-reward state without equipping anything", () => {
  const queried = [];
  const tree = playerRewards.buildRewardTree({
    currentLevel: 4,
    isEquipped: (reward) => {
      queried.push(reward.id);
      return reward.level === 2;
    },
  });

  assert.equal(tree.currentLevel, 4);
  assert.equal(tree.nextReward.level, 5);
  assert.equal(tree.nodes[0].state, "owned");
  assert.equal(tree.nodes[1].state, "equipped");
  assert.equal(tree.nodes[3].state, "owned");
  assert.equal(tree.nodes[4].state, "locked");
  assert.equal(queried.length, 4, "locked rewards are never queried as equipped");
});

test("equipped state reads the loadout and refuses a near-miss", () => {
  const tree = playerRewards.buildRewardTree({
    currentLevel: 30,
    loadout: {
      getGlobalSlot: (slot) => (slot === "ballTrail" ? "ball-trail:lime-shock" : null),
      getEquippedSkinId: () => "canon",
      getBowlerSlot: () => null,
    },
  });

  const equipped = tree.nodes.filter((node) => node.state === "equipped");
  assert.equal(equipped.length, 1, "exactly the worn trail counts as equipped");
  assert.equal(equipped[0].rewards[0].equipment.itemId, "ball-trail:lime-shock");
});

test("pending content is declared, not silently missing", () => {
  // A voucher has no equipment because it is a currency, not a cosmetic: it is
  // spent on one later. That is the opposite of pending content, which is a
  // named reward still waiting to be authored.
  const currencies = new Set(["skin-voucher", "emote-voucher"]);
  const unbound = playerRewards.listRewards()
    .filter((reward) => !currencies.has(reward.family) && !reward.equipment)
    .map((reward) => ({ level: reward.level, family: reward.family, key: reward.key }));

  assert.deepEqual(
    unbound,
    playerRewards.PENDING_CONTENT.map((entry) => ({ ...entry })),
    "a label-only node must appear in PENDING_CONTENT so it cannot be forgotten",
  );
  for (const entry of playerRewards.PENDING_CONTENT) {
    assert.ok(
      ["title", "player-card", "profile-art"].includes(entry.family),
      "only identity and profile presentation rewards are awaiting authoring",
    );
  }
});

test("the player level ladder never hands out an achievement badge", () => {
  assert.equal(
    playerRewards.listRewards().some((reward) => reward.family === "badge"),
    false,
  );
});

test("a pending node is still visible and still owned at its level", () => {
  const tree = playerRewards.buildRewardTree({ currentLevel: 8 });

  assert.equal(tree.nodes[6].state, "owned", "an unbound reward is still earned");
  assert.match(tree.nodes[6].label, /\S/, "a locked reward nobody can see is a reward nobody plays for");
});

test("the level cap clamps rather than inventing nodes", () => {
  assert.equal(playerRewards.buildRewardTree({ currentLevel: 999 }).nextReward, null);
  assert.equal(playerRewards.buildRewardTree({ currentLevel: -4 }).currentLevel, 1);
  assert.equal(playerRewards.buildRewardTree({ currentLevel: "junk" }).currentLevel, 1);
});
