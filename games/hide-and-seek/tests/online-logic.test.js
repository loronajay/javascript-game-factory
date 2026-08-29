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
  const input = online.describeInput({ forward: 4, strafe: -9, yaw: 1.2, crouch: 1, sprint: 0, light: true, x: 12, charge: 1 });

  assert.deepEqual(input, { forward: 1, strafe: -1, yaw: 1.2, crouch: true, sprint: false, light: true });
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
