import test from "node:test";
import assert from "node:assert/strict";

import { openTaFriendsPanel } from "../src/ui/taFriendsPanel.js";

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.type = "";
    this.href = "";
    this.title = "";
    this.src = "";
    this.alt = "";
    this.loading = "";
    this.decoding = "";
    this.style = {};
    this.classList = {
      add: (...names) => {
        const next = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const name of names) next.add(name);
        this.className = [...next].join(" ");
      },
    };
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, handler) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), handler]);
  }

  removeEventListener() {}

  click() {
    for (const handler of this.listeners.get("click") || []) handler({ target: this });
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

function textContent(node) {
  return [node.textContent, ...(node.children ?? []).map(textContent)].join("");
}

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("clicking a friends-panel row opens that player's Tactical Arena profile", async () => {
  const previous = {
    document: globalThis.document,
    location: globalThis.location,
    window: globalThis.window,
  };
  const body = new TestElement("body");
  globalThis.document = {
    body,
    createElement: (tagName) => new TestElement(tagName),
    addEventListener() {},
    removeEventListener() {},
    querySelector: (selector) => body.querySelector(selector),
  };
  globalThis.location = { href: "http://localhost/games/tactical-arena/index.html" };
  globalThis.window = {
    localStorage: {
      getItem: () => JSON.stringify({ playerId: "me", profileName: "Me" }),
      setItem() {},
      removeItem() {},
    },
  };

  try {
    const client = {
      listFriends: async () => ({
        friends: [{ playerId: "friend-1", displayName: "Mara", tagline: "Bridge Warden", relationship: "friend" }],
      }),
      listRequests: async () => ({ incoming: [], outgoing: [] }),
      listBlocked: async () => ({ blocked: [] }),
      relationshipWith: async () => ({ relationship: "friend" }),
      badgesFor: async () => ({ badges: [] }),
    };

    openTaFriendsPanel({ client, availability: "ready" });
    await nextTask();

    const rowMain = body.findByClass("ta-friends-rowmain");
    assert.ok(rowMain, "the friend identity block should be clickable");
    assert.equal(rowMain.tagName, "BUTTON");
    assert.equal(rowMain.attributes.get("aria-label"), "View Mara's Tactical Arena profile");

    rowMain.click();
    await nextTask();

    const profile = body.findByClass("ta-player-modal");
    assert.ok(profile, "clicking the row should create the TA profile modal");
    assert.equal(profile.hidden, false);
    assert.match(textContent(profile), /Mara/);
    assert.match(textContent(profile), /Player Profile/);
  } finally {
    globalThis.document = previous.document;
    globalThis.location = previous.location;
    globalThis.window = previous.window;
  }
});
