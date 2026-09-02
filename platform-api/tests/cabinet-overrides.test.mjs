import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { listCabinetOverrides, saveCabinetOverride } from "../src/db/site-settings.mjs";

test("cabinet override rows expose editable catalog metadata", async () => {
  const pool = {
    async query() {
      return { rows: [{
        slug: "sumorai",
        hidden: false,
        featured: null,
        sort_order: null,
        title: null,
        tagline: null,
        description: "Updated description",
        status_label: null,
        categories: ["Fighting", "Arcade"],
        dimensions: ["2d"],
        play_modes: ["solo", "online"],
        preview_video: "grid-previews/sumorai.webm",
        updated_at: "2026-09-01T00:00:00.000Z",
      }] };
    },
  };

  const [override] = await listCabinetOverrides(pool);
  assert.equal(override.description, "Updated description");
  assert.deepEqual(override.categories, ["Fighting", "Arcade"]);
  assert.deepEqual(override.dimensions, ["2d"]);
  assert.deepEqual(override.playModes, ["solo", "online"]);
  assert.equal(override.previewVideo, "grid-previews/sumorai.webm");
});

test("saving a cabinet override normalizes editable metadata", async () => {
  let capturedSql = "";
  let capturedParams = [];
  const pool = {
    async query(sql, params) {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [{
        slug: params[0], hidden: params[1], featured: params[2], sort_order: params[3],
        title: params[4], tagline: params[5], description: params[6], status_label: params[7],
        categories: JSON.parse(params[8]), dimensions: JSON.parse(params[9]),
        play_modes: JSON.parse(params[10]), preview_video: params[11],
        updated_at: "2026-09-01T00:00:00.000Z",
      }] };
    },
  };

  const result = await saveCabinetOverride(pool, "sumorai", {
    description: "  Updated description  ",
    categories: [" Fighting ", "Arcade", "Fighting", ""],
    dimensions: ["2D", "sideways"],
    playModes: ["SOLO", "online", "lan"],
    previewVideo: "grid-previews/sumorai.webm",
  }, "admin-1");

  assert.equal(result.ok, true);
  assert.match(capturedSql, /description/);
  assert.match(capturedSql, /categories/);
  assert.match(capturedSql, /dimensions/);
  assert.match(capturedSql, /play_modes/);
  assert.equal(capturedParams[6], "Updated description");
  assert.deepEqual(JSON.parse(capturedParams[8]), ["Fighting", "Arcade"]);
  assert.deepEqual(JSON.parse(capturedParams[9]), ["2d"]);
  assert.deepEqual(JSON.parse(capturedParams[10]), ["solo", "online"]);
  assert.equal(capturedParams[11], "grid-previews/sumorai.webm");
});

test("the follow-up migration adds nullable catalog metadata columns", () => {
  const migration = readFileSync(
    resolve(import.meta.dirname, "../src/db/migrations/047-cabinet-catalog-metadata.sql"),
    "utf8",
  );
  assert.match(migration, /add column if not exists description text/i);
  assert.match(migration, /add column if not exists categories jsonb/i);
  assert.match(migration, /add column if not exists dimensions jsonb/i);
  assert.match(migration, /add column if not exists play_modes jsonb/i);
  assert.match(migration, /add column if not exists preview_video text/i);
});
