import assert from 'node:assert/strict';
import { getMapCardRowLayout } from '../scripts/renderer-ui.js';
for (const width of [390, 646, 844, 1280, 1920]) {
  const row = getMapCardRowLayout(width, 6);
  assert.ok(row.cardStartX >= 16);
  assert.ok(row.cardStartX + row.cardW * 6 + row.cardGap * 5 <= width - 16);
}
console.log('Illuminauts map cards stay inside the viewport.');
