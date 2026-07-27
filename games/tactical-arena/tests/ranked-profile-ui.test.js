import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLegacyRankedAvatarOptions,
  isRankedMatchInProgress,
  syncRankedStandingNameplate,
} from "../src/ui/rankedProfile.js";
import { renderAvatarField } from "../src/ui/rankedProfileIdentity.js";
import { renderBadgePickerField } from "../src/ui/rankedBadgePicker.js";
import { readUnlockProgress, writeUnlockProgress } from "../src/progression/unlocks.js";

class FakeLocalStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.classList = {
      add: (...names) => {
        const next = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const name of names) next.add(name);
        this.className = [...next].join(" ");
      },
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  append(...children) {
    for (const child of children) this.adopt(child);
    this.children.push(...children);
  }

  appendChild(child) {
    this.adopt(child);
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of children) this.adopt(child);
    this.children = children;
  }

  adopt(child) {
    if (child && typeof child === "object") child.parentNode = this;
  }

  // Enough of the event/removal surface for the interactive fields (pickers) to be driven
  // headlessly: register a listener, fire it, and let a node take itself out of the tree.
  addEventListener(type, handler) {
    if (!this.listeners) this.listeners = new Map();
    this.listeners.set(type, [...(this.listeners.get(type) || []), handler]);
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners?.get(type) || []) handler(event);
  }

  remove() {
    const parent = this.parentNode;
    if (!parent) return;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  focus() {}

  findAllByClass(className, found = []) {
    if (this.className.split(/\s+/).includes(className)) found.push(this);
    for (const child of this.children) child.findAllByClass?.(className, found);
    return found;
  }

  querySelector(selector) {
    if (!selector.startsWith(".")) return null;
    return this.findByClass(selector.slice(1));
  }

  findByClass(className) {
    if (this.className.split(/\s+/).includes(className)) return this;
    for (const child of this.children) {
      const match = child.findByClass?.(className);
      if (match) return match;
    }
    return null;
  }
}

globalThis.document = {
  createElement: (tagName) => new TestElement(tagName),
};

function createNameplateSection() {
  const section = new TestElement("section");
  section.className = "ranked-profile-standing";
  const nameplate = new TestElement("div");
  nameplate.className = "ranked-profile-nameplate";
  const avatar = new TestElement("div");
  avatar.className = "ranked-profile-nameplate-avatar";
  const name = new TestElement("span");
  name.className = "ranked-profile-nameplate-name";
  const tagline = new TestElement("span");
  tagline.className = "ranked-profile-nameplate-tagline";
  const badge = new TestElement("span");
  badge.className = "ranked-profile-nameplate-badge";

  nameplate.append(avatar, name, tagline, badge);
  section.appendChild(nameplate);
  return { section, avatar, name, tagline, badge };
}

test("ranked profile standing nameplate updates tagline and avatar in-place", () => {
  const { section, avatar, name, tagline } = createNameplateSection();

  syncRankedStandingNameplate(section, {
    pilot: "Leonardo",
    tagline: "Tempo thief",
    avatarUnit: "swordsman",
    avatarSkin: null,
  });

  assert.equal(name.textContent, "Leonardo");
  assert.equal(tagline.textContent, "Tempo thief");
  assert.equal(avatar.children.length, 1);
  assert.equal(avatar.children[0].tagName, "figure");
  assert.equal(avatar.children[0].className, "unit-portrait is-profile-avatar");
  assert.equal(avatar.children[0].dataset.type, "swordsman");

  syncRankedStandingNameplate(section, {
    pilot: "Leonardo",
    tagline: "",
    avatarUnit: null,
    avatarSkin: null,
  });

  assert.equal(tagline.textContent, "No tagline set");
  assert.equal(avatar.children.length, 1);
  assert.equal(avatar.children[0].className, "ranked-profile-avatar-initial");
  assert.equal(avatar.children[0].textContent, "L");
});

test("ranked profile standing nameplate renders sprite avatar ids", () => {
  const { section, avatar } = createNameplateSection();

  syncRankedStandingNameplate(section, {
    pilot: "Leonardo",
    tagline: "Tempo thief",
    avatarUnit: "avatar-001",
    avatarSkin: null,
  });

  assert.equal(avatar.children.length, 1);
  assert.equal(avatar.children[0].tagName, "span");
  assert.equal(avatar.children[0].className, "ranked-avatar-icon is-profile-avatar");
  assert.equal(avatar.children[0].dataset.avatar, "avatar-001");
  assert.equal(avatar.children[0].children[0].className, "ranked-avatar-icon-sprite");
});

test("ranked profile legacy avatar options include unlocked units and owned skins", () => {
  const storage = new FakeLocalStorage();
  writeUnlockProgress(storage, {
    unlockedUnits: ["clod"],
    purchasedSkins: [{ type: "paladin", slug: "crusader" }],
  });

  const options = buildLegacyRankedAvatarOptions(storage);

  assert.ok(options.some((option) =>
    option.avatarUnit === "swordsman" && option.avatarSkin === null && option.label === "Swordsman"));
  assert.ok(options.some((option) =>
    option.avatarUnit === "clod" && option.avatarSkin === null && option.label === "Clod"));
  assert.ok(options.some((option) =>
    option.avatarUnit === "paladin" && option.avatarSkin === "crusader" && option.label === "Paladin: Crusader"));
  assert.equal(options.some((option) =>
    option.avatarUnit === "paladin" && option.avatarSkin === null), false);
});

// The icon-avatar picker only lists RANKED_AVATARS ids that are free or owned — locked
// (unpurchased) ones are bought in the Shop, not offered here.
test("the icon-avatar picker only offers free/owned avatars, not locked ones", () => {
  const storage = new FakeLocalStorage();
  globalThis.localStorage = storage;
  try {
    writeUnlockProgress(storage, { ...readUnlockProgress(storage), serverEntitlementAvatars: ["avatar-042"] });

    const section = new TestElement("section");
    section.appendChild(renderAvatarField({ avatarUnit: null, avatarSkin: null }, () => {}));

    const labels = section.findAllByClass("ranked-profile-avatar-option-text").map((node) => node.textContent);
    assert.ok(labels.includes("Avatar 001"), "free starter avatar is offered");
    assert.ok(labels.includes("Avatar 042"), "purchased avatar is offered");
    assert.equal(labels.includes("Avatar 020"), false, "locked, unpurchased avatar is not offered");
  } finally {
    delete globalThis.localStorage;
  }
});

test("a no-longer-owned equipped icon avatar still appears in the menu, selected", () => {
  const storage = new FakeLocalStorage();
  globalThis.localStorage = storage;
  try {
    const section = new TestElement("section");
    section.appendChild(renderAvatarField({ avatarUnit: "avatar-077", avatarSkin: null }, () => {}));

    const labels = section.findAllByClass("ranked-profile-avatar-option-text").map((node) => node.textContent);
    assert.ok(labels.includes("Avatar 077"), "currently-equipped avatar stays visible even if unowned");
  } finally {
    delete globalThis.localStorage;
  }
});

test("ranked profile active-match notice only treats live matches as in progress", () => {
  assert.equal(isRankedMatchInProgress({ status: "playing", matchId: "m1" }), true);
  assert.equal(isRankedMatchInProgress({ status: "active", matchId: "m1" }), false);

  assert.equal(isRankedMatchInProgress(null), false);
  assert.equal(isRankedMatchInProgress(true), false);
  assert.equal(isRankedMatchInProgress("active"), false);
  assert.equal(isRankedMatchInProgress({ status: "pending_forfeit", matchId: "m1" }), false);
  assert.equal(isRankedMatchInProgress({ status: "resolved", matchId: "m1" }), false);
  assert.equal(isRankedMatchInProgress({ status: "active", outcome: "win", matchId: "m1" }), false);
});

const BLOOD_MOON = {
  badgeId: "blood-moon-collector",
  label: "Blood Moon",
  description: "Owns the complete Blood Moon skin collection.",
  art: "blood-moon",
};
const OG = { badgeId: "og-commander", label: "OG Commander", description: "Opening days.", art: "og-commander" };

// The picker loads its options asynchronously; let the whole chain settle before asserting.
const flushAsyncField = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the nameplate badge slot fills when equipped and hides when not", () => {
  const { section, badge } = createNameplateSection();

  syncRankedStandingNameplate(section, { pilot: "Leonardo", badge: BLOOD_MOON });
  assert.equal(badge.hidden, false);
  assert.equal(badge.children.length, 1);
  assert.match(badge.children[0].src, /assets\/player-badges\/blood-moon\.webp$/);
  assert.equal(badge.children[0].alt, "Blood Moon", "shown alone, so the art carries the label");
  assert.equal(badge.title, "Blood Moon — Owns the complete Blood Moon skin collection.");

  // Unequipping must leave nothing behind — an empty-but-present slot would hold space in
  // the meta row it shares with the tier and rating.
  syncRankedStandingNameplate(section, { pilot: "Leonardo", badge: null });
  assert.equal(badge.hidden, true);
  assert.equal(badge.children.length, 0);
  assert.equal(badge.title, "", "a stale tooltip on an empty slot would still show on hover");
});

test("the badge picker offers only earned badges, plus an explicit no-badge option", async () => {
  const section = new TestElement("section");
  const state = { badgeId: null, badge: null };
  const saved = [];

  renderBadgePickerField(section, {
    state,
    save: (patch) => saved.push(patch),
    loadBadges: async () => ({ badges: [BLOOD_MOON, OG] }),
  });
  await flushAsyncField();

  const options = section.findAllByClass("ranked-profile-badge-option");
  assert.equal(options.length, 3, "no badge + the two earned ones");
  assert.equal(section.findByClass("ranked-profile-badge-selected-label").textContent, "No badge");

  // Equip the second earned badge.
  options[2].dispatch("click");
  assert.equal(state.badgeId, "og-commander");
  assert.equal(state.badge.label, "OG Commander");
  assert.deepEqual(saved, [{ badgeId: "og-commander" }]);
  assert.equal(section.findByClass("ranked-profile-badge-selected-label").textContent, "OG Commander");

  // And unequip through the no-badge option.
  section.findAllByClass("ranked-profile-badge-option")[0].dispatch("click");
  assert.equal(state.badgeId, null);
  assert.equal(state.badge, null);
  assert.deepEqual(saved, [{ badgeId: "og-commander" }, { badgeId: null }]);
});

test("the badge picker says so when there is nothing to equip yet", async () => {
  const section = new TestElement("section");
  renderBadgePickerField(section, {
    state: { badgeId: null, badge: null },
    save: () => {},
    loadBadges: async () => ({ badges: [] }),
  });
  await flushAsyncField();

  assert.equal(section.findAllByClass("ranked-profile-badge-option").length, 0);
  assert.match(section.findByClass("ranked-profile-badge-status").textContent, /No badges yet/);
});

test("an equipped badge the player no longer has is dropped rather than offered", async () => {
  const section = new TestElement("section");
  // The server is the authority on what is earned; a stale local pick must not survive as
  // an option that can't be re-selected.
  const state = { badgeId: "blood-moon-collector", badge: BLOOD_MOON };
  renderBadgePickerField(section, {
    state,
    save: () => {},
    loadBadges: async () => ({ badges: [OG] }),
  });
  await flushAsyncField();

  assert.equal(state.badgeId, null);
  assert.equal(state.badge, null);
  assert.equal(section.findByClass("ranked-profile-badge-selected-label").textContent, "No badge");
});

test("the badge picker reports a failed load instead of silently offering nothing", async () => {
  const section = new TestElement("section");
  renderBadgePickerField(section, {
    state: { badgeId: null, badge: null },
    save: () => {},
    loadBadges: async () => { throw new Error("offline"); },
  });
  await flushAsyncField();

  const status = section.findByClass("ranked-profile-badge-status");
  assert.match(status.textContent, /Couldn't load your badges/);
  assert.equal(status.dataset.state, "err");
});
