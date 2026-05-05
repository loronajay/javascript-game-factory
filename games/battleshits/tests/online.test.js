import { getOppositeMatchSide, resolveWebSocketUrl } from '../scripts/online.js';

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

console.log('\nresolveWebSocketUrl');

test('returns the opposite public matchmaking side for alpha', () => {
  assertEqual(getOppositeMatchSide('alpha'), 'beta');
});

test('returns the opposite public matchmaking side for beta', () => {
  assertEqual(getOppositeMatchSide('beta'), 'alpha');
});

test('uses localhost websocket server when running from localhost', () => {
  assertEqual(
    resolveWebSocketUrl({ protocol: 'http:', hostname: 'localhost' }),
    'ws://localhost:3000',
  );
});

test('uses loopback websocket server when running from 127.0.0.1', () => {
  assertEqual(
    resolveWebSocketUrl({ protocol: 'http:', hostname: '127.0.0.1' }),
    'ws://127.0.0.1:3000',
  );
});

test('uses production websocket server for deployed pages', () => {
  assertEqual(
    resolveWebSocketUrl({ protocol: 'https:', hostname: 'jay.example' }),
    'wss://factory-network-server-production.up.railway.app',
  );
});

test('falls back to production websocket server without a browser location', () => {
  assertEqual(
    resolveWebSocketUrl(null),
    'wss://factory-network-server-production.up.railway.app',
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
