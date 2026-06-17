import { normalizeInputFrame } from './input-buffer.js';

export const GAMECUBE_GAMEPAD_PROFILE = Object.freeze({
  id: 'gamecube-adapter',
  deadzone: 0.35,
  axes: Object.freeze({
    leftX: 0,
    leftY: 1,
    cX: 2,
    cY: 3,
  }),
  buttons: Object.freeze({
    attack: Object.freeze([0]),
    special: Object.freeze([1]),
    jump: Object.freeze([2, 3]),
    shield: Object.freeze([4, 7]),
    grab: Object.freeze([5]),
  }),
});

export function selectGamepads(gamepads) {
  return [...gamepads]
    .filter(Boolean)
    .filter(gamepad => gamepad.connected)
    .sort((a, b) => a.index - b.index)
    .slice(0, 2);
}

export function gamepadToInputFrame(gamepad, profile = GAMECUBE_GAMEPAD_PROFILE) {
  if (!gamepad) return normalizeInputFrame();

  const leftX = readAxis(gamepad, profile.axes.leftX);
  const leftY = readAxis(gamepad, profile.axes.leftY);
  const cX = readAxis(gamepad, profile.axes.cX);
  const cY = readAxis(gamepad, profile.axes.cY);
  const deadzone = profile.deadzone;
  const attackX = Math.abs(cX) > deadzone ? Math.sign(cX) : 0;
  const attackY = Math.abs(cY) > deadzone ? Math.sign(cY) : 0;

  return normalizeInputFrame({
    left: leftX < -deadzone,
    right: leftX > deadzone,
    up: leftY < -deadzone,
    down: leftY > deadzone,
    moveX: Math.abs(leftX) > deadzone ? leftX : 0,
    moveY: Math.abs(leftY) > deadzone ? leftY : 0,
    attack: isAnyButtonPressed(gamepad, profile.buttons.attack) || attackX !== 0 || attackY !== 0,
    attackX,
    attackY,
    special: isAnyButtonPressed(gamepad, profile.buttons.special),
    jump: isAnyButtonPressed(gamepad, profile.buttons.jump),
    shield: isAnyButtonPressed(gamepad, profile.buttons.shield),
    grab: isAnyButtonPressed(gamepad, profile.buttons.grab),
  });
}

export function createGamepadInputManager({ profile = GAMECUBE_GAMEPAD_PROFILE } = {}) {
  const baselines = new Map();
  let activeProfile = profile;

  function readFrame(gamepad) {
    if (!gamepad) return normalizeInputFrame();
    if (!baselines.has(gamepad.index)) {
      baselines.set(gamepad.index, captureBaseline(gamepad));
    }
    return calibratedGamepadToInputFrame(gamepad, baselines.get(gamepad.index), activeProfile);
  }

  function reset(gamepadIndex) {
    if (gamepadIndex == null) {
      baselines.clear();
    } else {
      baselines.delete(gamepadIndex);
    }
  }

  function setProfile(nextProfile) {
    activeProfile = nextProfile;
  }

  return { readFrame, reset, setProfile };
}

export function calibratedGamepadToInputFrame(gamepad, baseline, profile = GAMECUBE_GAMEPAD_PROFILE) {
  if (!gamepad) return normalizeInputFrame();

  const leftX = readCalibratedAxis(gamepad, baseline, profile.axes.leftX);
  const leftY = readCalibratedAxis(gamepad, baseline, profile.axes.leftY);
  const cX = readCalibratedAxis(gamepad, baseline, profile.axes.cX);
  const cY = readCalibratedAxis(gamepad, baseline, profile.axes.cY);
  const deadzone = profile.deadzone;
  const attackX = Math.abs(cX) > deadzone ? Math.sign(cX) : 0;
  const attackY = Math.abs(cY) > deadzone ? Math.sign(cY) : 0;

  return normalizeInputFrame({
    left: leftX < -deadzone,
    right: leftX > deadzone,
    up: leftY < -deadzone,
    down: leftY > deadzone,
    moveX: Math.abs(leftX) > deadzone ? leftX : 0,
    moveY: Math.abs(leftY) > deadzone ? leftY : 0,
    attack: isAnyCalibratedButtonPressed(gamepad, baseline, profile.buttons.attack) || attackX !== 0 || attackY !== 0,
    attackX,
    attackY,
    special: isAnyCalibratedButtonPressed(gamepad, baseline, profile.buttons.special),
    jump: isAnyCalibratedButtonPressed(gamepad, baseline, profile.buttons.jump),
    shield: isAnyCalibratedButtonPressed(gamepad, baseline, profile.buttons.shield),
    grab: isAnyCalibratedButtonPressed(gamepad, baseline, profile.buttons.grab),
  });
}

function captureBaseline(gamepad) {
  return {
    axes: [...(gamepad.axes ?? [])],
    buttons: [...(gamepad.buttons ?? [])].map(button => button?.value ?? 0),
  };
}

function readCalibratedAxis(gamepad, baseline, axisIndex) {
  return readAxis(gamepad, axisIndex) - (baseline.axes?.[axisIndex] ?? 0);
}

function isCalibratedButtonPressed(gamepad, baseline, buttonIndex) {
  const button = gamepad.buttons?.[buttonIndex];
  const value = button?.value ?? 0;
  const baseValue = baseline.buttons?.[buttonIndex] ?? 0;
  return value - baseValue > 0.45 || (baseValue < 0.5 && Boolean(button?.pressed || value > 0.5));
}

function isAnyCalibratedButtonPressed(gamepad, baseline, buttonIndices) {
  return asButtonList(buttonIndices).some(index => isCalibratedButtonPressed(gamepad, baseline, index));
}

function readAxis(gamepad, axisIndex) {
  const value = gamepad.axes?.[axisIndex];
  return Number.isFinite(value) ? value : 0;
}

function isButtonPressed(gamepad, buttonIndex) {
  const button = gamepad.buttons?.[buttonIndex];
  return Boolean(button?.pressed || button?.value > 0.5);
}

function isAnyButtonPressed(gamepad, buttonIndices) {
  return asButtonList(buttonIndices).some(index => isButtonPressed(gamepad, index));
}

function asButtonList(buttonIndices) {
  return Array.isArray(buttonIndices) ? buttonIndices : [buttonIndices];
}
