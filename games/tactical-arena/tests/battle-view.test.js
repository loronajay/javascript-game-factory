import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBattleState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, moveUnit } from "../src/core/commands.js";
import { TEMPO_GAUGE_MAX, enableTempoBattle } from "../src/core/tempoBattle.js";
import { canCancelMoveInActivation, canMoveInActivation } from "../src/ui/hud.js";
import { renderActions, renderSquads, renderUnitCard } from "../src/ui/hud.js";
import { isHealArtConfirmTile, isTargetedMode, renderBoard } from "../src/ui/boardRenderer.js";
import { getActiveBoardWeather } from "../src/ui/boardAtmosphere.js";
import { createUnitFigure, UNIT_VISUAL_LIFT } from "../src/ui/unitRenderer.js";
import { createEffects } from "../src/ui/effects.js";
import { UNIT_TYPES, getArt } from "../src/core/unitCatalog.js";
import { buildCodex, buildCodexForTypes, mountCodex } from "../src/ui/codex.js";

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STYLE_CSS = ["board", "overlays", "effects", "scene"]
  .map((name) => readFileSync(join(GAME_ROOT, "styles", "battle", `${name}.css`), "utf8"))
  .join("\n");

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
    const squadListClass = value.match(/class="([^"]*\bsquad-list\b[^"]*)"/)?.[1];
    if (squadListClass) {
      const list = new TestElement("div");
      list.className = squadListClass;
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

  animate(frames, options) {
    this.animations ??= [];
    this.animations.push({ frames, options });
    return { finished: Promise.resolve() };
  }

  remove() {
    this.removed = true;
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

  querySelector(selector) {
    if (selector.startsWith(".")) return this.findByClass(selector.slice(1));
    const attr = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
    if (attr) return findSvgByAttribute(this, attr[1], attr[2]);
    return null;
  }

  querySelectorAll(selector) {
    if (!selector.startsWith(".")) return [];
    return this.findAllByClass(selector.slice(1));
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

function findSvgByAttribute(root, name, value) {
  if (root.getAttribute?.(name) === value) return root;
  for (const child of root.children ?? []) {
    const match = findSvgByAttribute(child, name, value);
    if (match) return match;
  }
  return null;
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

test("the accuracy forecast toggle lives in the topbar instead of the command console", () => {
  const html = readFileSync(join(GAME_ROOT, "html/match-screen.html"), "utf8");
  const topbar = html.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0] ?? "";
  const commandConsole = html.match(/<section class="panel command-console">[\s\S]*?<\/section>/)?.[0] ?? "";
  const boardCss = readFileSync(join(GAME_ROOT, "styles/battle/board.css"), "utf8");

  assert.match(topbar, /id="accuracyForecastToggle"/);
  assert.match(topbar, /class="forecast-toggle topbar-forecast"/);
  assert.doesNotMatch(commandConsole, /id="accuracyForecastToggle"/);
  assert.doesNotMatch(commandConsole, /class="forecast-toggle/);
  assert.match(commandConsole, /id="actionHelp"/);
  assert.match(boardCss, /\.battle-assist\s*\{/);
  assert.match(boardCss, /\.topbar-forecast\s*\{/);
  assert.match(boardCss, /\.forecast-toggle\s*\{/);
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

test("the action bar displays effective ART MP costs after team discounts", () => {
  const state = createBattleState({
    units: [
      { id: "nem", type: "nemesis", player: 1, x: 0, y: 0 },
      { id: "mage", type: "magician", player: 1, x: 1, y: 0 },
      { id: "foe", type: "swordsman", player: 2, x: 4, y: 0 }
    ]
  });
  const started = applyCommand(state, beginActivation(1, "mage"));
  assert.equal(started.accepted, true);
  const mage = started.nextState.units.find((candidate) => candidate.id === "mage");
  const actions = { innerHTML: "", querySelectorAll: () => [] };
  const actionHelp = { textContent: "" };

  renderActions(mage, started.nextState, null, { actions, actionHelp }, {
    resolving: false,
    controlsEnabled: true,
    onActionClick: () => {}
  });

  assert.match(actions.innerHTML, /Spark<kbd class="key">3<span class="kbd-unit">MP<\/span><\/kbd>/);
  assert.match(actions.innerHTML, /title="Spark [^"]*3 MP/);
  assert.doesNotMatch(actions.innerHTML, /Spark<kbd class="key">4<span class="kbd-unit">MP<\/span><\/kbd>/);
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

test("four-player team HUD uses compact chips in every player slot", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new TestElement(tagName) };

  try {
    const overlay = new TestElement("div");
    renderSquads(createBattleState({ playerCount: 4, format: "teams" }), overlay, () => {});

    assert.equal(overlay.children.length, 4);
    assert.deepEqual(
      overlay.children.map((panel) => panel.classNames().find((name) => name.startsWith("slot-"))),
      ["slot-1", "slot-2", "slot-3", "slot-4"],
    );
    assert.match(overlay.children[0].innerHTML, /Player 1 - Team 1/);
    assert.match(overlay.children[1].innerHTML, /Player 2 - Team 2/);
    assert.match(overlay.children[2].innerHTML, /Player 3 - Team 1/);
    assert.match(overlay.children[3].innerHTML, /Player 4 - Team 2/);
    assert.ok(overlay.children.every((panel) => panel.className.includes("is-compact")));
    assert.ok(overlay.children.every((panel) => panel.querySelector(".squad-list").className.includes("is-compact-grid")));
    assert.equal(overlay.children[0].querySelector(".squad-list").children.length, 4);
    assert.ok(overlay.children[0].querySelector(".squad-list").children.every((row) => row.className.includes("squad-chip")));
    assert.doesNotMatch(overlay.children[0].innerHTML, /unit-statline/);
    assert.match(STYLE_CSS, /\.squad-overlay\.slot-3\s*\{\s*top:\.75rem;\s*left:\.75rem;/);
    assert.match(STYLE_CSS, /\.squad-overlay\.slot-4\s*\{\s*top:\.75rem;\s*right:\.75rem;/);
    assert.match(STYLE_CSS, /\.panel\.squad-overlay\.is-compact\s*\{[^}]*width:clamp\(12\.25rem,18vw,15\.5rem\)/);
    assert.match(STYLE_CSS, /\.squad-list\.is-compact-grid\s*\{/);
    assert.match(STYLE_CSS, /\.squad-chip-body\s*\{[^}]*width:100%/);
    assert.match(STYLE_CSS, /\.squad-overlay\.is-compact \.vital\s*\{[^}]*minmax\(2\.2rem,1fr\)/);
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

test("tempo squad rows are selectable for ready units while no squad turn is active", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new TestElement(tagName) };

  try {
    const state = enableTempoBattle(createBattleState({
      units: [
        { id: "p1-ready", player: 1, type: "archer", x: 0, y: 0 },
        { id: "p1-waiting", player: 1, type: "swordsman", x: 1, y: 0 },
        { id: "p2-ready", player: 2, type: "clod", x: 7, y: 7 }
      ]
    }), { readiness: { "p1-ready": TEMPO_GAUGE_MAX, "p2-ready": TEMPO_GAUGE_MAX } });
    const selected = [];
    const overlay = new TestElement("div");

    renderSquads(state, overlay, (unit) => selected.push(unit.id));

    const rows = overlay.children.flatMap((panel) => panel.querySelector(".squad-list").children);
    const readyRow = rows.find((row) => row.innerHTML.includes("Archer"));
    const waitingRow = rows.find((row) => row.innerHTML.includes("Swordsman"));
    assert.match(readyRow.className, /\bselectable\b/);
    assert.doesNotMatch(waitingRow.className, /\bselectable\b/);

    readyRow.listeners.get("click")();
    assert.deepEqual(selected, ["p1-ready"]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("main menu does not expose Tempo Battle while it is out of scope", () => {
  const html = readFileSync(join(GAME_ROOT, "html/menu-screens.html"), "utf8");
  const mainMenu = html.match(/data-screen="mainMenu"[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.doesNotMatch(mainMenu, /data-nav="tempoMenu"/);
  assert.doesNotMatch(mainMenu, />\s*Tempo Battle\s*</);
});

test("tempo setup board-size labels use the same readable multiplication sign as other setup screens", () => {
  const html = readFileSync(join(GAME_ROOT, "html/setup-screens.html"), "utf8");
  const tempoSetup = html.match(/data-screen="tempoSpSetup"[\s\S]*?data-action="startTempoSingle"/)?.[0] ?? "";

  assert.match(tempoSetup, /13 × 13/);
  assert.match(tempoSetup, /15 × 15/);
  assert.doesNotMatch(tempoSetup, /Ã/);
});

test("local match setup exposes compact board sizes from fifteen down to seven", () => {
  const html = readFileSync(join(GAME_ROOT, "html/setup-screens.html"), "utf8");
  const expectedSizes = [15, 14, 13, 12, 11, 10, 9, 8, 7];

  for (const [screen, startAction] of [
    ["hsSetup", "startHotSeat"],
    ["spSetup", "startSingle"],
    ["tempoSpSetup", "startTempoSingle"],
  ]) {
    const setup = html.match(new RegExp(`data-screen="${screen}"[\\s\\S]*?data-action="${startAction}"`))?.[0] ?? "";
    const boardControl = setup.match(/<div class="segmented board-size-grid" data-field="boardSize">[\s\S]*?<\/div>/)?.[0] ?? "";
    const sizes = [...boardControl.matchAll(/data-size="(\d+)"/g)].map((match) => Number(match[1]));

    assert.deepEqual(sizes, expectedSizes, `${screen} should offer every board size from 15 to 7`);
    assert.match(boardControl, /class="seg is-selected" data-size="13">13 × 13<\/button>/);
  }
});

test("hot-seat setup enables three-player free-for-all and reserves teams for four players", () => {
  const html = readFileSync(join(GAME_ROOT, "html/setup-screens.html"), "utf8");
  const setup = html.match(/data-screen="hsSetup"[\s\S]*?data-action="startHotSeat"/)?.[0] ?? "";
  const playerControl = setup.match(/<div class="segmented" data-field="playerCount">[\s\S]*?<\/div>/)?.[0] ?? "";

  assert.match(playerControl, /data-count="3">3<\/button>/);
  assert.doesNotMatch(playerControl, /data-count="3" disabled/);
  assert.match(setup, /Three-player matches are free-for-all/);
  assert.match(setup, /four players can play FFA or 2v2/);
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

test("painted board sprites render without a team-color tint wash", () => {
  const spriteRules = STYLE_CSS
    .split("}")
    .filter((rule) => rule.includes(".sprite-img"))
    .join("}");

  assert.doesNotMatch(spriteRules, /url\(#teamTintP[12]\)/, "sprite art should stay true-color so skins remain readable");
});

test("rage styling leaves the ownership coin in the parent team color", () => {
  const ragingCoinRules = STYLE_CSS
    .split("}")
    .filter((rule) => /\.unit\.is-raging\s+\.(?:base-top|base-inlay|rim)\b/.test(rule))
    .join("}");

  assert.doesNotMatch(ragingCoinRules, /#(?:b71f1a|ff5d50)|rgba\(255,\s*(?:48|118),|rgba\(126,\s*18,/i);
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
    const p3Token = createUnitFigure(metrics, makeUnit("p3-left", 3, { x: 11, y: 0 }), { state, onUnitClick: () => {} });

    assert.equal(p1Token.findByClass("sprite-figure").getAttribute("transform"), null);
    assert.equal(p2Token.findByClass("sprite-figure").getAttribute("transform"), "scale(-1 1)");
    assert.equal(p3Token.findByClass("sprite-figure").getAttribute("transform"), "scale(-1 1)");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("board unit visuals sit higher without moving the tile hit diamond", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const metrics = { tileWidth: 58, tileHeight: 29, originX: 0, originY: 0 };
    const state = createBattleState();
    const unit = {
      id: "p1-swordsman",
      player: 1,
      type: "swordsman",
      hp: 25,
      mp: 20,
      position: { x: 0, y: 0 },
      statuses: [],
      statModifiers: {}
    };

    const token = createUnitFigure(metrics, unit, { state, onUnitClick: () => {} });
    const visual = token.findByClass("unit-visual");
    const hit = token.findByClass("unit-hit");
    const points = hit.getAttribute("points").split(" ").map((pair) => pair.split(",").map(Number));

    assert.equal(visual.getAttribute("transform"), `translate(0 ${-UNIT_VISUAL_LIFT})`);
    assert.deepEqual(points, [
      [0, -0.45 * metrics.tileHeight],
      [metrics.tileWidth / 2, 0.05 * metrics.tileHeight],
      [0, 0.55 * metrics.tileHeight],
      [-metrics.tileWidth / 2, 0.05 * metrics.tileHeight]
    ]);
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

test("global ritual VFX use the configured board metrics without throwing", async () => {
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

    await effects.playAbilityVfx("higher-ground", {
      actor: { id: "king", position: { x: 1, y: 1 } },
      targets: [{ id: "ally", position: { x: 2, y: 1 } }]
    });

    const expandingRing = effectsLayer.children.find((child) => (
      child.tagName === "ellipse" && child.animations?.[0]?.frames?.at(-1)?.rx === metrics.tileWidth * 9
    ));
    assert.ok(expandingRing, "the ritual ring should scale from the active board geometry");
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test("blast VFX use the current board metrics without throwing", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };
  globalThis.window = { matchMedia: () => ({ matches: false }) };

  try {
    const initialMetrics = { tileWidth: 58, tileHeight: 29, originX: 0, originY: 0 };
    const resizedMetrics = { tileWidth: 72, tileHeight: 36, originX: 0, originY: 0 };
    const effectsLayer = new TestSvgElement("g");
    const effects = createEffects({
      board: null,
      unitsLayer: { querySelector: () => null },
      effectsLayer,
      diceOverlay: null,
      dieFace: null,
      metrics: initialMetrics,
      audio: { play() {} }
    });
    effects.setMetrics(resizedMetrics);

    await effects.playAbilityVfx("nuke", {
      actor: { id: "magician", position: { x: 1, y: 1 } },
      targets: []
    });

    const expectedReach = resizedMetrics.tileWidth * 0.55 * 3 + resizedMetrics.tileWidth * 0.5;
    const shockwave = effectsLayer.children.find((child) => (
      child.tagName === "ellipse" && child.animations?.[0]?.frames?.[1]?.rx === expectedReach
    ));
    assert.ok(shockwave, "the blast shockwave should scale from the latest board geometry");
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test("screen-darken ability VFX black out the stage instead of only the board SVG", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = {
    createElement: (tagName) => new TestElement(tagName),
    createElementNS: (_ns, tagName) => new TestSvgElement(tagName)
  };
  globalThis.window = { matchMedia: () => ({ matches: false }) };

  try {
    const metrics = { tileWidth: 58, tileHeight: 29, originX: 0, originY: 0 };
    const stage = new TestElement("main");
    const board = new TestSvgElement("svg");
    board.parentElement = stage;
    board.viewBox = { baseVal: { x: 0, y: 0, width: 1200, height: 760 } };
    const effectsLayer = new TestSvgElement("g");
    const effects = createEffects({
      board,
      unitsLayer: { querySelector: () => null },
      effectsLayer,
      diceOverlay: null,
      dieFace: null,
      metrics,
      audio: { play() {} }
    });

    await effects.playAbilityVfx("banish-dark", {
      actor: { id: "black", position: { x: 1, y: 1 } },
      targets: []
    });

    const blackout = stage.children.find((child) => child.className === "fx-stage-blackout");
    assert.ok(blackout, "Banish should darken the whole stageWrap HTML layer");
    assert.equal(blackout.style.props.get("--fx-stage-blackout-color"), "#020106");
    assert.equal(blackout.animations[0].frames[1].opacity, 0.78);
    assert.equal(blackout.removed, true);
    assert.equal(
      effectsLayer.children.some((child) => child.tagName === "rect" && child.getAttribute("fill") === "#020106"),
      false,
      "the blackout should not be constrained to the board SVG viewBox"
    );
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
  assert.equal(isTargetedMode("art:summon", { type: "summoner" }), false);
  assert.equal(isTargetedMode("art:beckon", { type: "summoner" }), false);
});

test("Summoner placement ARTS do not paint attack-range spillover", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const state = createBattleState({
      size: 9,
      units: [
        { id: "summoner", player: 1, type: "summoner", x: 1, y: 1, hp: 5 },
        { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
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
      mode: "art:beckon",
      selectedId: "summoner",
      footworkPath: [],
      onTileClick: () => {}
    });

    assert.ok(findSvgByAttribute(boardLayer, "data-key", "4,1").classList.contains("legal-art"));
    const outsidePrintedRange = findSvgByAttribute(boardLayer, "data-key", "5,1");
    assert.equal(outsidePrintedRange.classList.contains("legal-art"), false);
    assert.equal(outsidePrintedRange.classList.contains("art-range"), false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("self-aura heal ARTS can be confirmed from any highlighted heal tile", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const state = createBattleState({
      size: 10,
      units: [
        { id: "fc", player: 1, type: "fat-cleric", x: 5, y: 5, hp: 10, mp: 20 },
        { id: "ally", player: 1, type: "swordsman", x: 6, y: 5, hp: 10 },
        { id: "enemy", player: 2, type: "swordsman", x: 9, y: 9 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "fc");
    const art = getArt("fat-cleric", "hope");
    const board = new TestSvgElement("svg");
    const boardLayer = new TestSvgElement("g");
    const unitsLayer = new TestSvgElement("g");
    const clicked = [];

    renderBoard({
      board,
      boardLayer,
      unitsLayer,
      state,
      mode: "art:hope",
      selectedId: "fc",
      footworkPath: [],
      onTileClick: (position) => clicked.push(position)
    });

    const emptyHealTile = findSvgByAttribute(boardLayer, "data-key", "7,5");
    const outsideTile = findSvgByAttribute(boardLayer, "data-key", "9,5");

    assert.ok(emptyHealTile.classList.contains("legal-heal"), "empty aura tiles should look clickable");
    assert.equal(isHealArtConfirmTile(state, actor, art, { x: 7, y: 5 }), true);
    assert.equal(isHealArtConfirmTile(state, actor, art, { x: 9, y: 5 }), false);

    emptyHealTile.listeners.get("click")();
    assert.deepEqual(clicked, [{ x: 7, y: 5 }]);
    assert.equal(outsideTile.classList.contains("legal-heal"), false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("global heal ARTS can be confirmed from any board heal tile", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const state = createBattleState({
      size: 10,
      units: [
        { id: "mystic", player: 1, type: "mystic", x: 5, y: 5, hp: 10, mp: 20 },
        { id: "ally", player: 1, type: "swordsman", x: 6, y: 5, hp: 10 },
        { id: "enemy", player: 2, type: "swordsman", x: 9, y: 9 }
      ]
    });
    const actor = state.units.find((unit) => unit.id === "mystic");
    const art = getArt("mystic", "wish");
    const board = new TestSvgElement("svg");
    const boardLayer = new TestSvgElement("g");
    const unitsLayer = new TestSvgElement("g");
    const clicked = [];

    renderBoard({
      board,
      boardLayer,
      unitsLayer,
      state,
      mode: "art:wish",
      selectedId: "mystic",
      footworkPath: [],
      onTileClick: (position) => clicked.push(position)
    });

    const farHealTile = findSvgByAttribute(boardLayer, "data-key", "0,0");

    assert.ok(farHealTile.classList.contains("legal-heal"), "global heal should green the whole board");
    assert.equal(isHealArtConfirmTile(state, actor, art, { x: 0, y: 0 }), true);
    assert.equal(isHealArtConfirmTile(state, actor, art, { x: 10, y: 0 }), false);

    farHealTile.listeners.get("click")();
    assert.deepEqual(clicked, [{ x: 0, y: 0 }]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("Volley Shot previews its cone when hovering any tile inside that cone", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const state = createBattleState({
      size: 10,
      units: [
        { id: "p1-archer", player: 1, type: "archer", x: 4, y: 5 },
        { id: "p2-target", player: 2, type: "swordsman", x: 3, y: 3 }
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
      mode: "art:volley-shot",
      selectedId: "p1-archer",
      footworkPath: [],
      onTileClick: () => {}
    });

    const coneTile = findSvgByAttribute(boardLayer, "data-key", "3,3");
    assert.ok(coneTile, "the clicked cone tile should be addressable");
    assert.equal(coneTile.listeners.has("mouseenter"), true);

    coneTile.listeners.get("mouseenter")();

    assert.ok(findSvgByAttribute(boardLayer, "data-key", "4,4").classList.contains("cone-hot"));
    assert.ok(coneTile.classList.contains("cone-hot"));
  } finally {
    globalThis.document = previousDocument;
  }
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

test("Blasting Cap highlights wall tiles as legal targets", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const state = createBattleState({
      size: 8,
      units: [
        { id: "miner", player: 1, type: "miner", x: 1, y: 1, mp: 2 },
        { id: "target", player: 2, type: "swordsman", x: 4, y: 1 }
      ],
      tileObjects: [{ kind: "wall", x: 3, y: 1, hp: 1 }]
    });
    const board = new TestSvgElement("svg");
    const boardLayer = new TestSvgElement("g");
    const unitsLayer = new TestSvgElement("g");

    renderBoard({
      board,
      boardLayer,
      unitsLayer,
      state,
      mode: "art:blasting-cap",
      selectedId: "miner",
      footworkPath: [],
      onTileClick: () => {}
    });

    const wallTile = findSvgByAttribute(boardLayer, "data-key", "3,1");
    assert.ok(wallTile.classList.contains("legal-art"));
  } finally {
    globalThis.document = previousDocument;
  }
});

test("Mother Nature weather renders a persistent non-clicking board overlay", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const state = createBattleState({
      size: 8,
      units: [
        { id: "mn", player: 1, type: "mother-nature", x: 1, y: 1, weather: "blizzard", lastWeather: "blizzard" },
        { id: "target", player: 2, type: "swordsman", x: 6, y: 6 }
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
      mode: null,
      selectedId: null,
      footworkPath: [],
      onTileClick: () => {}
    });

    const overlay = boardLayer.findByClass("weather-overlay");
    assert.equal(getActiveBoardWeather(state), "blizzard");
    assert.equal(board.getAttribute("data-weather"), "blizzard");
    assert.ok(overlay, "active weather should add a board overlay");
    assert.match(overlay.getAttribute("class"), /\bweather-overlay--blizzard\b/);
    assert.equal(overlay.getAttribute("data-weather"), "blizzard");
    assert.equal(overlay.getAttribute("aria-label"), "Blizzard board weather");
    assert.equal(overlay.listeners.has("click"), false, "overlay should not own board clicks");
    assert.ok(overlay.findByClass("weather-overlay-wash"), "overlay should tint the board");
    assert.ok(overlay.findByClass("weather-field--snow"), "blizzard overlay should include a layered snow field");
    assert.ok(overlay.findAllByClass("weather-flake").length >= 36, "blizzard should draw a dense field of drifting flakes");
    assert.equal(overlay.findByClass("weather-streak--snow"), null, "blizzard should not use blunt line streaks");
    assert.equal(boardLayer.children.at(-1), overlay, "weather should paint above tiles but below units");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("authored board weather renders without a Mother Nature unit", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    const state = createBattleState({
      size: 8,
      weather: "thunderstorm",
      units: [
        { id: "hero", player: 1, type: "swordsman", x: 1, y: 1 },
        { id: "target", player: 2, type: "swordsman", x: 6, y: 6 }
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
      mode: null,
      selectedId: null,
      footworkPath: [],
      onTileClick: () => {}
    });

    const overlay = boardLayer.findByClass("weather-overlay");
    assert.equal(getActiveBoardWeather(state), "thunderstorm");
    assert.equal(board.getAttribute("data-weather"), "thunderstorm");
    assert.ok(overlay.findByClass("weather-field--storm"));
    assert.ok(overlay.findByClass("weather-bolt"));
  } finally {
    globalThis.document = previousDocument;
  }
});

test("the board weather overlay follows each Mother Nature weather and clears when inactive", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: (_ns, tagName) => new TestSvgElement(tagName) };

  try {
    for (const [weather, expectedDetail] of [
      ["spring", "weather-field--rain"],
      ["heatwave", "weather-field--heat"],
      ["thunderstorm", "weather-field--storm"]
    ]) {
      const state = createBattleState({
        size: 8,
        units: [
          { id: `mn-${weather}`, player: 1, type: "mother-nature", x: 1, y: 1, weather, lastWeather: weather },
          { id: `target-${weather}`, player: 2, type: "swordsman", x: 6, y: 6 }
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
        mode: null,
        selectedId: null,
        footworkPath: [],
        onTileClick: () => {}
      });

      const overlay = boardLayer.findByClass("weather-overlay");
      assert.equal(board.getAttribute("data-weather"), weather);
      assert.match(overlay.getAttribute("class"), new RegExp(`\\bweather-overlay--${weather}\\b`));
      assert.ok(overlay.findByClass(expectedDetail), `${weather} should render its own weather detail`);
    }

    const defeatedWeatherSource = createBattleState({
      size: 8,
      units: [
        { id: "mn", player: 1, type: "mother-nature", x: 1, y: 1, hp: 0, weather: "heatwave", lastWeather: "heatwave" },
        { id: "target", player: 2, type: "swordsman", x: 6, y: 6 }
      ]
    });
    const board = new TestSvgElement("svg");
    const boardLayer = new TestSvgElement("g");
    const unitsLayer = new TestSvgElement("g");

    renderBoard({
      board,
      boardLayer,
      unitsLayer,
      state: defeatedWeatherSource,
      mode: null,
      selectedId: null,
      footworkPath: [],
      onTileClick: () => {}
    });

    assert.equal(getActiveBoardWeather(defeatedWeatherSource), null);
    assert.equal(board.getAttribute("data-weather"), "none");
    assert.equal(boardLayer.findByClass("weather-overlay"), null);
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
