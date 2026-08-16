import test from "node:test";
import assert from "node:assert/strict";

import {
  getGameProgress,
  isPubliclyClaimableKind,
  isValidGameClaimKind,
  recordGameProgressClaim,
  resetCampaignProgress,
} from "../src/db/game-progress.mjs";

function createGameProgressPool() {
  const state = {
    claims: new Set(),
    claimRows: [],
    valorBalance: 0,
    campaignEpoch: 0,
    entitlements: new Map(),
    campaignProgress: new Map(),
    xpProfiles: new Map(),
    xpTracks: new Map(),
    xpGrants: [],
  };
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      const text = String(sql);
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };
      if (text.includes("insert into game_progress_profiles")) return { rows: [] };
      if (text.includes("insert into game_progress_claims")) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        if (state.claims.has(key)) return { rowCount: 0, rows: [] };
        state.claims.add(key);
        state.claimRows.push({
          claim_id: params[2],
          kind: params[3],
          source_id: params[4],
          payload: params[5] ? JSON.parse(params[5]) : {},
        });
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("select source_id from game_progress_claims")) {
        const allowed = new Set(Array.isArray(params[2]) ? params[2] : []);
        return {
          rows: state.claimRows.filter((row) => row.kind === "tutorial-complete" && allowed.has(row.source_id)),
        };
      }
      if (text.includes("select claim_id, source_id, payload from game_progress_claims")) {
        return { rows: state.claimRows.filter((row) => row.kind === "consumable-activation") };
      }
      if (text.includes("select 1 from game_campaign_progress")) {
        return { rows: state.campaignProgress.has(params[2]) ? [{ "?column?": 1 }] : [] };
      }
      if (text.includes("select 1 from game_entitlements")) {
        return { rows: state.entitlements.has(params[2]) ? [{ "?column?": 1 }] : [], rowCount: state.entitlements.has(params[2]) ? 1 : 0 };
      }
      if (text.includes("select campaign_epoch from game_progress_profiles")) {
        return { rows: [{ campaign_epoch: state.campaignEpoch }] };
      }
      if (text.includes("update game_progress_profiles")) {
        if (text.includes("campaign_epoch = campaign_epoch + 1")) {
          state.campaignEpoch += 1;
          return { rows: [] };
        }
        state.valorBalance += Number(params[2]) || 0;
        return { rows: [] };
      }
      if (text.includes("delete from game_campaign_progress")) {
        state.campaignProgress.clear();
        return { rows: [] };
      }
      if (text.includes("insert into game_entitlements")) {
        state.entitlements.set(params[2], {
          entitlement_id: params[2],
          kind: params[3],
          source: params[4],
          source_id: params[5],
          quantity: 1,
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
        });
        return { rows: [] };
      }
      if (text.includes("insert into game_campaign_progress")) {
        state.campaignProgress.set(params[2], {
          mission_id: params[2],
          stars: params[3],
          completed_at: "2026-07-18T00:00:00.000Z",
          valor_claimed_at: params[4],
          reward_claimed_at: params[5],
        });
        return { rows: [] };
      }
      if (text.includes("insert into game_xp_grants")) {
        const [player_id, game_slug, grant_id, track_id, xp, source] = params;
        if (state.xpGrants.some((row) => row.player_id === player_id && row.game_slug === game_slug && row.grant_id === grant_id)) {
          return { rows: [], rowCount: 0 };
        }
        state.xpGrants.push({ player_id, game_slug, grant_id, track_id, xp, source });
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("insert into game_xp_profiles")) {
        const key = `${params[0]}:${params[1]}`;
        const previous = state.xpProfiles.get(key) || { xp: 0, matches: 0 };
        state.xpProfiles.set(key, {
          xp: previous.xp + Number(params[2]),
          matches: previous.matches + 1,
          updated_at: "2026-07-18T00:00:00.000Z",
        });
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("select stats from game_xp_tracks")) {
        const row = state.xpTracks.get(`${params[0]}:${params[1]}:${params[2]}`);
        return { rows: row ? [{ stats: row.stats }] : [] };
      }
      if (text.includes("insert into game_xp_tracks")) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        const previous = state.xpTracks.get(key) || { xp: 0, matches: 0, wins: 0 };
        state.xpTracks.set(key, {
          xp: previous.xp + Number(params[3]),
          matches: previous.matches + 1,
          wins: previous.wins + Number(params[4]),
          stats: JSON.parse(params[5]),
        });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    state,
    calls,
    async connect() {
      return client;
    },
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("from game_xp_profiles")) {
        const row = state.xpProfiles.get(`${params[0]}:${params[1]}`);
        return { rows: row ? [row] : [] };
      }
      if (text.includes("from game_xp_tracks")) {
        return {
          rows: [...state.xpTracks.entries()]
            .filter(([key]) => key.startsWith(`${params[0]}:${params[1]}:`))
            .map(([key, row]) => ({ track_id: key.split(":").slice(2).join(":"), ...row })),
        };
      }
      if (text.includes("from game_xp_grants")) {
        return {
          rows: state.xpGrants
            .filter((row) => row.player_id === params[0] && row.game_slug === params[1])
            .map((row) => ({ grant_id: row.grant_id })),
        };
      }
      if (text.includes("from game_progress_profiles")) {
        return {
          rows: [{
            player_id: params[0],
            game_slug: params[1],
            valor_balance: state.valorBalance,
            campaign_epoch: state.campaignEpoch,
            created_at: "2026-07-18T00:00:00.000Z",
            updated_at: "2026-07-18T00:00:00.000Z",
          }],
        };
      }
      if (text.includes("from game_entitlements")) return { rows: [...state.entitlements.values()] };
      if (text.includes("from game_campaign_progress")) return { rows: [...state.campaignProgress.values()] };
      if (text.includes("from game_inventory_items")) return { rows: [] };
      if (text.includes("from game_progress_claims")) {
        return {
          rows: state.claimRows
            .filter((row) => row.kind === "tutorial-complete" && row.source_id)
            .map((row) => ({ source_id: row.source_id })),
        };
      }
      return { rows: [] };
    },
  };
  return pool;
}

test("tutorial progress claim kinds are accepted by platform validation", () => {
  assert.equal(isValidGameClaimKind("tactical-arena", "tutorial-complete"), true);
  assert.equal(isValidGameClaimKind("tactical-arena", "tutorial-valor"), true);
  assert.equal(isValidGameClaimKind("tactical-arena", "tutorial-unit-reward"), true);
  assert.equal(isValidGameClaimKind("tactical-arena", "tutorial-skin-choice"), true);
});

test("recordGameProgressClaim applies tutorial Valor and entitlement claims idempotently", async () => {
  const pool = createGameProgressPool();
  const common = { playerId: "player-1", gameSlug: "tactical-arena" };

  let completion = null;
  for (const tutorialId of ["basics", "arts-mp", "damage-types", "rage-status", "status-effects"]) {
    completion = await recordGameProgressClaim(pool, {
      ...common,
      claimId: `tutorial-complete:${tutorialId}`,
      kind: "tutorial-complete",
      sourceId: tutorialId,
      payload: { tutorialId },
    });
  }
  const valor = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "tutorial-valor:all-tutorials",
    kind: "tutorial-valor",
    sourceId: "all-tutorials",
    payload: { amount: 500 },
  });
  const unit = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "tutorial-unit-reward:all-tutorials:juggernaut",
    kind: "tutorial-unit-reward",
    sourceId: "all-tutorials",
    payload: { type: "juggernaut", entitlementId: "unit:juggernaut" },
  });
  const skin = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "tutorial-skin-choice:juggernaut:bio-mech",
    kind: "tutorial-skin-choice",
    sourceId: "all-tutorials",
    payload: { type: "juggernaut", slug: "bio-mech", entitlementId: "skin:juggernaut:bio-mech" },
  });
  const duplicateValor = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "tutorial-valor:all-tutorials",
    kind: "tutorial-valor",
    sourceId: "all-tutorials",
    payload: { amount: 500 },
  });

  assert.equal(completion.ok, true);
  assert.equal(valor.progress.valorBalance, 500);
  assert.equal(unit.progress.entitlements.some((entry) => entry.entitlementId === "unit:juggernaut" && entry.source === "tutorial"), true);
  assert.equal(skin.progress.entitlements.some((entry) => entry.entitlementId === "skin:juggernaut:bio-mech" && entry.source === "tutorial"), true);
  assert.equal(duplicateValor.alreadyProcessed, true);
  assert.equal(duplicateValor.progress.valorBalance, 500);
});

test("recordGameProgressClaim refuses premium kinds unless the trusted Stripe path sets allowPremiumKinds", async () => {
  const pool = createGameProgressPool();
  const common = { playerId: "player-1", gameSlug: "tactical-arena" };

  // Untrusted caller (public route) — must be refused, nothing granted.
  const forged = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "forged:cs_fake",
    kind: "premium-skin-purchase",
    sourceId: "cs_fake",
    payload: { entitlementIds: ["skin:swordsman:medieval"] },
  });
  assert.equal(forged, null);
  assert.equal(pool.state.entitlements.has("skin:swordsman:medieval"), false);

  // Trusted Stripe fulfillment path — allowed to grant the paid entitlement.
  const paid = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "stripe-checkout:cs_real",
    kind: "premium-skin-purchase",
    sourceId: "cs_real",
    allowPremiumKinds: true,
    payload: { entitlementIds: ["skin:swordsman:medieval"] },
  });
  assert.equal(paid.ok, true);
  assert.equal(pool.state.entitlements.has("skin:swordsman:medieval"), true);
});

test("campaign-progress records a mission clear and its stars without moving Valor", async () => {
  const pool = createGameProgressPool();

  const result = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "tactical-arena",
    claimId: "campaign-progress:clod-trial:3",
    kind: "campaign-progress",
    payload: { missionId: "clod-trial", stars: 3 },
  });

  assert.equal(result.ok, true);
  assert.equal(pool.state.valorBalance, 0);
  assert.deepEqual(result.progress.campaignProgress, [{
    missionId: "clod-trial",
    stars: 3,
    completedAt: "2026-07-18T00:00:00.000Z",
    valorClaimedAt: null,
    rewardClaimedAt: null,
  }]);
});

test("campaign-progress is a publicly claimable, non-premium kind", () => {
  assert.equal(isValidGameClaimKind("tactical-arena", "campaign-progress"), true);
  assert.equal(isPubliclyClaimableKind("tactical-arena", "campaign-progress"), true);
});

test("Yam Bowling circuit clears grant only the server-catalogued bowler", async () => {
  const pool = createGameProgressPool();
  const result = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "yam-bowling",
    claimId: "circuit-clear:local-hazel-ward",
    kind: "circuit-clear",
    payload: {
      matchId: "local-hazel-ward",
      activeBowlerSlug: "daisy-monroe",
      unlockedBowlerSlug: "reina-sato",
      entitlementIds: ["room:champion-room"],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual([...pool.state.entitlements.keys()], ["bowler:hazel-ward"]);
  assert.equal(result.progress.campaignProgress.length, 1);
  assert.equal(result.progression.player.xp, 300);
  assert.equal(result.progression.tracks["daisy-monroe"].xp, 300);
  assert.deepEqual(result.progression.grants, ["circuit-clear:local-hazel-ward"]);
  assert.deepEqual({
    ...result.progress.campaignProgress[0],
    rewardClaimedAt: Boolean(result.progress.campaignProgress[0].rewardClaimedAt),
  }, {
    missionId: "local-hazel-ward",
    stars: 1,
    completedAt: "2026-07-18T00:00:00.000Z",
    valorClaimedAt: null,
    rewardClaimedAt: true,
  });
});

test("Yam Bowling cannot skip ahead in the canonical circuit", async () => {
  const pool = createGameProgressPool();
  const result = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "yam-bowling",
    claimId: "circuit-clear:local-piper-hart",
    kind: "circuit-clear",
    payload: { matchId: "local-piper-hart", activeBowlerSlug: "daisy-monroe" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "claim_prerequisite_missing");
  assert.equal(pool.state.entitlements.size, 0);
});

test("Yam Bowling circuit XP can use an earned bowler but never a forged active bowler", async () => {
  const pool = createGameProgressPool();

  const forged = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "yam-bowling",
    claimId: "circuit-clear:local-hazel-ward",
    kind: "circuit-clear",
    payload: { matchId: "local-hazel-ward", activeBowlerSlug: "hazel-ward" },
  });
  assert.equal(forged.ok, false);
  assert.equal(forged.error, "active_bowler_not_owned");
  assert.equal(pool.state.xpGrants.length, 0);
  assert.equal(pool.state.entitlements.size, 0);

  await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "yam-bowling",
    claimId: "circuit-clear:local-hazel-ward",
    kind: "circuit-clear",
    payload: { matchId: "local-hazel-ward", activeBowlerSlug: "daisy-monroe" },
  });
  const earned = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "yam-bowling",
    claimId: "circuit-clear:local-piper-hart",
    kind: "circuit-clear",
    payload: { matchId: "local-piper-hart", activeBowlerSlug: "hazel-ward" },
  });

  assert.equal(earned.ok, true);
  assert.equal(earned.progression.tracks["hazel-ward"].xp, 300);
});

// A second device restores which tutorials are done from the claim rows themselves —
// tutorial completion has no table of its own.
test("the progress snapshot reports completed tutorials", async () => {
  const pool = createGameProgressPool();

  for (const tutorialId of ["basics", "arts-mp"]) {
    await recordGameProgressClaim(pool, {
      playerId: "player-1",
      gameSlug: "tactical-arena",
      claimId: `tutorial-complete:${tutorialId}`,
      kind: "tutorial-complete",
      payload: { tutorialId },
    });
  }

  const snapshot = await getGameProgress(pool, "player-1", "tactical-arena");
  assert.deepEqual(snapshot.completedTutorials.sort(), ["arts-mp", "basics"]);
});

// --- Campaign reset epoch -------------------------------------------------------------
//
// Reset is the only progress operation that moves backward, so it is the only one the
// clients' forward-only union merges cannot express. The epoch is what makes it stick.

const COMMON = { playerId: "player-1", gameSlug: "tactical-arena" };

function campaignClaim({ missionId, stars, campaignEpoch }) {
  const epochSegment = campaignEpoch > 0 ? `e${campaignEpoch}:` : "";
  return {
    ...COMMON,
    claimId: `campaign-progress:${epochSegment}${missionId}:${stars}`,
    kind: "campaign-progress",
    payload: { missionId, stars, campaignEpoch },
  };
}

test("resetCampaignProgress clears the missions and bumps the campaign epoch", async () => {
  const pool = createGameProgressPool();
  await recordGameProgressClaim(pool, campaignClaim({ missionId: "clod-trial", stars: 3, campaignEpoch: 0 }));

  const before = await getGameProgress(pool, COMMON.playerId, COMMON.gameSlug);
  assert.equal(before.campaignEpoch, 0);
  assert.equal(before.campaignProgress.length, 1);

  const result = await resetCampaignProgress(pool, COMMON.playerId, COMMON.gameSlug);
  assert.equal(result.ok, true);
  assert.deepEqual(result.progress.campaignProgress, []);
  assert.equal(result.progress.campaignEpoch, 1);
});

test("public Tactical Arena claims reject invented ids and oversized Valor payouts", async () => {
  const pool = createGameProgressPool();

  const invented = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "tactical-arena",
    claimId: "campaign-valor:invented-repeatable-id",
    kind: "campaign-valor",
    payload: { missionId: "clod-trial", amount: 100000, stars: 3 },
  });

  assert.equal(invented.ok, false);
  assert.equal(invented.error, "invalid_claim");
  assert.equal(pool.state.valorBalance, 0);
});

test("campaign Valor is priced from the server reward catalog", async () => {
  const pool = createGameProgressPool();

  const result = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "tactical-arena",
    claimId: "campaign-valor:clod-trial",
    kind: "campaign-valor",
    payload: { missionId: "clod-trial", amount: 100000, stars: 3 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.progress.valorBalance, 55);
});

test("campaign Valor preserves paid boosts using server activation records", async () => {
  const pool = createGameProgressPool();
  pool.state.claimRows.push({
    claim_id: "consumable-activation:boost-1",
    kind: "consumable-activation",
    source_id: "valor-boost-x",
    payload: { itemId: "valor-boost-x" },
  });

  const result = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "tactical-arena",
    claimId: "campaign-valor:clod-trial",
    kind: "campaign-valor",
    payload: { missionId: "clod-trial", amount: 1, stars: 3 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.progress.valorBalance, 110);
});

test("campaign reward claims cannot substitute a different mission reward", async () => {
  const pool = createGameProgressPool();

  const result = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "tactical-arena",
    claimId: "campaign-unit-reward:clod-trial:blacksword",
    kind: "campaign-unit-choice",
    payload: { missionId: "clod-trial", type: "blacksword", entitlementId: "unit:blacksword" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_claim");
  assert.equal(pool.state.entitlements.has("unit:blacksword"), false);
});

test("tutorial completion rewards require every canonical tutorial claim", async () => {
  const pool = createGameProgressPool();

  const result = await recordGameProgressClaim(pool, {
    playerId: "player-1",
    gameSlug: "tactical-arena",
    claimId: "tutorial-valor:all-tutorials",
    kind: "tutorial-valor",
    sourceId: "all-tutorials",
    payload: { amount: 500 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "claim_prerequisite_missing");
  assert.equal(pool.state.valorBalance, 0);
});

test("a campaign claim built before a reset cannot resurrect the cleared progress", async () => {
  const pool = createGameProgressPool();
  await resetCampaignProgress(pool, COMMON.playerId, COMMON.gameSlug);

  // The other device still has the old campaign cached and flushes a queued claim for it.
  const stale = await recordGameProgressClaim(pool, campaignClaim({
    missionId: "clod-trial",
    stars: 3,
    campaignEpoch: 0,
  }));

  // The claim is accepted and recorded (so the device stops retrying) but writes nothing.
  assert.ok(stale);
  const snapshot = await getGameProgress(pool, COMMON.playerId, COMMON.gameSlug);
  assert.deepEqual(snapshot.campaignProgress, []);
});

test("a mission replayed after a reset is recorded again under the new epoch", async () => {
  const pool = createGameProgressPool();
  await recordGameProgressClaim(pool, campaignClaim({ missionId: "clod-trial", stars: 3, campaignEpoch: 0 }));
  await resetCampaignProgress(pool, COMMON.playerId, COMMON.gameSlug);

  // Same mission, same stars — only the epoch differs. Without the epoch in the claim id
  // this would collide with the pre-reset claim and be swallowed as a duplicate, leaving
  // the server permanently unable to re-record the mission.
  await recordGameProgressClaim(pool, campaignClaim({ missionId: "clod-trial", stars: 3, campaignEpoch: 1 }));

  const snapshot = await getGameProgress(pool, COMMON.playerId, COMMON.gameSlug);
  assert.equal(snapshot.campaignProgress.length, 1);
  assert.equal(snapshot.campaignProgress[0].missionId, "clod-trial");
  assert.equal(snapshot.campaignProgress[0].stars, 3);
});

test("resetting preserves Valor and entitlement claims so nothing can be re-farmed", async () => {
  const pool = createGameProgressPool();
  await recordGameProgressClaim(pool, {
    ...COMMON,
    claimId: "campaign-valor:clod-trial",
    kind: "campaign-valor",
    payload: { missionId: "clod-trial", amount: 55, stars: 3 },
  });
  await resetCampaignProgress(pool, COMMON.playerId, COMMON.gameSlug);

  // Replaying the mission must not pay a second time: the valor claim row survives the
  // reset, so it is still a duplicate.
  await recordGameProgressClaim(pool, {
    ...COMMON,
    claimId: "campaign-valor:clod-trial",
    kind: "campaign-valor",
    payload: { missionId: "clod-trial", amount: 55, stars: 3 },
  });

  const snapshot = await getGameProgress(pool, COMMON.playerId, COMMON.gameSlug);
  assert.equal(snapshot.valorBalance, 55);
});
