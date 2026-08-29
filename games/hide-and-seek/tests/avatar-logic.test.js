const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../avatar-logic.js');
const { MOTION, ROLES } = logic;

test('motion state comes from speed and crouch, not from an animation name', () => {
  assert.equal(logic.resolveMotionState({ speed: 0 }), MOTION.IDLE);
  assert.equal(logic.resolveMotionState({ speed: 0.2 }), MOTION.IDLE);
  assert.equal(logic.resolveMotionState({ speed: 4.2 }), MOTION.WALK);
  assert.equal(logic.resolveMotionState({ speed: 6.8 }), MOTION.RUN);
  assert.equal(logic.resolveMotionState({ speed: 0 , crouching: true }), MOTION.CROUCH_IDLE);
  assert.equal(logic.resolveMotionState({ speed: 2.45, crouching: true }), MOTION.CROUCH_WALK);
});

test('clip choice uses the asset bank locomotion and crouch clips', () => {
  const shipped = [
    'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
    'Crouch_Idle_Loop', 'Crouch_Fwd_Loop',
  ];

  assert.equal(logic.pickClipName(MOTION.IDLE, shipped), 'Idle_Loop');
  assert.equal(logic.pickClipName(MOTION.WALK, shipped), 'Jog_Fwd_Loop');
  assert.equal(logic.pickClipName(MOTION.RUN, shipped), 'Sprint_Loop');
  assert.equal(logic.pickClipName(MOTION.CROUCH_IDLE, shipped), 'Crouch_Idle_Loop');
  assert.equal(logic.pickClipName(MOTION.CROUCH_WALK, shipped), 'Crouch_Fwd_Loop');
  assert.equal(logic.pickClipName(MOTION.WALK, []), null);
});

test('native locomotion clips stay near their authored playback rate', () => {
  assert.equal(logic.clipTimeScale(MOTION.RUN, 6.8), 1);
  assert.equal(logic.clipTimeScale(MOTION.WALK, 4.2), 1);
  assert.equal(logic.clipTimeScale(MOTION.IDLE, 0), 1);
  assert.equal(logic.clipTimeScale(MOTION.CROUCH_WALK, 2.45), 1);
});

test('facing turns the short way around and never overshoots', () => {
  assert.ok(Math.abs(logic.shortestAngle(3.0, -3.0) - 0.283) < 0.01);
  assert.equal(logic.stepFacing(0, 0.4, 1, 9), 0.4);
  assert.equal(logic.stepFacing(0, Math.PI, 0.01, 9), 0.09);
  assert.ok(logic.stepFacing(3.0, -3.0, 0.01, 9) > 3.0);
});

test('crouching is covered by native clips instead of manual bone folding', () => {
  assert.deepEqual(logic.CLIP_CANDIDATES[MOTION.CROUCH_IDLE], ['Crouch_Idle_Loop']);
  assert.deepEqual(logic.CLIP_CANDIDATES[MOTION.CROUCH_WALK], ['Crouch_Fwd_Loop']);
  assert.equal(logic.crouchPosture, undefined);
});

test('the seeker is the one warm figure so a glimpse identifies it without a tracker', () => {
  const seeker = logic.avatarTint(ROLES.SEEKER, 0);
  const hiders = [0, 1, 2, 3, 4].map((seat) => logic.avatarTint(ROLES.HIDER, seat).skin);

  assert.equal(new Set(hiders).size, 5);
  assert.ok(!hiders.includes(seeker.skin));
  assert.equal(logic.avatarTint(ROLES.HIDER, 7).skin, logic.avatarTint(ROLES.HIDER, 2).skin);
});

test('avatar motion is derived from successive poses, which is what a network snapshot gives us', () => {
  let state = logic.createAvatarMotion({ x: 0, y: 0, z: 0 });
  const step = 1 / 60;

  for (let tick = 0; tick < 60; tick += 1) {
    state = logic.updateAvatarMotion(state, { x: 0, y: 0, z: state.position.z + 4.2 * step, yaw: 0 }, step);
  }

  assert.ok(Math.abs(state.speed - 4.2) < 0.2);
  assert.equal(state.motionState, MOTION.WALK);

  const stopped = logic.updateAvatarMotion(state, { ...state.position, yaw: 0 }, step);
  assert.ok(stopped.speed < state.speed);
});

test('a pose without a yaw faces the direction it is travelling', () => {
  const state = logic.createAvatarMotion({ x: 0, y: 0, z: 0 });
  const moved = logic.updateAvatarMotion(state, { x: 1, y: 0, z: 0 }, 1 / 60);

  assert.ok(moved.facing > 0);
});

test('avatar motion retains flashlight state supplied by a network pose', () => {
  const state = logic.createAvatarMotion({ x: 0, y: 0, z: 0, flashlightOn: false, flashlightCharge: 1 });
  const updated = logic.updateAvatarMotion(state, { x: 0, y: 0, z: 0, flashlightOn: true, flashlightCharge: 0.41 }, 1 / 60);

  assert.equal(updated.flashlightOn, true);
  assert.equal(updated.flashlightCharge, 0.41);
});
