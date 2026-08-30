const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('./helpers/map-fixture.js');
const maps = require('../map-catalog.js');

// A proportional metric keeps the layout contract independent of canvas and installed fonts.
const measureText = (text, size) => [...text].reduce((width, char) =>
  width + (char === ' ' ? 0.28 : /[MW]/.test(char) ? 0.9 : /[I1]/.test(char) ? 0.3 : 0.65) * size, 0);

function assertFits(layout, text) {
  assert.equal(layout.lines.join(' '), text);
  assert.ok(layout.fontSize > 0);
  for (const line of layout.lines) {
    assert.ok(measureText(line, layout.fontSize) <= layout.width - 2 * layout.padding,
      `${text}: line overflows the sign`);
  }
  assert.ok(layout.lines.length * layout.lineHeight <= layout.height - 2 * layout.padding,
    `${text}: lines overflow vertically`);
}

test('every authored map sign preserves all its words inside its own proportions', async () => {
  const { layoutSignText } = await import('../modules/sign-layout.js');
  for (const map of maps.playableMaps()) {
    for (const sign of buildPlan(map.id).signs) {
      const w = sign.w || 1.3, h = sign.h || 0.65;
      const result = layoutSignText(sign.text, w, h, measureText);
      assertFits(result, sign.text.trim().replace(/\s+/g, ' '));
      assert.ok(Math.abs((result.width / result.height) / (w / h) - 1) < 0.01,
        `${sign.text}: texture distorts the sign proportions`);
    }
  }
});

test('cinema marquees fit on one line while poster titles wrap without stretching letters', async () => {
  const { layoutSignText } = await import('../modules/sign-layout.js');
  for (const [text, w, h] of [['THEATER 6', 4, 0.62], ['CROWNE POINT CINEMA', 10.5, 0.9], ['ELEVATOR', 2.8, 0.45]]) {
    const result = layoutSignText(text, w, h, measureText);
    assertFits(result, text);
    assert.equal(result.lines.length, 1);
  }
  const poster = layoutSignText('NO WAY HOME', 1.9, 1.5, measureText);
  assertFits(poster, 'NO WAY HOME');
  assert.ok(poster.lines.length > 1);
});

test('long unbroken labels and room numbers shrink uniformly to stay inside their borders', async () => {
  const { layoutSignText } = await import('../modules/sign-layout.js');
  for (const text of ['101', '12345', 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS']) {
    const result = layoutSignText(text, 1, 1, measureText, { wrap: false });
    assertFits(result, text);
    assert.equal(result.lines.length, 1);
  }
});

test('short signs retain a readable font and empty labels have a finite layout', async () => {
  const { layoutSignText } = await import('../modules/sign-layout.js');
  const result = layoutSignText('EXIT', 4, 0.6, measureText);
  assertFits(result, 'EXIT');
  assert.ok(result.fontSize >= result.height * 0.5);
  const empty = layoutSignText('', 1, 1, measureText);
  assertFits(empty, '');
});
