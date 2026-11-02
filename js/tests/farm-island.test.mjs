import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectFarmProperty, setDefaultFarmProperty, normalizeFarmGarage, farmLoadoutFromGarage } from '../../platform-api/src/services/farm-loadout-catalog.mjs';
import { farmMarketBoard, farmMarketSeedPrice } from '../../platform-api/src/services/farm-market-day.mjs';
import { farmCropRule } from '../../platform-api/src/services/farm-crop-catalog.mjs';
import { findFarmSupply } from '../../platform-api/src/services/farm-economy-catalog.mjs';
import { purchaseFarmSupply } from '../../platform-api/src/db/farm-economy.mjs';
import { getFarmListings, buyFarmListing, withdrawFarmListing } from '../../platform-api/src/db/farm-listings.mjs';
import { getFarmResidents } from '../../platform-api/src/db/farm-residents.mjs';
import { createDefaultFarmLayout } from '../farm-layout.mjs';
import { plantFarmCrop, createStarterAgriculture, CROP_CATALOG } from '../farm-crops.mjs';
import { regionalMarketLayout, regionalMarketStalls } from '../farm-regional-market.mjs';
import { farmRegionForProperty } from '../farm-regions.mjs';
import { publicRegionUrl, islandPlaceInReach } from '../farm-island.mjs';
import { propertyRoutes } from '../farm-property-scene.mjs';

const owned = new Set(['lot.orchard', 'lot.estate']);
const context = farm => ({ ownedEntitlementIds: owned, propertyRevision: farm.propertyRevision, now: Date.now() });
test('island home is independent, owned, defaultable and visitable while the owner lives elsewhere', () => {
  const original = normalizeFarmGarage({ ...createDefaultFarmLayout(() => .5), onboarding: { status: 'complete' } });
  const island = selectFarmProperty(original, 'lot.orchard', context(original));
  assert.equal(island.lot, 'lot.orchard');
  assert.deepEqual(island.pets, []);
  assert.equal(island.agriculture.crops.length, 0);
  assert.deepEqual(island.properties.meadow.pets, original.pets);
  const preferred = setDefaultFarmProperty(island, 'lot.orchard', context(island));
  const home = selectFarmProperty(preferred, 'meadow', context(preferred));
  assert.equal(home.defaultProperty, 'lot.orchard');
  assert.deepEqual(home.pets, original.pets);
  assert.deepEqual(home.agriculture, original.agriculture);
  assert.equal(farmLoadoutFromGarage(home, { propertyId: 'lot.orchard' }).layout.lot, 'lot.orchard');
  assert.throws(() => selectFarmProperty(original, 'lot.orchard', { ...context(original), ownedEntitlementIds: new Set() }), /property_not_owned/);
  assert.equal(propertyRoutes({ lot: 'lot.orchard' })[0].target, 'orchard-harbor');
  assert.equal(farmRegionForProperty('lot.orchard'), 'orchard-isle');
});
test('island seeds never replace mainland starter seeds and every new crop model has finite geometry', () => {
  const starter = createStarterAgriculture(() => .999999);
  assert.equal(starter.inventory.seeds.pepper, 0);
  assert.equal(starter.inventory.seeds.lavender, 0);
  for (const id of ['pepper', 'lavender']) {
    const crop = CROP_CATALOG.find(crop => crop.id === id);
    assert.equal(findFarmSupply('seed.' + id).price, crop.seedPrice);
    assert.equal(farmCropRule(id).growMinutes, crop.growMinutes);
    for (const file of crop.models) {
      const buffer = readFileSync(new URL('../../farm/assets/crops/' + file, import.meta.url));
      const jsonLength = buffer.readUInt32LE(12), gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength));
      for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION], view = gltf.bufferViews[accessor.bufferView];
        const start = 28 + jsonLength + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        for (let i = 0; i < accessor.count * 3; i++) assert.ok(Number.isFinite(buffer.readFloatLE(start + i * 4)), file);
      }
    }
  }
});
test('island specialties plant on the island and are rejected on mainland soil by both client and server', () => {
  const layout = createDefaultFarmLayout(() => .5);
  const plot = layout.decor.find(row => row.itemId === 'decor.plant.soil-patch');
  const agriculture = { ...layout.agriculture, inventory: { ...layout.agriculture.inventory, seeds: { pepper: 2 } } };
  assert.equal(plantFarmCrop(agriculture, plot.instanceId, 'cell-0', 'pepper', 480, 30, 'mainland').reason, 'wrong_region');
  const planted = plantFarmCrop(agriculture, plot.instanceId, 'cell-0', 'pepper', 480, 30, 'orchard-isle');
  assert.equal(planted.ok, true); assert.equal(planted.agriculture.inventory.seeds.pepper, 1);
  const stored = normalizeFarmGarage({ ...layout, onboarding: { status: 'complete' }, agriculture });
  const submitted = { ...stored, agriculture: planted.agriculture };
  const verifiedMainland = normalizeFarmGarage(submitted, { currentGarage: stored, ownedEntitlementIds: owned, now: Date.now() });
  assert.equal(verifiedMainland.agriculture.crops.length, 0);
  const storedIsland = normalizeFarmGarage({ ...stored, lot: 'lot.orchard', agriculture }, { ownedEntitlementIds: owned });
  const verifiedIsland = normalizeFarmGarage({ ...storedIsland, agriculture: planted.agriculture }, { currentGarage: storedIsland, ownedEntitlementIds: owned, now: Date.now() });
  assert.equal(verifiedIsland.agriculture.crops[0].cropId, 'pepper');
});
test('buying and withdrawing island escrow into a mainland farm is rejected before goods or money move', async () => {
  const now = Date.now(), calls = [];
  const listing = { listing_id: 'listing-12345678', seller_id: 'seller', seller_name: 'Seller', stack: 'produce', item_id: 'carrot', quantity: 2, listed_quantity: 2, unit_price: 11, status: 'open', created_at: new Date(now), expires_at: new Date(now + 60000), region_id: 'orchard-isle' };
  const client = { release() {}, async query(sql) {
    calls.push(sql);
    if (sql.includes('from farm_market_listings')) return { rows: [listing] };
    if (sql.includes('select garage')) return { rows: [{ garage: { ...createDefaultFarmLayout(() => .5), onboarding: { status: 'complete' } } }] };
    if (sql.includes('select entitlement_id')) return { rows: [{ entitlement_id: 'lot.orchard' }] };
    return { rows: [] };
  } };
  const pool = { connect: async () => client };
  const buy = await buyFarmListing(pool, { playerId: 'buyer', listingId: listing.listing_id, quantity: 1, purchaseId: 'island-buy' }, now);
  assert.equal(buy.error, 'wrong_market_region');
  const withdrawal = await withdrawFarmListing(pool, { playerId: 'seller', listingId: listing.listing_id }, now);
  assert.equal(withdrawal.error, 'wrong_market_region');
  assert.ok(!calls.some(sql => /(?:update ticket_wallets|insert into ticket_transactions|update game_loadouts|update farm_market_listings)/.test(sql)));
});
test('server refuses island seed purchases into a mainland farm before any wallet mutation', async () => {
  const calls = [];
  const client = { release() {}, async query(sql) {
    calls.push(sql);
    if (sql.includes('select garage')) return { rows: [{ garage: { ...createDefaultFarmLayout(() => .5), onboarding: { status: 'complete' } } }] };
    if (sql.includes('select entitlement_id')) return { rows: [{ entitlement_id: 'lot.orchard' }] };
    return { rows: [] };
  }};
  const result = await purchaseFarmSupply({ connect: async () => client }, { playerId: 'owner', purchaseId: 'island-seed-check', itemId: 'seed.pepper', quantity: 1 });
  assert.equal(result.error, 'wrong_crop_region');
  assert.ok(!calls.some(sql => sql.includes('update ticket_wallets')));
});
test('each island market has local people, scenery and region-scoped exchange queries', async () => {
  const island = regionalMarketStalls(true), mainland = regionalMarketStalls(false);
  assert.notEqual(island[0].keeper.name, mainland[0].keeper.name);
  assert.match(island.find(stall => stall.id === 'seeds').keeper.greeting, /lavender/);
  assert.ok(regionalMarketLayout(true).decor.some(row => row.itemId === 'decor.plant.apple'));
  assert.ok(!regionalMarketLayout(true).decor.some(row => row.instanceId === 'market-gate-downs' && row.itemId === 'decor.fence.gate'));
  const calls = [];
  await getFarmListings({ query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } }, { playerId: 'p', region: 'orchard-isle' });
  for (const query of calls.filter(call => call.sql.startsWith('select * from farm_market_listings'))) {
    assert.match(query.sql, /region_id =/); assert.ok(query.values.includes('orchard-isle'));
  }
});
test('regional seed specials only offer growable crops and use the same authoritative purchase price', () => {
  for (let day = 0; day < 100; day++) for (const region of ['mainland', 'orchard-isle']) {
    const board = farmMarketBoard(day, region);
    assert.equal(Object.keys(board.seedSpecials).length, 3);
    for (const [id, price] of Object.entries(board.seedSpecials)) {
      assert.equal(price, farmMarketSeedPrice(id, day, region));
      assert.ok(!farmCropRule(id).regions || farmCropRule(id).regions.includes(region));
    }
  }
});
test('resident register returns only public island identities and paginates without exposing saves', async () => {
  const result = await getFarmResidents({ query: async (sql, args) => {
    assert.match(sql, /entitlement_id = 'lot.orchard'/); assert.deepEqual(args, ['']);
    return { rows: Array.from({ length: 51 }, (_, i) => ({ player_id: 'p' + i, name: 'Neighbor ' + i, garage: { private: true } })) };
  } }, { region: 'orchard-isle' });
  assert.equal(result.residents.length, 50); assert.equal(result.next, 'p49');
  assert.deepEqual(Object.keys(result.residents[0]), ['playerId', 'name', 'propertyId']);
  assert.equal(islandPlaceInReach({ x: 24, z: 39 }), 'farm');
  const url = new URL(publicRegionUrl('harbor', 'orchard-isle', new URLSearchParams('from=ferry&at=dock')), 'https://game.test/farm/harbor/');
  assert.equal(url.searchParams.get('at'), 'dock'); assert.equal(url.searchParams.get('region'), 'orchard-isle');
});
