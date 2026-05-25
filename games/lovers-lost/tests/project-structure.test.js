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
    'scripts/mobile-ui.js',
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

test('mobile controller is mounted with a Lovers Lost-specific control profile', () => {
  const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(
    indexSource.includes("from '../../js/mobile-controller.mjs'"),
    'expected index.html to import the shared mobile controller'
  );
  assert(
    indexSource.includes("from './scripts/mobile-ui.js'"),
    'expected index.html to import the Lovers Lost mobile UI helpers'
  );
  assert(
    /mountMobileController\(\{\s*profile:\s*LOVERS_LOST_MOBILE_PROFILE,\s*force:\s*forceMobileControls\s*\}\)/.test(indexSource),
    'expected index.html to mount a local Lovers Lost mobile profile'
  );
  assert(
    indexSource.includes("label: 'BOY'"),
    'expected the boy pad label to describe the playable side'
  );
  assert(
    indexSource.includes("label: 'GIRL'"),
    'expected the girl pad label to describe the playable side'
  );
  assert(
    indexSource.includes("legends: { up: 'JUMP', down: 'CROUCH', left: 'BLOCK', right: 'ATTACK' }"),
    'expected the boy pad to use Lovers Lost action labels instead of keyboard letters'
  );
  assert(
    indexSource.includes("legends: { up: 'JUMP', down: 'CROUCH', left: 'ATTACK', right: 'BLOCK' }"),
    'expected the girl pad to use Lovers Lost action labels instead of keyboard letters'
  );
});

test('mobile fullscreen landscape gate is mounted before game init', () => {
  const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(
    /initMobileLandscapeGate\(\{\s*force:\s*forceMobileControls\s*\}\)/.test(indexSource),
    'expected index.html to mount the mobile landscape/fullscreen gate'
  );
  assert(
    indexSource.indexOf('initMobileLandscapeGate') < indexSource.indexOf('initGame();'),
    'expected the mobile gate to initialize before the game starts'
  );
});

test('mobile styles use dynamic fullscreen viewport sizing', () => {
  const styleSource = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert(
    styleSource.includes('height: 100dvh'),
    'expected dynamic viewport height to avoid mobile browser chrome clipping'
  );
  assert(
    styleSource.includes('.mobile-landscape-gate'),
    'expected mobile landscape gate styles'
  );
  assert(
    styleSource.includes('(pointer: coarse)'),
    'expected touch-specific viewport styling'
  );
});

test('mobile controller can be forced on for local visual QA', () => {
  const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(
    indexSource.includes("new URLSearchParams(window.location.search).has('forceMobileControls')"),
    'expected a query switch for desktop mobile-controller QA'
  );
  assert(
    /mountMobileController\(\{\s*profile:\s*LOVERS_LOST_MOBILE_PROFILE,\s*force:\s*forceMobileControls\s*\}\)/.test(indexSource),
    'expected the mobile controller mount to use the QA force switch'
  );
});

test('Lovers Lost mobile controller hides generic arrow glyphs behind action labels', () => {
  const styleSource = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert(
    /\.mobile-controller\[data-mobile-controller-root="lovers-lost-touch"\]\s+\.mobile-controller__arrow/.test(styleSource),
    'expected Lovers Lost-specific mobile controller arrow override'
  );
  assert(
    /display:\s*none/.test(styleSource),
    'expected the generic mobile controller arrows to be hidden for Lovers Lost'
  );
  assert(
    /\.mobile-controller\[data-mobile-controller-root="lovers-lost-touch"\]\s+\.mobile-controller__pad-label/.test(styleSource),
    'expected Lovers Lost to override the shared center pad labels'
  );
  assert(
    /content:\s*"BOY"/.test(styleSource) && /content:\s*"GIRL"/.test(styleSource),
    'expected side labels to sit outside the action wheels'
  );
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
