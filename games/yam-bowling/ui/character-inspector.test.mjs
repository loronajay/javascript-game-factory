import { test } from "node:test";
import assert from "node:assert/strict";

import { ownedSkinsForBowler } from "./character-inspector.mjs";
import { renderSkinOptions } from "./skin-options.mjs";

const animation = {
  DEFAULT_SKIN_ID: "canon",
  AVAILABLE_SKINS: [
    { id: "canon", name: "Classic" },
    { id: "swimsuit", name: "Swimsuit" },
    { id: "maid", name: "Maid Cafe" },
  ],
};

test("character inspection exposes only skins owned for the inspected bowler", () => {
  const owned = new Set(["skin:reina-sato:canon", "skin:reina-sato:maid"]);
  const skins = ownedSkinsForBowler(animation, { owns: (id) => owned.has(id) }, "reina-sato");

  assert.deepEqual(skins.map((skin) => skin.id), ["canon", "maid"]);
});

test("character inspection fails closed to Canon when ownership data is unavailable", () => {
  assert.deepEqual(
    ownedSkinsForBowler(animation, null, "reina-sato").map((skin) => skin.id),
    ["canon"],
  );
});

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.disabled = false;
    this.listeners = new Map();
  }

  set innerHTML(value) {
    this.markup = value;
    if (value === "") this.children = [];
  }

  get innerHTML() {
    return this.markup || "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  appendChild(child) {
    this.children.push(child);
  }

  click() {
    if (!this.disabled) this.listeners.get("click")?.();
  }
}

test("the equipment picker shows locked skins as disabled cards", () => {
  const host = new FakeElement();
  globalThis.document = {
    getElementById: () => host,
    createElement: () => new FakeElement(),
  };

  const equipped = [];
  const loadout = {
    listOwned: () => [
      { id: "skin:reina-sato:canon", characterSlug: "reina-sato" },
      { id: "skin:reina-sato:maid", characterSlug: "reina-sato" },
    ],
    equipSkin: (_slug, skinId) => {
      equipped.push(skinId);
      return skinId;
    },
  };

  try {
    renderSkinOptions({
      containerId: "skin-options",
      slug: "reina-sato",
      selectedSkinId: "canon",
      animation,
      assets: {
        bowlerBySlug: (slug) => ({ slug }),
        characterPortrait: (_slug, skinId) => `${skinId}.webp`,
      },
      loadout,
      onEquip: (skinId) => equipped.push(`selected:${skinId}`),
    });

    assert.deepEqual(host.children.map((button) => button.dataset.skinId), ["canon", "swimsuit", "maid"]);

    const locked = host.children[1];
    assert.equal(locked.disabled, true);
    assert.match(locked.className, /\bis-locked\b/);
    assert.match(locked.innerHTML, />Locked</);
    assert.match(locked.innerHTML, /src="swimsuit\.webp"/);
    locked.click();
    assert.deepEqual(equipped, []);

    const owned = host.children[2];
    assert.equal(owned.disabled, false);
    assert.doesNotMatch(owned.className, /\bis-locked\b/);
    assert.match(owned.innerHTML, />Equip</);
    owned.click();
    assert.deepEqual(equipped, ["maid", "selected:maid"]);
  } finally {
    delete globalThis.document;
  }
});
