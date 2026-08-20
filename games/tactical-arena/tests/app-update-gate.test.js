// The packaged app's boot-time version gate.
//
// The thing these tests are really guarding is the FAIL-OPEN property. Blocking is the
// destructive outcome — it locks a paying player out of a game they own — so every
// uncertain input has to resolve to "play normally", and only an affirmative answer
// (known build, server-declared minimum, ours is lower) may block.
import test from "node:test";
import assert from "node:assert/strict";

import {
  checkForRequiredUpdate,
  decideUpdateRequirement,
  openStoreListing,
  parseInstalledVersionCode,
} from "../src/platform/appUpdateGate.js";
import { renderAppUpdateOverlay } from "../src/ui/appUpdateOverlay.js";

function nativeRoot({ build = "11", id = "com.jayarcade.tacticalarena", getInfo = null } = {}) {
  return {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        App: { getInfo: getInfo ?? (async () => ({ build, id, version: "1.0.8" })) },
      },
    },
  };
}

function jsonFetch(payload, { ok = true } = {}) {
  return async () => ({ ok, json: async () => payload });
}

// --- the pure decision -------------------------------------------------------------

test("a build below the server's minimum is blocked", () => {
  const result = decideUpdateRequirement({
    installedVersionCode: 11,
    release: { minimumVersionCode: 12, latestVersionCode: 14, storeUrl: "https://play/x", updateUrl: "market://x" },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.minimumVersionCode, 12);
  assert.equal(result.updateUrl, "market://x");
});

test("a build at or above the minimum plays", () => {
  assert.equal(decideUpdateRequirement({ installedVersionCode: 12, release: { minimumVersionCode: 12 } }).blocked, false);
  assert.equal(decideUpdateRequirement({ installedVersionCode: 99, release: { minimumVersionCode: 12 } }).blocked, false);
});

test("no configured minimum never blocks", () => {
  for (const release of [{ minimumVersionCode: 0 }, {}, { minimumVersionCode: null }, { minimumVersionCode: "12" }]) {
    assert.equal(decideUpdateRequirement({ installedVersionCode: 1, release }).blocked, false);
  }
});

test("an unknown installed build never blocks", () => {
  assert.equal(decideUpdateRequirement({ installedVersionCode: null, release: { minimumVersionCode: 99 } }).blocked, false);
});

test("only a clean non-negative integer counts as a version code", () => {
  assert.equal(parseInstalledVersionCode({ build: "11" }), 11);
  assert.equal(parseInstalledVersionCode({ build: 11 }), 11);
  assert.equal(parseInstalledVersionCode({ build: " 7 " }), 7);
  assert.equal(parseInstalledVersionCode({ build: "1.0.8" }), 1, "Play's build is an integer; a dotted string truncates");
  assert.equal(parseInstalledVersionCode({ build: "abc" }), null);
  assert.equal(parseInstalledVersionCode({ build: "-3" }), null);
  assert.equal(parseInstalledVersionCode({}), null);
  assert.equal(parseInstalledVersionCode(null), null);
});

// --- the end-to-end check ----------------------------------------------------------

test("the web build is never gated", async () => {
  let fetched = 0;
  const result = await checkForRequiredUpdate({
    root: {},
    fetchImpl: async () => { fetched += 1; return { ok: true, json: async () => ({}) }; },
    baseUrl: "https://api.example",
  });
  assert.equal(result.blocked, false);
  assert.equal(result.reason, "not_packaged");
  assert.equal(fetched, 0, "the web build must not even ask");
});

test("the packaged app blocks when the server says its build is too old", async () => {
  const result = await checkForRequiredUpdate({
    root: nativeRoot({ build: "11" }),
    fetchImpl: jsonFetch({ release: { minimumVersionCode: 12, latestVersionCode: 12, storeUrl: "https://play/x", updateUrl: "market://x" } }),
    baseUrl: "https://api.example",
  });
  assert.equal(result.blocked, true);
  assert.equal(result.installedVersionCode, 11);
});

test("an unreachable API never blocks", async () => {
  const result = await checkForRequiredUpdate({
    root: nativeRoot(),
    fetchImpl: async () => { throw new Error("offline"); },
    baseUrl: "https://api.example",
  });
  assert.equal(result.blocked, false);
  assert.equal(result.reason, "no_policy");
});

test("an API error response never blocks", async () => {
  const result = await checkForRequiredUpdate({
    root: nativeRoot(),
    fetchImpl: jsonFetch({ status: "error" }, { ok: false }),
    baseUrl: "https://api.example",
  });
  assert.equal(result.blocked, false);
});

test("malformed JSON never blocks", async () => {
  const result = await checkForRequiredUpdate({
    root: nativeRoot(),
    fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }),
    baseUrl: "https://api.example",
  });
  assert.equal(result.blocked, false);
});

test("a native bridge that cannot report its build never blocks", async () => {
  const result = await checkForRequiredUpdate({
    root: nativeRoot({ getInfo: async () => { throw new Error("no plugin"); } }),
    fetchImpl: jsonFetch({ release: { minimumVersionCode: 999 } }),
    baseUrl: "https://api.example",
  });
  assert.equal(result.blocked, false);
  assert.equal(result.reason, "unknown_build");
});

test("a missing API base never blocks", async () => {
  const result = await checkForRequiredUpdate({
    root: nativeRoot(),
    fetchImpl: jsonFetch({ release: { minimumVersionCode: 999 } }),
    baseUrl: "",
  });
  assert.equal(result.blocked, false);
});

test("the check asks for the running app's own id and platform", async () => {
  let seen = "";
  await checkForRequiredUpdate({
    root: nativeRoot({ id: "com.jayarcade.tacticalarena" }),
    fetchImpl: async (url) => { seen = url; return { ok: true, json: async () => ({ release: {} }) }; },
    baseUrl: "https://api.example",
    platform: "android",
  });
  assert.match(seen, /^https:\/\/api\.example\/app-version\?/);
  assert.match(seen, /app=com\.jayarcade\.tacticalarena/);
  assert.match(seen, /platform=android/);
});

// --- the store hand-off ------------------------------------------------------------

test("the store hand-off prefers the Play deep link and falls back to the listing", () => {
  const opened = [];
  openStoreListing({
    root: { open: (target) => { opened.push(target); return {}; } },
    updateUrl: "market://details?id=x",
    storeUrl: "https://play.google.com/store/apps/details?id=x",
  });
  assert.deepEqual(opened, ["market://details?id=x"]);

  const fallback = [];
  openStoreListing({
    root: {
      open: () => { throw new Error("no handler"); },
      location: { set href(value) { fallback.push(value); } },
    },
    updateUrl: "market://details?id=x",
    storeUrl: "https://play.google.com/store/apps/details?id=x",
  });
  assert.deepEqual(fallback, ["market://details?id=x"]);
});

// --- the overlay -------------------------------------------------------------------
// A tiny DOM stand-in: the overlay deliberately uses plain DOM so it works when the rest
// of the build is not trusted to run, which also makes it cheap to assert on here.

function fakeDoc() {
  const make = (tag) => ({
    tagName: tag,
    id: "",
    className: "",
    children: [],
    attributes: {},
    listeners: {},
    textContent: "",
    setAttribute(k, v) { this.attributes[k] = v; },
    append(...nodes) { this.children.push(...nodes); },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    remove() {},
    focus() { this.focused = true; },
  });
  const body = { ...make("body"), classList: { added: [], add(c) { this.added.push(c); } }, replaceChildren(...n) { this.children = n; } };
  body.children = [];
  return { body, createElement: make, getElementById: () => null };
}

function findByClass(node, className) {
  if (node?.className === className) return node;
  for (const child of node?.children ?? []) {
    const hit = findByClass(child, className);
    if (hit) return hit;
  }
  return null;
}

test("the overlay replaces the whole document and offers exactly one action", () => {
  const doc = fakeDoc();
  const overlay = renderAppUpdateOverlay(
    { installedVersionCode: 11, minimumVersionCode: 12, updateUrl: "market://x", storeUrl: "https://play/x" },
    { doc, root: {}, open: () => {} },
  );

  assert.equal(doc.body.children.length, 1, "nothing may remain behind the gate");
  assert.equal(doc.body.children[0], overlay);
  assert.equal(overlay.attributes["aria-modal"], "true");
  assert.equal(overlay.attributes.role, "alertdialog");
  assert.ok(doc.body.classList.added.includes("app-update-blocked"));

  const buttons = [];
  (function walk(node) {
    if (node?.tagName === "button") buttons.push(node);
    for (const child of node?.children ?? []) walk(child);
  })(overlay);
  assert.equal(buttons.length, 1, "a hard gate has one button and no way to dismiss it");
});

test("the overlay's button sends the player to the store", () => {
  const doc = fakeDoc();
  const opens = [];
  renderAppUpdateOverlay(
    { installedVersionCode: 11, minimumVersionCode: 12, updateUrl: "market://x", storeUrl: "https://play/x" },
    { doc, root: {}, open: (args) => opens.push(args) },
  );
  const button = findByClass(doc.body.children[0], "app-update-button");
  button.listeners.click[0]();
  assert.equal(opens.length, 1);
  assert.equal(opens[0].updateUrl, "market://x");
  assert.equal(opens[0].storeUrl, "https://play/x");
});

test("the overlay states both version numbers so a support report is actionable", () => {
  const doc = fakeDoc();
  renderAppUpdateOverlay({ installedVersionCode: 11, minimumVersionCode: 12 }, { doc, root: {}, open: () => {} });
  const note = findByClass(doc.body.children[0], "app-update-note");
  assert.match(note.textContent, /11/);
  assert.match(note.textContent, /12/);
});
