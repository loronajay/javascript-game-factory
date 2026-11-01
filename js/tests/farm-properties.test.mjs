import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFarmLayout, farmLotBounds } from '../farm-layout.mjs';
import { normalizeFarmGarage, selectFarmProperty } from '../../platform-api/src/services/farm-loadout-catalog.mjs';
import { createLayoutStore } from '../arcade-room-store.mjs';
import { FARM_LAYOUT_SPEC } from '../farm-layout.mjs';
import { horseTravelQuery } from '../farm-riding-travel.mjs';

test('fresh independent properties have expanded boundaries, entrances and empty paid inventory', () => {
  const original = normalizeFarmGarage({ version: 3, onboarding: { status: 'complete' }, pets: [{ instanceId: 'corgi-1', speciesId: 'pet.corgi', name: 'Original' }] });
  for (const [id, size] of [['lot.smallholding', 40], ['lot.estate', 56]]) {
    const selected = selectFarmProperty(original, id, { ownedEntitlementIds: new Set([id]), propertyRevision: 0, now: Date.now() });
    const client = normalizeFarmLayout(selected);
    assert.equal(farmLotBounds(client).width, size);
    assert.ok(client.decor.find(row => row.instanceId === 'gate-1').z > size / 2 - 1);
    assert.ok(client.decor.some(row => row.instanceId === 'property-gate-east'));
    if (size === 56) assert.ok(client.decor.some(row => row.instanceId === 'property-gate-downs'));
    assert.deepEqual(client.pets, []);
    assert.ok(Object.values(client.agriculture.inventory.seeds).every(count => count === 0));
    assert.equal(client.onboarding.status, 'complete');
    assert.equal(client.propertyRevision, 1);
    assert.equal(client.properties, undefined, 'the editor holds only the farm being edited');
    assert.deepEqual(normalizeFarmLayout(client), client);
  }
});

test('the store requests a specific visited farm and cannot save it', async () => {
  const calls = [];
  const store = createLayoutStore(FARM_LAYOUT_SPEC, { visitPlayerId: 'friend', propertyId: 'lot.estate',
    session: { authenticated: true, playerId: 'self' }, storage: null,
    api: { fetchGamePublicLoadout: async (...args) => { calls.push(args); return { layout: { version: 3, lot: 'lot.estate', propertyIds: ['meadow', 'lot.estate'] } }; },
      loadPlayerProfile: async () => ({ profileName: 'Friend' }), fetchGameGarage: async () => null, saveGameGarage: async () => { throw Error('visitor write'); } } });
  const loaded = await store.load();
  assert.deepEqual(calls, [['farm', 'friend', 'lot.estate']]);
  assert.deepEqual(loaded.layout.propertyIds, ['meadow', 'lot.estate']);
  assert.equal((await store.save(loaded.layout)).error, 'read_only');
});

test('travel preserves a visited property without granting it to the acting player', () => {
  const query = new URLSearchParams(horseTravelQuery('friend', '', 'id', 'lot.estate'));
  assert.equal(query.get('id'), 'friend');
  assert.equal(query.get('property'), 'lot.estate');
  assert.equal(horseTravelQuery('', '', 'id', 'lot.estate'), '', 'own-property switching stays server controlled');
});
