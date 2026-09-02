import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ARCADE_GAME_SLUGS } from "../arcade-catalog.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const allowedDimensions = new Set(["2d", "3d"]);
const allowedModes = new Set(["solo", "local", "online"]);

function readMetadata(entry) {
  const slug = typeof entry === "string" ? entry : entry.slug;
  const folder = typeof entry === "string" ? entry : entry.path;
  const path = resolve(repoRoot, "games", folder, "game.json");
  return { slug, config: JSON.parse(readFileSync(path, "utf8")) };
}

for (const entry of ARCADE_GAME_SLUGS) {
  const { slug, config } = readMetadata(entry);

  test(`${slug} has complete catalog metadata`, () => {
    assert.ok(config.tagline?.length >= 20, "tagline should describe the hook");
    assert.ok(config.description?.length >= 80, "description should explain the actual game");
    assert.match(config.players, /^\d+(?:-\d+)?$/, "players must be a compact numeric range");
    assert.ok(Array.isArray(config.categories) && config.categories.length >= 2, "categories are required");
    assert.equal(new Set(config.categories).size, config.categories.length, "categories must be unique");
    assert.ok(Array.isArray(config.dimensions) && config.dimensions.length >= 1, "dimensions are required");
    assert.ok(config.dimensions.every((value) => allowedDimensions.has(value)), "dimensions must be 2d/3d");
    assert.ok(Array.isArray(config.play_modes) && config.play_modes.length >= 1, "play_modes are required");
    assert.ok(config.play_modes.every((value) => allowedModes.has(value)), "play_modes must use the shared vocabulary");
  });
}

test("known 3D and hybrid cabinets stay classified honestly", () => {
  const metadata = new Map(ARCADE_GAME_SLUGS.map((entry) => {
    const game = readMetadata(entry);
    return [game.slug, game.config];
  }));

  assert.deepEqual(metadata.get("illuminauts").dimensions, ["3d"]);
  assert.deepEqual(metadata.get("hide-and-seek").dimensions, ["3d"]);
  assert.deepEqual(metadata.get("puckd-up").dimensions, ["3d"]);
  assert.deepEqual(metadata.get("yam-bowling").dimensions, ["2d", "3d"]);
  assert.deepEqual(metadata.get("speed-demon").dimensions, ["2d"]);
});
