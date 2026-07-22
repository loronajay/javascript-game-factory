import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PLACEMENT_MATCHES,
  describePlacementResult,
  getRankedPlacementProgress,
  placementProgressText,
} from "../src/ui/rankedPlacements.js";

test("ranked placement progress counts existing authoritative ranked record", () => {
  const progress = getRankedPlacementProgress({ wins: 2, losses: 1, draws: 0 });

  assert.equal(progress.required, DEFAULT_PLACEMENT_MATCHES);
  assert.equal(progress.played, 3);
  assert.equal(progress.remaining, 7);
  assert.equal(progress.complete, false);
  assert.equal(placementProgressText(progress), "Placement matches: 3/10 complete - 7 to go");
});

test("ranked placement progress never resets players with completed records", () => {
  const standing = { wins: 5, losses: 4, draws: 1, rating: 1360, tier: { id: "gold", label: "Gold" } };
  const progress = getRankedPlacementProgress(standing);

  assert.equal(progress.played, 10);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.complete, true);
  assert.equal(placementProgressText(progress, standing), "Placement complete - Gold, 1360 rating");
});

test("ranked placement progress honors explicit server placement fields", () => {
  const progress = getRankedPlacementProgress({
    wins: 1,
    losses: 1,
    draws: 1,
    rating: 1290,
    tier: { id: "silver", label: "Silver" },
    placement: { matchesPlayed: 4, matchesRequired: 7 },
  });

  assert.equal(progress.played, 4);
  assert.equal(progress.required, 7);
  assert.equal(progress.remaining, 3);
  assert.equal(placementProgressText(progress), "Placement matches: 4/7 complete - 3 to go");
});

test("ranked placement result announces only the match that completes placement", () => {
  const finishedNow = describePlacementResult({ wins: 5, losses: 5, draws: 0, rating: 1234, tier: { label: "Silver" } });
  const stillPlacing = describePlacementResult({ wins: 5, losses: 4, draws: 0, rating: 1220, tier: { label: "Silver" } });
  const alreadyPlaced = describePlacementResult({ wins: 6, losses: 5, draws: 0, rating: 1250, tier: { label: "Silver" } });

  assert.equal(finishedNow?.kind, "complete");
  assert.equal(finishedNow.title, "Placement Complete");
  assert.equal(finishedNow.body, "You placed in Silver at 1234 rating.");
  assert.equal(stillPlacing?.kind, "progress");
  assert.equal(stillPlacing.body, "Placement matches: 9/10 complete - 1 to go");
  assert.equal(alreadyPlaced, null);
});
