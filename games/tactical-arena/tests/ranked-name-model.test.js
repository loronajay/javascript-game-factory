import test from "node:test";
import assert from "node:assert/strict";

import {
  RANKED_NAME_MAX_LENGTH,
  RANKED_NAME_STORAGE_KEY,
  loadRankedName,
  resolveRankedDisplayName,
  sanitizeRankedName,
  saveRankedName,
} from "../src/ui/rankedNameModel.js";

class FakeLocalStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

test("sanitizeRankedName trims, collapses whitespace, and caps length", () => {
  assert.equal(sanitizeRankedName("  Leo  the   Bold  "), "Leo the Bold");
  assert.equal(sanitizeRankedName(""), null);
  assert.equal(sanitizeRankedName("   "), null);
  assert.equal(sanitizeRankedName(42), null);
  assert.equal(sanitizeRankedName("x".repeat(40)).length, RANKED_NAME_MAX_LENGTH);
});

test("save then load round-trips a sanitized ranked name", () => {
  const storage = new FakeLocalStorage();
  const saved = saveRankedName("  Shadowblade  ", storage);
  assert.equal(saved, "Shadowblade");
  assert.equal(storage.getItem(RANKED_NAME_STORAGE_KEY), "Shadowblade");
  assert.equal(loadRankedName(storage), "Shadowblade");
});

test("saving an empty name clears the stored value", () => {
  const storage = new FakeLocalStorage({ [RANKED_NAME_STORAGE_KEY]: "Old" });
  const saved = saveRankedName("   ", storage);
  assert.equal(saved, "");
  assert.equal(storage.getItem(RANKED_NAME_STORAGE_KEY), null);
  assert.equal(loadRankedName(storage), "");
});

test("resolveRankedDisplayName prefers the custom name, then pilot, then fallback", () => {
  assert.equal(resolveRankedDisplayName({ customName: "Vex", pilotName: "leo" }), "Vex");
  assert.equal(resolveRankedDisplayName({ customName: "  ", pilotName: "leo" }), "leo");
  assert.equal(resolveRankedDisplayName({ customName: "", pilotName: "" }), "Commander");
  assert.equal(resolveRankedDisplayName({ customName: "", pilotName: "", fallback: "Pilot" }), "Pilot");
});
