import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

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

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

console.log('\nproject structure');

test('support modules live under scripts/', () => {
  const expected = [
    'scripts/input.js',
    'scripts/obstacles.js',
    'scripts/player.js',
    'scripts/renderer.js',
    'scripts/renderer-scenes.js',
    'scripts/scoring.js',
    'scripts/sounds.js',
  ];

  for (const file of expected) {
    assert(exists(file), `missing ${file}`);
  }
});

test('renderer scene stack lives behind a dedicated module seam', () => {
  const rendererPath = path.join(ROOT, 'scripts', 'renderer.js');
  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  assert(
    rendererSource.includes("from './renderer-scenes.js'"),
    'expected renderer.js to import the dedicated renderer-scenes module'
  );
});

test('node tests live under tests/', () => {
  const expected = [
    'tests/game.test.js',
    'tests/input.test.js',
    'tests/obstacles.test.js',
    'tests/player.test.js',
    'tests/scoring.test.js',
  ];

  for (const file of expected) {
    assert(exists(file), `missing ${file}`);
  }
});

test('dev-only artifacts are separated from the shipped root', () => {
  assert(exists('dev/demo.html'), 'missing dev/demo.html');
  assert(exists('dev/renderer-test.html'), 'missing dev/renderer-test.html');
  assert(exists('dev/archetype-model.js'), 'missing dev/archetype-model.js');
  assert(exists('docs/PACING.md'), 'missing docs/PACING.md');
});

test('old root-level clutter is gone', () => {
  const oldRootFiles = [
    'input.js',
    'input.test.js',
    'obstacles.js',
    'obstacles.test.js',
    'player.js',
    'player.test.js',
    'renderer.js',
    'scoring.js',
    'scoring.test.js',
    'sounds.js',
    'demo.html',
    'renderer-test.html',
    'archetype-model.js',
    'PACING.md',
  ];

  for (const file of oldRootFiles) {
    assert(!exists(file), `expected ${file} to be moved out of root`);
  }
});

if (failed > 0) {
  console.error(`\n${failed} failing, ${passed} passing`);
  process.exit(1);
}

console.log(`\n${passed} passing`);
