const test = require('node:test');
const assert = require('node:assert/strict');

const preview = require('../map-preview.js');
const hotelFixture = require('./helpers/hotel-fixture.js');
const mallFixture = require('./helpers/mall-fixture.js');

// The picker's floorplans are derived from the plans themselves, so that a map which changes its
// walls changes its preview in the same commit and a new map gets a preview for free. These are the
// rules that makes that derivation trustworthy rather than decorative.

const hotel = hotelFixture.buildHotel();
const mall = mallFixture.buildMall();

test('a preview has one panel per level a player can stand on', () => {
  assert.deepEqual(preview.floorsOf(hotel), [1, 2, 3, 4]);
  assert.deepEqual(preview.floorsOf(mall), [1, 2]);
  // Floor 0 is "between floors" — a stairwell, a moving cabin. It is not a level, so it is no panel.
  assert.equal(preview.createMapPreview(mall).some((panel) => panel.floor === 0), false);
});

test('every drawn wall lands inside the panel it belongs to', () => {
  for (const plan of [hotel, mall]) {
    for (const panel of preview.createMapPreview(plan, { width: 100, height: 100 })) {
      assert.ok(panel.walls.length > 0, `level ${panel.floor} drew no walls`);
      // The panel is trimmed to the building's own proportions, so it is the panel's own box a wall
      // has to sit inside — not the 100x100 the caller asked to fit within.
      assert.ok(panel.width <= 100.01 && panel.height <= 100.01, 'a panel grew past the size it was given');
      for (const wall of panel.walls) {
        assert.ok(wall.x >= -0.01 && wall.y >= -0.01, 'a wall is drawn off the top-left of the panel');
        assert.ok(wall.x + wall.w <= panel.width + 0.01, 'a wall runs off the right of the panel');
        assert.ok(wall.y + wall.h <= panel.height + 0.01, 'a wall runs off the bottom of the panel');
        assert.ok(wall.w > 0 && wall.h > 0, 'a wall with no size is invisible');
      }
    }
  }
});

test('the two buildings do not draw the same picture', () => {
  // The point of a preview is to tell them apart before entering one.
  const hotelPanel = preview.createFloorPreview(hotel, 1);
  const mallPanel = preview.createFloorPreview(mall, 1);
  assert.notEqual(hotelPanel.walls.length, mallPanel.walls.length);
});

test('the projection keeps a building its own shape', () => {
  // Cinder Mall is 96m across and 72m deep, so its drawing has to be wider than it is tall. One
  // scale for both axes is what protects that; two would square everything off.
  const panel = preview.createFloorPreview(mall, 1, { width: 100, height: 100 });
  assert.ok(panel.width > panel.height, 'a wide building must get a wide panel');
  const spread = (items, axis, size) => {
    const low = Math.min(...items.map((item) => item[axis]));
    const high = Math.max(...items.map((item) => item[axis] + item[size]));
    return high - low;
  };
  const across = spread(panel.walls, 'x', 'w');
  const deep = spread(panel.walls, 'y', 'h');
  assert.ok(across > deep, `the mall drew ${across} across by ${deep} deep, but it is a wide building`);
  assert.ok(Math.abs(across / deep - 96 / 72) < 0.15, 'the drawing is not in the building\'s proportions');
});

test('the rooms a map names are placed on the level they are on', () => {
  const panels = preview.createMapPreview(mall);
  const drawn = panels.flatMap((panel) => panel.rooms.map((room) => room.id));
  for (const room of mall.roomCenters) assert.ok(drawn.includes(room.roomNumber), `${room.roomNumber} is missing`);
  const ground = panels.find((panel) => panel.floor === 1);
  assert.equal(ground.rooms.some((room) => room.id === '201'), false, 'an upper store is drawn on the ground plan');
});

test('a plan with nothing in it draws an empty panel rather than throwing', () => {
  // The picker asks for a preview before it knows whether a map is buildable, so this has to be a
  // shrug rather than an exception inside a menu.
  const empty = preview.createFloorPreview({ boxes: [], roomCenters: [], surfaces: [] }, 1);
  assert.deepEqual(empty.walls, []);
  assert.deepEqual(empty.rooms, []);
});
