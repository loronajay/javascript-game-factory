import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

const files = {
  index: readFileSync(join(root, 'index.html'), 'utf8'),
  variables: readFileSync(join(root, 'css', 'variables.css'), 'utf8'),
  shell: readFileSync(join(root, 'css', 'shell.css'), 'utf8'),
  board: readFileSync(join(root, 'css', 'board.css'), 'utf8'),
  battle: readFileSync(join(root, 'css', 'battle.css'), 'utf8'),
  responsive: readFileSync(join(root, 'css', 'responsive.css'), 'utf8'),
};

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

function assertMatches(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

function assertNotMatches(source, pattern, message) {
  if (pattern.test(source)) {
    throw new Error(message);
  }
}

console.log('\nlayout css');

test('page shell allows vertical scrolling when battle controls exceed viewport height', () => {
  assertMatches(
    files.variables,
    /body\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/,
    'Expected body to keep horizontal overflow hidden while allowing vertical scrolling.',
  );
  assertMatches(
    files.shell,
    /\.game-shell\s*\{[\s\S]*overflow-x:\s*hidden;/,
    'Expected game shell to avoid horizontal spill without clipping vertical content.',
  );
  assertNotMatches(
    files.shell,
    /\.game-shell\s*\{[\s\S]*overflow:\s*hidden;/,
    'The game shell must not use overflow:hidden because it clips stacked battle boards.',
  );
  assertMatches(
    files.shell,
    /#game-root\s*\{[\s\S]*min-height:\s*100svh;[\s\S]*height:\s*auto;/,
    'Expected game root to grow taller than the viewport when needed.',
  );
});

test('toilet bowl seats stay square and do not crop playable grids', () => {
  assertMatches(
    files.board,
    /\.board-bowl-seat\s*\{[\s\S]*aspect-ratio:\s*1\s*\/\s*1;/,
    'Expected bowl seats to be square.',
  );
  assertMatches(
    files.board,
    /\.board-bowl-water\s*\{[\s\S]*display:\s*grid;[\s\S]*place-items:\s*center;[\s\S]*overflow:\s*visible;/,
    'Expected bowl water to center the grid and leave it visible.',
  );
  assertMatches(
    files.board,
    /\.board-bowl-water \.board-grid\s*\{[\s\S]*position:\s*relative;/,
    'Expected board grids to participate in centered layout instead of being absolutely offset.',
  );
});

test('battle board sizing is viewport-aware and stacks before boards are crushed', () => {
  assertMatches(
    files.battle,
    /\.screen-battle\s*\{[\s\S]*--bowl-size:\s*clamp\(280px,\s*min\(34vw,\s*54vh\),\s*480px\);/,
    'Expected battle bowls to use a minimum playable square size.',
  );
  assertMatches(
    files.responsive,
    /@media\s*\(max-width:\s*1280px\)\s*\{[\s\S]*\.battle-boards\s*\{[\s\S]*grid-template-columns:\s*1fr;/,
    'Expected battle boards to stack before the two-bowl layout clips smaller widths.',
  );
  assertMatches(
    files.responsive,
    /@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*\.screen-battle\s*\{[\s\S]*--bowl-size:\s*min\(92vw,\s*420px\);/,
    'Expected mobile battle bowls to use most of the viewport width.',
  );
});

test('fleet status panel owns layout space instead of overlapping the fleet bowl', () => {
  assertMatches(
    files.battle,
    /\.battle-playfield\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*clamp\(150px,\s*12vw,\s*190px\)\s+minmax\(0,\s*1fr\)\s+clamp\(150px,\s*12vw,\s*190px\);/,
    'Expected the battle playfield to reserve columns for both fleet status panels on wide screens.',
  );
  assertMatches(
    files.index,
    /id="fleet-ships-status"[\s\S]*class="battle-boards"[\s\S]*id="opponent-ships-status"/,
    'Expected the battle screen to render own and opponent fleet panels around the boards.',
  );
  assertMatches(
    files.battle,
    /\.screen-battle #fleet-ships-status,\s*\n\.screen-battle #opponent-ships-status\s*\{[\s\S]*position:\s*relative;/,
    'Expected fleet status to live in normal layout flow.',
  );
  assertMatches(
    files.battle,
    /\.screen-battle #fleet-ships-status,\s*\n\.screen-battle #opponent-ships-status\s*\{[\s\S]*position:\s*relative;/,
    'Expected opponent fleet status to live in normal layout flow.',
  );
  assertNotMatches(
    files.battle,
    /#(?:fleet-ships-status|opponent-ships-status)[\s\S]*position:\s*absolute;/,
    'Fleet status panels must not be absolutely positioned over the bowls.',
  );
  assertNotMatches(
    files.responsive,
    /@media\s*\(max-width:\s*1280px\)\s*\{[\s\S]*\.screen-battle #(fleet-ships-status|opponent-ships-status)\s*\{[\s\S]*display:\s*none;/,
    'Fleet status panels are important battle UI and should stay visible on narrower screens.',
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
