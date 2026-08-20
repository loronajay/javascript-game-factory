const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const emotes = require("./emote-core.js");
const cosmetics = require("./cosmetics-core.js");
const playerRewards = require("./player-rewards-core.js");
const masteryRewards = require("./mastery-rewards-core.js");

const { EMOTES, DEFAULT_EMOTE_SLUG, getEmote, isEmoteSlug, normalizeEmoteSlug } = emotes;

test("the pool is thirty distinct gestures, each with shipped art", () => {
  assert.equal(EMOTES.length, 30);

  const slugs = EMOTES.map((emote) => emote.slug);
  assert.equal(new Set(slugs).size, slugs.length, "an emote slug is an id and must be unique");

  for (const emote of EMOTES) {
    assert.match(emote.slug, /^[a-z][a-z0-9-]*$/, `${emote.slug} should be kebab-case`);
    assert.equal(emote.src, `assets/emotes/${emote.slug}.webp`, "nothing but the slug names the file");
    assert.equal(
      fs.existsSync(path.join(__dirname, emote.src)),
      true,
      `${emote.slug} needs shipped WebP art`,
    );
    assert.match(emote.name, /\S/);
    assert.match(emote.description, /\S/);
  }
});

test("emotes are named for the gesture, never for a bowler", () => {
  // The pool is global: any bowler wears any emote. A slug carrying a roster
  // name would imply otherwise and would rot the moment the art was reused.
  const rosterSlugs = new Set(require("./animation-core.js").CANON_BOWLERS.map((bowler) => bowler.slug));
  const rosterNames = new Set([...rosterSlugs].flatMap((slug) => slug.split("-")));

  for (const emote of EMOTES) {
    assert.equal(rosterSlugs.has(emote.slug), false, `${emote.slug} must not be a bowler slug`);
    for (const part of emote.slug.split("-")) {
      assert.equal(rosterNames.has(part), false, `${emote.slug} must not name a bowler`);
    }
  }
});

test("six founding emotes ship unlocked so a new account can always react", () => {
  const founding = EMOTES.filter((emote) => emote.unlock.source === "founding");

  assert.deepEqual(founding.map((emote) => emote.slug), [
    "wave", "thumbs-up", "good-luck", "nice-one", "lets-go", "oh-no",
  ]);
  assert.ok(founding.some((emote) => emote.slug === DEFAULT_EMOTE_SLUG), "the default must be founding");
});

test("every other emote names the route it is earned by", () => {
  for (const emote of EMOTES.filter((entry) => entry.unlock.source !== "founding")) {
    assert.ok(
      ["emote-voucher", "player-level"].includes(emote.unlock.source),
      `${emote.slug} has an unroutable unlock source`,
    );
    assert.match(emote.unlock.detail, /\S/);
  }
});

test("all but one earnable emote is bought with a voucher", () => {
  // The pool is thirty deep and the ladders have a handful of rungs to spend,
  // so pinning one emote per rung would have left most of the pool permanently
  // unreachable. A voucher is what makes the whole remainder obtainable.
  const bySource = new Map();
  for (const emote of EMOTES) {
    bySource.set(emote.unlock.source, (bySource.get(emote.unlock.source) || 0) + 1);
  }

  assert.deepEqual([...bySource.entries()].sort(), [
    ["emote-voucher", 23],
    ["founding", 6],
    ["player-level", 1],
  ]);
});

test("an unknown slug normalizes back to the default rather than throwing", () => {
  assert.equal(isEmoteSlug("wave"), true);
  assert.equal(isEmoteSlug("not-an-emote"), false);
  assert.equal(normalizeEmoteSlug("not-an-emote"), DEFAULT_EMOTE_SLUG);
  assert.equal(normalizeEmoteSlug("cheer"), "cheer");
  assert.equal(getEmote("not-an-emote").slug, DEFAULT_EMOTE_SLUG);
  assert.equal(getEmote("cheer").slug, "cheer");
});

test("every emote reaches the cosmetic catalog with a matching unlock", () => {
  const catalogued = cosmetics.listByType("emote");
  assert.equal(catalogued.length, EMOTES.length);

  for (const emote of EMOTES) {
    const item = cosmetics.getItem(`emote:${emote.slug}`);
    assert.ok(item, `emote:${emote.slug} should be catalogued`);
    assert.equal(item.scope, "global", "an emote is never scoped to a bowler");
    assert.equal(item.unlock.source, emote.unlock.source);
    assert.equal(cosmetics.isOwnedByDefault(item.id), emote.unlock.source === "founding");
  }
});

test("the one ladder-granted emote agrees with the account ladder that pays it", () => {
  // The catalog sits underneath the ladders and cannot import them, so an
  // unlock source is recorded beside the item. This is what stops the two
  // drifting into a reward whose own copy contradicts the tree offering it.
  const playerEmotes = playerRewards.REWARD_CADENCE
    .flatMap((node) => node.rewards)
    .filter((reward) => reward.family === "emote" && reward.equipment)
    .map((reward) => `emote:${reward.equipment[2]}`);

  assert.deepEqual(playerEmotes, ["emote:game-face"]);
  for (const itemId of playerEmotes) {
    const item = cosmetics.getItem(itemId);
    assert.ok(item, `${itemId} is paid by a ladder and must exist`);
    assert.equal(item.unlock.source, "player-level");
  }

  // And the reverse: an entry claiming a ladder must actually be on one.
  for (const item of cosmetics.listByType("emote")) {
    if (item.unlock.source === "player-level") {
      assert.ok(playerEmotes.includes(item.id), `${item.id} claims a ladder that never pays it`);
    }
  }
});

test("the player ladder pays vouchers plus one authored milestone emote", () => {
  const emoteRewards = playerRewards.listRewards().filter((reward) => reward.family === "emote");
  assert.deepEqual(emoteRewards.map((reward) => [reward.level, reward.equipment?.[2]]), [[7, "game-face"]]);

  assert.deepEqual(
    playerRewards.listRewards()
      .filter((reward) => reward.family === "emote-voucher")
      .map((reward) => reward.level),
    [...playerRewards.EMOTE_VOUCHER_LEVELS],
  );
});

test("no emote is promised by both ladders", () => {
  const playerEmotes = playerRewards.listRewards()
    .filter((reward) => reward.family === "emote")
    .map((reward) => reward.equipment?.[2]);
  const masteryEmotes = masteryRewards.REWARD_CADENCE
    .flatMap((node) => node.rewards)
    .filter((reward) => reward.family === "emote" && reward.equipment)
    .map((reward) => reward.equipment[2]);

  for (const slug of playerEmotes) {
    assert.equal(masteryEmotes.includes(slug), false, `${slug} is offered by both ladders`);
  }
});
