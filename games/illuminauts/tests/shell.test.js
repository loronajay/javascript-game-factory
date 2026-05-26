import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function testBackToArcadeLinkExists() {
  assert.match(
    indexHtml,
    /<a\s+[^>]*href="\.\.\/\.\.\/grid\.html"[^>]*class="back-link"[^>]*>\s*&lt;\s*Back to Arcade\s*<\/a>/,
  );
}

function testBackLinkIsAccessibleAboveCanvas() {
  assert.match(styleCss, /\.back-link\s*\{/);
  assert.match(styleCss, /position:\s*fixed;/);
  assert.match(styleCss, /z-index:\s*10;/);
}

function testMobileControllerBootsWithIlluminautsProfile() {
  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(indexHtml, /from ['"]\.\.\/\.\.\/js\/mobile-controller\.mjs['"]/);
  assert.match(indexHtml, /from ['"]\.\/scripts\/mobile-ui\.js['"]/);
  assert.match(indexHtml, /id:\s*['"]illuminauts-touch['"]/);
  assert.match(indexHtml, /layout:\s*['"]dpad-buttons['"]/);
  assert.match(indexHtml, /directionMode:\s*['"]cardinal['"]/);
  assert.doesNotMatch(indexHtml, /directionMode:\s*['"]eight-way['"]/);
  assert.match(indexHtml, /forceMobileControls/);
  assert.match(indexHtml, /mountMobileController\(\{\s*profile:\s*ILLUMINAUTS_MOBILE_PROFILE,\s*force:\s*forceMobileControls\s*\}\)/);

  const gateCall = indexHtml.indexOf('initMobileLandscapeGate({ force: forceMobileControls })');
  const controllerCall = indexHtml.indexOf('mountMobileController({ profile: ILLUMINAUTS_MOBILE_PROFILE, force: forceMobileControls })');
  const gameScript = indexHtml.indexOf('<script type="module" src="game.js"></script>');
  assert.ok(gateCall >= 0 && controllerCall >= 0 && gameScript >= 0);
  assert.ok(gateCall < controllerCall && controllerCall < gameScript);
}

function testMobileStylesArePresent() {
  assert.match(styleCss, /\.mobile-landscape-gate\s*\{/);
  assert.match(styleCss, /\.mobile-play-gated\s+#gameCanvas\s*\{/);
  assert.match(styleCss, /\(pointer:\s*coarse\)/);
  assert.match(styleCss, /data-mobile-controller-root="illuminauts-touch"/);
  assert.match(styleCss, /env\(safe-area-inset-bottom\)/);
}

function run() {
  testBackToArcadeLinkExists();
  testBackLinkIsAccessibleAboveCanvas();
  testMobileControllerBootsWithIlluminautsProfile();
  testMobileStylesArePresent();
  console.log('Illuminauts shell tests passed.');
}

run();
