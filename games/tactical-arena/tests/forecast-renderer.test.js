import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState } from "../src/core/state.js";
import { renderForecast } from "../src/ui/forecastRenderer.js";

class TestSvgElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.textContent = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }
}

function withSvgDocument(fn) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };
  try {
    return fn();
  } finally {
    globalThis.document = previousDocument;
  }
}

function textContentOf(element) {
  return [element.textContent, ...element.children.flatMap(textContentOf)].join("");
}

test("self-centered blast arts do not render single-target forecast badges", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-necro", player: 1, type: "necromancer", x: 5, y: 5 },
        { id: "p2-in", player: 2, type: "swordsman", x: 5, y: 8 },
        { id: "p2-out", player: 2, type: "swordsman", x: 9, y: 5 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-necro");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:dark-bomb", actor, resolving: false });

    assert.equal(forecastLayer.children.length, 0);
  });
});

test("targeted spell arts still render their normal damage forecast", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-mag", player: 1, type: "magician", x: 0, y: 0 },
        { id: "p2-sword", player: 2, type: "swordsman", x: 3, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-mag");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:spark", actor, resolving: false });

    assert.equal(forecastLayer.children.length, 1);
    assert.equal(textContentOf(forecastLayer), "-6");
  });
});
