const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('main is a small composition root and gameplay responsibilities live in modules', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  const lines = main.split(/\r?\n/).length;

  assert.ok(lines <= 160, `main.js should stay below 160 lines; found ${lines}`);

  for (const moduleName of [
    'game-config.js',
    'rendering.js',
    'world.js',
    'hotel.js',
    'elevator.js',
    'player.js',
  ]) {
    assert.ok(fs.existsSync(path.join(projectRoot, 'modules', moduleName)), `${moduleName} is missing`);
    assert.match(main, new RegExp(moduleName.replace('.', '\\.')));
  }
});

test('opening a room door does not change the renderer light count', () => {
  const hotel = fs.readFileSync(path.join(projectRoot, 'modules', 'hotel.js'), 'utf8');

  assert.doesNotMatch(hotel, /roomFill\s*=\s*new THREE\.PointLight/);
  assert.doesNotMatch(hotel, /fillLight\.visible/);
  assert.match(hotel, /fillFixture/);
});
