import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFixedStepLoop } from '../src/engine/fixed-step-loop.js';
import {
  calibratedGamepadToInputFrame,
  createGamepadInputManager,
  GAMECUBE_GAMEPAD_PROFILE,
  gamepadToInputFrame,
  selectGamepads,
} from '../src/engine/gamepad-input.js';
import {
  createControllerMapping,
  firstNewPressedButton,
  getPressedButtonIndices,
  loadControllerBindings,
  saveControllerBindings,
} from '../src/engine/controller-mapping.js';
import { createKeyboardInputState } from '../src/engine/keyboard-input.js';
import { createInputBuffer, normalizeInputFrame } from '../src/engine/input-buffer.js';
import { createFighter, tickFighterState } from '../src/engine/fighter-state.js';
import { applyFighterPhysics, resolveStageCollision } from '../src/engine/physics.js';
import { DEMO_PLATFORM_STAGE } from '../src/engine/platform-stage.js';
import { FIGHTER_ARCHETYPES } from '../src/characters/archetypes.js';
import { createTrainingMatch } from '../src/scenes/training-match.js';

test('fixed step loop runs simulation at 60hz independent of render cadence', () => {
  const ticks = [];
  const renders = [];
  const loop = createFixedStepLoop({
    tick: frame => ticks.push(frame),
    render: alpha => renders.push(alpha),
  });

  loop.step(0);
  loop.step(8);
  loop.step(16);
  loop.step(1000 / 60 + 16);
  loop.step(1000 / 60 * 4 + 16);

  assert.deepEqual(ticks, [1, 2, 3, 4]);
  assert.equal(renders.length, 5);
  assert.ok(renders.every(alpha => alpha >= 0 && alpha < 1));
});

test('input buffer tracks held, pressed, released, and buffered commands', () => {
  const buffer = createInputBuffer({ bufferFrames: 5 });

  buffer.push(normalizeInputFrame({ jump: true, attack: true }));
  assert.equal(buffer.isHeld('jump'), true);
  assert.equal(buffer.wasPressed('jump'), true);
  assert.equal(buffer.wasPressed('attack'), true);

  buffer.push(normalizeInputFrame({ jump: true }));
  assert.equal(buffer.wasPressed('jump'), false);
  assert.equal(buffer.wasReleased('attack'), true);
  assert.equal(buffer.consumeBuffered('attack'), true);
  assert.equal(buffer.consumeBuffered('attack'), false);

  for (let i = 0; i < 6; i += 1) {
    buffer.push(normalizeInputFrame({}));
  }

  assert.equal(buffer.consumeBuffered('jump'), false);
});

test('normalized input lets digital keyboard directions override neutral analog axes', () => {
  assert.equal(normalizeInputFrame({ moveX: 0, right: true }).moveX, 1);
  assert.equal(normalizeInputFrame({ moveX: 0, left: true }).moveX, -1);
  assert.equal(normalizeInputFrame({ moveY: 0, down: true }).moveY, 1);
  assert.equal(normalizeInputFrame({ moveX: 0.55, right: true }).moveX, 0.55);
});

test('gamecube gamepad profile converts adapter axes and buttons into engine input', () => {
  const frame = gamepadToInputFrame(makeGamepad({
    axes: [0.72, 0.64, 0.64, 0.84],
    buttons: {
      0: true,
      3: true,
      7: true,
    },
  }), GAMECUBE_GAMEPAD_PROFILE);

  assert.equal(frame.right, true);
  assert.equal(frame.left, false);
  assert.equal(frame.up, false);
  assert.equal(frame.down, true);
  assert.equal(frame.jump, true);
  assert.equal(frame.attack, true);
  assert.equal(frame.attackX, 1);
  assert.equal(frame.shield, true);
});

test('gamepad selection uses connected pads by index for local players', () => {
  const pads = [
    makeGamepad({ index: 0, connected: false }),
    makeGamepad({ index: 2, connected: true }),
    null,
    makeGamepad({ index: 1, connected: true }),
  ];

  assert.deepEqual(selectGamepads(pads).map(pad => pad.index), [1, 2]);
});

test('calibrated gamepad input treats adapter startup noise as neutral', () => {
  const noisyBaseline = makeGamepad({
    axes: [0.9, -1, 0.4, 0],
    buttons: { 0: true },
  });
  const laterNeutral = makeGamepad({
    axes: [0.9, -1, 0.4, 0],
    buttons: { 0: true },
  });
  const laterMoved = makeGamepad({
    axes: [0.2, -1, 0.4, 0],
    buttons: { 0: true, 3: true },
  });
  const manager = createGamepadInputManager();

  manager.readFrame(noisyBaseline);
  const neutral = manager.readFrame(laterNeutral);
  const moved = manager.readFrame(laterMoved);

  assert.equal(neutral.left, false);
  assert.equal(neutral.attack, false);
  assert.equal(moved.left, true);
  assert.equal(moved.jump, true);
});

test('calibrated gamepad helper supports explicit baseline snapshots', () => {
  const baseline = {
    axes: [0.5, 0, 0, 0],
    buttons: [1, 0, 0, 0],
  };
  const frame = calibratedGamepadToInputFrame(makeGamepad({
    axes: [-0.1, 0, 0, 0],
    buttons: { 0: true, 1: true },
  }), baseline);

  assert.equal(frame.left, true);
  assert.equal(frame.attack, false);
  assert.equal(frame.special, true);
});

test('controller mappings replace guessed adapter button indices', () => {
  const mapping = createControllerMapping({ attack: [4], special: [0], jump: [1], shield: [7], grab: [5] });
  const profile = mapping.toProfile(GAMECUBE_GAMEPAD_PROFILE);

  assert.equal(gamepadToInputFrame(makeGamepad({ buttons: { 4: true } }), profile).attack, true);
  assert.equal(gamepadToInputFrame(makeGamepad({ buttons: { 0: true } }), profile).special, true);
  assert.equal(gamepadToInputFrame(makeGamepad({ buttons: { 1: true } }), profile).jump, true);

  mapping.bind('attack', 2);
  assert.equal(gamepadToInputFrame(makeGamepad({ buttons: { 2: true } }), mapping.toProfile(GAMECUBE_GAMEPAD_PROFILE)).attack, true);
});

test('controller mapping helpers detect pressed indices and persist bindings', () => {
  const storage = makeStorage();
  const gamepad = makeGamepad({ buttons: { 1: true, 7: true } });

  assert.deepEqual(getPressedButtonIndices(gamepad), [1, 7]);
  assert.equal(firstNewPressedButton([1], [1, 7]), 7);

  saveControllerBindings(storage, { attack: [7], special: [1], jump: [2], shield: [4], grab: [5] });
  assert.deepEqual(loadControllerBindings(storage).attack, [7]);
});

test('keyboard input accepts code and key identifiers and preserves quick taps for fixed-step reads', () => {
  const keyboard = createKeyboardInputState({
    p1: { KeyD: 'right', d: 'right' },
    p2: { ArrowLeft: 'left' },
  }, { pulseFrames: 2 });
  let prevented = 0;

  keyboard.recordKey({ code: '', key: 'd', preventDefault: () => { prevented += 1; } }, true);
  keyboard.recordKey({ code: '', key: 'd', preventDefault: () => { prevented += 1; } }, false);

  assert.equal(prevented, 2);
  assert.equal(keyboard.readFrame('p1').right, true);
  assert.equal(keyboard.readFrame('p1').moveX, 1);

  keyboard.tick();
  assert.equal(keyboard.readFrame('p1').right, true);

  keyboard.tick();
  assert.equal(keyboard.readFrame('p1').right, false);
});

test('fighter state machine consumes buffered jump on the first actionable frame', () => {
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.vanguard,
    position: { x: 0, y: 0 },
  });
  const input = createInputBuffer({ bufferFrames: 6 });

  fighter.state.name = 'landing';
  fighter.state.framesRemaining = 2;
  fighter.grounded = true;
  input.push(normalizeInputFrame({ jump: true }));

  tickFighterState(fighter, input);
  assert.equal(fighter.state.name, 'landing');

  input.push(normalizeInputFrame({}));
  tickFighterState(fighter, input);

  assert.equal(fighter.state.name, 'jump_squat');
  assert.equal(input.consumeBuffered('jump'), false);
});

test('physics applies traction, gravity, fastfall, and stage collision deterministically', () => {
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.vanguard,
    position: { x: 0, y: -20 },
  });
  fighter.velocity.x = 3;
  fighter.velocity.y = 0;
  fighter.grounded = true;

  applyFighterPhysics(fighter, normalizeInputFrame({ left: true }));
  assert.equal(fighter.velocity.x < 3, true);
  assert.equal(fighter.velocity.y, 0);

  fighter.grounded = false;
  applyFighterPhysics(fighter, normalizeInputFrame({ down: true }));
  assert.equal(fighter.velocity.y, fighter.archetype.gravity);

  fighter.position.y = 4;
  fighter.velocity.y = 12;
  resolveStageCollision(fighter, { floorY: 0 });
  assert.equal(fighter.position.y, 0);
  assert.equal(fighter.velocity.y, 0);
  assert.equal(fighter.grounded, true);
});

test('analog tilt walks while smash input enters dash and then run', () => {
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: 0 },
  });
  const input = createInputBuffer();

  input.push(normalizeInputFrame({ moveX: 0.28 }));
  tickFighterState(fighter, input);
  applyFighterPhysics(fighter, input.current);

  assert.equal(fighter.state.name, 'walk');
  assert.equal(fighter.velocity.x <= fighter.archetype.walkSpeed, true);

  input.push(normalizeInputFrame({ moveX: 0 }));
  tickFighterState(fighter, input);
  input.push(normalizeInputFrame({ moveX: 1 }));
  tickFighterState(fighter, input);

  assert.equal(fighter.state.name, 'dash');

  for (let i = 0; i < fighter.archetype.dashFrames + 1; i += 1) {
    input.push(normalizeInputFrame({ moveX: 1 }));
    tickFighterState(fighter, input);
  }

  assert.equal(fighter.state.name, 'run');
});

test('grounded down input enters crouch until released', () => {
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: DEMO_PLATFORM_STAGE.main.y },
  });
  fighter.groundPlatformId = DEMO_PLATFORM_STAGE.main.id;
  fighter.groundPlatformKind = DEMO_PLATFORM_STAGE.main.kind;
  fighter.velocity.x = 1.8;
  const input = createInputBuffer();

  input.push(normalizeInputFrame({ moveY: 0.5, down: true }));
  tickFighterState(fighter, input);
  applyFighterPhysics(fighter, input.current);

  assert.equal(fighter.state.name, 'crouch');
  assert.equal(fighter.velocity.x < 1.8, true);

  input.push(normalizeInputFrame({}));
  tickFighterState(fighter, input);

  assert.equal(fighter.state.name, 'idle');
});

test('grounded attacks do not accept stick movement during startup active or recovery', () => {
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: DEMO_PLATFORM_STAGE.main.y },
  });
  fighter.groundPlatformId = DEMO_PLATFORM_STAGE.main.id;
  fighter.groundPlatformKind = DEMO_PLATFORM_STAGE.main.kind;
  const input = createInputBuffer();

  input.push(normalizeInputFrame({ attack: true, moveX: 1 }));
  tickFighterState(fighter, input);
  applyFighterPhysics(fighter, input.current);

  assert.equal(fighter.state.name, 'attack_forward');
  assert.equal(fighter.velocity.x, 0);

  for (let i = 0; i < fighter.archetype.attacks.forward.totalFrames; i += 1) {
    input.push(normalizeInputFrame({ moveX: 1 }));
    tickFighterState(fighter, input);
    applyFighterPhysics(fighter, input.current);
    if (fighter.attack) assert.equal(fighter.velocity.x, 0);
  }

  assert.equal(fighter.attack, null);
});

test('falcon movement constants are ported from the v13 ledge momentum fastfall demo', () => {
  const falcon = FIGHTER_ARCHETYPES.falcon;

  assert.equal(falcon.jumpSquatFrames, 4);
  assert.equal(falcon.shortHopVelocity, -9.3);
  assert.equal(falcon.fullHopVelocity, -14.1);
  assert.equal(falcon.doubleJumpVelocity, -12.2);
  assert.equal(falcon.gravity, 0.58);
  assert.equal(falcon.maxFallSpeed, 10.4);
  assert.equal(falcon.fastFallSpeed, 15.5);
  assert.equal(falcon.dashInitialSpeed, 2.45);
  assert.equal(falcon.initialDashFrames, 9);
  assert.equal(falcon.dashDanceWindowFrames, 9);
  assert.equal(falcon.dashTurnSpeed, 2.15);
  assert.equal(falcon.maxWalkSpeed, 2.25);
  assert.equal(falcon.maxRunSpeed, 5.05);
  assert.equal(falcon.walkAcceleration, 0.20);
  assert.equal(falcon.runAcceleration, 0.27);
  assert.equal(falcon.airAcceleration, 0.17);
  assert.equal(falcon.airTurnAcceleration, 0.23);
  assert.equal(falcon.maxAirSpeed, 5.35);
  assert.equal(falcon.platformDropFrames, 14);
  assert.equal(falcon.ledgeSnapX, 58);
});

test('dash tap gives demo initial speed and opposite tap inside window dash dances', () => {
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: DEMO_PLATFORM_STAGE.main.y },
  });
  const input = createInputBuffer();

  input.push(normalizeInputFrame({ moveX: 1 }));
  tickFighterState(fighter, input);

  assert.equal(fighter.state.name, 'dash');
  assert.equal(fighter.velocity.x, fighter.archetype.dashInitialSpeed);

  input.push(normalizeInputFrame({ moveX: -1 }));
  tickFighterState(fighter, input);

  assert.equal(fighter.state.name, 'dash');
  assert.equal(fighter.facing, -1);
  assert.equal(fighter.velocity.x, -fighter.archetype.dashTurnSpeed);
});

test('fastfall is a down tap while airborne, not just holding down forever', () => {
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: DEMO_PLATFORM_STAGE.main.y - 160 },
  });
  const input = createInputBuffer();
  fighter.grounded = false;
  fighter.velocity.y = 1;

  input.push(normalizeInputFrame({ moveY: 1, down: true }));
  tickFighterState(fighter, input);
  applyFighterPhysics(fighter, input.current, input);

  assert.equal(fighter.fastFalling, true);
  assert.equal(fighter.state.name, 'fastFall');
  assert.equal(fighter.velocity.y, fighter.archetype.fastFallSpeed * 0.72 + fighter.archetype.gravity);

  input.push(normalizeInputFrame({ moveY: 1, down: true }));
  fighter.fastFalling = false;
  fighter.fastFallArmed = false;
  fighter.velocity.y = 1;
  tickFighterState(fighter, input);
  applyFighterPhysics(fighter, input.current, input);

  assert.equal(fighter.fastFalling, false);
});

test('semisolid platforms land from above and drop through on full down', () => {
  const platform = DEMO_PLATFORM_STAGE.platforms[0];
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: platform.x + platform.w / 2, y: platform.y - 8 },
  });
  fighter.grounded = false;
  fighter.previousPosition = { ...fighter.position };
  fighter.velocity.y = 12;
  fighter.position.y = platform.y + 4;

  resolveStageCollision(fighter, DEMO_PLATFORM_STAGE, normalizeInputFrame({}));

  assert.equal(fighter.grounded, true);
  assert.equal(fighter.position.y, platform.y);
  assert.equal(fighter.groundPlatformId, platform.id);
  assert.equal(fighter.state.name, 'landing');

  const input = createInputBuffer();
  for (let i = 0; i < fighter.archetype.landingLagFrames; i += 1) {
    input.push(normalizeInputFrame({}));
    tickFighterState(fighter, input);
  }
  input.push(normalizeInputFrame({ moveY: 1, down: true }));
  tickFighterState(fighter, input);

  assert.equal(fighter.state.name, 'dropThrough');
  assert.equal(fighter.grounded, false);
  assert.equal(fighter.platformDropTimer, fighter.archetype.platformDropFrames);
});

test('falling near a main-stage ledge snaps into ledge hang and ledge jump returns inward', () => {
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: DEMO_PLATFORM_STAGE.main.x - 20, y: DEMO_PLATFORM_STAGE.main.y + 38 },
  });
  fighter.grounded = false;
  fighter.velocity.y = 4;
  fighter.previousPosition = { ...fighter.position };

  resolveStageCollision(fighter, DEMO_PLATFORM_STAGE, normalizeInputFrame({}));

  assert.equal(fighter.state.name, 'ledgeHang');
  assert.equal(fighter.ledge.id, 'main-left');
  assert.equal(fighter.facing, 1);

  const input = createInputBuffer();
  input.push(normalizeInputFrame({ jump: true }));
  tickFighterState(fighter, input);

  assert.equal(fighter.state.name, 'airborne');
  assert.equal(fighter.velocity.x, fighter.archetype.ledgeJumpInwardSpeed);
  assert.equal(fighter.velocity.y, fighter.archetype.ledgeJumpVelocity);
});

test('jump squat produces short hop when jump is released and full hop when held', () => {
  const shortHop = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: 0 },
  });
  const shortInput = createInputBuffer();
  shortInput.push(normalizeInputFrame({ jump: true }));
  tickFighterState(shortHop, shortInput);
  for (let i = 0; i < shortHop.archetype.jumpSquatFrames; i += 1) {
    shortInput.push(normalizeInputFrame({ jump: false }));
    tickFighterState(shortHop, shortInput);
  }

  assert.equal(shortHop.state.name, 'airborne');
  assert.equal(shortHop.velocity.y, shortHop.archetype.shortHopVelocity);

  const fullHop = createFighter({
    id: 'p2',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: 0 },
  });
  const fullInput = createInputBuffer();
  fullInput.push(normalizeInputFrame({ jump: true }));
  tickFighterState(fullHop, fullInput);
  for (let i = 0; i < fullHop.archetype.jumpSquatFrames; i += 1) {
    fullInput.push(normalizeInputFrame({ jump: true }));
    tickFighterState(fullHop, fullInput);
  }

  assert.equal(fullHop.state.name, 'airborne');
  assert.equal(fullHop.velocity.y, fullHop.archetype.fullHopVelocity);
});

test('training match composes independent player inputs, state, and physics', () => {
  const match = createTrainingMatch();

  match.input.p1.push(normalizeInputFrame({ right: true }));
  match.input.p2.push(normalizeInputFrame({ left: true }));
  match.tick();

  assert.equal(match.fighters.p1.position.x > -210, true);
  assert.equal(match.fighters.p2.position.x < 210, true);
  assert.notEqual(match.fighters.p1, match.fighters.p2);
});

function makeGamepad({
  axes = [],
  buttons = {},
  connected = true,
  index = 0,
  id = 'Mayflash GameCube Controller Adapter',
} = {}) {
  return {
    axes,
    buttons: Array.from({ length: 16 }, (_, buttonIndex) => ({
      pressed: Boolean(buttons[buttonIndex]),
      value: buttons[buttonIndex] ? 1 : 0,
    })),
    connected,
    id,
    index,
  };
}

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}
