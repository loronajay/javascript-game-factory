import {
  BIRD_DUTY_PERSONAL_BEST_KEY,
  clearPersonalBest,
  getPersonalBest,
  updatePersonalBest,
} from "../scripts/personal-best.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${actual} to equal ${expected}`);
  }
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("missing personal best reads as zero", () => {
  assertEqual(getPersonalBest({ localStorage: createStorage() }), 0);
});

test("invalid personal best reads as zero", () => {
  const storage = createStorage({ [BIRD_DUTY_PERSONAL_BEST_KEY]: "nope" });

  assertEqual(getPersonalBest({ localStorage: storage }), 0);
});

test("higher score updates personal best", () => {
  const storage = createStorage({ [BIRD_DUTY_PERSONAL_BEST_KEY]: "4" });
  const result = updatePersonalBest(7, { localStorage: storage });

  assertEqual(result.value, 7);
  assertEqual(result.isNewBest, true);
  assertEqual(storage.getItem(BIRD_DUTY_PERSONAL_BEST_KEY), "7");
});

test("lower score keeps existing personal best", () => {
  const storage = createStorage({ [BIRD_DUTY_PERSONAL_BEST_KEY]: "9" });
  const result = updatePersonalBest(5, { localStorage: storage });

  assertEqual(result.value, 9);
  assertEqual(result.isNewBest, false);
  assertEqual(storage.getItem(BIRD_DUTY_PERSONAL_BEST_KEY), "9");
});

test("personal best can be cleared", () => {
  const storage = createStorage({ [BIRD_DUTY_PERSONAL_BEST_KEY]: "9" });
  clearPersonalBest({ localStorage: storage });

  assertEqual(getPersonalBest({ localStorage: storage }), 0);
});

test("personal best helpers are safe without storage", () => {
  assertEqual(getPersonalBest({}), 0);
  assertEqual(updatePersonalBest(5, {}).value, 5);
  assertEqual(clearPersonalBest({}), false);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
