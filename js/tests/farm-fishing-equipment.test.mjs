import test from 'node:test';
import assert from 'node:assert/strict';
import { createFishingEquipmentStore } from '../farm-fishing-equipment.mjs';
import { FISHING_RODS, FISHING_LURES, STARTER_ROD_ID, WORM_ID } from '../farm-catalog/fish.mjs';

test('equipment survives leaving and returning, across destinations, per farmer', () => {
  const entries = new Map();
  const storage = () => ({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  const gear = { rodId: FISHING_RODS.at(-1).id, baitId: FISHING_LURES.at(-1).id };
  createFishingEquipmentStore('farmer-a', storage).save(gear);
  assert.deepEqual(createFishingEquipmentStore('farmer-a', storage).load(), gear);
  assert.deepEqual(createFishingEquipmentStore('farmer-b', storage).load(), { rodId: STARTER_ROD_ID, baitId: WORM_ID });
  // Deliberately choosing starter tackle must also stick.
  const starter = { rodId: STARTER_ROD_ID, baitId: WORM_ID };
  createFishingEquipmentStore('farmer-a', storage).save(starter);
  assert.deepEqual(createFishingEquipmentStore('farmer-a', storage).load(), starter);
});

test('invalid or unavailable storage does not prevent fishing', () => {
  for (const value of ['broken json', '{"rodId":"bad","baitId":"bad"}']) {
    const store = createFishingEquipmentStore('farmer', () => ({ getItem: () => value, setItem() {} }));
    assert.deepEqual(store.load(), { rodId: STARTER_ROD_ID, baitId: WORM_ID });
  }
  const store = createFishingEquipmentStore('farmer', () => { throw new Error('storage blocked'); });
  assert.deepEqual(store.load(), { rodId: STARTER_ROD_ID, baitId: WORM_ID });
  assert.doesNotThrow(() => store.save({ rodId: STARTER_ROD_ID, baitId: WORM_ID }));
});
