import {
  SHOT_ANIMATION_MS,
  getBattleStatusCopy,
  getEndedScreenCopy,
  getTargetLabelCopy,
} from '../scripts/presentation.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\npresentation');

test('shot animation timing stays within the agreed one-to-one-and-a-half second range', () => {
  if (SHOT_ANIMATION_MS < 1000 || SHOT_ANIMATION_MS > 1500) {
    throw new Error(`Expected timing within 1000-1500ms, got ${SHOT_ANIMATION_MS}`);
  }
});

test('my turn copy prompts the player to fire', () => {
  assertEqual(
    getBattleStatusCopy('mine'),
    'Your turn - pick a target bowl space.',
  );
});

test('awaiting result copy reflects the falling shot sequence', () => {
  assertEqual(
    getBattleStatusCopy('awaiting_result'),
    'Missile in the air...',
  );
});

test('their turn copy indicates the opponent is aiming', () => {
  assertEqual(
    getBattleStatusCopy('theirs'),
    'Opponent is lining up a shot...',
  );
});

test('incoming shot copy reflects the local impact sequence', () => {
  assertEqual(
    getBattleStatusCopy('incoming_shot'),
    'Incoming shot! Brace for impact...',
  );
});

test('target label becomes actionable during my turn', () => {
  assertEqual(
    getTargetLabelCopy('mine'),
    'Target Bowl - Click to fire',
  );
});

test('target label becomes passive when it is not my turn', () => {
  assertEqual(
    getTargetLabelCopy('theirs'),
    'Target Bowl',
  );
});

test('win ended screen copy is triumphant', () => {
  const copy = getEndedScreenCopy('win');
  assertEqual(copy.title, 'Victory');
  assertEqual(copy.message, 'You flushed their whole fleet.');
});

test('forfeit win ended screen copy mentions the disconnect', () => {
  const copy = getEndedScreenCopy('forfeit_win');
  assertEqual(copy.title, 'Victory by Forfeit');
  assertEqual(copy.message, 'Opponent disconnected. The bowl is yours.');
});

test('loss ended screen copy stays arcade-clean', () => {
  const copy = getEndedScreenCopy('loss');
  assertEqual(copy.title, 'Defeat');
  assertEqual(copy.message, 'Your fleet went under. Run it back.');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
