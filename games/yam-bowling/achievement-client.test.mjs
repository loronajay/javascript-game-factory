import test from "node:test";
import assert from "node:assert/strict";

import { createAchievementClient } from "./profile/achievement-client.mjs";

test("finished matches file career evidence before fixed idempotent achievement claims", async () => {
  const calls = [];
  const applied = [];
  const earned = [];
  const client = createAchievementClient({
    achievementCore: {
      detectMatchAchievements: () => ["perfect-game", "split-decision"],
      summarizeCareerMatch: () => ({ trackId: "daisy-monroe", outcome: "win", laneSlug: "royal-gold", spareAttempts: 1, spares: 1, sparePrefix: 1, spareSuffix: 1, spareBest: 1 }),
    },
    platformApi: {
      recordGameProgressClaim: async (gameSlug, claim) => {
        calls.push([gameSlug, claim]);
        return {
          ok: true,
          alreadyProcessed: false,
          progress: { entitlements: [{ entitlementId: `reward:${claim.sourceId}` }] },
          entitlementIds: claim.kind === "career-match" ? ["badge:precision-bowler"] : [],
        };
      },
    },
    loadout: { applyServerEntitlements: (entitlements) => applied.push(entitlements) },
    onEarned: (achievementIds) => earned.push(achievementIds),
  });

  const result = await client.handleFinishedMatch({ match: {}, localPlayerId: "p1", rolls: [], progressId: "match-123" });

  assert.deepEqual(result, ["precision-bowler", "perfect-game", "split-decision"]);
  assert.deepEqual(calls.map(([, claim]) => claim), [
    {
      claimId: "career-match:match-123",
      kind: "career-match",
      sourceId: "match-123",
      payload: { trackId: "daisy-monroe", outcome: "win", laneSlug: "royal-gold", spareAttempts: 1, spares: 1, sparePrefix: 1, spareSuffix: 1, spareBest: 1 },
    },
    {
      claimId: "match-achievement:perfect-game",
      kind: "match-achievement",
      sourceId: "perfect-game",
      payload: { achievementId: "perfect-game" },
    },
    {
      claimId: "match-achievement:split-decision",
      kind: "match-achievement",
      sourceId: "split-decision",
      payload: { achievementId: "split-decision" },
    },
  ]);
  assert.equal(calls.every(([gameSlug]) => gameSlug === "yam-bowling"), true);
  assert.equal(applied.length, 3);
  assert.deepEqual(earned, [["precision-bowler", "perfect-game", "split-decision"]]);
});

test("already-owned achievements stay silent and a failed claim grants nothing", async () => {
  let applied = 0;
  let announced = 0;
  const answers = [
    { ok: true, alreadyProcessed: true, progress: { entitlements: [] } },
    null,
  ];
  const client = createAchievementClient({
    achievementCore: { detectMatchAchievements: () => ["comeback-kid", "perfect-game"] },
    platformApi: { recordGameProgressClaim: async () => answers.shift() },
    loadout: { applyServerEntitlements: () => { applied += 1; } },
    onEarned: () => { announced += 1; },
  });

  assert.deepEqual(await client.handleFinishedMatch({}), []);
  assert.equal(applied, 1, "an idempotent response still refreshes authoritative ownership");
  assert.equal(announced, 0);
});
