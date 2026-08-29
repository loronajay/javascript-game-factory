const test = require('node:test');
const assert = require('node:assert/strict');

const stamina = require('../stamina-logic.js');

const CONFIG = {
  sprintSeconds: 6,
  walkRecoverSeconds: 14,
  restRecoverSeconds: 7,
  crouchRecoverSeconds: 5,
  recoverThreshold: 0.35,
};

function run(state, ticks, input, delta = 0.1) {
  let current = state;
  for (let i = 0; i < ticks; i += 1) current = stamina.updateStamina(current, { delta, config: CONFIG, ...input });
  return current;
}

test('a fresh meter is full, rested, and cleared to sprint', () => {
  const state = stamina.createStaminaState();
  assert.equal(state.value, 1);
  assert.equal(state.sprinting, false);
  assert.equal(state.exhausted, false);
  assert.equal(stamina.canSprint(state), true);
});

test('sprinting drains the meter and only while actually moving', () => {
  const moving = run(stamina.createStaminaState(), 10, { wantSprint: true, moving: true });
  assert.equal(moving.sprinting, true);
  assert.ok(moving.value < 1);

  const standing = run(stamina.createStaminaState(), 10, { wantSprint: true, moving: false });
  assert.equal(standing.sprinting, false);
  // Holding shift while standing still must recover, not drain.
  assert.equal(standing.value, 1);
});

test('crouching cannot sprint even with the key held', () => {
  const state = run(stamina.createStaminaState(), 10, { wantSprint: true, moving: true, crouching: true });
  assert.equal(state.sprinting, false);
});

test('an emptied meter locks sprinting out until it recovers past the threshold', () => {
  let state = stamina.updateStamina(stamina.createStaminaState(), { delta: CONFIG.sprintSeconds, wantSprint: true, moving: true, config: CONFIG });
  assert.equal(state.value, 0);
  assert.equal(state.exhausted, true);
  assert.equal(stamina.canSprint(state), false);

  // Still exhausted just below the threshold, and still refusing to sprint.
  const partial = run(state, 10, { wantSprint: true, moving: true });
  assert.ok(partial.value > 0 && partial.value < CONFIG.recoverThreshold);
  assert.equal(partial.exhausted, true);
  assert.equal(partial.sprinting, false);

  state = run(state, 400, { moving: false });
  assert.equal(state.exhausted, false);
  assert.equal(state.value, 1);
  assert.equal(stamina.canSprint(state), true);
});

test('recovery is fastest crouched, then resting, and slowest while walking', () => {
  const drained = { ...stamina.createStaminaState(), value: 0.5, exhausted: false };
  const crouched = stamina.updateStamina(drained, { delta: 1, crouching: true, config: CONFIG });
  const rested = stamina.updateStamina(drained, { delta: 1, config: CONFIG });
  const walked = stamina.updateStamina(drained, { delta: 1, moving: true, config: CONFIG });

  assert.ok(crouched.value > rested.value);
  assert.ok(rested.value > walked.value);
  assert.equal(crouched.recovery, 'crouch');
  assert.equal(rested.recovery, 'rest');
  assert.equal(walked.recovery, 'walk');
});

test('the meter never leaves the 0..1 range', () => {
  const overfilled = run(stamina.createStaminaState(), 100, { moving: false });
  assert.equal(overfilled.value, 1);
  const drained = stamina.updateStamina(stamina.createStaminaState(), { delta: 60, wantSprint: true, moving: true, config: CONFIG });
  assert.equal(drained.value, 0);
});

test('sprint seconds and recovery seconds are the published tuning contract', () => {
  for (const key of ['sprintSeconds', 'walkRecoverSeconds', 'restRecoverSeconds', 'crouchRecoverSeconds', 'recoverThreshold']) {
    assert.ok(key in stamina.STAMINA_DEFAULTS, `${key} is missing from STAMINA_DEFAULTS`);
  }
  assert.ok(Object.isFrozen(stamina.STAMINA_DEFAULTS));
});
