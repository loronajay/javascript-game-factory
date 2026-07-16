import test from "node:test";
import assert from "node:assert/strict";

import {
  createOnlineCommandController,
  isRolledArtResult,
} from "../src/online/onlineCommandController.js";

test("online ART routing recognizes rolled ART events with unit targets", () => {
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED", hit: true, targetId: "foe" }]), true);
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED", hit: true, targetIds: ["foe"] }]), true);
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED" }]), false);
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED", artId: "smoke-bomb-riot", hit: true, center: { x: 8, y: 5 }, statusTargets: ["foe"] }]), false);
  assert.equal(isRolledArtResult([{ type: "ATTACK_RESOLVED", hit: true }]), false);
});

test("remote replay always releases its echo-suppression lock", async () => {
  const runtime = { state: { units: [] }, applyingRemote: false };
  const controller = createOnlineCommandController({ runtime, interaction: {} });

  await controller.applyRemoteCommand({ type: "UNKNOWN" });

  assert.equal(runtime.applyingRemote, false);
});
