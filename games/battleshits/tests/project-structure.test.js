// project-structure.test.js — verifies required files exist
// Run: node tests/project-structure.test.js  (from games/battleshits/)

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = join(__dir, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function requireFile(rel) {
  const full = join(root, rel);
  if (!existsSync(full)) throw new Error(`Missing: ${rel}`);
}

console.log('\nproject structure');

test('index.html exists',                  () => requireFile('index.html'));
test('style.css exists',                   () => requireFile('style.css'));
test('game.js exists',                     () => requireFile('game.js'));
test('game.json exists',                   () => requireFile('game.json'));
test('GDD.md exists',                      () => requireFile('GDD.md'));
test('AGENTS.md exists',                   () => requireFile('AGENTS.md'));
test('CLAUDE.md exists',                   () => requireFile('CLAUDE.md'));
test('package.json exists',                () => requireFile('package.json'));
test('scripts/board.js exists',            () => requireFile('scripts/board.js'));
test('scripts/emojis.js exists',           () => requireFile('scripts/emojis.js'));
test('scripts/online.js exists',           () => requireFile('scripts/online.js'));
test('tests/board.test.js exists',         () => requireFile('tests/board.test.js'));
test('tests/emojis.test.js exists',        () => requireFile('tests/emojis.test.js'));
test('tests/project-structure.test.js',    () => requireFile('tests/project-structure.test.js'));
test('images/ directory exists',           () => requireFile('images'));
test('images/emojis directory exists',     () => requireFile('images/emojis'));
test('sounds/ directory exists',           () => requireFile('sounds'));

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
