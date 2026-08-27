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
    catchLineId: "catch-line:ready-to-roll",
    profileFrameId: null,
    profileBackgroundId: null,
  });
});

test("a founding catch line persists and is exposed in the public loadout", () => {
  const raw = { ...legacyGarage("canon"), global: { catchLine: "catch-line:find-the-pocket" } };
  const garage = normalizeYamBowlingGarage(raw);

  assert.equal(garage.global.catchLine, "catch-line:find-the-pocket");
  assert.equal(loadoutFromYamBowlingGarage(raw).catchLineId, "catch-line:find-the-pocket");
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

test("a Halloween entitlement survives server garage normalization", () => {
  const halloweenGarage = legacyGarage("halloween");
  const garage = normalizeYamBowlingGarage(halloweenGarage, {
    ownedEntitlementIds: new Set(["skin:daisy-monroe:halloween"]),
  });

  assert.deepEqual(garage.bowlers["daisy-monroe"], halloweenGarage.bowlers["daisy-monroe"]);
  assert.deepEqual(garage.featured, { bowlerSlug: "daisy-monroe", skinId: "halloween" });
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

test("each Yam strike burst entitlement preserves only its exact equipped color", () => {
  const purpleGarage = {
    ...legacyGarage("canon"),
    global: { strikeBurst: "strike-burst:purple-nova" },
  };
  const ownedEntitlementIds = new Set(["strike-burst:purple-nova"]);

  assert.equal(
    normalizeYamBowlingGarage(purpleGarage, { ownedEntitlementIds }).global.strikeBurst,
    "strike-burst:purple-nova",
  );
  assert.deepEqual(
    normalizeYamBowlingGarage({ ...purpleGarage, global: { strikeBurst: "strike-burst:cyan-flash" } }, { ownedEntitlementIds }).global,
    {},
    "one color entitlement must not unlock another burst",
  );
});

test("per-bowler effect overrides survive while remaining player-owned cosmetics", () => {
  const raw = {
    ...legacyGarage("canon"),
    bowlers: {
      "daisy-monroe": {
        ...legacyGarage("canon").bowlers["daisy-monroe"],
        ballTrail: "ball-trail:cyan-pulse",
        strikeBurst: "strike-burst:purple-nova",
      },
      "nia-brooks": {
        ballTrail: "ball-trail:cyan-pulse",
      },
    },
  };
  const garage = normalizeYamBowlingGarage(raw, {
    ownedEntitlementIds: new Set(["ball-trail:cyan-pulse", "strike-burst:purple-nova"]),
  });

  assert.equal(garage.bowlers["daisy-monroe"].ballTrail, "ball-trail:cyan-pulse");
  assert.equal(garage.bowlers["daisy-monroe"].strikeBurst, "strike-burst:purple-nova");
  assert.equal(garage.bowlers["nia-brooks"].ballTrail, "ball-trail:cyan-pulse");
  assert.equal(garage.global.ballTrail, undefined, "an override does not rewrite the player default");
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

test("both reaction wheels survive a garage round trip slot by slot", () => {
  // The wheels are the cabinet's only mid-match expression, and they are stored
  // one slot per key rather than as a list — so a slot the server silently drops
  // is a chip that disappears from the player's tray on the next save. Founding
  // reactions need no entitlement, which is what lets a new account fill both.
  const wheels = {
    emote: "emote:wave",
    emote2: "emote:thumbs-up",
    emote3: "emote:good-luck",
    emote4: "emote:nice-one",
    catchLine: "catch-line:ready-to-roll",
    catchLine2: "catch-line:good-game",
    catchLine3: "catch-line:keep-it-clean",
    catchLine4: "catch-line:find-the-pocket",
  };
  const garage = normalizeYamBowlingGarage(
    { ...legacyGarage("canon"), global: { ...wheels } },
    { ownedEntitlementIds: new Set() },
  );

  for (const [slot, itemId] of Object.entries(wheels)) {
    assert.equal(garage.global[slot], itemId, `${slot} should survive normalization`);
  }
});

test("a reaction slot refuses an item of the other wheel's kind", () => {
  // Each slot declares one reward type. Without that, a catch line could be
  // stored in an emote slot and the match HUD would have a chip it cannot draw.
  const garage = normalizeYamBowlingGarage(
    { ...legacyGarage("canon"), global: { emote2: "catch-line:good-game", catchLine2: "emote:wave" } },
    { ownedEntitlementIds: new Set() },
  );

  assert.equal(garage.global.emote2, undefined);
  assert.equal(garage.global.catchLine2, undefined);
});
