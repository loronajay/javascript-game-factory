import {
  deriveMaskFromRouteCell,
  directionFromTo,
  getMaskForDirections,
  getMaskOpenings,
  masksConnect
} from "../../scripts/shared/tile-connectivity.js";

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\ntile-connectivity");

test("directionFromTo resolves orthogonal movement", () => {
  assertEqual(directionFromTo([3, 4], [4, 4]), "E");
  assertEqual(directionFromTo([3, 4], [2, 4]), "W");
  assertEqual(directionFromTo([3, 4], [3, 3]), "N");
  assertEqual(directionFromTo([3, 4], [3, 5]), "S");
});

test("getMaskOpenings returns the canonical directions for a mask", () => {
  assertEqual(getMaskOpenings("NE").join(","), "N,E");
  assertEqual(getMaskOpenings("SW").join(","), "S,W");
});

test("getMaskForDirections resolves straight and corner masks", () => {
  assertEqual(getMaskForDirections("N", "S"), "NS");
  assertEqual(getMaskForDirections("E", "W"), "EW");
  assertEqual(getMaskForDirections("N", "E"), "NE");
});

test("deriveMaskFromRouteCell derives the correct mask for interior cells", () => {
  assertEqual(deriveMaskFromRouteCell([2, 5], [3, 5], [4, 5]), "EW");
  assertEqual(deriveMaskFromRouteCell([3, 4], [3, 5], [3, 6]), "NS");
  assertEqual(deriveMaskFromRouteCell([3, 4], [3, 5], [4, 5]), "NE");
});

test("deriveMaskFromRouteCell uses source and terminal directions for endpoints", () => {
  assertEqual(deriveMaskFromRouteCell(null, [0, 0], [0, 1]), "NS");
  assertEqual(deriveMaskFromRouteCell([2, 18], [2, 19], null), "NS");
});

test("masksConnect only reports true when openings face each other", () => {
  assert(masksConnect("EW", "E", "SW"), "expected east opening to connect to west opening");
  assert(!masksConnect("NS", "N", "EW"), "expected north opening not to connect to a tile with no south opening");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
