import {
  EMOTE_ASSET_PATHS,
  EMOTE_COOLDOWN_MS,
  EMOTE_DISPLAY_MS,
  keyToEmoteType,
  EMOTE_TYPES,
  sanitizeEmoteType,
} from '../scripts/emojis.js';

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

console.log('\nemojis');

test('supports the same four emote types as Lovers Lost', () => {
  assertEqual(EMOTE_TYPES.join(','), 'heart,middle-finger,smile,crying');
});

test('maps heart to the expected local asset path', () => {
  assertEqual(EMOTE_ASSET_PATHS.heart, 'images/emojis/heart.png');
});

test('uses the same 1 second cooldown pattern', () => {
  assertEqual(EMOTE_COOLDOWN_MS, 1000);
});

test('shows emotes long enough to read them', () => {
  assertEqual(EMOTE_DISPLAY_MS, 3000);
});

test('accepts a valid emote type', () => {
  assertEqual(sanitizeEmoteType('smile'), 'smile');
});

test('rejects unknown emote types', () => {
  assertEqual(sanitizeEmoteType('poop'), null);
});

test('maps W to heart like Lovers Lost jump', () => {
  assertEqual(keyToEmoteType('w'), 'heart');
});

test('maps S to middle-finger like Lovers Lost crouch', () => {
  assertEqual(keyToEmoteType('s'), 'middle-finger');
});

test('maps D to smile like Lovers Lost attack', () => {
  assertEqual(keyToEmoteType('d'), 'smile');
});

test('maps A to crying like Lovers Lost block', () => {
  assertEqual(keyToEmoteType('a'), 'crying');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
