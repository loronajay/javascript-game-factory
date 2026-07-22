import test from "node:test";
import assert from "node:assert/strict";

import { renderLeaderboard } from "../src/ui/rankedLeaderboard.js";

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
