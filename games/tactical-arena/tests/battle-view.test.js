import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, moveUnit } from "../src/core/commands.js";
import { canCancelMoveInActivation, canMoveInActivation } from "../src/ui/hud.js";
import { renderActions, renderSquads, renderUnitCard } from "../src/ui/hud.js";
import { isTargetedMode, renderBoard } from "../src/ui/boardRenderer.js";
import { createUnitFigure } from "../src/ui/unitRenderer.js";
import { createEffects } from "../src/ui/effects.js";
import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { buildCodex, buildCodexForTypes, mountCodex } from "../src/ui/codex.js";

class TestStyle {
  constructor() {
    this.props = new Map();
  }

  setProperty(name, value) {
    this.props.set(name, value);
  }

  removeProperty(name) {
    this.props.delete(name);
  }
}

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.style = new TestStyle();
    this.listeners = new Map();
    this.dataset = {};
    this.textContent = "";
    this._innerHTML = "";
    this.classList = {
      add: (...names) => this.setClasses([...new Set([...this.classNames(), ...names])]),
      remove: (...names) => this.setClasses(this.classNames().filter((name) => !names.includes(name))),
      contains: (name) => this.classNames().includes(name),
      toggle: (name, force) => {
        const has = this.classNames().includes(name);
        const shouldAdd = force ?? !has;
        if (shouldAdd && !has) this.classList.add(name);
        if (!shouldAdd && has) this.classList.remove(name);
        return shouldAdd;
      }
    };
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
    if (value.includes('class="squad-list"')) {
      const list = new TestElement("div");
      list.className = "squad-list";
      this.children.push(list);
    }
  }

  get innerHTML() {
    return this._innerHTML;
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

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  querySelector(selector) {
    if (!selector.startsWith(".")) return null;
    const className = selector.slice(1);
    return this.findByClass(className);
  }

  querySelectorAll(selector) {
    if (!selector.startsWith(".")) return [];
    const className = selector.slice(1);
    return this.findAllByClass(className);
  }

  findByClass(className) {
    if (this.className.split(/\s+/).includes(className)) return this;
    for (const child of this.children) {
      const match = child.findByClass(className);
      if (match) return match;
    }
    return null;
  }

  findAllByClass(className) {
    const matches = [];
    if (this.className.split(/\s+/).includes(className)) matches.push(this);
    for (const child of this.children) {
      matches.push(...(child.findAllByClass?.(className) ?? []));
    }
    return matches;
  }

  classNames() {
    return this.className.split(/\s+/).filter(Boolean);
  }

  setClasses(names) {
    this.className = names.join(" ");
  }
}

class TestSvgElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = "";
    this.classList = {
      add: (...names) => this.setClasses([...new Set([...this.classNames(), ...names])]),
      remove: (...names) => this.setClasses(this.classNames().filter((name) => !names.includes(name))),
      contains: (name) => this.classNames().includes(name),
      toggle: (name, force) => {
        const has = this.classNames().includes(name);
        const shouldAdd = force ?? !has;
        if (shouldAdd && !has) this.classList.add(name);
        if (!shouldAdd && has) this.classList.remove(name);
        return shouldAdd;
      }
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "class") this.className = String(value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
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

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  animate(frames, options) {
    this.animations ??= [];
    this.animations.push({ frames, options });
    return { finished: Promise.resolve() };
  }

  remove() {
    this.removed = true;
  }

  classNames() {
    return this.className.split(/\s+/).filter(Boolean);
  }

  setClasses(names) {
    this.className = names.join(" ");
    this.attributes.set("class", this.className);
  }

  findByClass(className) {
    if (this.className.split(/\s+/).includes(className)) return this;
    for (const child of this.children) {
      const match = child.findByClass?.(className);
      if (match) return match;
    }
    return null;
  }

  findAllByClass(className) {
    const matches = [];
    if (this.className.split(/\s+/).includes(className)) matches.push(this);
    for (const child of this.children) {
      matches.push(...(child.findAllByClass?.(className) ?? []));
    }
    return matches;
  }
}

test("the default duel uses the standard thirteen-tile map and four-unit corner staging", () => {
  const state = createBattleState();
  assert.equal(state.size, 13);
  assert.deepEqual(
    state.units.map((unit) => [unit.id, unit.position]),
    [
      ["p1-swordsman", { x: 1, y: 12 }],
      ["p1-archer", { x: 0, y: 11 }],
      ["p1-mystic", { x: 0, y: 12 }],
      ["p1-magician", { x: 1, y: 11 }],
      ["p2-swordsman", { x: 11, y: 0 }],
      ["p2-archer", { x: 12, y: 1 }],
      ["p2-mystic", { x: 12, y: 0 }],
      ["p2-magician", { x: 11, y: 1 }]
    ]
  );
});

test("the action bar keeps Move available after attacking if movement is unused", () => {
  assert.equal(canMoveInActivation({ moved: false, primaryUsed: true }), true);
  assert.equal(canMoveInActivation({ moved: true, primaryUsed: false }), false);
  assert.equal(canMoveInActivation({ moved: true, primaryUsed: true }), false);
});

test("the action bar hides commands when the active turn is not locally controllable", () => {
  const started = applyCommand(createBattleState(), beginActivation(1, "p1-swordsman"));
  assert.equal(started.accepted, true);
  const state = started.nextState;
  const unit = state.units.find((candidate) => candidate.id === "p1-swordsman");
  const actions = { innerHTML: "", querySelectorAll: () => [] };
  const actionHelp = { textContent: "" };

  renderActions(unit, state, null, { actions, actionHelp }, {
    resolving: false,
    controlsEnabled: false,
    lockedMessage: "Enemy turn - commands hidden.",
    onActionClick: () => assert.fail("hidden commands should not be clickable")
  });

  assert.equal(actions.innerHTML, "");
  assert.equal(actionHelp.textContent, "Enemy turn - commands hidden.");
});

test("the action bar enables Cancel Move only after an uncommitted move", () => {
  const started = applyCommand(createBattleState(), beginActivation(1, "p1-swordsman"));
  assert.equal(started.accepted, true);
  const unit = started.nextState.units.find((candidate) => candidate.id === "p1-swordsman");
  const actions = { innerHTML: "", querySelectorAll: () => [] };
  const actionHelp = { textContent: "" };

  renderActions(unit, started.nextState, null, { actions, actionHelp }, {
    resolving: false,
    controlsEnabled: true,
    onActionClick: () => {}
  });
  assert.match(actions.innerHTML, /data-action="cancel-move"[^>]*disabled/);

  const moved = applyCommand(started.nextState, moveUnit(1, "p1-swordsman", 2, 12));
  assert.equal(moved.accepted, true);
  renderActions(unit, moved.nextState, null, { actions, actionHelp }, {
    resolving: false,
    controlsEnabled: true,
    onActionClick: () => {}
  });
  assert.match(actions.innerHTML, /data-action="cancel-move"/);
  assert.doesNotMatch(actions.innerHTML, /data-action="cancel-move"[^>]*disabled/);
});

test("the action bar disables Cancel Move after raging Fat Knight Trample movement", () => {
  const state = createBattleState({
    size: 13,
    seed: 7,
    units: [
      { id: "fk", type: "fat-knight", player: 1, x: 5, y: 5, hp: 5 },
      { id: "e", type: "swordsman", player: 2, x: 6, y: 5 }
    ]
  });
  const started = applyCommand(state, beginActivation(1, "fk"));
  assert.equal(started.accepted, true);
  const moved = applyCommand(started.nextState, moveUnit(1, "fk", 7, 5));
  assert.equal(moved.accepted, true);
  const unit = moved.nextState.units.find((candidate) => candidate.id === "fk");
  const actions = { innerHTML: "", querySelectorAll: () => [] };
  const actionHelp = { textContent: "" };

  assert.equal(canCancelMoveInActivation(moved.nextState.activation, unit), false);
  renderActions(unit, moved.nextState, null, { actions, actionHelp }, {
    resolving: false,
    controlsEnabled: true,
    onActionClick: () => {}
  });

  assert.match(actions.innerHTML, /data-action="cancel-move"[^>]*disabled/);
  assert.match(actionHelp.textContent, /Trample movement is committed/);
});

test("the squad HUD renders each player as four stacked unit rows", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new TestElement(tagName) };

  try {
    const overlay = new TestElement("div");
    renderSquads(createBattleState(), overlay, () => {});

    assert.equal(overlay.children.length, 2);
    for (const panel of overlay.children) {
      const list = panel.querySelector(".squad-list");
      assert.ok(list, "panel should include a squad list");
      assert.equal(list.children.length, 4);
      assert.ok(list.children.every((row) => row.className.includes("squad-unit")));
      assert.ok(list.children.every((row) => !row.className.includes("squad-chip")));
    }
  } finally {
    globalThis.document = previousDocument;
  }
});

test("spent defending squad rows keep Done in the status tag strip", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new TestElement(tagName) };

  try {
    const state = createBattleState();
    const unit = state.units.find((candidate) => candidate.id === "p1-swordsman");
    unit.spent = true;
    unit.defending = true;

    const overlay = new TestElement("div");
    renderSquads(state, overlay, () => {});

    const firstPlayerRows = overlay.children[0].querySelector(".squad-list").children;
    const spentRow = firstPlayerRows.find((row) => row.className.includes("spent"));
    assert.ok(spentRow, "spent unit should render as a spent squad row");
    assert.match(spentRow.innerHTML, /<span class="unit-tag on">Defending<\/span>/);
    assert.match(spentRow.innerHTML, /<span class="unit-tag spent">Done<\/span>/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("raging board units carry a rage state class and aura element", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const metrics = { tileWidth: 58, tileHeight: 29, originX: 0, originY: 0 };
    const unit = {
      id: "p1-rage",
      player: 1,
      type: "swordsman",
      hp: 5,
      mp: 12,
      position: { x: 0, y: 0 },
      statuses: [],
      statModifiers: {}
    };

    const token = createUnitFigure(metrics, unit, { onUnitClick: () => {} });

    assert.match(token.getAttribute("class"), /\bis-raging\b/);
    assert.ok(token.findByClass("rage-aura"), "raging units should draw a persistent rage aura");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("board sprite facing follows player ownership instead of board position", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const metrics = { tileWidth: 58, tileHeight: 29, originX: 0, originY: 0 };
    const state = createBattleState();
    const makeUnit = (id, player, position) => ({
      id,
      player,
      type: "swordsman",
      hp: 25,
      mp: 20,
      position,
      statuses: [],
      statModifiers: {}
    });

    const p1Token = createUnitFigure(metrics, makeUnit("p1-crossed", 1, { x: 9, y: 9 }), { state, onUnitClick: () => {} });
    const p2Token = createUnitFigure(metrics, makeUnit("p2-left", 2, { x: 1, y: 1 }), { state, onUnitClick: () => {} });

    assert.equal(p1Token.findByClass("sprite-figure").getAttribute("transform"), null);
    assert.equal(p2Token.findByClass("sprite-figure").getAttribute("transform"), "scale(-1 1)");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("an ART callout is a fixed one-shot overlay instead of a unit child", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };
  globalThis.window = { matchMedia: () => ({ matches: false }) };

  try {
    const metrics = { tileWidth: 58, tileHeight: 29, originX: 0, originY: 0 };
    const effectsLayer = new TestSvgElement("g");
    const effects = createEffects({
      board: null,
      unitsLayer: { querySelector: () => null },
      effectsLayer,
      diceOverlay: null,
      dieFace: null,
      metrics,
      audio: { play() {} }
    });

    effects.artCallout({ id: "p1-caster", position: { x: 1, y: 2 } }, "Spark");

    assert.equal(effectsLayer.children.length, 1);
    const callout = effectsLayer.children[0];
    assert.match(callout.getAttribute("class"), /\bfx-art-callout\b/);
    assert.equal(callout.getAttribute("aria-label"), "Spark");
    assert.equal(callout.findByClass("fx-art-callout-label").textContent, "Spark");

    const firstFrame = callout.animations[0].frames[0];
    const lastFrame = callout.animations[0].frames.at(-1);
    assert.match(firstFrame.transform, /^translate\([^)]*\) scale/);
    assert.match(lastFrame.transform, /^translate\([^)]*\) scale/);
    assert.equal(firstFrame.opacity, 0);
    assert.equal(lastFrame.opacity, 0);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test("the selected-unit HUD gains a rage glow state", () => {
  const state = createBattleState();
  const unit = state.units.find((candidate) => candidate.id === "p1-swordsman");
  unit.hp = 5;
  const unitCard = new TestElement("div");
  unitCard.className = "unit-card";

  renderUnitCard(unit, state, unitCard);

  assert.match(unitCard.className, /\bis-raging\b/);
  assert.match(unitCard.innerHTML, /<span class="unit-tag rage"/);

  renderUnitCard(null, state, unitCard);
  assert.doesNotMatch(unitCard.className, /\bis-raging\b/);
});

test("raging squad rows get an obvious HUD state", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new TestElement(tagName) };

  try {
    const state = createBattleState();
    state.units.find((candidate) => candidate.id === "p1-swordsman").hp = 5;

    const overlay = new TestElement("div");
    renderSquads(state, overlay, () => {});

    const ragingRow = overlay.children[0].querySelector(".squad-list").children[0];
    assert.match(ragingRow.className, /\bis-raging\b/);
    assert.match(ragingRow.innerHTML, /<span class="unit-tag rage"/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("the board only treats attack and enemy-target ARTS as targeted modes", () => {
  const actor = { type: "mystic" };

  assert.equal(isTargetedMode("attack", actor), true);
  assert.equal(isTargetedMode("art:silence", actor), true);
  assert.equal(isTargetedMode("art:pray", actor), false);
  assert.equal(isTargetedMode("art:wish", actor), false);
  assert.equal(isTargetedMode("art:volley-shot", { type: "archer" }), false);
});

test("Curve Shot highlights an enemy behind an intervening unit as a legal target", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const state = createBattleState({
      size: 8,
      units: [
        { id: "fb", player: 1, type: "fat-bowman", x: 0, y: 0 },
        { id: "screen", player: 1, type: "swordsman", x: 1, y: 0 },
        { id: "target", player: 2, type: "swordsman", x: 3, y: 0 }
      ]
    });
    const board = new TestSvgElement("svg");
    const boardLayer = new TestSvgElement("g");
    const unitsLayer = new TestSvgElement("g");

    renderBoard({
      board,
      boardLayer,
      unitsLayer,
      state,
      mode: "art:curve-shot",
      selectedId: "fb",
      footworkPath: [],
      onTileClick: () => {}
    });

    assert.equal(boardLayer.findAllByClass("legal-art").length, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("Build Cover walls render as low pass-through cover instead of click-blocking slabs", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const state = createBattleState({
      size: 10,
      units: [
        { id: "p1", player: 1, type: "sniper", x: 0, y: 0 },
        { id: "p2", player: 2, type: "swordsman", x: 9, y: 9 }
      ],
      tileObjects: [{ kind: "wall", x: 4, y: 4, hp: 1 }]
    });
    const board = new TestSvgElement("svg");
    const boardLayer = new TestSvgElement("g");
    const unitsLayer = new TestSvgElement("g");

    renderBoard({
      board,
      boardLayer,
      unitsLayer,
      state,
      mode: null,
      selectedId: null,
      footworkPath: [],
      onTileClick: () => {}
    });

    const wall = unitsLayer.findByClass("tile-wall");
    assert.ok(wall, "wall figure should render");
    assert.match(wall.getAttribute("class"), /\btile-wall--low-cover\b/);
    assert.equal(wall.listeners.has("click"), false, "wall body should not intercept clicks meant for tiles behind it");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("the codex describes either-order movement and primary actions", () => {
  const html = buildCodex();

  assert.match(html, /Move and act in either order/);
  assert.doesNotMatch(html, /Move, then attack or defend/);
});

test("the codex lists Stun as an auto-spent status effect", () => {
  const html = buildCodex();

  assert.match(html, /<span class="ref-tag status">Stun<\/span>/);
  assert.match(html, /auto-spent/);
});

test("the mounted codex separates unit categories from the statuses tab", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new TestElement(tagName) };

  try {
    const container = new TestElement("div");
    mountCodex(container, [
      UNIT_TYPES.swordsman,
      UNIT_TYPES.archer,
      UNIT_TYPES.mystic,
      UNIT_TYPES.paladin
    ]);

    const layout = container.children[0];
    const categoryTabs = layout.findByClass("codex-category-tabs");
    const body = layout.findByClass("codex-body");
    const nav = layout.findByClass("codex-nav");
    const detail = layout.findByClass("codex-detail");

    assert.ok(categoryTabs, "codex should render a top-level category tab strip");
    assert.deepEqual(
      categoryTabs.children.map((tab) => tab.textContent),
      ["Melees", "Rangers", "Supports", "Statuses"]
    );
    assert.deepEqual(
      nav.children.map((button) => button.dataset.unitId),
      ["swordsman", "paladin"]
    );
    assert.equal(nav.children.some((button) => button.dataset.unitId === "__status__"), false);

    const statusTab = categoryTabs.children.find((tab) => tab.dataset.categoryId === "__status__");
    statusTab.listeners.get("click")();

    assert.match(body.className, /\bis-status-view\b/);
    assert.equal(nav.children.length, 0);
    assert.match(detail.innerHTML, /Status Effects/);

    const rangerTab = categoryTabs.children.find((tab) => tab.dataset.categoryId === "ranger");
    rangerTab.listeners.get("click")();

    assert.doesNotMatch(body.className, /\bis-status-view\b/);
    assert.deepEqual(nav.children.map((button) => button.dataset.unitId), ["archer"]);

    const fullContainer = new TestElement("div");
    mountCodex(fullContainer, Object.values(UNIT_TYPES));
    const fullTabs = fullContainer.children[0].findByClass("codex-category-tabs");
    assert.ok(fullTabs.children.some((tab) => tab.textContent === "Summons"));

    const summonTab = fullTabs.children.find((tab) => tab.dataset.categoryId === "summon");
    summonTab.listeners.get("click")();
    const fullNav = fullContainer.children[0].findByClass("codex-nav");
    assert.deepEqual(fullNav.children.map((button) => button.dataset.unitId), ["ghoul"]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("the Paladin codex entry lists Hand of Life and the full passive stack", () => {
  const html = buildCodexForTypes([UNIT_TYPES.paladin]);

  assert.match(html, /Hand of Life/);
  assert.match(html, /Chosen/);
  assert.match(html, /Heaven's Realm/);
  assert.match(html, /Darkseeker/);
});

test("the fat squad and Nemesis codex entries include rage-passive details", () => {
  const html = buildCodexForTypes([
    UNIT_TYPES["fat-knight"],
    UNIT_TYPES["fat-bowman"],
    UNIT_TYPES.nemesis
  ]);

  assert.match(html, /Trample/);
  assert.match(html, /Desperation Shot/);
  assert.match(html, /20, 15, 10, and 5 HP/);
  assert.match(html, /no MP cost/);
});
