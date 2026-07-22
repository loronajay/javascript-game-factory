import test from "node:test";
import assert from "node:assert/strict";

import { isRankedMatchInProgress, syncRankedStandingNameplate } from "../src/ui/rankedProfile.js";

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

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
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

  nameplate.append(avatar, name, tagline);
  section.appendChild(nameplate);
  return { section, avatar, name, tagline };
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

test("ranked profile active-match notice only treats live matches as in progress", () => {
  assert.equal(isRankedMatchInProgress({ status: "active", matchId: "m1" }), true);

  assert.equal(isRankedMatchInProgress(null), false);
  assert.equal(isRankedMatchInProgress(true), false);
  assert.equal(isRankedMatchInProgress("active"), false);
  assert.equal(isRankedMatchInProgress({ status: "pending_forfeit", matchId: "m1" }), false);
  assert.equal(isRankedMatchInProgress({ status: "resolved", matchId: "m1" }), false);
  assert.equal(isRankedMatchInProgress({ status: "active", outcome: "win", matchId: "m1" }), false);
});
