import test from "node:test";
import assert from "node:assert/strict";

import {
  RANKED_ACCOUNT_FEATURE_MESSAGE,
  rankedAccountFeatureState,
  syncRankedAccountFeatureControls,
} from "../src/ui/rankedFeatureGate.js";

class TestClassList {
  constructor(node) {
    this.node = node;
  }

  toggle(name, force) {
    const classes = new Set(this.node.className.split(/\s+/).filter(Boolean));
    if (force) classes.add(name);
    else classes.delete(name);
    this.node.className = [...classes].join(" ");
  }

  contains(name) {
    return this.node.className.split(/\s+/).includes(name);
  }
}

class TestControl {
  constructor() {
    this.className = "";
    this.disabled = false;
    this.title = "";
    this.attributes = new Map();
    this.classList = new TestClassList(this);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function rootWith(...controls) {
  return {
    querySelectorAll: (selector) => selector === "[data-ranked-account-feature]" ? controls : [],
  };
}

test("ranked account-only controls are disabled for guests and local profiles without tokens", () => {
  assert.deepEqual(rankedAccountFeatureState({ authenticated: false }), {
    enabled: false,
    message: RANKED_ACCOUNT_FEATURE_MESSAGE,
  });
  assert.deepEqual(rankedAccountFeatureState({ authenticated: true, playerId: "local-only" }), {
    enabled: false,
    message: RANKED_ACCOUNT_FEATURE_MESSAGE,
  });

  const rankedProfile = new TestControl();
  const rankedMode = new TestControl();
  const state = syncRankedAccountFeatureControls(rootWith(rankedProfile, rankedMode), {
    account: { authenticated: true, playerId: "local-only" },
  });

  assert.equal(state.enabled, false);
  for (const control of [rankedProfile, rankedMode]) {
    assert.equal(control.disabled, true);
    assert.equal(control.getAttribute("aria-disabled"), "true");
    assert.equal(control.classList.contains("is-locked"), true);
    assert.equal(control.title, RANKED_ACCOUNT_FEATURE_MESSAGE);
  }
});

test("ranked account-only controls are re-enabled for signed-in account tokens", () => {
  const control = new TestControl();
  control.disabled = true;
  control.className = "seg is-locked";
  control.title = "old";
  control.setAttribute("aria-disabled", "true");

  const state = syncRankedAccountFeatureControls(rootWith(control), {
    account: { authenticated: true, token: "token-1" },
  });

  assert.equal(state.enabled, true);
  assert.equal(control.disabled, false);
  assert.equal(control.getAttribute("aria-disabled"), null);
  assert.equal(control.className, "seg");
  assert.equal(control.title, "");
});
