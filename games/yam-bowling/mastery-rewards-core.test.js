const { test } = require("node:test");
const assert = require("node:assert/strict");

const masteryRewards = require("./mastery-rewards-core.js");

const character = { slug: "reina-sato", name: "Reina Sato" };
const MILESTONE_LEVELS = [1, 3, 5, 9, 12, 18, 24, 29, 30];

test("mastery is a sparse path of meaningful character milestones", () => {
  assert.deepEqual(masteryRewards.REWARD_CADENCE.map((node) => node.level), MILESTONE_LEVELS);
  for (const node of masteryRewards.REWARD_CADENCE) {
    assert.ok(node.rewards.length > 0);
    for (const reward of node.rewards) {
      assert.match(reward.label, /\S/);
      for (const banned of ["speed", "power", "accuracy", "pins", "score"]) {
        assert.equal(banned in reward, false);
      }
    }
  }
});

test("every post-starter mastery reward belongs to the bowler who earned it", () => {
  const tree = masteryRewards.buildRewardTree({ character, currentLevel: 30 });

  for (const node of tree.nodes.slice(1)) {
    for (const reward of node.rewards) {
      assert.ok(reward.equipment?.itemId.includes(character.slug),
        `${reward.id} must resolve to ${character.slug}, not an account-wide duplicate`);
    }
  }
});

test("the milestone families escalate through identity and presentation", () => {
  const familyAt = (level) => masteryRewards.REWARD_CADENCE
    .find((node) => node.level === level).rewards.map((reward) => reward.family);

  assert.deepEqual(familyAt(1), ["bowler"]);
  assert.deepEqual(familyAt(3), ["profile-icon"]);
  assert.deepEqual(familyAt(5), ["victory-pose"]);
  assert.deepEqual(familyAt(9), ["player-card"]);
  assert.deepEqual(familyAt(12), ["player-card"]);
  assert.deepEqual(familyAt(18), ["victory-pose"]);
  assert.deepEqual(familyAt(24), ["player-card"]);
  assert.deepEqual(familyAt(29), ["title"]);
  assert.deepEqual(familyAt(30), ["title"]);
});

test("resolved reward ids remain stable across current level", () => {
  const early = masteryRewards.buildRewardTree({ character, currentLevel: 3 });
  const capped = masteryRewards.buildRewardTree({ character, currentLevel: 30 });

  assert.deepEqual(
    early.nodes.flatMap((node) => node.rewards.map((reward) => reward.id)),
    capped.nodes.flatMap((node) => node.rewards.map((reward) => reward.id)),
  );
  assert.equal(early.nodes[1].rewards[0].id, "mastery:reina-sato:level-03:profile-icon");
  assert.equal(early.nodes.at(-1).rewards[0].id, "mastery:reina-sato:level-30:exclusive-title");
});

test("the tree points to the next actual reward milestone", () => {
  const tree = masteryRewards.buildRewardTree({ character, currentLevel: 13 });

  assert.equal(tree.currentLevel, 13);
  assert.equal(tree.nextReward.level, 18);
  assert.match(tree.nextReward.label, /Victory/i);
});

test("every milestone resolves to wearable catalog equipment", () => {
  const tree = masteryRewards.buildRewardTree({ character, currentLevel: 30 });
  assert.deepEqual(masteryRewards.PENDING_CONTENT, []);
  const expected = new Map([
    [3, "profile-icon:reina-sato:canon"],
    [5, "victory-pose:reina-sato:spotlight"],
    [9, "player-card:reina-sato:rivalry"],
    [12, "player-card:reina-sato:signature"],
    [18, "victory-pose:reina-sato:champion"],
    [24, "player-card:reina-sato:elite"],
    [29, "title:reina-sato:nameplate"],
    [30, "title:reina-sato:master"],
  ]);
  for (const [level, itemId] of expected) {
    assert.equal(tree.nodes.find((node) => node.level === level).rewards[0].equipment?.itemId, itemId);
  }
});

test("a bowler-scoped title is equipped only for its owner", () => {
  const loadout = { getGlobalSlot: (slot) => (slot === "title" ? "title:reina-sato:master" : null) };
  const mine = masteryRewards.buildRewardTree({ character, currentLevel: 30, loadout });
  const theirs = masteryRewards.buildRewardTree({
    character: { slug: "daisy-monroe", name: "Daisy Monroe" },
    currentLevel: 30,
    loadout,
  });

  assert.equal(mine.nodes.at(-1).rewards[0].equipped, true);
  assert.equal(theirs.nodes.at(-1).rewards[0].equipped, false);
});

test("an unnamed mastery track never mints characterless rewards", () => {
  assert.deepEqual(masteryRewards.rewardsBetween({ fromLevel: 1, toLevel: 30 }), []);
});
