import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFarmGarage, selectFarmProperty, setDefaultFarmProperty, farmLoadoutFromGarage } from '../src/services/farm-loadout-catalog.mjs';
import { saveGarage } from '../src/db/game-loadouts.mjs';
import { getFarmLivestock } from '../src/db/farm-livestock.mjs';
import { nextPetId } from '../src/db/farm-economy.mjs';
import { readdirSync } from 'node:fs';
import { MIGRATION_FILES } from '../src/db/migrations.mjs';

test('every numbered SQL migration is registered for production startup', () => {
  const files = readdirSync(new URL('../src/db/migrations/', import.meta.url)).filter(name => /^\d+-.*\.sql$/.test(name)).sort();
  assert.deepEqual([...MIGRATION_FILES].sort(), files);
  assert.ok(MIGRATION_FILES.indexOf('060-farm-properties.sql') > MIGRATION_FILES.indexOf('059-farm-races.sql'));
});

const owned = new Set(['lot.smallholding', 'lot.estate']);
const now = 1_800_000_000_000;
const context = (farm) => ({ ownedEntitlementIds: owned, propertyRevision: farm.propertyRevision ?? 0, now, currentSavedAt: now - 60000 });
const base = (extra = {}) => normalizeFarmGarage({ version: 3, onboarding: { status: 'complete' },
  ground: 'ground.meadow', pets: [{ instanceId: 'corgi-1', speciesId: 'pet.corgi', name: 'Original' }],
  decor: [{ instanceId: 'plot-1', itemId: 'decor.plant.soil-patch', x: 1, z: 2, rotationY: 0 }],
  agriculture: { inventory: { seeds: { carrot: 2 }, produce: { carrot: 3 } }, crops: [{ plotId: 'plot-1', cellId: 'cell-0', cropId: 'carrot', growthMinutes: 5 }] },
  skills: { farming: { xp: 1000 } }, ...extra });

test('three farms keep independent contents while skill gains follow the player', () => {
  const meadow = base();
  let farm = selectFarmProperty(meadow, 'lot.smallholding', context(meadow));
  assert.equal(farm.lot, 'lot.smallholding');
  assert.deepEqual(farm.pets, []);
  assert.deepEqual(farm.agriculture.inventory.produce, {});
  assert.deepEqual(farm.properties.meadow.agriculture, meadow.agriculture);
  assert.equal(farm.onboarding.status, 'complete', 'a new property does not grant another starter dog');
  // Simulate server-earned contents and skill XP on the new farm.
  farm = normalizeFarmGarage({ ...farm, pets: [{ instanceId: 'duck-1', speciesId: 'pet.duck', name: 'Island' }], skills: { ...farm.skills, farming: { ...farm.skills.farming, xp: 1500 } } });
  const smallholding = farm;
  farm = selectFarmProperty(farm, 'lot.estate', context(farm));
  assert.deepEqual(farm.pets, []);
  farm = selectFarmProperty(farm, 'meadow', context(farm));
  assert.equal(farm.lot, undefined);
  assert.deepEqual(farm.agriculture, meadow.agriculture);
  assert.deepEqual(farm.pets, meadow.pets);
  assert.equal(farm.skills.farming.xp, 1500);
  assert.equal(farm.propertyRevision, 3);
  farm = selectFarmProperty(farm, 'lot.smallholding', context(farm));
  assert.deepEqual(farm.pets, smallholding.pets);
  assert.equal(farm.skills.farming.xp, 1500);
  for (const archived of Object.values(farm.properties)) assert.equal(archived.properties, undefined);
});

test('an upgraded legacy farm stays intact; returning to meadow creates a separate farm', () => {
  const legacy = base({ lot: 'lot.estate' });
  const meadow = selectFarmProperty(legacy, 'meadow', context(legacy));
  assert.deepEqual(meadow.pets, []);
  const restored = selectFarmProperty(meadow, 'lot.estate', context(meadow));
  assert.deepEqual(restored.pets, legacy.pets);
  assert.deepEqual(restored.decor, legacy.decor);
  assert.deepEqual(restored.agriculture, legacy.agriculture);
  assert.equal(restored.clock.verifiedAt, now - 60000, 'switching preserves the offline verification window');
});

test('legacy farms without onboarding metadata can switch; pet identities span every property', () => {
  const legacy = base({ onboarding: undefined, lot: 'lot.estate' });
  const meadow = selectFarmProperty(legacy, 'meadow', context(legacy));
  assert.equal(nextPetId(meadow, 'pet.corgi'), 'corgi-2');
  assert.equal(meadow.properties['lot.estate'].pets[0].name, 'Original');
});

test('ownership, selection generations, and inactive farms are server controlled', () => {
  const meadow = base();
  assert.throws(() => selectFarmProperty(meadow, 'lot.estate', { ...context(meadow), ownedEntitlementIds: new Set() }), /property_not_owned/);
  assert.throws(() => selectFarmProperty(meadow, '../anything', context(meadow)), /invalid_property/);
  assert.throws(() => selectFarmProperty(meadow, 'lot.estate', { ...context(meadow), propertyRevision: 100 }), /farm_property_changed/);
  const estate = selectFarmProperty(meadow, 'lot.estate', context(meadow));
  const submitted = { ...estate, properties: { meadow: base({ pets: [] }) } };
  const saved = normalizeFarmGarage(submitted, { currentGarage: estate, ownedEntitlementIds: owned, now });
  assert.deepEqual(saved.properties.meadow.pets, meadow.pets);
  assert.throws(() => normalizeFarmGarage(meadow, { currentGarage: estate }), /farm_property_changed/);
  const returned = selectFarmProperty(estate, 'meadow', context(estate));
  assert.throws(() => normalizeFarmGarage(meadow, { currentGarage: returned }), /farm_property_changed/, 'old tabs remain stale even after a round trip');
});

test('visiting an inactive property does not change the owner selection or expose other layouts', () => {
  const estate = selectFarmProperty(base(), 'lot.estate', context(base()));
  const visit = farmLoadoutFromGarage(estate, { propertyId: 'meadow' }).layout;
  assert.equal(visit.lot, undefined);
  assert.equal(visit.pets[0].name, 'Original');
  assert.deepEqual(visit.propertyIds, ['lot.estate', 'meadow']);
  assert.equal(visit.properties, undefined);
  assert.equal(estate.lot, 'lot.estate');
  assert.throws(() => farmLoadoutFromGarage(estate, { propertyId: 'lot.smallholding' }), /property_not_found/);
});

function memoryPool(initial, { trading = false } = {}) {
  let garage = initial;
  const calls = [];
  const db = { release() {}, async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes('from farm_trades')) return { rows: trading ? [{}] : [] };
    if (sql.includes('select garage, updated_at')) return { rows: [{ garage, updated_at: new Date(now) }] };
    if (sql.includes('select entitlement_id')) return { rows: [...owned].map(entitlement_id => ({ entitlement_id })) };
    if (sql.includes('insert into game_loadouts')) garage = JSON.parse(values[2]);
    return { rows: [] };
  } };
  return { connect: async () => db, calls, get garage() { return garage; } };
}

test('the garage endpoint selects atomically and rejects stale writes and trades', async () => {
  const pool = memoryPool(base());
  const select = await saveGarage(pool, { playerId: 'p1', gameSlug: 'farm', garage: { selectProperty: 'lot.estate', propertyRevision: 0 } });
  assert.equal(select.ok, true);
  assert.equal(pool.garage.properties.meadow.pets[0].name, 'Original');
  assert.ok(pool.calls.some(({ sql }) => sql === 'commit'));
  const stale = await saveGarage(pool, { playerId: 'p1', gameSlug: 'farm', garage: base() });
  assert.equal(stale.error, 'farm_property_changed');
  assert.equal(pool.garage.lot, 'lot.estate');
  assert.equal(pool.calls.at(-1).sql, 'rollback');
  const trading = memoryPool(base(), { trading: true });
  const refused = await saveGarage(trading, { playerId: 'p1', gameSlug: 'farm', garage: { selectProperty: 'lot.estate', propertyRevision: 0 } });
  assert.equal(refused.error, 'trade_in_progress');
  assert.equal(trading.garage.lot, undefined);
});

test('public herd reads are scoped to a named property', async () => {
  const calls = [];
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; } };
  await getFarmLivestock(pool, { playerId: 'p1', propertyId: 'lot.estate' });
  assert.deepEqual(calls[0].values, ['p1', 'lot.estate']);
  assert.match(calls[0].sql, /property_id = \$2/);
  await getFarmLivestock(pool, { playerId: 'p1' });
  assert.match(calls[1].sql, /property_id = coalesce/);
});

test('default property persists independently of selection and ordinary saves', async () => {
  const meadow = base();
  const preferred = setDefaultFarmProperty(meadow, 'lot.estate', context(meadow));
  assert.equal(preferred.lot, undefined);
  assert.equal(preferred.defaultProperty, 'lot.estate');
  const cedar = selectFarmProperty(preferred, 'lot.smallholding', context(preferred));
  assert.equal(cedar.defaultProperty, 'lot.estate');
  const saved = normalizeFarmGarage({ ...cedar, defaultProperty: 'meadow' }, { currentGarage: cedar, ownedEntitlementIds: owned });
  assert.equal(saved.defaultProperty, 'lot.estate', 'a stale ordinary save cannot undo the preference');
  assert.throws(() => setDefaultFarmProperty(meadow, 'lot.estate', { ...context(meadow), ownedEntitlementIds: new Set() }), /property_not_owned/);
  const pool = memoryPool(meadow);
  const result = await saveGarage(pool, { playerId: 'p1', gameSlug: 'farm', garage: { setDefaultProperty: 'lot.estate', propertyRevision: 0 } });
  assert.equal(result.ok, true);
  assert.equal(pool.garage.defaultProperty, 'lot.estate');
  assert.equal(pool.garage.propertyRevision, 0);
});

test('a save cannot introduce an unregistered regional crop', () => {
  const stored = base();
  const submitted = { ...stored, agriculture: { ...stored.agriculture, crops: [{ ...stored.agriculture.crops[0], cropId: 'unreleased-island-crop' }] } };
  const saved = normalizeFarmGarage(submitted, { currentGarage: stored, now, ownedEntitlementIds: owned });
  assert.deepEqual(saved.agriculture.crops, []);
  assert.deepEqual(stored.agriculture.crops.map(crop => crop.cropId), ['carrot']);
});
