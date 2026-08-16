const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const cabinetRoot = __dirname;
const repoRoot = path.resolve(cabinetRoot, "..", "..");

test("Yam Bowling satisfies the arcade grid registration contract", () => {
  const metadataPath = path.join(cabinetRoot, "game.json");
  assert.equal(fs.existsSync(metadataPath), true, "game.json should exist beside the cabinet entry point");

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  assert.equal(metadata.title, "Yam Bowling");
  assert.equal(metadata.order, 14);

  const catalog = fs.readFileSync(path.join(repoRoot, "js", "arcade-catalog.mts"), "utf8");
  assert.match(catalog, /["']yam-bowling["']/, "the shared arcade catalog should include yam-bowling");

  const previewPath = path.join(repoRoot, "grid-previews", "yam-bowling.png");
  assert.equal(fs.existsSync(previewPath), true, "the grid preview should exist at the canonical slug path");
});

test("Yam Bowling online results use the shared account-bound ELO ladder", () => {
  const ladderCatalog = fs.readFileSync(path.join(repoRoot, "platform-api", "src", "services", "ladder-catalog.mts"), "utf8");
  assert.match(
    ladderCatalog,
    /gameSlug:\s*["']yam-bowling["'][\s\S]*?source:\s*["']game-ratings["'][\s\S]*?unitLabel:\s*["']ELO["']/,
    "yam-bowling should persist online records through the shared game_ratings ladder",
  );
});

test("the platform registers an ownership-aware Yam profile loadout", async () => {
  const loadoutDb = await import(pathToFileURL(path.join(repoRoot, "platform-api", "src", "db", "game-loadouts.mjs")));
  assert.equal(loadoutDb.isValidLoadoutSlug("yam-bowling"), true);

  const state = {
    garage: null,
    entitlements: new Set([
      "bowler:hazel-ward",
      "room:teal-lounge",
      "skin:hazel-ward:maid",
    ]),
  };
  const pool = {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("select entitlement_id from game_entitlements")) {
        return { rows: [...state.entitlements].map((entitlement_id) => ({ entitlement_id })) };
      }
      if (text.includes("insert into game_loadouts")) {
        state.garage = JSON.parse(params[2]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unhandled query: ${text}`);
    },
  };

  const saved = await loadoutDb.saveGarage(pool, {
    playerId: "player-1",
    gameSlug: "yam-bowling",
    garage: {
      version: 1,
      global: { room: "room:teal-lounge", badge: "badge:perfect-game" },
      featured: { bowlerSlug: "hazel-ward", skinId: "maid" },
      granted: ["badge:perfect-game"],
    },
  });

  assert.equal(saved.ok, true);
  assert.deepEqual(saved.garage.global, { room: "room:teal-lounge" });
  assert.deepEqual(saved.garage.featured, { bowlerSlug: "hazel-ward", skinId: "maid" });
  assert.equal(saved.garage.granted, undefined, "the client cannot persist its own ownership ledger");
});

test("the platform catalog prices canonical circuit XP without trusting the claim payload", async () => {
  const claims = await import(pathToFileURL(path.join(repoRoot, "platform-api", "src", "services", "game-progress-claim-catalog.mjs")));
  const progression = await import(pathToFileURL(path.join(repoRoot, "platform-api", "src", "services", "progression-catalog.mjs")));
  const claim = claims.validatePublicGameClaim({
    gameSlug: "yam-bowling",
    claimId: "circuit-clear:local-talia-dodson",
    kind: "circuit-clear",
    payload: {
      matchId: "local-talia-dodson",
      activeBowlerSlug: "daisy-monroe",
      xp: 999999,
      unlockedBowlerSlug: "reina-sato",
    },
  });

  assert.deepEqual(claim.campaignXp, { trackId: "daisy-monroe", kind: "boss" });
  assert.equal(claim.payload.unlockedBowlerSlug, "talia-dodson");
  assert.equal(progression.computeCampaignGrant("yam-bowling", { ...claim.campaignXp, firstClear: true }).xp, 600);
  assert.equal(progression.computeCampaignGrant("yam-bowling", { kind: "boss", firstClear: false }).xp, 0);
});
