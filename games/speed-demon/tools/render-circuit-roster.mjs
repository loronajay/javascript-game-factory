// Offline review artifacts use the production livery baker and its measured
// geometry; no approximate parallel paint implementation lives in this tool.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readPng } from '../tests/png.js';
import { CIRCUIT_MODELS } from '../scripts/circuit/assets.js';
import { createLivery, addLayer, updateLayer } from '../scripts/garage/livery.js';
let source;
globalThis.document = { createElement() {
  const canvas = { width: 0, height: 0 };
  canvas.getContext = () => ({
    drawImage(image) { source = image; },
    getImageData(x, y, width, height) { return { data: new Uint8ClampedArray(source), width, height }; },
    putImageData(image) { canvas.data = image.data; },
  });
  return canvas;
} };
const { circuitLiveryAtlas, createCircuitLiveryCache, circuitFrameGeometry } = await import('../scripts/circuit/livery-atlas.js');
const rows = [];
for (const model of CIRCUIT_MODELS) {
  const png = readPng(readFileSync(new URL('../assets/circuit-cars/'+model.spritesheet, import.meta.url)));
  const image = Object.assign(png.pixels, { width: png.width, height: png.height, naturalWidth: png.width, complete: true });
  const cache = createCircuitLiveryCache();
  const versions = {};
  for (const [name, curve] of [['straight', 0], ['curve-left', -.2], ['curve-right', .2]]) {
    let livery = addLayer(createLivery({ paint: { hue: 0, saturation: .82, brightness: .76, finish: 'gloss' } }), 'stripes');
    livery = updateLayer(livery, livery.layers[0].id, { position: .44, size: .08, curve, mirrored: true, paint: { hue:0, saturation:0, brightness:1.3, finish:'gloss' } });
    const atlas = circuitLiveryAtlas(cache, { image, modelId: model.modelId, livery });
    versions[name] = Buffer.from(atlas.data).toString('base64');
  }
  rows.push({ modelId: model.modelId, label: model.label, geometry: Array.from({length:8}, (_, frame) => circuitFrameGeometry(cache, model.modelId, frame)), versions });
}
mkdirSync(new URL('../artifacts/circuit-roster/', import.meta.url), { recursive:true });
writeFileSync(new URL('../artifacts/circuit-roster/bakes.json', import.meta.url), JSON.stringify(rows));
console.log('Baked', rows.length, 'models × 8 headings × 3 stripe curves');
