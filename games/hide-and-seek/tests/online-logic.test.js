const test = require('node:test');
const assert = require('node:assert/strict');

const online = require('../online-logic.js');

function connected() {
  return online.applyNetEvent(online.createNetState(), { event: 'connected', clientId: 'c_1' });
}

function inLobby() {
  return online.applyNetEvent(connected(), {
    event: 'lobby_joined', roomCode: 'HOTEL', clientId: 'c_1', ownerId: 'c_1', members: ['c_1', 'c_2'],
  });
}

function snapshotEvent(overrides = {}) {
  return {
    event: 'message',
    messageType: 'hide_and_seek_snapshot',
    value: JSON.stringify({
      seekerId: 'c_2',
      tick: 120,
      round: { phase: 'seeking', over: false, hidersRemaining: 1 },
      players: [
        { id: 'c_1', role: 'hider', alive: true, x: 1, y: 0, z: 2, yaw: 0, crouching: false, flashlight: { on: false, charge: 1 } },
        { id: 'c_2', role: 'seeker', alive: true, x: 8, y: 0, z: 2, yaw: 1, crouching: false, flashlight: { on: true, charge: 0.4 } },
      ],
      ...overrides,
    }),
  };
}

test('the connection reduces server events into one view', () => {
  const lobby = inLobby();

  assert.equal(lobby.status, online.NET_STATES.LOBBY);
  assert.equal(lobby.roomCode, 'HOTEL');
  assert.deepEqual(lobby.members, ['c_1', 'c_2']);

  const started = online.applyNetEvent(lobby, {
    event: 'lobby_started',
    members: ['c_1', 'c_2'],
    matchState: { seekerId: 'c_2', players: [], round: { phase: 'hiding' } },
  });
  assert.equal(started.status, online.NET_STATES.STARTING);
  assert.equal(started.seekerId, 'c_2');
});

test('a snapshot is the truth about who is where, who is it and who is out', () => {
  const state = online.applyNetEvent(inLobby(), snapshotEvent());

  assert.equal(state.status, online.NET_STATES.PLAYING);
  assert.equal(online.isSeeker(state), false);
  assert.equal(online.selfOf(state).id, 'c_1');
  assert.deepEqual(online.othersOf(state).map((entry) => entry.id), ['c_2']);
  assert.equal(online.selfOf(state).flashlight.charge, 1);
});

test('the end of a round arrives as a status, not as something the client decides', () => {
  const over = online.applyNetEvent(inLobby(), {
    event: 'message',
    messageType: 'hide_and_seek_match_ended',
    value: JSON.stringify({ seekerId: 'c_2', round: { phase: 'ended', over: true, outcome: 'seeker' }, players: [] }),
  });

  assert.equal(over.status, online.NET_STATES.ENDED);
  assert.equal(over.snapshot.round.outcome, 'seeker');
});

test('an unrelated lobby message and a malformed snapshot leave the view alone', () => {
  const state = online.applyNetEvent(inLobby(), snapshotEvent());

  assert.equal(online.applyNetEvent(state, { event: 'message', messageType: 'chat', value: 'hello' }), state);
  assert.equal(online.applyNetEvent(state, { event: 'message', messageType: 'hide_and_seek_snapshot', value: 'not json' }), state);
  assert.equal(online.applyNetEvent(state, null), state);
});

test('an error is surfaced rather than swallowed', () => {
  const failed = online.applyNetEvent(inLobby(), { event: 'error', code: 'SERVER_AUTHORITY', message: 'no' });

  assert.equal(failed.status, online.NET_STATES.ERROR);
  assert.equal(failed.error.code, 'SERVER_AUTHORITY');
});

test('an input carries intent only', () => {
  const input = online.describeInput({ forward: 4, strafe: -9, yaw: 1.2, crouch: 1, sprint: 0, light: true, interact: true, x: 12, charge: 1, roomNumber: '105' });

  assert.deepEqual(input, { forward: 1, strafe: -1, yaw: 1.2, crouch: true, sprint: false, light: true, interact: true, interactId: null });

  // The one field that names something in the world. It is still intent, not outcome: the authority
  // re-tests reach on it before honouring it, and refuses anything that is not an id.
  assert.equal(online.describeInput({ interact: true, interactId: 'door-105' }).interactId, 'door-105');
  assert.equal(online.describeInput({ interact: true, interactId: 7 }).interactId, null);
});

test('an unchanged input is not resent, but silence is still heartbeaten', () => {
  const input = online.describeInput({ forward: 1, yaw: 0.5 });

  assert.equal(online.shouldSendInput(null, input, 0), true);
  assert.equal(online.shouldSendInput(input, input, 0), false);
  assert.equal(online.shouldSendInput(input, input, online.INPUT_HEARTBEAT_SECONDS), true);
  // A turn of the head is a change: the step is derived from the yaw.
  assert.equal(online.shouldSendInput(input, online.describeInput({ forward: 1, yaw: 0.6 }), 0), true);
  assert.equal(online.shouldSendInput(input, online.describeInput({ forward: 1, yaw: 0.5, crouch: true }), 0), true);
});

test('a small disagreement with the server is walked off and a large one is applied at once', () => {
  const local = { x: 0, y: 0, z: 0 };

  const settled = online.reconcilePosition(local, { x: 0.02, y: 0, z: 0 }, 1 / 60);
  assert.equal(settled.corrected, false);

  const nudged = online.reconcilePosition(local, { x: 0.5, y: 0, z: 0 }, 1 / 60);
  assert.equal(nudged.snapped, false);
  assert.ok(nudged.x > 0 && nudged.x < 0.5, 'a near miss is blended, not teleported');

  const pushed = online.reconcilePosition(local, { x: 9, y: 4.6, z: 0 }, 1 / 60);
  assert.deepEqual({ x: pushed.x, y: pushed.y, z: pushed.z }, { x: 9, y: 4.6, z: 0 });
  assert.equal(pushed.snapped, true);

  assert.equal(online.reconcilePosition(local, null, 1 / 60).corrected, false);
});

test('a remote body is walked toward its last pose and turns the short way', () => {
  const previous = { x: 0, y: 0, z: 0, yaw: 3.0 };
  const target = { x: 1, y: 0, z: 0, yaw: -3.0 };

  const step = online.interpolatePose(previous, target, 1 / 60, 12);
  assert.ok(step.x > 0 && step.x < 1);
  // Turning from 3.0 to -3.0 is a short hop across pi, not a long sweep back through zero.
  assert.ok(step.yaw > 3.0, `expected the short way round, got ${step.yaw}`);
  assert.deepEqual(online.interpolatePose(null, target, 1 / 60), { ...target });
});

test('both halves of an interact press reach the authority', () => {
  const resting = online.describeInput({ yaw: 0.4 });
  const pressed = online.describeInput({ yaw: 0.4, interact: true });

  // The server opens a door on the rising edge. A release that is never sent leaves `interact`
  // latched true, and the next press is not an edge at all.
  assert.equal(online.shouldSendInput(resting, pressed, 0), true);
  assert.equal(online.shouldSendInput(pressed, resting, 0), true);
  assert.equal(online.shouldSendInput(pressed, pressed, 0), false);
});

test('a dropped player can reclaim the seat their body is still standing in', () => {
  let state = online.applyNetEvent(online.createNetState(), { event: 'connected', clientId: 'me', sessionToken: 'tok' });
  state = online.applyNetEvent(state, { event: 'lobby_joined', clientId: 'me', roomCode: 'HOTEL', ownerId: 'me', members: ['me', 'you'] });

  const saved = online.rememberSession(state, 1_000);
  assert.deepEqual(saved, { clientId: 'me', sessionToken: 'tok', roomCode: 'HOTEL', at: 1_000 });

  // Inside the grace window the seat is worth asking for; past it the server has already given it
  // away and the ask would only produce a rejection to handle.
  assert.deepEqual(online.resumeRequestFor(saved, 5_000), { type: 'resume_lobby', clientId: 'me', sessionToken: 'tok' });
  assert.equal(online.resumeRequestFor(saved, 1_000 + online.RECONNECT_GRACE_MS), null);
  assert.equal(online.resumeRequestFor(null, 5_000), null);
  assert.equal(online.resumeRequestFor({ clientId: 'me', at: 1_000 }, 2_000), null, 'a seat without its token is not resumable');
});

test('a resumed session restores who this client is and nothing about the round', () => {
  const state = online.applyNetEvent(online.createNetState(), {
    event: 'session_resumed', clientId: 'me', sessionToken: 'tok2', roomCode: 'HOTEL',
  });

  assert.equal(state.status, online.NET_STATES.PLAYING);
  assert.equal(state.clientId, 'me');
  assert.equal(state.roomCode, 'HOTEL');
  // The server still owns the round and says so on the next snapshot.
  assert.equal(state.snapshot, null);
});

test('a refused resume falls back to joining rather than becoming an error screen', () => {
  const connected = online.applyNetEvent(online.createNetState(), { event: 'connected', clientId: 'me', sessionToken: 'tok' });
  const refused = online.applyNetEvent(connected, { event: 'error', code: 'RESUME_REJECTED', message: 'gone' });
  const genuine = online.applyNetEvent(connected, { event: 'error', code: 'LOBBY_FULL', message: 'full' });

  assert.equal(refused.status, online.NET_STATES.CONNECTING);
  assert.equal(refused.error, null);
  assert.equal(genuine.status, online.NET_STATES.ERROR);
  assert.equal(genuine.error.code, 'LOBBY_FULL');
});

test('a dropped guest is a caption, not a roster change: their body is still in the hotel', () => {
  let state = online.applyNetEvent(online.createNetState(), { event: 'lobby_joined', clientId: 'me', members: ['me', 'you'] });
  state = online.applyNetEvent(state, { event: 'lobby_player_disconnected', clientId: 'you' });

  assert.deepEqual(state.absent, ['you']);
  assert.deepEqual(state.members, ['me', 'you'], 'a dropped hider is left standing — a free find, not a vanishing');

  state = online.applyNetEvent(state, { event: 'lobby_player_reconnected', clientId: 'you' });
  assert.deepEqual(state.absent, []);
});

test('the lobby search carries this game\'s seat limits', () => {
  // `find_lobby` matches an open lobby on its limits. Omitting them sanitizes to the server-wide
  // default of 2-6, which never equals the 2-8 lobby this game creates — so every guest would
  // quietly open a room of their own instead of joining each other.
  assert.deepEqual(online.LOBBY_LIMITS, { minPlayers: 2, maxPlayers: 8 });
});
