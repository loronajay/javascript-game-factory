import {
  createPuzzleState,
  tickPuzzleState,
  applyPuzzlePlayerSnapshot,
  activeGateIds,
  buildPuzzleTicketResult,
} from '../scripts/puzzle-campaign.js';
import { PUZZLE_PACKS, getPuzzleStage } from '../scripts/puzzle-stage-packs.js';
import { normalizePuzzleProgress, completePuzzleStage, isPuzzleStageUnlocked } from '../scripts/puzzle-progress.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assertEq(actual, expected, message) {
  assert(actual === expected, message || `expected ${expected}, got ${actual}`);
}

function place(state, side, x, y = 398) {
  return { ...state, players: { ...state.players, [side]: { ...state.players[side], x, y, vx: 0, vy: 0 } } };
}

const stage = getPuzzleStage('first-steps', 'the-handoff');

console.log('\npuzzle campaign');

test('stage packs expose stable ids and an expandable stage list', () => {
  assertEq(PUZZLE_PACKS.length, 1);
  assertEq(PUZZLE_PACKS[0].id, 'first-steps');
  assertEq(PUZZLE_PACKS[0].stages.length, 1);
  assertEq(stage.id, 'the-handoff');
  assert(stage.switches.length >= 3, 'expected a three-beat cooperative puzzle');
});

test('switches and their linked gates use distinct shared colors instead of text labels', () => {
  const colors = stage.switches.map(item => stage.signals[item.id]?.color);

  assert(colors.every(Boolean), 'every switch should have a signal color');
  assertEq(new Set(colors).size, stage.switches.length, 'each switch pair should be visually distinct');
  assert(stage.switches.every(item => !('label' in item)), 'switches should not carry text labels');
  assert(stage.gates.every(gate => !('label' in gate)), 'gates should not carry text labels');
  assert(stage.gates.every(gate => stage.signals[gate.switchId]?.color), 'every gate should inherit its linked switch color');
});

test('the first gate starts closed and opens only while the girl holds her switch', () => {
  let state = createPuzzleState(stage, 'solo');
  assert(activeGateIds(stage, state).includes('boy-first-gate'), 'boy gate should start solid');

  const girlSwitch = stage.switches.find(item => item.id === 'girl-opens-boy');
  state = place(state, 'girl', girlSwitch.x);
  state = tickPuzzleState(stage, state, {});

  assert(state.switches['girl-opens-boy'], 'girl switch should be pressed');
  assert(!activeGateIds(stage, state).includes('boy-first-gate'), 'girl switch should open boy gate');
});

test('a closed gate blocks horizontal movement', () => {
  let state = createPuzzleState(stage, 'local');
  const gate = stage.gates.find(item => item.id === 'boy-first-gate');
  state = place(state, 'boy', gate.x - 30);
  for (let i = 0; i < 30; i++) {
    state = tickPuzzleState(stage, state, { boy: { right: true } });
  }
  assert(state.players.boy.x + stage.player.width <= gate.x + 0.01, 'boy should not pass a closed gate');
});

test('online puzzle ticks only the locally authoritative side', () => {
  const state = createPuzzleState(stage, 'online');
  const next = tickPuzzleState(stage, state, {
    boy: { right: true },
    girl: { right: true },
  }, { activeSides: ['boy'] });

  assert(next.players.boy.x > state.players.boy.x, 'local boy should move');
  assertEq(next.players.girl.x, state.players.girl.x, 'remote girl should wait for her snapshot');
});

test('online puzzle snapshots update only the remote player and ignore stale packets', () => {
  const state = createPuzzleState(stage, 'online');
  const moved = applyPuzzlePlayerSnapshot(state, 'girl', {
    seq: 2,
    player: { ...state.players.girl, x: 144, facing: 'left' },
  });
  const stale = applyPuzzlePlayerSnapshot(moved, 'girl', {
    seq: 1,
    player: { ...state.players.girl, x: 40 },
  });

  assertEq(moved.players.girl.x, 144);
  assertEq(stale.players.girl.x, 144, 'stale remote movement must not rewind the partner');
});

test('the handoff chain lets each lover open the other lane', () => {
  let state = createPuzzleState(stage, 'solo');
  const girlSwitch = stage.switches.find(item => item.id === 'girl-opens-boy');
  const boySwitch = stage.switches.find(item => item.id === 'boy-opens-girl');
  const finalSwitch = stage.switches.find(item => item.id === 'girl-opens-exit');

  state = tickPuzzleState(stage, place(state, 'girl', girlSwitch.x), {});
  assert(!activeGateIds(stage, state).includes('boy-first-gate'));

  state = tickPuzzleState(stage, place(state, 'boy', boySwitch.x), {});
  assert(!activeGateIds(stage, state).includes('girl-first-gate'));

  state = tickPuzzleState(stage, place(state, 'girl', finalSwitch.x), {});
  assert(!activeGateIds(stage, state).includes('boy-exit-gate'));
});

test('the stage completes only after both lovers reach their exits', () => {
  let state = createPuzzleState(stage, 'solo');
  state = place(state, 'boy', stage.exits.boy.x);
  state = tickPuzzleState(stage, state, {});
  assert(state.players.boy.finished, 'boy should be waiting in his exit');
  assertEq(state.phase, 'playing');

  state = place(state, 'girl', stage.exits.girl.x);
  state = tickPuzzleState(stage, state, {});
  assert(state.players.girl.finished, 'girl should reach her exit');
  assertEq(state.phase, 'complete');
});

test('the authored stage can be completed through movement and jumps without teleporting', () => {
  let state = createPuzzleState(stage, 'solo');

  for (let i = 0; i < 20 && !state.switches['girl-opens-boy']; i++) {
    state = tickPuzzleState(stage, state, { girl: { right: true } });
  }
  assert(state.switches['girl-opens-boy'], 'girl should reach switch A');

  for (let i = 0; i < 120 && !state.switches['boy-opens-girl']; i++) {
    const boy = state.players.boy;
    state = tickPuzzleState(stage, state, {
      boy: { right: true, jump: boy.onGround && boy.x >= 65 && boy.x <= 100 },
    });
  }
  assert(state.switches['boy-opens-girl'], 'boy should clear his crate and reach switch B');

  for (let i = 0; i < 140 && !state.switches['girl-opens-exit']; i++) {
    const girl = state.players.girl;
    state = tickPuzzleState(stage, state, {
      girl: { right: true, jump: girl.onGround && girl.x >= 70 && girl.x <= 112 },
    });
  }
  assert(state.switches['girl-opens-exit'], 'girl should clear her steps and reach switch C');

  for (let i = 0; i < 80 && !state.players.boy.finished; i++) {
    state = tickPuzzleState(stage, state, { boy: { right: true } });
  }
  assert(state.players.boy.finished, 'boy should cross the exit gate');

  for (let i = 0; i < 80 && state.phase !== 'complete'; i++) {
    state = tickPuzzleState(stage, state, { girl: { right: true } });
  }
  assertEq(state.phase, 'complete');
});

test('ticket result reports bounded facts and never names a payout', () => {
  const state = {
    ...createPuzzleState(stage, 'solo'),
    phase: 'complete',
    elapsedFrames: 1875,
    resets: 2,
    resultId: 'llp-test-result-1234',
  };
  const result = buildPuzzleTicketResult(stage, state);
  assertEq(result.packId, 'first-steps');
  assertEq(result.stageId, 'the-handoff');
  assertEq(result.mode, 'solo');
  assertEq(result.durationMs, 31250);
  assertEq(result.resets, 2);
  for (const key of ['tickets', 'reward', 'amount', 'payout']) {
    assert(!(key in result), `result must not choose its own ${key}`);
  }
});

test('unfinished puzzle attempts are never filed for tickets', () => {
  assertEq(buildPuzzleTicketResult(stage, createPuzzleState(stage, 'local')), null);
});

test('campaign progress records the best clear and unlocks the next authored stage', () => {
  const blank = normalizePuzzleProgress(null);
  assert(isPuzzleStageUnlocked(PUZZLE_PACKS[0], 0, blank), 'first stage should always be unlocked');

  const once = completePuzzleStage(blank, stage, 2400);
  const slower = completePuzzleStage(once, stage, 3000);
  assertEq(slower.completed['first-steps/the-handoff'].bestFrames, 2400);
  assertEq(slower.completed['first-steps/the-handoff'].clears, 2);
});

if (failed > 0) {
  console.error(`\n${failed} failing, ${passed} passing`);
  process.exit(1);
}

console.log(`\n${passed} passing`);
