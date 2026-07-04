import test from "node:test";
import assert from "node:assert/strict";

import { turnAnnouncementSub } from "../src/ui/turnAnnouncement.js";

test("hot-seat turn announcements ask players to pass the device", () => {
  assert.equal(turnAnnouncementSub({ matchMode: "hotseat", player: 2, mySeat: null, isCpu: false }), "Pass the device");
});

test("online turn announcements describe the local seat instead of asking to pass the device", () => {
  assert.equal(turnAnnouncementSub({ matchMode: "online", player: 1, mySeat: 1, isCpu: false }), "Your turn");
  assert.equal(turnAnnouncementSub({ matchMode: "online", player: 2, mySeat: 1, isCpu: false }), "Opponent's turn");
});

test("single-player turn announcements distinguish the CPU from the local player", () => {
  assert.equal(turnAnnouncementSub({ matchMode: "single", player: 1, mySeat: null, isCpu: false }), "Your turn");
  assert.equal(turnAnnouncementSub({ matchMode: "single", player: 2, mySeat: null, isCpu: true }), "CPU turn");
});
