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
  assert.match(indexHtml, /from ['"]\.\.\/\.\.\/js\/mobile-controller\.mjs['"]/);
  assert.match(indexHtml, /mountMobileController\(\{\s*profileId:\s*['"]illuminauts['"]\s*\}\)/);
}

function run() {
  testBackToArcadeLinkExists();
  testBackLinkIsAccessibleAboveCanvas();
  testMobileControllerBootsWithIlluminautsProfile();
  console.log('Illuminauts shell tests passed.');
}

run();
