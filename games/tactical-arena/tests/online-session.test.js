import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState } from "../src/core/state.js";
import { hashState } from "../src/core/state-hash.js";
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

test("owner publishes the revision-0 hash when the match controller binds", () => {
  const client = createFakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["c_owner", "c_guest"],
    seed: 123,
    size: 13,
  });
  const match = createBattleState({ seed: 123 });

  session.bind({
    getMatchState: () => match,
    applyRemoteCommand: async () => {},
    applyOwnerConcede: async () => {},
  });

  assert.deepEqual(client.sentHashes, [{ revision: 0, hash: hashState(match) }]);
});

test("session exposes local and remote ranked profiles by seat", () => {
  const client = createFakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["c_owner", "c_guest"],
    seed: 123,
    size: 13,
    localProfile: {
      playerId: "me",
      displayName: "Local Pilot",
      rankedProfile: { title: "Holds the bridge", tagline: "Holds the bridge", rating: 1410 },
    },
  });

  client.cb.onRemoteProfile({
    playerId: "them",
    displayName: "Remote Pilot",
    seat: 2,
    rankedProfile: { title: "Draft menace", tagline: "Draft menace", avatarUnit: "archer" },
  });

  assert.equal(session.nameForSeat(1), "Local Pilot");
  assert.equal(session.nameForSeat(2), "Remote Pilot");
  assert.deepEqual(session.profileForSeat(1), {
    playerId: "me",
    displayName: "Local Pilot",
    rankedProfile: { title: "Holds the bridge", tagline: "Holds the bridge", rating: 1410 },
  });
  assert.deepEqual(session.profileForSeat(2), {
    playerId: "them",
    displayName: "Remote Pilot",
    rankedProfile: { title: "Draft menace", tagline: "Draft menace", avatarUnit: "archer" },
  });
});

test("session seeds ranked profiles cached before match handoff", () => {
  const client = createFakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["c_owner", "c_guest"],
    seed: 123,
    size: 13,
    localProfile: { playerId: "me", displayName: "Local Pilot" },
    initialProfiles: [{
      clientId: "c_guest",
      playerId: "them",
      displayName: "Remote Pilot",
      seat: 2,
      rankedProfile: {
        title: "Diamond draft menace",
        tagline: "Diamond draft menace",
        tier: { id: "diamond", label: "Diamond" },
        rating: 1715,
        wins: 27,
        losses: 9,
        draws: 2,
      },
    }],
  });

  assert.deepEqual(session.profileForSeat(2), {
    playerId: "them",
    displayName: "Remote Pilot",
    rankedProfile: {
      title: "Diamond draft menace",
      tagline: "Diamond draft menace",
      tier: { id: "diamond", label: "Diamond" },
      rating: 1715,
      wins: 27,
      losses: 9,
      draws: 2,
    },
  });
});
