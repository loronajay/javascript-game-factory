import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const renderer = readFileSync(resolve(repoRoot, "js/admin-page/render-content.mts"), "utf8");
const actions = readFileSync(resolve(repoRoot, "js/admin-page/actions.mts"), "utf8");

test("cabinet editor exposes visibility, descriptions, tags, formats, and play modes", () => {
  assert.match(renderer, /name="description"|textArea\("description"/);
  assert.match(renderer, /name="categories"|textInput\("categories"/);
  assert.match(renderer, /name="dimensions"|textInput\("dimensions"/);
  assert.match(renderer, /name="playModes"|textInput\("playModes"/);
  assert.match(renderer, /name="previewVideo"|textInput\("previewVideo"/);
  assert.match(renderer, /checkbox\("hidden"/);
  assert.match(renderer, /Reset to game\.json/);
});

test("cabinet save converts comma-separated metadata into arrays", () => {
  assert.match(actions, /categories:\s*splitList\(values\.categories\)/);
  assert.match(actions, /dimensions:\s*splitList\(values\.dimensions\)/);
  assert.match(actions, /playModes:\s*splitList\(values\.playModes\)/);
});
