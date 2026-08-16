import test from "node:test";
import assert from "node:assert/strict";

import { createAchievementClient } from "./profile/achievement-client.mjs";

test("finished-match achievements become fixed idempotent claims and server entitlements", async () => {
  const calls = [];
  const applied = [];
  const earned = [];
  const client = createAchievementClient({
    achievementCore: { detectMatchAchievements: () => ["perfect-game", "split-decision"] },
    platformApi: {
      recordGameProgressClaim: async (gameSlug, claim) => {
        calls.push([gameSlug, claim]);
        return {
          ok: true,
          alreadyProcessed: false,
          progress: { entitlements: [{ entitlementId: `reward:${claim.sourceId}` }] },
        };
      },
    },
    loadout: { applyServerEntitlements: (entitlements) => applied.push(entitlements) },
    onEarned: (achievementIds) => earned.push(achievementIds),
  });

  const result = await client.handleFinishedMatch({ match: {}, localPlayerId: "p1", rolls: [] });

  assert.deepEqual(result, ["perfect-game", "split-decision"]);
  assert.deepEqual(calls.map(([, claim]) => claim), [
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
  assert.equal(applied.length, 2);
  assert.deepEqual(earned, [["perfect-game", "split-decision"]]);
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
