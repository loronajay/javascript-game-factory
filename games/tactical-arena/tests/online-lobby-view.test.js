// Coverage for src/ui/onlineLobbyView.js — the roster + draft/ban rendering extracted
// out of onlineFlow.js. onlineFlow.js itself has no headless test (it constructs a real
// WebSocket client on enter), so this suite is the safety net for the extracted view: it
// drives every render branch through a fake DOM and a hand-built ctx, asserting the DOM
// output and that unit/ban clicks reach the controller callbacks. If the ctx seam ever
// loses a field, these tests fail instead of a live multiplayer lobby.

import test from "node:test";
import assert from "node:assert/strict";

import { createLobbyView } from "../src/ui/onlineLobbyView.js";
import {
  UNIT_TYPE_KEYS,
} from "../src/ui/squadModel.js";
import {
  applyDraftPick,
  canDraftType,
  createDraftState,
  currentDraftSeat,
  isDraftComplete,
} from "../src/ui/draftModel.js";

// ── minimal fake DOM (mirrors the pattern used by shop.test.js) ──────────────
class FakeClassList {
  constructor(node) { this.node = node; }
  _set() { return new Set(this.node.className.split(/\s+/).filter(Boolean)); }
  _write(set) { this.node.className = [...set].join(" "); }
  add(...names) { const s = this._set(); for (const n of names) s.add(n); this._write(s); }
  remove(...names) { const s = this._set(); for (const n of names) s.delete(n); this._write(s); }
  contains(name) { return this._set().has(name); }
  toggle(name, force) {
    const has = this.contains(name);
    const on = force === undefined ? !has : !!force;
    if (on) this.add(name); else this.remove(name);
    return on;
  }
}

class FakeStyle {
  setProperty(name, value) { this[name] = value; }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.dataset = {};
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList(this);
    this.hidden = false;
    this.disabled = false;
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) {
    if (node.parentElement) node.parentElement.children = node.parentElement.children.filter((c) => c !== node);
    node.parentElement = this;
    this.children.push(node);
    return node;
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  focus() {}
  click() { for (const h of this.listeners.get("click") ?? []) h({ target: this, stopPropagation() {} }); }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName); }
}

function installDom() {
  globalThis.document = new FakeDocument();
  globalThis.window = { setTimeout: (fn) => { globalThis.window.__timeouts.push(fn); }, __timeouts: [] };
}

function walk(node, predicate, matches = []) {
  if (node && predicate(node)) matches.push(node);
  for (const child of node?.children ?? []) walk(child, predicate, matches);
  return matches;
}
function hasClass(node, className) { return node.className.split(/\s+/).includes(className); }
function textOf(node) { return [node.textContent, node.innerHTML, ...(node.children ?? []).map(textOf)].join(" "); }

// Build a ctx over a lobby/draft snapshot. Callback invocations land in `calls`.
function makeCtx(overrides = {}) {
  const el = () => new FakeElement("div");
  const calls = { submitDraftPick: [], submitBan: [], openLocalFormation: 0, setFormationPromptOpen: [] };
  const state = {
    lobby: null,
    draft: null,
    myClientId: "c1",
    localLocked: false,
    localFormationOrder: null,
    formationPromptOpen: false,
    matchType: "duel",
    localSeat: 1,
    ...overrides,
  };
  const MATCH = { duel: { maxPlayers: 2 }, teams4: { maxPlayers: 4 } };
  const ctx = {
    rosterEl: new FakeElement("ul"),
    draftField: Object.assign(new FakeElement("div"), { hidden: false }),
    draftHint: el(),
    draftTrack: el(),
    draftSquads: el(),
    draftActions: el(),
    draftRoster: el(),
    readyByClientId: state.readyByClientId ?? new Map(),
    getLobby: () => state.lobby,
    getDraft: () => state.draft,
    getMyClientId: () => state.myClientId,
    getLocalLocked: () => state.localLocked,
    getLocalFormationOrder: () => state.localFormationOrder,
    getFormationPromptOpen: () => state.formationPromptOpen,
    setFormationPromptOpen: (v) => { state.formationPromptOpen = v; calls.setFormationPromptOpen.push(v); },
    activeMatchType: () => state.matchType,
    isDraftMatch: () => state.matchType === "draft1v1" || Boolean(state.draft),
    matchTypeConfig: () => MATCH[state.matchType] ?? MATCH.duel,
    playerCount: () => state.lobby?.players?.length ?? 0,
    localLobbySeat: () => state.localSeat,
    draftPlayerLabel: (seat) => `P${seat}`,
    submitDraftPick: (type) => calls.submitDraftPick.push(type),
    submitBan: (type) => calls.submitBan.push(type),
    openLocalFormation: () => { calls.openLocalFormation += 1; },
  };
  return { ctx, calls, state };
}

function completeDraft() {
  let d = createDraftState({ seats: [1, 2] });
  let guard = 0;
  while (!isDraftComplete(d) && guard < 40) {
    const seat = currentDraftSeat(d);
    const type = UNIT_TYPE_KEYS.find((t) => canDraftType(d, seat, t, { isUnlocked: () => true }));
    d = applyDraftPick(d, { seat, type, isUnlocked: () => true, trustSkin: true }).nextState;
    guard += 1;
  }
  return d;
}

test("roster renders FFA seats with host/you and lock-state tags", () => {
  installDom();
  const { ctx } = makeCtx({
    matchType: "duel",
    lobby: {
      ownerId: "c1",
      players: [
        { id: "c1", seat: 1, name: "Alice" },
        { id: "c2", seat: 2, name: "Bob" },
      ],
    },
    readyByClientId: new Map([["c1", true], ["c2", false]]),
  });
  createLobbyView(ctx).renderRoster();

  const items = walk(ctx.rosterEl, (n) => hasClass(n, "lobby-roster-item"));
  assert.equal(items.length, 2);
  assert.match(items[0].innerHTML, /Alice/);
  assert.match(items[0].innerHTML, /Host/);
  assert.match(items[0].innerHTML, /You/);
  assert.match(items[0].innerHTML, /Locked/);
  assert.match(items[1].innerHTML, /Bob/);
  assert.match(items[1].innerHTML, /Picking/);
  assert.equal(hasClass(ctx.rosterEl, "is-team-roster"), false);
});

test("roster renders 2v2 team headings and team tags", () => {
  installDom();
  const { ctx } = makeCtx({
    matchType: "teams4",
    lobby: {
      ownerId: "c1",
      players: [
        { id: "c1", seat: 1, name: "A" },
        { id: "c2", seat: 2, name: "B" },
        { id: "c3", seat: 3, name: "C" },
        { id: "c4", seat: 4, name: "D" },
      ],
    },
    readyByClientId: new Map(),
  });
  createLobbyView(ctx).renderRoster();

  assert.ok(hasClass(ctx.rosterEl, "is-team-roster"));
  assert.equal(walk(ctx.rosterEl, (n) => hasClass(n, "lobby-team-heading")).length, 2);
  assert.equal(walk(ctx.rosterEl, (n) => hasClass(n, "lobby-roster-item")).length, 4);
});

test("draft board waits for both commanders before starting", () => {
  installDom();
  const { ctx } = makeCtx({
    matchType: "draft1v1",
    draft: createDraftState({ seats: [1, 2] }),
    lobby: { ownerId: "c1", players: [{ id: "c1", seat: 1, name: "A" }] },
  });
  createLobbyView(ctx).renderDraft();
  assert.match(ctx.draftHint.textContent, /Draft starts when both commanders/);
  assert.equal(ctx.draftTrack.children.length, 0);
});

test("ban phase renders and a ban click reaches submitBan", () => {
  installDom();
  const draft = createDraftState({ seats: [1, 2], banFirstSeat: 1 });
  const { ctx, calls } = makeCtx({
    matchType: "draft1v1",
    draft,
    localSeat: 1,
    lobby: { ownerId: "c1", players: [{ id: "c1", seat: 1, name: "A" }, { id: "c2", seat: 2, name: "B" }] },
  });
  createLobbyView(ctx).renderDraft();

  assert.match(ctx.draftHint.textContent, /Ban phase/);
  assert.equal(ctx.draftTrack.children.length, 2); // two ban steps
  const banBtn = walk(ctx.draftRoster, (n) => n.tagName === "BUTTON" && n.disabled === false)[0];
  assert.ok(banBtn, "an enabled ban button should exist on your ban turn");
  banBtn.click();
  assert.equal(calls.submitBan.length, 1);
  assert.equal(calls.submitBan[0], banBtn.dataset.type);
});

test("pick phase renders the 8-step track and a pick click reaches submitDraftPick", () => {
  installDom();
  const draft = createDraftState({ seats: [1, 2] });
  const { ctx, calls } = makeCtx({
    matchType: "draft1v1",
    draft,
    localSeat: currentDraftSeat(draft),
    lobby: { ownerId: "c1", players: [{ id: "c1", seat: 1, name: "A" }, { id: "c2", seat: 2, name: "B" }] },
  });
  createLobbyView(ctx).renderDraft();

  assert.match(ctx.draftHint.textContent, /Your pick/);
  assert.equal(ctx.draftTrack.children.length, 8);
  const pickBtn = walk(ctx.draftRoster, (n) => n.tagName === "BUTTON" && n.disabled === false)[0];
  assert.ok(pickBtn, "an enabled draft button should exist on your pick");
  pickBtn.click();
  assert.equal(calls.submitDraftPick.length, 1);
});

test("completed draft offers Arrange Formation and auto-prompts once", () => {
  installDom();
  const draft = completeDraft();
  assert.ok(isDraftComplete(draft));
  const { ctx, calls } = makeCtx({
    matchType: "draft1v1",
    draft,
    localSeat: 1,
    localLocked: false,
    lobby: { ownerId: "c1", players: [{ id: "c1", seat: 1, name: "A" }, { id: "c2", seat: 2, name: "B" }] },
  });
  createLobbyView(ctx).renderDraft();

  const arrange = walk(ctx.draftActions, (n) => n.tagName === "BUTTON")[0];
  assert.ok(arrange);
  assert.match(arrange.textContent, /Arrange Formation/);
  // auto-open scheduled the formation prompt exactly once
  assert.deepEqual(calls.setFormationPromptOpen, [true]);
  assert.equal(globalThis.window.__timeouts.length, 1);
  globalThis.window.__timeouts[0]();
  assert.equal(calls.openLocalFormation, 1);

  arrange.click();
  assert.equal(calls.openLocalFormation, 2);
});
