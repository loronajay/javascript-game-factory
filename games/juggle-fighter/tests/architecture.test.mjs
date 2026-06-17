import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('index.html stays a thin module entry point', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const scriptTags = html.match(/<script\b/gi) ?? [];

  assert.equal(scriptTags.length, 1);
  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /function\s+\w+\s*\(/);
  assert.doesNotMatch(html, /requestAnimationFrame\s*\(/);
});

test('top-level main file composes modules instead of owning engine rules', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(source, /from '\.\/engine\/fixed-step-loop\.js'/);
  assert.match(source, /from '\.\/scenes\/training-match\.js'/);
  assert.match(source, /from '\.\/rendering\/canvas-renderer\.js'/);
  assert.doesNotMatch(source, /class\s+Fighter/);
  assert.doesNotMatch(source, /function\s+applyFighterPhysics/);
});
