import test from "node:test";
import assert from "node:assert/strict";

import { createOnlineSession } from "../src/online/onlineSession.js";

function createFakeClient({ clientId = "c_owner" } = {}) {
  return {
    cb: {},
    pingsStarted: 0,
    sentCommands: [],
    sentHashes: [],
    disconnected: false,
    getClientId: () => clientId,
    sendCommand(command) {
      this.sentCommands.push(command);
    },
    sendHash(revision, hash) {
      this.sentHashes.push({ revision, hash });
    },
    startPinging() {
      this.pingsStarted += 1;
    },
    stopPinging() {},
    disconnect() {
      this.disconnected = true;
    },
  };
}

async function drainPromises() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

test("owner disconnect concede is buffered until the match controller binds", async () => {
  const client = createFakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["c_owner", "c_guest"],
    seed: 123,
    size: 13,
  });
  const concedes = [];

  client.cb.onPlayerLeft({ clientId: "c_guest", ownerId: "c_owner" });
  await drainPromises();
  assert.deepEqual(concedes, [], "no controller is bound yet");

  session.bind({
    getMatchState: () => null,
    applyRemoteCommand: async () => {},
    applyOwnerConcede: async (seat) => concedes.push(seat),
  });
  await drainPromises();

  assert.deepEqual(concedes, [2]);
  assert.equal(client.pingsStarted, 1);
});

test("handoff-buffered remote commands apply before a buffered owner concede", async () => {
  const client = createFakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["c_owner", "c_guest"],
    seed: 123,
    size: 13,
  });
  const applied = [];

  client.cb.onRemoteCommand({ command: { type: "BEGIN_ACTIVATION", player: 2, unitId: "p2-swordsman" } });
  client.cb.onPlayerLeft({ clientId: "c_guest", ownerId: "c_owner" });

  session.bind({
    getMatchState: () => null,
    applyRemoteCommand: async (command) => applied.push(command.type),
    applyOwnerConcede: async (seat) => applied.push(`CONCEDE:${seat}`),
  });
  await drainPromises();

  assert.deepEqual(applied, ["BEGIN_ACTIVATION", "CONCEDE:2"]);
});
