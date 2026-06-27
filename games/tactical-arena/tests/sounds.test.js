import test from "node:test";
import assert from "node:assert/strict";

import { SAMPLE_SOURCES, SOUND_CATALOG } from "../src/audio/soundCatalog.js";

test("UI sound catalog includes button click and unit selection cues", () => {
  const keys = new Set(SOUND_CATALOG.map((entry) => entry.key));

  assert.ok(keys.has("buttonClick"));
  assert.ok(keys.has("unitSelect"));
});

test("sample URLs resolve inside this game's local sounds directory", () => {
  const normalizedPaths = Object.values(SAMPLE_SOURCES).map((source) =>
    decodeURIComponent(new URL(source).pathname).replace(/\\/g, "/")
  );

  assert.ok(normalizedPaths.some((path) => path.endsWith("/tactical-arena/sounds/button-click.wav")));
  assert.ok(normalizedPaths.every((path) => path.includes("/tactical-arena/sounds/")));
});
