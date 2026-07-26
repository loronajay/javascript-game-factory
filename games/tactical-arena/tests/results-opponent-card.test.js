import test from "node:test";
import assert from "node:assert/strict";

import { renderOpponentCard } from "../src/ui/resultsOpponentCard.js";

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.hidden = false;
    this.href = "";
    this.type = "";
    this.disabled = false;
    this.title = "";
    this.style = { setProperty() {} };
  }

  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  addEventListener() {}
  setAttribute(name, value) { this[name] = String(value); }

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

function installDom() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    location: globalThis.location,
    fetch: globalThis.fetch,
  };
  globalThis.document = { createElement: (tagName) => new TestElement(tagName) };
  globalThis.location = { href: "http://localhost/games/tactical-arena/index.html" };
  return () => {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.location = previous.location;
    globalThis.fetch = previous.fetch;
  };
}

function memoryStorage(seed = {}) {
  const entries = new Map(Object.entries(seed));
  return {
    getItem: (key) => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => { entries.set(key, String(value)); },
    removeItem: (key) => { entries.delete(key); },
  };
}

function opponentNet(profile) {
  return { profileForSeat: (seat) => seat === 2 ? profile : null };
}

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("results opponent card falls back to the exchanged pilot name and updated loss record", () => {
  const restore = installDom();
  globalThis.window = undefined;
  try {
    const host = new TestElement("section");
    renderOpponentCard(host, { opponentPlayerId: "opponent-1" }, {
      mySeat: 1,
      outcome: "win",
      net: opponentNet({
        displayName: "Rival Pilot",
        rankedProfile: { title: "Never skips bans", tier: { id: "silver", label: "Silver" }, rating: 1301, wins: 1, losses: 0, draws: 0 },
      }),
    });

    assert.equal(host.hidden, false);
    assert.equal(host.findByClass("results-opponent-name").textContent, "Rival Pilot");
    assert.equal(host.findByClass("results-opponent-record").textContent, "1W / 1L / 0D");
  } finally {
    restore();
  }
});

test("stale fetched ranked cards keep the pilot name and receive the just-finished result", async () => {
  const restore = installDom();
  globalThis.window = { __JGF_PLATFORM_API_URL__: "http://api.test", location: {} };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      card: { playerId: "opponent-1", displayName: "Commander", title: "Server title", tier: { id: "silver", label: "Silver" }, rating: 1301, wins: 1, losses: 0, draws: 0 },
    }),
  });
  try {
    const host = new TestElement("section");
    renderOpponentCard(host, { opponentPlayerId: "opponent-1" }, {
      mySeat: 1,
      outcome: "win",
      net: opponentNet({
        displayName: "Rival Pilot",
        rankedProfile: { title: "Never skips bans", tier: { id: "silver", label: "Silver" }, rating: 1301, wins: 1, losses: 0, draws: 0 },
      }),
    });
    await nextTask();

    assert.equal(host.findByClass("results-opponent-name").textContent, "Rival Pilot");
    assert.equal(host.findByClass("results-opponent-record").textContent, "1W / 1L / 0D");
  } finally {
    restore();
  }
});

// Adding a friend from this card now creates a TACTICAL ARENA friend (server-backed,
// see src/platform/taFriendsClient.js), not a factory-wide one. The old local
// profile.friends check is gone on purpose: TA friendship is server-authoritative, so
// the control renders from the server's answer rather than a local cache.
test("a signed-out player gets no TA friend control but keeps the factory links", () => {
  const restore = installDom();
  globalThis.window = {
    localStorage: memoryStorage({
      "javascript-game-factory.factoryProfile": JSON.stringify({ playerId: "me-1", profileName: "Me" }),
    }),
    location: { hostname: "" },
  };
  globalThis.fetch = undefined;
  try {
    const host = new TestElement("section");
    renderOpponentCard(host, { opponentPlayerId: "opponent-1" }, {
      mySeat: 1,
      net: opponentNet({ displayName: "Rival Pilot" }),
    });

    // No account -> nothing to add a friend with, and no misleading enabled button.
    const friendSlot = host.findByClass("results-opponent-friend");
    assert.equal(friendSlot.children.length, 0);

    // The in-game TA profile is always offered; it is a public read.
    const actions = host.findByClass("results-opponent-actions");
    const buttons = actions.children.filter((child) => child.tagName === "button");
    assert.deepEqual(buttons.map((b) => b.textContent), ["View Profile"]);

    // And the factory profile / DM deep-links stay available alongside it.
    const links = actions.children.filter((child) => child.tagName === "a");
    assert.deepEqual(links.map((a) => a.textContent), ["Factory Profile", "Message"]);
  } finally {
    restore();
  }
});
