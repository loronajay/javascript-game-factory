const { test } = require("node:test");
const assert = require("node:assert/strict");

const Animation = require("./animation-core.js");
const Catalog = require("./character-catalog.js");

test("publishes one frozen, complete runtime record for every canon bowler", () => {
  assert.equal(Catalog.CHARACTERS.length, Animation.CANON_BOWLERS.length);
  assert.deepEqual(
    Catalog.CHARACTERS.map(({ slug }) => slug),
    Animation.CANON_BOWLERS.map(({ slug }) => slug),
  );
  assert.equal(Object.isFrozen(Catalog.CHARACTERS), true);
  assert.equal(Catalog.CHARACTERS.every(Object.isFrozen), true);
});

test("looks up canon bios and falls back safely for unknown slugs", () => {
  assert.equal(Catalog.getCharacter("reina-sato").name, "Reina Sato");
  assert.equal(Catalog.getCharacter("not-a-bowler").slug, Animation.CANON_BOWLERS[0].slug);
});

test("moves through the inspector roster with wraparound navigation", () => {
  const first = Animation.CANON_BOWLERS[0].slug;
  const last = Animation.CANON_BOWLERS.at(-1).slug;

  assert.equal(Catalog.getAdjacentCharacterSlug(first, -1), last);
  assert.equal(Catalog.getAdjacentCharacterSlug(last, 1), first);
  assert.equal(
    Catalog.getAdjacentCharacterSlug("reina-sato", 1),
    Animation.CANON_BOWLERS[Animation.CANON_BOWLERS.findIndex(({ slug }) => slug === "reina-sato") + 1].slug,
  );
});

test("describes preview and equipment state without mutating either selection", () => {
  assert.equal(Catalog.getSkinPreviewLabel("canon", "canon", "canon"), "Equipped · Previewing");
  assert.equal(Catalog.getSkinPreviewLabel("maid", "maid", "canon"), "Previewing");
  assert.equal(Catalog.getSkinPreviewLabel("canon", "maid", "canon"), "Equipped");
  assert.equal(Catalog.getSkinPreviewLabel("swimsuit", "maid", "canon"), "Preview");
});
