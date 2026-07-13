import test from "node:test";
import assert from "node:assert/strict";

import {
  createOnlineCommandController,
  isRolledArtResult,
} from "../src/online/onlineCommandController.js";

test("online ART routing recognizes only resolved ART events carrying a hit result", () => {
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED", hit: true }]), true);
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED" }]), false);
  assert.equal(isRolledArtResult([{ type: "ATTACK_RESOLVED", hit: true }]), false);
});

test("remote replay always releases its echo-suppression lock", async () => {
  const runtime = { state: { units: [] }, applyingRemote: false };
  const controller = createOnlineCommandController({ runtime, interaction: {} });

  await controller.applyRemoteCommand({ type: "UNKNOWN" });

  assert.equal(runtime.applyingRemote, false);
});
