import test from "node:test";
import assert from "node:assert/strict";

import { createOnlineSession, rematchSeed } from "../src/online/onlineSession.js";

function fakeClient() {
  return {
    cb: {},
    sentRematches: [],
    getClientId: () => "owner",
    sendRematch(state) { this.sentRematches.push(state); },
    stopPinging() {},
    disconnect() { this.disconnected = true; },
    leaveLobby() { this.leftLobby = true; },
  };
}

test("online session requires results availability and mutual rematch consent", () => {
  const client = fakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["owner", "guest"],
    seed: 123,
    size: 10,
  });
  const states = [];
  const accepted = [];

  session.endMatch({ allowRematch: true });
  session.enterResults({
    onState: (state) => states.push(state),
    onAccepted: (next) => accepted.push(next),
  });
  assert.equal(states.at(-1).available, false);
  assert.deepEqual(session.requestRematch(), { accepted: false, reason: "unavailable" });

  client.cb.onRemoteRematch({ clientId: "guest", round: 0, available: true, requested: false });
  assert.equal(states.at(-1).available, true);
  assert.deepEqual(session.requestRematch(), { accepted: true, waiting: true });

  client.cb.onRemoteRematch({ clientId: "guest", round: 0, available: true, requested: true });
  assert.deepEqual(accepted, [{ seed: rematchSeed(123, 1), round: 1 }]);
});

test("leaving results broadcasts unavailability before closing the lobby", () => {
  const client = fakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["owner", "guest"],
    seed: 123,
    size: 10,
  });
  session.endMatch({ allowRematch: true });
  session.enterResults({});
  session.leaveResults();

  assert.deepEqual(client.sentRematches.at(-1), {
    round: 0,
    available: false,
    requested: false,
  });
  assert.equal(client.leftLobby, true);
  assert.equal(client.disconnected, true);
});

