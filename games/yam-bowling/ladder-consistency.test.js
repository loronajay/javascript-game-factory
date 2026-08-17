const test = require("node:test");
const assert = require("node:assert/strict");

const cosmetics = require("./cosmetics-core.js");
const masteryRewards = require("./mastery-rewards-core.js");
const playerRewards = require("./player-rewards-core.js");

// The catalog sits underneath the two ladders and cannot import them: it is what
// they are built on. So an item records where it is earned as plain data, and
// the ladders separately name what they pay. Those are two statements of the
// same fact, and nothing structural stops them disagreeing.
//
// They HAVE disagreed. Three rooms were added to the catalog saying "reach
// mastery level 7/15/25" while the cadence still paid a character banner at
// those rungs, so the rooms were unobtainable and the backfill migration handed
// them to existing accounts that new accounts could never earn. These tests are
// the guard against that shape of bug, in both directions.

function ladderItemIds(track, options = {}) {
  const ids = new Set();
  for (const node of track.REWARD_CADENCE) {
    // Level 1 is where a player starts, not a rung they climb. Its rewards are
    // founding content -- the Rookie title, the canon skin -- so it is the one
    // level whose payout is deliberately owned before anything is earned, and
    // the server catalog leaves it out of `levelEntitlements` for that reason.
    if (node.level === 1) continue;
    for (const reward of node.rewards) {
      if (!reward.equipment) continue;
      const [scope, slot, value] = reward.equipment;
      // A bowler-scoped id is resolved per bowler, so it is checked by the
      // mastery suite rather than here where there is no bowler in hand.
      if (scope !== "global") continue;
      if (slot === "bowlerTitle") continue;
      const type = {
        ballTrail: "ball-trail",
        strikeBurst: "strike-burst",
        title: "title",
        badge: "badge",
        emote: "emote",
        room: "room",
      }[slot];
      assert.ok(type, `${options.name}: unmapped equipment slot ${slot}`);
      ids.add(`${type}:${value}`);
    }
  }
  return ids;
}

const masteryIds = ladderItemIds(masteryRewards, { name: "mastery" });
const playerIds = ladderItemIds(playerRewards, { name: "player" });

test("every item claiming a ladder is actually paid by that ladder", () => {
  // The direction that failed in practice. An item advertising "reach mastery
  // level 7" that no rung grants is a promise the game cannot keep.
  for (const item of cosmetics.CATALOG) {
    if (item.scope !== "global") continue;
    if (item.unlock.source === "bowler-level") {
      assert.ok(
        masteryIds.has(item.id),
        `${item.id} claims bowler mastery but no mastery rung pays it`,
      );
    }
    if (item.unlock.source === "player-level") {
      assert.ok(
        playerIds.has(item.id),
        `${item.id} claims the player ladder but no player rung pays it`,
      );
    }
  }
});

test("every global reward a ladder pays exists and agrees about which ladder pays it", () => {
  // The opposite direction: a rung binding an id the catalog does not carry
  // would resolve to nothing, and the loadout would strip it on the next save.
  for (const [ids, source, name] of [
    [masteryIds, "bowler-level", "mastery"],
    [playerIds, "player-level", "the player ladder"],
  ]) {
    for (const itemId of ids) {
      const item = cosmetics.getItem(itemId);
      assert.ok(item, `${name} pays ${itemId}, which is not in the catalog`);
      assert.equal(
        item.unlock.source,
        source,
        `${itemId} is paid by ${name} but its catalog entry says ${item.unlock.source}`,
      );
    }
  }
});

test("the two ladders never promise the same reward", () => {
  // A reward earnable on the other ladder is not a reward. This is asserted
  // across every type rather than per type, so a future reward family inherits
  // the rule instead of needing its own copy of it.
  for (const itemId of masteryIds) {
    assert.equal(playerIds.has(itemId), false, `${itemId} is offered by both ladders`);
  }
});

test("no ladder pays founding content", () => {
  // Founding content is what a brand-new device already has, so paying it out
  // as a level reward would be a rung that visibly gives nothing.
  for (const itemId of [...masteryIds, ...playerIds]) {
    assert.equal(
      cosmetics.isOwnedByDefault(itemId),
      false,
      `${itemId} is founding content and cannot also be a level reward`,
    );
  }
});

test("every unbound node is a currency or declared as pending content", () => {
  // A node with no equipment is either a voucher, which is spent later, or a
  // reward still awaiting authoring -- and the second kind has to be declared
  // so it cannot be quietly forgotten. Both ladders declare their own.
  const currencies = new Set(["skin-voucher", "emote-voucher"]);

  for (const [track, name] of [[playerRewards, "player"], [masteryRewards, "mastery"]]) {
    const pendingKeys = new Set(track.PENDING_CONTENT.map((entry) => `${entry.level}:${entry.key}`));
    for (const node of track.REWARD_CADENCE) {
      for (const reward of node.rewards) {
        if (reward.equipment || currencies.has(reward.family)) continue;
        assert.ok(
          pendingKeys.has(`${node.level}:${reward.key}`),
          `${name} level ${node.level} "${reward.label}" is unbound and undeclared`,
        );
      }
    }
  }
});

test("pending content is not stale -- every declared node is still unbound", () => {
  // The other direction. A rung that gets bound but is left in PENDING_CONTENT
  // would keep reporting itself as unfinished work forever.
  for (const [track, name] of [[playerRewards, "player"], [masteryRewards, "mastery"]]) {
    for (const entry of track.PENDING_CONTENT) {
      const node = track.REWARD_CADENCE.find((candidate) => candidate.level === entry.level);
      assert.ok(node, `${name} declares pending content at level ${entry.level}, which has no node`);
      const reward = node.rewards.find((candidate) => candidate.key === entry.key);
      assert.ok(reward, `${name} level ${entry.level} has no reward keyed ${entry.key}`);
      assert.equal(reward.family, entry.family, `${name}:${entry.key} family disagrees with its declaration`);
      assert.equal(reward.equipment, null, `${name}:${entry.key} is bound and should leave PENDING_CONTENT`);
    }
  }
});
