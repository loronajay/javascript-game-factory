import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, moveUnit } from "../src/core/commands.js";
import { createBattleState } from "../src/core/state.js";
import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { buildAbilityDetail } from "../src/ui/abilityDetailModel.js";
import { ABILITY_DETAIL_HOLD_MS, attachAbilityDetailGestures, closeAbilityDetail, isAbilityDetailOpen } from "../src/ui/abilityDetail.js";

function activatedState(type = "archer", extraUnits = []) {
  const initial = createBattleState({
    units: [
      { id: "p1-actor", player: 1, type, x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 3, y: 0 },
      ...extraUnits
    ]
  });
  const state = applyCommand(initial, beginActivation(1, "p1-actor")).nextState;
  return { state, unit: state.units.find((u) => u.id === "p1-actor") };
}

test("an ART detail carries the full description plus its cost, targeting, and rolls", () => {
  const { state, unit } = activatedState("archer");

  const detail = buildAbilityDetail("art:poison-arrow", unit, state);

  assert.equal(detail.kicker, "ART");
  assert.equal(detail.title, "Poison Arrow");
  assert.equal(detail.unitName, "Archer");
  // The whole description, never an excerpt — that is the entire point of the pop-up.
  assert.equal(detail.description, UNIT_TYPES.archer.arts.find((a) => a.id === "poison-arrow").description);
  const facts = Object.fromEntries(detail.facts.map(({ label, value }) => [label, value]));
  assert.equal(facts.Cost, "4 MP");
  assert.equal(facts.Accuracy, "96% at range 1");
  assert.equal(facts.Status, "poison · permanent · 60% chance");
  assert.equal(detail.unavailableReason, null);
});

test("an instant-resolving ART is readable even though it never shows a targeting message", () => {
  // Volley Shot fires on a direction click and Nuke-style selfCast ARTS resolve on the
  // spot, so nothing ever printed their text to the message box mid-match.
  const { state, unit } = activatedState("archer");

  const detail = buildAbilityDetail("art:volley-shot", unit, state);

  assert.equal(detail.title, "Volley Shot");
  assert.ok(detail.description.length > 0);
  const facts = Object.fromEntries(detail.facts.map(({ label, value }) => [label, value]));
  assert.equal(facts.Targets, "A cone, aimed from an adjacent tile");
  assert.equal(facts.Range, "5 tiles");
  assert.equal(facts.Damage, "2 true (ignores DEF and Defend)");
});

test("every active ART in the roster produces a readable card, RAGE ARTS included", () => {
  let checked = 0;
  for (const definition of Object.values(UNIT_TYPES)) {
    if (definition.summon) continue;
    const { state, unit } = activatedState(definition.id);
    // A RAGE ART only joins the available set while raging, which is exactly when its
    // button appears — so drop the unit into RAGE to cover that half of the roster.
    const raging = { ...state, units: state.units.map((u) => (u.id === unit.id ? { ...u, hp: 3 } : u)) };
    const ragingUnit = raging.units.find((u) => u.id === unit.id);

    for (const [art, actor, world] of [
      ...definition.arts.filter((a) => a.kind === "active" && a.implemented).map((a) => [a, unit, state]),
      ...(definition.rageArt?.kind === "active" && definition.rageArt.implemented ? [[definition.rageArt, ragingUnit, raging]] : [])
    ]) {
      const detail = buildAbilityDetail(`art:${art.id}`, actor, world);
      assert.ok(detail, `${definition.id}/${art.id} should produce a detail`);
      assert.ok(detail.description.length > 0, `${definition.id}/${art.id} should carry a description`);
      assert.ok(detail.facts.length > 0, `${definition.id}/${art.id} should carry at least a cost`);
      assert.ok(detail.notes.length > 0, `${definition.id}/${art.id} should explain how it spends the activation`);
      checked += 1;
    }
  }
  assert.ok(checked > 80, `expected the whole roster's ARTS to be covered, checked ${checked}`);
});

test("a blocked ability explains itself rather than staying a silent grey button", () => {
  const { state, unit } = activatedState("archer");
  const moved = applyCommand(state, moveUnit(1, "p1-actor", 1, 0)).nextState;
  const movedUnit = moved.units.find((u) => u.id === "p1-actor");

  const detail = buildAbilityDetail("art:poison-arrow", movedUnit, moved);

  assert.match(detail.unavailableReason, /whole activation/i);
});

test("out-of-MP reads as a resource problem, not a generic refusal", () => {
  const { state, unit } = activatedState("archer");
  const drained = { ...state, units: state.units.map((u) => (u.id === unit.id ? { ...u, mp: 0 } : u)) };

  const detail = buildAbilityDetail("art:poison-arrow", drained.units.find((u) => u.id === unit.id), drained);

  assert.equal(detail.unavailableReason, "Not enough MP.");
});

test("base actions get cards too, with the numbers the HUD tooltip used to hide", () => {
  const { state, unit } = activatedState("archer");

  const move = buildAbilityDetail("move", unit, state);
  assert.equal(move.title, "Move");
  assert.equal(move.facts[0].value, "Up to 2 tiles");
  assert.match(move.notes[0], /does not end the activation/i);

  const attack = buildAbilityDetail("attack", unit, state);
  assert.equal(attack.facts.find((f) => f.label === "Range").value, "5 tiles");

  assert.equal(buildAbilityDetail("defend", unit, state).title, "Defend");
  assert.equal(buildAbilityDetail("not-an-action", unit, state), null);
});

test("disabled base actions explain why they are not available", () => {
  const { state, unit } = activatedState("archer");
  const moved = applyCommand(state, moveUnit(1, "p1-actor", 1, 0)).nextState;
  const movedUnit = moved.units.find((u) => u.id === "p1-actor");

  assert.equal(buildAbilityDetail("move", movedUnit, moved).unavailableReason, "This unit has already moved.");
  assert.equal(
    buildAbilityDetail("finish", movedUnit, moved).unavailableReason,
    "Available after this unit attacks, defends, or uses an ART."
  );
  assert.equal(
    buildAbilityDetail("cancel-move", unit, state).unavailableReason,
    "Only available after this unit moves."
  );
});

test("the card lists the unit's always-on passives so the Codex is not the only place they exist", () => {
  const { state, unit } = activatedState("archer");

  const { passives } = buildAbilityDetail("attack", unit, state);

  const closeShot = passives.find((p) => p.name === "Close Shot");
  assert.ok(closeShot, "the Archer's passive should be listed");
  assert.equal(closeShot.tag, "Passive");
  assert.ok(closeShot.description.length > 0);
  // A RAGE passive is shown but dimmed until it is actually live.
  assert.equal(passives.filter((p) => p.tag === "RAGE Passive").every((p) => p.active === false), true);
});

test("redundant RAGE passive names do not stutter beside the tag", () => {
  const { state, unit } = activatedState("archer");

  const { passives } = buildAbilityDetail("attack", unit, state);
  const ragePassive = passives.find((p) => p.tag === "RAGE Passive");

  assert.ok(ragePassive, "the Archer's RAGE passive should be listed");
  assert.equal(ragePassive.name, "");
  assert.ok(ragePassive.description.length > 0);
});

// --- The hold gesture ------------------------------------------------------
// A fake document, small enough to read but real enough that the pop-up actually
// renders — so these tests cover the card the player sees, not just the timer.

class FakeNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = "";
    this.textContent = "";
    this.children = [];
    this.dataset = {};
    this.hidden = false;
    this.attributes = {};
    this.listeners = new Map();
    this.rect = null;
    this.style = { setProperty: (k, v) => { this.attributes[k] = v; }, removeProperty: (k) => { delete this.attributes[k]; } };
  }

  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getBoundingClientRect() { return this.rect; }
  addEventListener(type, handler, capture = false) { this.listeners.set(`${type}${capture ? ":capture" : ""}`, handler); }
  removeEventListener(type, _handler, capture = false) { this.listeners.delete(`${type}${capture ? ":capture" : ""}`); }
  fire(type, event = {}, capture = false) { this.listeners.get(`${type}${capture ? ":capture" : ""}`)?.(event); }
  querySelectorAll() { return this.buttons ?? []; }
  contains(node) { return (this.buttons ?? []).includes(node); }

  text() {
    return [this.textContent, ...this.children.map((child) => child.text())].filter(Boolean).join(" ");
  }

  find(className) {
    if (this.className.split(/\s+/).includes(className)) return this;
    for (const child of this.children) {
      const match = child.find(className);
      if (match) return match;
    }
    return null;
  }
}

function installFakeDocument() {
  const created = [];
  globalThis.document = {
    created,
    createElement(tag) { const node = new FakeNode(tag); created.push(node); return node; },
    addEventListener() {},
    removeEventListener() {},
    body: { appendChild() {} }
  };
  return created;
}

// The overlay is a module-level singleton, so the fake document must be in place before
// the first open and stay there for the rest of the file.
const createdNodes = installFakeDocument();
const overlayOf = () => createdNodes.find((node) => node.className.includes("ability-detail-modal"));

function actionBar(action) {
  const host = new FakeNode("div");
  const button = new FakeNode("button");
  button.dataset.action = action;
  button.rect = { left: 0, right: 10, top: 0, bottom: 10 };
  button.closest = (selector) => (selector === "button[data-action]" ? button : null);
  host.buttons = [button];
  return { host, button };
}

const held = (ms = ABILITY_DETAIL_HOLD_MS + 30) => new Promise((resolve) => setTimeout(resolve, ms));

test("holding an action button opens its card and swallows the click that ends the hold", async () => {
  const { state, unit } = activatedState("archer");
  const { host, button } = actionBar("art:poison-arrow");
  const detach = attachAbilityDetailGestures(host, () => ({ unit, state }));

  host.fire("pointerdown", { button: 0, target: button, clientX: 5, clientY: 5 });
  await held();

  assert.equal(isAbilityDetailOpen(), true);
  const card = overlayOf().find("ability-detail-card");
  assert.match(card.text(), /Poison Arrow/);
  assert.match(card.text(), /permanent poison/);

  let prevented = false;
  host.fire("click", { preventDefault: () => { prevented = true; }, stopPropagation() {} }, true);
  assert.equal(prevented, true, "the hold must not also press the button");

  closeAbilityDetail();
  assert.equal(isAbilityDetailOpen(), false);
  detach();
});

test("a drifting finger cancels the hold, so dragging across the action bar is not a read", async () => {
  const { state, unit } = activatedState("archer");
  const { host, button } = actionBar("art:poison-arrow");
  const detach = attachAbilityDetailGestures(host, () => ({ unit, state }));

  host.fire("pointerdown", { button: 0, target: button, clientX: 5, clientY: 5 });
  host.fire("pointermove", { clientX: 60, clientY: 5 });
  await held();

  assert.equal(isAbilityDetailOpen(), false);
  detach();
});

test("a short tap leaves the click alone so the ability still activates", () => {
  const { state, unit } = activatedState("archer");
  const { host, button } = actionBar("attack");
  const detach = attachAbilityDetailGestures(host, () => ({ unit, state }));

  host.fire("pointerdown", { button: 0, target: button, clientX: 5, clientY: 5 });
  host.fire("pointerup", {});
  let prevented = false;
  host.fire("click", { preventDefault: () => { prevented = true; }, stopPropagation() {} }, true);

  assert.equal(prevented, false, "a tap must reach the action-bar click handler");
  assert.equal(isAbilityDetailOpen(), false);
  detach();
});

test("a disabled button still opens — it is the one a player most needs explained", () => {
  // A disabled <button> swallows its own pointer events, so the container becomes the
  // event target; the gesture falls back to hit-testing the press position.
  const { state, unit } = activatedState("archer");
  const drained = { ...state, units: state.units.map((u) => (u.id === unit.id ? { ...u, mp: 0 } : u)) };
  const { host } = actionBar("art:poison-arrow");
  host.closest = () => null;
  const detach = attachAbilityDetailGestures(host, () => ({ unit: drained.units.find((u) => u.id === unit.id), state: drained }));

  let prevented = false;
  host.fire("contextmenu", { target: host, clientX: 5, clientY: 5, preventDefault: () => { prevented = true; } });

  assert.equal(isAbilityDetailOpen(), true);
  assert.match(overlayOf().find("ability-detail-blocked").text(), /Not enough MP/);
  assert.equal(prevented, true, "the native long-press menu should give way to the card");

  closeAbilityDetail();
  detach();
});
