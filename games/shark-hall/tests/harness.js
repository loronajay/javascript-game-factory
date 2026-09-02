// Minimal shared test harness for the Shark Hall cabinet.
//
// Byte-for-byte the harness Mini Hoops uses. Copied rather than imported across
// cabinets on purpose: a game folder is self-contained and runs its own `npm
// test` with no dependencies, and a shared test library between cabinets would
// be the first thing to couple them.
//
// The repo runs on zero test dependencies: each test file is a plain node script
// chained by the `test` script in package.json. This module exists only so the
// individual test files do not each re-declare the same assertion helpers.
//
// Usage: call `suite(name)` once, `test(...)` per case, `finish()` last. `finish()`
// sets the exit code, which is what makes `&&`-chaining in package.json meaningful.

let passed = 0;
let failed = 0;

export function suite(name) {
  console.log(`\n${name}`);
}

export function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }
}

/**
 * The async variant. **Must be awaited** — `test` catches only synchronous
 * throws, so an async body handed to it reports PASS the moment it starts and
 * its assertions escape as an unhandled rejection *after* `finish()` has already
 * printed a clean tally.
 */
export async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(message || `Expected ${b}, got ${a}`);
}

// Float comparison for physics assertions, where exact equality is meaningless.
export function assertClose(actual, expected, tolerance, message) {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) {
    throw new Error(message || `Expected ${expected} +/- ${tolerance}, got ${actual} (delta ${delta})`);
  }
}

export function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(message || "Expected function to throw");
}

export function finish() {
  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}
