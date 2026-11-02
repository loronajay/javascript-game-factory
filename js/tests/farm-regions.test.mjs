import test from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../farm-regions.mjs';
import * as server from '../../platform-api/src/services/farm-region-catalog.mjs';
import { CROP_CATALOG } from '../farm-crops.mjs';
import { FARM_CROP_RULES } from '../../platform-api/src/services/farm-crop-catalog.mjs';

test('world identities and crop restrictions agree across the browser and API', () => {
  assert.deepEqual(client.FARM_REGIONS, server.FARM_REGIONS);
  assert.deepEqual(client.FARM_PROPERTY_REGIONS, server.FARM_PROPERTY_REGIONS);
  for (const crop of CROP_CATALOG) assert.deepEqual(crop.regions, FARM_CROP_RULES[crop.id].regions);
  for (const rules of [undefined, ['orchard-isle'], ['mainland'], []]) for (const region of ['mainland', 'orchard-isle', 'unknown']) {
    const rule = { regions: rules };
    assert.equal(client.cropCanGrowInRegion(rule, region), server.cropCanGrowInRegion(rule, region));
  }
  assert.equal(server.cropCanGrowInRegion({ regions: ['orchard-isle'] }, 'mainland'), false);
  assert.equal(server.cropCanGrowInRegion({ regions: ['orchard-isle'] }, 'orchard-isle'), true);
  assert.equal(server.cropCanGrowInRegion({}, 'unknown'), false);
  assert.equal(server.cropCanGrowInRegion(null, 'mainland'), false);
});
test('existing farms stay on the mainland and the island has its own property and crops', () => {
  for (const property of [undefined, 'meadow', 'lot.smallholding', 'lot.estate', 'untrusted']) assert.equal(client.farmRegionForProperty(property), 'mainland');
  assert.equal(client.findFarmRegion('orchard-isle').available, true);
  assert.equal(client.farmRegionForProperty('lot.orchard'), 'orchard-isle');
  for (const crop of CROP_CATALOG) assert.equal(client.cropCanGrowInRegion(crop, 'mainland'), !['pepper', 'lavender'].includes(crop.id));
});
