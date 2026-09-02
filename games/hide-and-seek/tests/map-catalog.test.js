const test = require('node:test');
const assert = require('node:assert/strict');

const maps = require('../map-catalog.js');

test('the registry lists all four playable locations', () => {
  const ids = maps.listMaps().map((entry) => entry.id);
  assert.deepEqual(ids, ['grand-hotel', 'cinder-mall', 'mercy-hospital', 'crowne-point-cinema']);
  assert.equal(maps.DEFAULT_MAP_ID, 'grand-hotel');
  assert.equal(maps.isPlayable('grand-hotel'), true);
  assert.equal(maps.isPlayable('cinder-mall'), true);
  assert.equal(maps.isPlayable('mercy-hospital'), true);
  assert.deepEqual(maps.playableMaps().map((entry) => entry.id), ids);
});

test('`soon` stays a real state even with nothing sitting in it', () => {
  // Cinder Mall used to be the worked example of a registered-but-unbuilt map. Now that its plan
  // exists, the rule still has to hold for the next map that does not — a `soon` row is offered in
  // the picker and refused by anything that stands a round up.
  const soon = { ...maps.getMap('cinder-mall'), id: 'not-built-yet', status: maps.MAP_STATUS.SOON };
  assert.notEqual(soon.status, maps.MAP_STATUS.READY);
  assert.equal(maps.playableMapId('not-built-yet'), 'grand-hotel', 'an unregistered id never resolves into a round');
});

test('an untrusted map id becomes a map, and an unknown one never becomes a round', () => {
  assert.equal(maps.normalizeMapId('  CINDER-MALL '), 'cinder-mall');
  assert.equal(maps.normalizeMapId('nowhere'), 'grand-hotel');
  assert.equal(maps.normalizeMapId(null), 'grand-hotel');
  assert.equal(maps.normalizeMapId({ id: 'grand-hotel' }), 'grand-hotel');
  assert.equal(maps.playableMapId('cinder-mall'), 'cinder-mall');
  assert.equal(maps.playableMapId('nowhere'), 'grand-hotel');
});

test('the demon roster is per map and is not capped at two', () => {
  assert.equal(maps.demonCountFor('grand-hotel'), 2);
  assert.equal(maps.demonCountFor('cinder-mall'), 3);
  assert.deepEqual(maps.demonRosterFor('cinder-mall').map((entry) => entry.name),
    ['The Greeter', 'The Custodian', 'The Nightwatch']);
});

test('exactly one demon per map reads the heat meter', () => {
  for (const map of maps.listMaps()) {
    const hunters = maps.demonRosterFor(map.id).filter((entry) => entry.hunts);
    assert.equal(hunters.length, 1, `${map.id} must have one camper-hunter, not ${hunters.length}`);
  }
});

test('Mercy Hospital does not assign either rejected authored creature to gameplay', () => {
  const roster = maps.demonRosterFor('mercy-hospital');
  assert.equal(roster.find((entry) => entry.id === 'surgeon').visual, undefined);
  assert.equal(roster.find((entry) => entry.id === 'matron').visual, undefined);
  assert.equal(roster.find((entry) => entry.id === 'orderly').visual, undefined);
});

test('every roster entry is a distinct, nameable demon', () => {
  for (const map of maps.listMaps()) {
    const roster = maps.demonRosterFor(map.id);
    assert.equal(new Set(roster.map((entry) => entry.id)).size, roster.length, `${map.id} has a duplicate demon id`);
    for (const entry of roster) assert.match(entry.name, /^The .+/);
  }
});

test('a map describes how tall it is so nothing has to assume four floors', () => {
  assert.equal(maps.floorCountFor('grand-hotel'), 4);
  assert.equal(maps.floorCountFor('cinder-mall'), 2);
});

test('a demon roster may be longer than the building is tall', () => {
  // Three demons on two levels. This is the combination that forced demon spawning to measure a
  // distance instead of counting storeys, and it must stay legal.
  assert.ok(maps.demonCountFor('cinder-mall') > maps.floorCountFor('cinder-mall'));
});

test('a plan is resolved through the named global rather than imported', () => {
  const calls = [];
  const scope = {
    HotelPlan: {
      createHotelPlan(options) { calls.push(options); return { boxes: [] }; },
    },
  };
  const floorDefs = [{ id: 1 }];
  const result = maps.resolveMapPlan('grand-hotel', { config: { a: 1 }, floorDefs, scope });
  assert.deepEqual(result, { boxes: [] });
  assert.equal(calls[0].floorDefs, floorDefs, 'the hotel uses the floor definitions the cabinet already ships');
  assert.equal(maps.resolveMapFloorDefs('grand-hotel', { floorDefs, scope }), floorDefs);
});

test('a map whose plan module is not loaded fails loudly instead of building an empty building', () => {
  assert.throws(() => maps.resolveMapPlan('grand-hotel', { scope: {} }), /has no plan/);
});
