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
  buttons: readFileSync(join(root, 'css', 'buttons.css'), 'utf8'),
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

test('mobile landscape keeps the battle boards side by side with compact chrome', () => {
  assertMatches(
    files.responsive,
    /@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\),\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\),\s*\(max-height:\s*520px\)\s*and\s*\(min-width:\s*700px\)\s*\{/,
    'Expected a landscape-first mobile media query matching the other recent cabinets.',
  );
  assertMatches(
    files.responsive,
    /\.screen-battle\s*\{[\s\S]*--bowl-size:\s*min\(31vw,\s*58svh,\s*260px\);/,
    'Expected compact mobile landscape battle bowls sized from width and dynamic viewport height.',
  );
  assertMatches(
    files.responsive,
    /\.battle-boards\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+clamp\(54px,\s*7vw,\s*78px\)\s+minmax\(0,\s*1fr\);/,
    'Expected mobile landscape battle boards to remain side by side with a compact center column.',
  );
  assertMatches(
    files.responsive,
    /\.screen-battle #fleet-ships-status,\s*\n\s*\.screen-battle #opponent-ships-status\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/,
    'Expected fleet status panels to compress into a single scan row instead of hiding.',
  );
  assertMatches(
    files.responsive,
    /\.screen-battle \.emote-bubble\s*\{[\s\S]*position:\s*absolute;/,
    'Expected mobile landscape emotes to overlay boards instead of reserving vertical layout space.',
  );
});

test('mobile portrait shows the landscape gate instead of crushing the boards', () => {
  assertMatches(
    files.responsive,
    /\.mobile-landscape-gate\s*\{[\s\S]*position:\s*fixed;[\s\S]*env\(safe-area-inset-top\)[\s\S]*env\(safe-area-inset-left\)/,
    'Expected mobile landscape gate to cover the viewport and respect safe-area insets.',
  );
  assertMatches(
    files.responsive,
    /\.mobile-landscape-gate\.is-visible\s*\{[\s\S]*display:\s*flex;/,
    'Expected the gate to become visible when mobile-ui marks it active.',
  );
  assertMatches(
    files.responsive,
    /\.mobile-play-gated \.game-shell\s*\{[\s\S]*filter:\s*blur\(2px\) brightness\(0\.55\);/,
    'Expected the game shell to dim behind the orientation gate.',
  );
});

test('mobile landscape menu remains centered with a fully visible title stack', () => {
  assertMatches(
    files.responsive,
    /\.menu-stage\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/,
    'Expected mobile landscape menu to keep the centered menu stack instead of a side-column layout.',
  );
  assertMatches(
    files.responsive,
    /\.menu-title-frame \.game-title\s*\{[\s\S]*font-size:\s*clamp\(1\.35rem,\s*3\.8vw,\s*2\.1rem\);/,
    'Expected mobile landscape title sizing to fit inside the frame.',
  );
  assertMatches(
    files.responsive,
    /\.menu-buttons\s*\{[\s\S]*margin-top:\s*clamp\(-150px,\s*-34svh,\s*-110px\);/,
    'Expected mobile landscape buttons to sit over the toilet area while the whole menu stays centered.',
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
    /@media\s*\(max-width:\s*1280px\)\s*\{[\s\S]*?\.screen-battle #(fleet-ships-status|opponent-ships-status)\s*\{[^}]*display:\s*none;/,
    'Fleet status panels are important battle UI and should stay visible on narrower screens.',
  );
});

test('missed shots animate as splash and ripple impacts on both boards', () => {
  assertMatches(
    files.board,
    /\.board-cell\.cell-water-hit::before,\s*\n\.board-cell\.cell-target-miss::before\s*\{[\s\S]*animation:\s*miss-splash-burst/,
    'Expected miss cells on both boards to render an animated splash burst.',
  );
  assertMatches(
    files.board,
    /\.board-cell\.cell-water-hit::after,\s*\n\.board-cell\.cell-target-miss::after\s*\{[\s\S]*animation:\s*miss-splash-ripple/,
    'Expected miss cells on both boards to render an animated ripple ring.',
  );
  assertMatches(
    files.board,
    /@keyframes\s+miss-splash-burst\s*\{/,
    'Expected splash burst keyframes to exist.',
  );
  assertMatches(
    files.board,
    /@keyframes\s+miss-splash-ripple\s*\{/,
    'Expected splash ripple keyframes to exist.',
  );
});

test('hidden result-screen buttons are removed from layout', () => {
  assertMatches(
    files.index,
    /id="btn-change-difficulty"[\s\S]*class="btn btn-secondary hidden"/,
    'Expected Change Difficulty to start hidden so online results can suppress it.',
  );
  assertMatches(
    files.buttons,
    /\.btn\.hidden\s*\{[\s\S]*display:\s*none;/,
    'Expected hidden buttons to be removed from the result-screen action row.',
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
