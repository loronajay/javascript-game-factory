import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { MIGRATION_FILES, migrationFileUrl } from "../src/db/migrations.mjs";
import {
  loadoutFromYamBowlingGarage,
  normalizeYamBowlingGarage,
} from "../src/services/yam-bowling-loadout-catalog.mjs";

function legacyGarage(skinId = "maid") {
  return {
    version: 1,
    bowlers: {
      "daisy-monroe": {
        skin: `skin:daisy-monroe:${skinId}`,
        victoryPose: `victory-pose:daisy-monroe:${skinId}`,
        defeatPose: `defeat-pose:daisy-monroe:${skinId}`,
      },
    },
    global: {},
    featured: { bowlerSlug: "daisy-monroe", skinId },
  };
}

test("new players and unentitled legacy garages normalize to Canon", () => {
  const garage = normalizeYamBowlingGarage(legacyGarage(), { ownedEntitlementIds: new Set() });

  assert.deepEqual(garage.bowlers["daisy-monroe"], { skin: "skin:daisy-monroe:canon" });
  assert.deepEqual(garage.featured, { bowlerSlug: "daisy-monroe", skinId: "canon" });
  assert.deepEqual(loadoutFromYamBowlingGarage(legacyGarage()), {
    featured: { bowlerSlug: "daisy-monroe", skinId: "canon" },
    roomId: "room:default",
    titleId: "title:rookie",
    badgeId: "badge:founding-bowler",
    profileFrameId: null,
    profileBackgroundId: null,
  });
});

test("one exact skin entitlement unlocks that skin and both matching outcome poses", () => {
  const ownedEntitlementIds = new Set(["skin:daisy-monroe:swimsuit"]);
  const garage = normalizeYamBowlingGarage(legacyGarage("swimsuit"), { ownedEntitlementIds });

  assert.deepEqual(garage.bowlers["daisy-monroe"], legacyGarage("swimsuit").bowlers["daisy-monroe"]);
  assert.deepEqual(garage.featured, { bowlerSlug: "daisy-monroe", skinId: "swimsuit" });

  const wrongBowler = normalizeYamBowlingGarage({
    ...legacyGarage("swimsuit"),
    bowlers: { "nia-brooks": {
      skin: "skin:nia-brooks:swimsuit",
      victoryPose: "victory-pose:nia-brooks:swimsuit",
      defeatPose: "defeat-pose:nia-brooks:swimsuit",
    } },
    featured: { bowlerSlug: "nia-brooks", skinId: "swimsuit" },
  }, { ownedEntitlementIds });
  assert.deepEqual(wrongBowler.bowlers["nia-brooks"], { skin: "skin:nia-brooks:canon" });
  assert.deepEqual(wrongBowler.featured, { bowlerSlug: "nia-brooks", skinId: "canon" });
});

test("each Yam trail entitlement preserves only its exact equipped color", () => {
  const cyanGarage = {
    ...legacyGarage("canon"),
    global: { ballTrail: "ball-trail:cyan-pulse" },
  };
  const ownedEntitlementIds = new Set(["ball-trail:cyan-pulse"]);

  assert.equal(
    normalizeYamBowlingGarage(cyanGarage, { ownedEntitlementIds }).global.ballTrail,
    "ball-trail:cyan-pulse",
  );
  assert.deepEqual(
    normalizeYamBowlingGarage({ ...cyanGarage, global: { ballTrail: "ball-trail:hot-pink" } }, { ownedEntitlementIds }).global,
    {},
    "one color entitlement must not unlock another trail",
  );
});

test("the one-time migration grants only exact non-Canon skins saved in the server garage", async () => {
  const migrationName = "039-yam-bowling-skin-entitlements.sql";
  assert.ok(MIGRATION_FILES.includes(migrationName));

  const sql = await readFile(migrationFileUrl(migrationName), "utf8");
  assert.match(sql, /jsonb_each\([^)]*garage[^)]*bowlers/is);
  assert.match(sql, /featured[^\n]*bowlerSlug/is);
  assert.match(sql, /skin_id\s+in\s*\(\s*'swimsuit'\s*,\s*'maid'\s*\)/i);
  assert.match(sql, /source_id[\s\S]*yam-bowling-equipped-skin-v1/i);
  assert.doesNotMatch(sql, /generate_series|cross\s+join\s+.*skin_ids/i);
});
