const { test } = require("node:test");
const assert = require("node:assert/strict");

const masteryRewards = require("./mastery-rewards-core.js");

const character = { slug: "reina-sato", name: "Reina Sato" };

test("the reusable mastery cadence gives every launch level a named cosmetic reward", () => {
  assert.equal(masteryRewards.REWARD_CADENCE.length, 30);
  assert.deepEqual(
    masteryRewards.REWARD_CADENCE.map((node) => node.level),
    Array.from({ length: 30 }, (_, index) => index + 1),
  );

  for (const node of masteryRewards.REWARD_CADENCE) {
    assert.ok(node.rewards.length > 0, `level ${node.level} needs a visible reward`);
    for (const reward of node.rewards) {
      assert.match(reward.label, /\S/);
      assert.equal("speed" in reward, false);
      assert.equal("power" in reward, false);
      assert.equal("accuracy" in reward, false);
    }
  }
});

test("the approved anchor levels keep their promised reward families", () => {
  const familiesAt = (level) => masteryRewards.REWARD_CADENCE[level - 1].rewards.map((reward) => reward.family);

  assert.deepEqual(familiesAt(1), ["bowler"]);
  assert.deepEqual(familiesAt(3), ["profile-icon"]);
  assert.deepEqual(familiesAt(5), ["victory-pose"]);
  assert.deepEqual(familiesAt(7), ["character-banner"]);
  assert.deepEqual(familiesAt(10), ["skin"]);
  assert.deepEqual(familiesAt(12), ["player-card"]);
  assert.deepEqual(familiesAt(15), ["menu-splash"]);
  assert.deepEqual(familiesAt(18), ["victory-pose"]);
  assert.deepEqual(familiesAt(20), ["skin"]);
  assert.deepEqual(familiesAt(25), ["rare-card"]);
  assert.deepEqual(familiesAt(30), ["skin", "title"]);
});

test("resolved reward ids are bowler-specific, stable, and leave room for levels 31 through 40", () => {
  const first = masteryRewards.buildRewardTree({ character, currentLevel: 9 });
  const second = masteryRewards.buildRewardTree({ character, currentLevel: 30 });

  assert.deepEqual(
    first.nodes.flatMap((node) => node.rewards.map((reward) => reward.id)),
    second.nodes.flatMap((node) => node.rewards.map((reward) => reward.id)),
  );
  assert.equal(first.nodes[2].rewards[0].id, "mastery:reina-sato:level-03:profile-icon");
  assert.equal(first.nodes[29].rewards[0].id, "mastery:reina-sato:level-30:mastery-skin");
  assert.equal(first.nodes[29].rewards[1].id, "mastery:reina-sato:level-30:exclusive-title");
  assert.ok(first.nodes.every((node) => node.level <= 30));
});

test("the tree exposes locked, owned, equipped, and next-reward state without equipping anything", () => {
  const equipped = [];
  const tree = masteryRewards.buildRewardTree({
    character,
    currentLevel: 4,
    isEquipped: (reward) => {
      equipped.push(reward.id);
      return reward.level === 3;
    },
  });

  assert.equal(tree.currentLevel, 4);
  assert.equal(tree.nextReward.level, 5);
  assert.match(tree.nextReward.label, /Victory/i);
  assert.equal(tree.nodes[1].state, "owned");
  assert.equal(tree.nodes[2].state, "equipped");
  assert.equal(tree.nodes[3].state, "owned");
  assert.equal(tree.nodes[4].state, "locked");
  assert.equal(equipped.length, 4, "locked rewards are never queried as equipped");
});

test("equipped labels are reserved for exact shipped equipment references", () => {
  const tree = masteryRewards.buildRewardTree({
    character,
    currentLevel: 10,
    loadout: {
      getGlobalSlot: (slot) => slot === "ballTrail" ? "ball-trail:red-neon" : null,
      getEquippedSkinId: () => "swimsuit",
      getBowlerSlot: () => null,
    },
  });

  assert.equal(tree.nodes[1].label, "Red Neon Ball Trail");
  assert.equal(tree.nodes[1].state, "equipped");
  assert.equal(tree.nodes[9].label, "Gym Day Skin");
  assert.equal(tree.nodes[9].state, "owned", "a different shipped skin must not impersonate the mastery reward");
});

test("the mastery badge milestones point at real equippable cabinet badges", () => {
  const tree = masteryRewards.buildRewardTree({ character, currentLevel: 30 });
  const expected = new Map([
    [13, "badge:laser-focus"],
    [21, "badge:precision-bowler"],
    [28, "badge:lane-legend"],
  ]);

  for (const [level, itemId] of expected) {
    const reward = tree.nodes[level - 1].rewards[0];
    assert.equal(reward.family, "badge");
    assert.deepEqual(reward.equipment, { scope: "global", slot: "badge", itemId });
  }
});

// A mastery title is the one reward whose id is scoped to the bowler who earned
// it while the slot it fills is global. Reaching the summit with Reina makes you
// Reina's master whichever bowler you then take to the lane, so the check that
// it is worn has to be a plain global-slot comparison.
test("the two mastery titles are bowler-scoped ids worn in the global title slot", () => {
  const tree = masteryRewards.buildRewardTree({ character, currentLevel: 30 });
  const nameplate = tree.nodes[28].rewards[0];
  const master = tree.nodes[29].rewards.find((reward) => reward.family === "title");

  assert.equal(nameplate.equipment.itemId, "title:reina-sato:nameplate");
  assert.equal(nameplate.equipment.slot, "title");
  assert.equal(nameplate.equipment.scope, "global");
  assert.equal(master.equipment.itemId, "title:reina-sato:master");
  assert.equal(master.equipment.slot, "title");
  assert.equal(master.equipment.scope, "global");
});

test("a mastery title belongs to the bowler who earned it and to no other", () => {
  const other = masteryRewards.buildRewardTree({
    character: { slug: "daisy-monroe", name: "Daisy Monroe" },
    currentLevel: 30,
  });
  assert.equal(other.nodes[28].rewards[0].equipment.itemId, "title:daisy-monroe:nameplate");
  assert.equal(other.nodes[28].rewards[0].label, "Daisy Mastery Nameplate");
});

test("a bowler-scoped title is only equipped when the global slot holds that exact id", () => {
  const loadout = { getGlobalSlot: (slot) => (slot === "title" ? "title:reina-sato:master" : null) };
  const mine = masteryRewards.buildRewardTree({ character, currentLevel: 30, loadout });
  const theirs = masteryRewards.buildRewardTree({
    character: { slug: "daisy-monroe", name: "Daisy Monroe" },
    currentLevel: 30,
    loadout,
  });

  assert.equal(mine.nodes[29].rewards.find((r) => r.family === "title").equipped, true);
  assert.equal(theirs.nodes[29].rewards.find((r) => r.family === "title").equipped, false);
});
