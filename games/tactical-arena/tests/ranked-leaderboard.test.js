import test from "node:test";
import assert from "node:assert/strict";

import { filterLeaderboardEntries, renderLeaderboard } from "../src/ui/rankedLeaderboard.js";

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.textContent = "";
    this.attributes = new Map();
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  addEventListener() {}

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function hasClass(node, className) {
  return String(node.className || "").split(/\s+/).includes(className);
}

function walk(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) walk(child, predicate, matches);
  return matches;
}

function textContent(node) {
  return [node.textContent, ...(node.children ?? []).map(textContent)].join("");
}

test("ranked leaderboard rows show player name and tagline separately", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new TestElement(tagName) };

  try {
    const body = new TestElement("div");

    renderLeaderboard(body, [
      {
        rank: 1,
        playerId: "pilot-1",
        displayName: "Mara",
        title: "Bridge Warden",
        tier: { id: "gold", label: "Gold" },
        rating: 1442,
        wins: 9,
        losses: 4,
        draws: 1,
      },
    ]);

    const row = walk(body, (node) => hasClass(node, "ranked-leaderboard-row"))[0];
    assert.ok(row);
    assert.equal(walk(row, (node) => hasClass(node, "ranked-leaderboard-player"))[0]?.textContent, "Mara");
    assert.equal(walk(row, (node) => hasClass(node, "ranked-leaderboard-title"))[0]?.textContent, "Bridge Warden");
    assert.match(textContent(row), /9W \/ 4L \/ 1D/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("ranked leaderboard top tab shows only the first ten entries", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    rank: index + 1,
    playerId: `pilot-${index + 1}`,
    displayName: `Pilot ${index + 1}`,
    tier: { id: index < 6 ? "gold" : "silver", label: index < 6 ? "Gold" : "Silver" },
  }));

  const visible = filterLeaderboardEntries(entries, { tab: "top" });

  assert.equal(visible.length, 10);
  assert.deepEqual(visible.map((entry) => entry.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("ranked leaderboard tier tabs filter by normalized tier id", () => {
  const entries = [
    { rank: 1, displayName: "Mara", tier: { id: "gold", label: "Gold" } },
    { rank: 2, displayName: "Vale", tier: { id: "grand-master", label: "Grandmaster" } },
    { rank: 3, displayName: "Iris", tier: { id: "silver", label: "Silver" } },
  ];

  const visible = filterLeaderboardEntries(entries, { tab: "grandmaster" });

  assert.deepEqual(visible.map((entry) => entry.displayName), ["Vale"]);
});

test("ranked leaderboard search finds loaded players outside the top ten", () => {
  const entries = Array.from({ length: 15 }, (_, index) => ({
    rank: index + 1,
    playerId: `pilot-${index + 1}`,
    displayName: index === 12 ? "Needle Commander" : `Pilot ${index + 1}`,
    title: index === 12 ? "Hidden in the ladder" : "",
    tier: { id: "bronze", label: "Bronze" },
  }));

  const visible = filterLeaderboardEntries(entries, { tab: "top", search: "needle" });

  assert.equal(visible.length, 1);
  assert.equal(visible[0].rank, 13);
});
