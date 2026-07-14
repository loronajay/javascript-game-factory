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

function badgeTextsByClass(forecastLayer, cls) {
  return forecastLayer.children
    .filter((child) => child.getAttribute("class")?.split(/\s+/).includes(cls))
    .map(textContentOf);
}

test("forecast rendering clears stale badges when disabled", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
        { id: "p2-sword", player: 2, type: "swordsman", x: 3, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-archer");
    const forecastLayer = new TestSvgElement("g");
    forecastLayer.append(new TestSvgElement("g"));

    renderForecast({ forecastLayer, state, mode: "attack", actor, resolving: false, enabled: false });

    assert.equal(forecastLayer.children.length, 0);
  });
});

test("self-centered blast arts render damage forecast badges for enemies in the blast", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-mag", player: 1, type: "magician", x: 5, y: 5, hp: 4 },
        { id: "p2-in", player: 2, type: "swordsman", x: 5, y: 8 },
        { id: "p2-out", player: 2, type: "swordsman", x: 9, y: 5 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-mag");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:nuke", actor, resolving: false });

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["100%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-attack"), ["-12"]);
  });
});

test("targeted blast arts render damage forecasts around the hovered tile", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-clod", player: 1, type: "clod", x: 5, y: 5, hp: 4 },
        { id: "p2-in", player: 2, type: "swordsman", x: 6, y: 6 },
        { id: "p2-out", player: 2, type: "swordsman", x: 9, y: 9 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-clod");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:thunderous-charge", actor, resolving: false, areaCenter: { x: 5, y: 5 } });

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["100%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-attack"), ["-5"]);
  });
});

test("cone arts render damage forecasts around the hovered cone", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-archer", player: 1, type: "archer", x: 5, y: 5 },
        { id: "p2-near", player: 2, type: "swordsman", x: 5, y: 6 },
        { id: "p2-out", player: 2, type: "swordsman", x: 6, y: 5 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-archer");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:volley-shot", actor, resolving: false, areaCenter: { x: 5, y: 6 } });

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["100%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-attack"), ["-4"]);
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

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["93%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-attack"), ["-6"]);
  });
});

test("blind targeted spell arts still render damage instead of miss", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-mag", player: 1, type: "magician", x: 0, y: 0, statuses: [{ type: "blind", duration: 1 }] },
        { id: "p2-sword", player: 2, type: "swordsman", x: 3, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-mag");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:spark", actor, resolving: false });

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["93%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-attack"), ["-6"]);
  });
});

test("targeted utility arts do not render damage forecast badges", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-fat-wizard", player: 1, type: "fat-wizard", x: 0, y: 0 },
        { id: "p2-sword", player: 2, type: "swordsman", x: 3, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-fat-wizard");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:study", actor, resolving: false });

    assert.equal(forecastLayer.children.length, 0);
  });
});

test("rush-path arts do not render single-target forecast badges", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "fk", player: 1, type: "fat-knight", x: 0, y: 0 },
        { id: "p2-sword", player: 2, type: "swordsman", x: 2, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "fk");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:stumble", actor, resolving: false });

    assert.equal(forecastLayer.children.length, 0);
  });
});

test("Angel basic attack forecast uses magic damage instead of physical chip", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-angel", player: 1, type: "angel", x: 0, y: 0 },
        { id: "p2-sword", player: 2, type: "swordsman", x: 3, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-angel");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "attack", actor, resolving: false });

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["93%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-attack"), ["-3"]);
  });
});

test("Angel basic attack forecast does not show through an intervening body", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-angel", player: 1, type: "angel", x: 0, y: 0 },
        { id: "p2-block", player: 2, type: "swordsman", x: 1, y: 0 },
        { id: "p2-sword", player: 2, type: "swordsman", x: 2, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-angel");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "attack", actor, resolving: false });

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["93%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-attack"), ["-3"]);
  });
});

test("Rocket Punch (fixed-power line strike) does not render a badge derived from live STR", () => {
  // Regression: Rocket Punch is a FIXED 10-power physical strike (resolveRocketPunch),
  // not a STR-scaled attack. Before this fix, its "lineEnemy" shape slipped through
  // isForecastableStrikeArt and got a badge from resolveBaseStrike/resolvePhysicalStrike,
  // which uses the Juggernaut's live effective STR instead of the authored fixed amount
  // — showing a number the ability could never actually deal.
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "jug", player: 1, type: "juggernaut", x: 0, y: 0 },
        { id: "p2-sword", player: 2, type: "swordsman", x: 3, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "jug");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:rocket-punch", actor, resolving: false });

    assert.equal(forecastLayer.children.length, 0);
  });
});

test("Flight (tile-placement blast) does not render a badge against the attacker's own tile", () => {
  // Regression: Flight lands its true-damage blast around a chosen destination TILE, not
  // the attacker's current position. Its "flightMove" shape used to slip through the
  // filter and show a physical STR-vs-DEF badge on enemies near the attacker instead of
  // the correct flat-2-true-damage blast near wherever the player lands.
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "gar", player: 1, type: "gargoyle", x: 0, y: 0 },
        { id: "p2-sword", player: 2, type: "swordsman", x: 1, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "gar");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:flight", actor, resolving: false });

    assert.equal(forecastLayer.children.length, 0);
  });
});

test("Curve Shot forecast shows through an intervening unit", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "fb", player: 1, type: "fat-bowman", x: 0, y: 0 },
        { id: "screen", player: 1, type: "swordsman", x: 1, y: 0 },
        { id: "target", player: 2, type: "swordsman", x: 3, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "fb");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:curve-shot", actor, resolving: false });

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["93%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-attack"), ["-3"]);
  });
});

test("raging Archer attack forecasts 100 percent accuracy above damage", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0, hp: 5 },
        { id: "p2-sword", player: 2, type: "swordsman", x: 5, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-archer");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "attack", actor, resolving: false });

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["100%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-attack"), ["-4"]);
  });
});

test("blinded physical attack art forecasts zero percent accuracy above miss", () => {
  withSvgDocument(() => {
    const state = createBattleState({
      units: [
        { id: "p1-sword", player: 1, type: "swordsman", x: 0, y: 0, statuses: [{ type: "blind", duration: 1 }] },
        { id: "p2-sword", player: 2, type: "swordsman", x: 1, y: 0 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "p1-sword");
    const forecastLayer = new TestSvgElement("g");

    renderForecast({ forecastLayer, state, mode: "art:moonstrike", actor, resolving: false });

    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-accuracy"), ["0%"]);
    assert.deepEqual(badgeTextsByClass(forecastLayer, "fc-miss"), ["miss"]);
  });
});
