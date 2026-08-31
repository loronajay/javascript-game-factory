import assert from 'node:assert/strict';
import { getMapCardGridLayout } from '../scripts/renderer-ui.js';

for (const [width, expectedColumns] of [[390, 2], [646, 3], [844, 3], [1280, 6], [1920, 6]]) {
  const grid = getMapCardGridLayout(width, 6);
  assert.equal(grid.columns, expectedColumns);
  assert.ok(grid.cardW >= 120, `cards remain legible at ${width}px`);
  assert.ok(grid.cardStartX >= 16);
  assert.ok(grid.cardStartX + grid.cardW * grid.columns + grid.cardGap * (grid.columns - 1) <= width - 16);
  assert.equal(grid.rows, Math.ceil(6 / expectedColumns));
}

console.log('Illuminauts mission grid stays legible inside the viewport.');
