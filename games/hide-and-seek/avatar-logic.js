(function attachHotelAvatarLogic(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelAvatarLogic = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelAvatarLogicApi() {
  'use strict';

  // Pure avatar rules. Nothing here touches Three.js, so a server can run the same figures
  // headlessly when the roadmap reaches step 2 (headless simulation seam).

  const MOTION = Object.freeze({
    IDLE: 'idle',
    WALK: 'walk',
    RUN: 'run',
    CROUCH_IDLE: 'crouch-idle',
    CROUCH_WALK: 'crouch-walk',
  });

  const ROLES = Object.freeze({ HIDER: 'hider', SEEKER: 'seeker' });

  // Quaternius's Base Characters and Universal Animation Library share the same 65-joint rig. Use
  // their dedicated locomotion clips; the UAL2 mannequin's carry/zombie/shield actions are not
  // acceptable stand-ins for a player walking, running, or crouching.
  const CLIP_CANDIDATES = Object.freeze({
    [MOTION.IDLE]: ['Idle_Loop'],
    [MOTION.WALK]: ['Jog_Fwd_Loop', 'Walk_Loop'],
    [MOTION.RUN]: ['Sprint_Loop'],
    [MOTION.CROUCH_IDLE]: ['Crouch_Idle_Loop'],
    [MOTION.CROUCH_WALK]: ['Crouch_Fwd_Loop'],
  });

  const CLIP_SPEED = Object.freeze({
    [MOTION.IDLE]: 1,
    [MOTION.WALK]: 1,
    [MOTION.RUN]: 1,
    [MOTION.CROUCH_IDLE]: 1,
    [MOTION.CROUCH_WALK]: 1,
  });

  // Hider palette first; the seeker is deliberately the one warm figure so a glimpse down a corridor
  // reads as "that is it" without a HUD tracker (see the deliberate removals in AGENT_HANDOFF.md).
  const HIDER_COLORS = Object.freeze([0x4f7cc4, 0x59a06b, 0x9a6bb8, 0xc9a15e, 0x6f7d8c]);

  function resolveMotionState({ speed = 0, crouching = false, walkThreshold = 0.25, runThreshold = 5.2 } = {}) {
    const moving = speed > walkThreshold;
    if (crouching) return moving ? MOTION.CROUCH_WALK : MOTION.CROUCH_IDLE;
    if (!moving) return MOTION.IDLE;
    return speed >= runThreshold ? MOTION.RUN : MOTION.WALK;
  }

  function pickClipName(motionState, availableNames = []) {
    const available = new Set(availableNames);
    for (const candidate of CLIP_CANDIDATES[motionState] || []) if (available.has(candidate)) return candidate;
    return null;
  }

  function clipTimeScale(motionState) {
    return CLIP_SPEED[motionState] || 1;
  }

  function shortestAngle(from, to) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function stepFacing(current, target, delta, turnRate = 9) {
    const difference = shortestAngle(current, target);
    const maxStep = turnRate * delta;
    if (Math.abs(difference) <= maxStep) return target;
    return current + Math.sign(difference) * maxStep;
  }

  function avatarTint(role, seatIndex = 0) {
    if (role === ROLES.SEEKER) return { skin: 0xc86a4a, accent: 0xf0b070 };
    const skin = HIDER_COLORS[Math.abs(seatIndex) % HIDER_COLORS.length];
    return { skin, accent: 0x1a1c22 };
  }

  function measureSpeed(previous, next, delta) {
    if (!previous || !next || delta <= 0) return 0;
    return Math.hypot(next.x - previous.x, next.z - previous.z) / delta;
  }

  function updateAvatarMotion(state, pose, delta) {
    const speed = measureSpeed(state.position, pose, delta);
    const smoothedSpeed = state.speed + (speed - state.speed) * Math.min(1, delta * 12);
    const motionState = resolveMotionState({ speed: smoothedSpeed, crouching: !!pose.crouching });
    const targetCrouch = pose.crouching ? 1 : 0;
    const crouchBlend = state.crouchBlend + Math.sign(targetCrouch - state.crouchBlend)
      * Math.min(Math.abs(targetCrouch - state.crouchBlend), delta * 5.2);
    const facingTarget = Number.isFinite(pose.yaw)
      ? pose.yaw
      : (smoothedSpeed > 0.25 ? Math.atan2(pose.x - state.position.x, pose.z - state.position.z) : state.facing);
    return {
      position: { x: pose.x, y: pose.y, z: pose.z },
      speed: smoothedSpeed,
      motionState,
      crouchBlend,
      facing: stepFacing(state.facing, facingTarget, delta),
      flashlightOn: !!pose.flashlightOn,
      flashlightCharge: Math.max(0, Math.min(1, Number(pose.flashlightCharge) || 0)),
    };
  }

  function createAvatarMotion(pose = { x: 0, y: 0, z: 0 }) {
    return {
      position: { x: pose.x || 0, y: pose.y || 0, z: pose.z || 0 },
      speed: 0,
      motionState: MOTION.IDLE,
      crouchBlend: 0,
      facing: pose.yaw || 0,
      flashlightOn: !!pose.flashlightOn,
      flashlightCharge: Math.max(0, Math.min(1, Number(pose.flashlightCharge) || 0)),
    };
  }

  return {
    MOTION, ROLES, CLIP_CANDIDATES,
    avatarTint, clipTimeScale, createAvatarMotion, measureSpeed,
    pickClipName, resolveMotionState, shortestAngle, stepFacing, updateAvatarMotion,
  };
});
