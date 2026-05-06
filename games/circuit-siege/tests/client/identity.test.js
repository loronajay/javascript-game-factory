import {
  FACTORY_PROFILE_MODULE_SPECIFIER,
  MATCH_IDENTITY_MODULE_SPECIFIER
} from "../../scripts/client/identity.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\nidentity");

test("identity module imports resolve through the repo-root shared shims", () => {
  assertEqual(FACTORY_PROFILE_MODULE_SPECIFIER, "../../../../js/factory-profile.mjs");
  assertEqual(MATCH_IDENTITY_MODULE_SPECIFIER, "../../../../js/match-identity.mjs");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
