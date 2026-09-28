import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

import { MANIFEST_NAME, MIRRORED_DIRS, buildManifest, mirroredFiles } from "../tools/mirror-sim.mjs";

// The mirrored layers are the Pet Games' authority: the network server runs
// these exact files to decide online races and brawls. That only works while
// they stay pure and self-contained, so this test is the rule, mechanically.
const repo = resolve(import.meta.dirname, "..", "..", "..");

const code = (path) => readFileSync(join(repo, path), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*/g, "$1");

test("every mirrored module is pure: no DOM, no clock, no ambient random", () => {
  for (const path of mirroredFiles()) {
    const source = code(path);
    assert.ok(!/\bdocument\b|\bwindow\b|\blocalStorage\b|\bsessionStorage\b/.test(source), `${path} touches the DOM`);
    assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|new Date\(/.test(source), `${path} reads a clock`);
    assert.ok(!/Math\.random/.test(source), `${path} uses an ambient random source`);
  }
});

test("no mirrored module imports anything outside the mirrored set", () => {
  const mirrored = new Set(mirroredFiles().map((path) => normalize(path)));
  for (const path of mirroredFiles()) {
    for (const [, specifier] of code(path).matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      assert.ok(specifier.startsWith("."), `${path} imports a package: ${specifier}`);
      const target = normalize(join(dirname(path), specifier.replace(/[?#].*$/, "")));
      assert.ok(mirrored.has(target), `${path} imports ${specifier}, which the server does not have`);
    }
  }
});

test("every mirrored module imports its siblings under one shared cache-buster", () => {
  // Two spellings of one file are two module instances in a browser and in node.
  const versions = new Set();
  for (const path of mirroredFiles()) {
    for (const [, query] of code(path).matchAll(/\bfrom\s+["'][^"']+\?v=([^"']+)["']/g)) versions.add(query);
  }
  assert.ok(versions.size <= 1, `the sim imports disagree about the version: ${[...versions].join(", ")}`);
});

test("the committed manifest matches the files (run tools/mirror-sim.mjs after a sim change)", () => {
  const recorded = JSON.parse(readFileSync(join(import.meta.dirname, "..", "tools", MANIFEST_NAME), "utf8"));
  assert.deepEqual(recorded.files, buildManifest().files);
  assert.equal(MIRRORED_DIRS.length, 3);
});
