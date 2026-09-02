const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

async function loadViewer() {
  return import(url.pathToFileURL(path.resolve(__dirname, '..', 'modules', 'model-viewer.js')).href);
}

test('the workbench keeps the top-level map group that owns a nested creature visible', async () => {
  const { containsViewerSubject, isolateViewerSubject } = await loadViewer();
  const scene = { parent: null, children: [] };
  const mapGroup = { parent: scene, children: [], visible: true };
  const creature = { parent: mapGroup, children: [], visible: true };
  const floorGeometry = { parent: mapGroup, children: [], visible: true };
  const unrelatedFloor = { parent: scene, children: [], visible: true };
  scene.children.push(mapGroup, unrelatedFloor);
  mapGroup.children.push(creature, floorGeometry);

  assert.equal(containsViewerSubject(mapGroup, creature), true);
  assert.equal(containsViewerSubject(creature, creature), true);
  assert.equal(containsViewerSubject(unrelatedFloor, creature), false);
  isolateViewerSubject(scene, creature);
  assert.equal(mapGroup.visible, true, 'the nested creature keeps its top-level owner');
  assert.equal(creature.visible, true);
  assert.equal(floorGeometry.visible, false, 'map geometry beside the workbench subject is hidden');
  assert.equal(unrelatedFloor.visible, false);
});
