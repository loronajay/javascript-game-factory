import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState } from "../src/core/state.js";
import { hashState } from "../src/core/state-hash.js";
import { createOnlineSession, rematchSeed } from "../src/online/onlineSession.js";

function createFakeClient({ clientId = "c_owner" } = {}) {
  return {
    cb: {},
    pingsStarted: 0,
    sentCommands: [],
    sentHashes: [],
    sentRematches: [],
    disconnected: false,
    leftLobby: false,
    getClientId: () => clientId,
    sendCommand(command) {
      this.sentCommands.push(command);
    },
    sendHash(revision, hash) {
      this.sentHashes.push({ revision, hash });
    },
    sendRematch(state) {
      this.sentRematches.push(state);
    },
    startPinging() {
      this.pingsStarted += 1;
    },
    stopPinging() {},
    disconnect() {
      this.disconnected = true;
    },
    leaveLobby() {
      this.leftLobby = true;
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

test("rematch seed changes every round while staying deterministic for both peers", () => {
  assert.equal(rematchSeed(123, 1), rematchSeed(123, 1));
  assert.notEqual(rematchSeed(123, 1), 123);
  assert.notEqual(rematchSeed(123, 2), rematchSeed(123, 1));
});

test("casual rematch stays locked until the opponent reaches results, then restarts after both consent", () => {
  const client = createFakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["c_owner", "c_guest"],
    seed: 123,
    size: 13,
  });
  const states = [];
  const accepted = [];

  session.endMatch({ allowRematch: true });
  session.enterResults({
    onState: (state) => states.push(state),
    onAccepted: (config) => accepted.push(config),
  });

  assert.deepEqual(client.sentRematches, [
    { round: 0, available: true, requested: false },
  ]);
  assert.equal(states.at(-1).available, false);
  assert.deepEqual(session.requestRematch(), { accepted: false, reason: "unavailable" });

  client.cb.onRemoteRematch({
    clientId: "c_guest",
    round: 0,
    available: true,
    requested: false,
  });
  assert.equal(states.at(-1).available, true);

  assert.deepEqual(session.requestRematch(), { accepted: true, waiting: true });
  assert.deepEqual(client.sentRematches.at(-1), {
    round: 0,
    available: true,
    requested: true,
  });
  assert.equal(states.at(-1).localRequested, true);

  client.cb.onRemoteRematch({
    clientId: "c_guest",
    round: 0,
    available: true,
    requested: true,
  });

  assert.deepEqual(accepted, [{ seed: rematchSeed(123, 1), round: 1 }]);
});

test("leaving results declines a pending rematch and locks the remaining player", () => {
  const client = createFakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["c_owner", "c_guest"],
    seed: 456,
    size: 13,
  });
  const states = [];

  session.endMatch({ allowRematch: true });
  session.enterResults({ onState: (state) => states.push(state) });
  client.cb.onRemoteRematch({
    clientId: "c_guest",
    round: 0,
    available: true,
    requested: false,
  });
  session.requestRematch();

  client.cb.onRemoteRematch({
    clientId: "c_guest",
    round: 0,
    available: false,
    requested: false,
  });

  assert.equal(states.at(-1).available, false);
  assert.equal(states.at(-1).declined, true);
  assert.equal(states.at(-1).localRequested, true);
});

test("a player leaving results withdraws rematch availability and leaves the relay lobby", () => {
  const client = createFakeClient();
  const session = createOnlineSession({
    client,
    mySeat: 1,
    isOwner: true,
    members: ["c_owner", "c_guest"],
    seed: 789,
    size: 13,
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
