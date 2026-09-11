import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    defaultGarage, normalizeGarage, serializeGarage, garagesEqual,
    applyShapePreset, applyMaterialPreset, applySurfacePreset, applyRailPreset, applyGoalPreset,
    matchingShapePresetId, matchingMaterialPresetId, LOADOUT_VERSION,
} from '../scripts/cosmetics/loadout.js';
import { MALLET_GEOMETRY_BOUNDS, TABLE_MARKING_BOUNDS, MALLET_SHAPE_BY_ID } from '../scripts/cosmetics/catalog.js';
import { DECALS } from '../scripts/cosmetics/decal-catalog.js';

test('the default garage is versioned and stable', () => {
    const first = defaultGarage(), second = defaultGarage();
    assert.equal(first.version, LOADOUT_VERSION);
    assert.deepEqual(first, second);
    assert.ok(garagesEqual(first, second));
});

test('junk normalizes to the default rather than throwing', () => {
    for (const junk of [null, undefined, 0, '', [], 'garage', { mallet: 7 }, { tableHalf: [] }]) {
        assert.deepEqual(normalizeGarage(junk), defaultGarage());
    }
});

test('geometry is clamped to visual bounds in both directions', () => {
    const high = normalizeGarage({ mallet: { geometry: { shoulderRadius: 9999, capHeight: 42 } } });
    assert.equal(high.mallet.geometry.shoulderRadius, MALLET_GEOMETRY_BOUNDS.shoulderRadius.max);
    assert.equal(high.mallet.geometry.capHeight, MALLET_GEOMETRY_BOUNDS.capHeight.max);
    const low = normalizeGarage({ mallet: { geometry: { shoulderRadius: -50, capHeight: 0 } } });
    assert.equal(low.mallet.geometry.shoulderRadius, MALLET_GEOMETRY_BOUNDS.shoulderRadius.min);
    assert.equal(low.mallet.geometry.capHeight, MALLET_GEOMETRY_BOUNDS.capHeight.min);
});

test('non-finite numbers fall back instead of poisoning the document', () => {
    const garage = normalizeGarage({ mallet: { geometry: { shoulderRadius: NaN, capLift: Infinity, capHeight: 'wide' } } });
    const defaults = MALLET_SHAPE_BY_ID.get('mallet.shape.classic').geometry;
    assert.equal(garage.mallet.geometry.shoulderRadius, defaults.shoulderRadius);
    assert.equal(garage.mallet.geometry.capHeight, defaults.capHeight);
    assert.ok(Number.isFinite(garage.mallet.geometry.capLift));
});

test('marking opacity has a floor so a goal mouth cannot be erased', () => {
    const garage = normalizeGarage({ tableHalf: { markings: { opacity: 0 } } });
    assert.equal(garage.tableHalf.markings.opacity, TABLE_MARKING_BOUNDS.opacity.min);
    assert.ok(garage.tableHalf.markings.opacity > 0);
});

test('unknown cosmetic ids fall back to the default rather than failing the document', () => {
    const garage = normalizeGarage({
        mallet: { shapePreset: 'mallet.shape.nope', material: { preset: '../../etc/passwd' }, hardware: { style: 42 } },
        tableHalf: { surface: { preset: 'table.surface.street-paint' }, rails: { preset: '' }, goal: { preset: null } },
    });
    assert.equal(garage.mallet.shapePreset, 'mallet.shape.classic');
    assert.equal(garage.mallet.material.preset, 'mallet.material.anodized');
    assert.equal(garage.mallet.hardware.style, 'mallet.hardware.halo');
    assert.equal(garage.tableHalf.surface.preset, 'table.surface.factory-graphite');
});

test('the removed prototype surfaces are not in the catalog', () => {
    for (const banned of ['table.surface.street-paint', 'table.surface.black-ice']) {
        assert.equal(normalizeGarage({ tableHalf: { surface: { preset: banned } } }).tableHalf.surface.preset,
            'table.surface.factory-graphite');
    }
});

test('colors accept short hex and reject anything else', () => {
    const garage = normalizeGarage({ mallet: { colors: { primary: '#ABC', accent: 'red', hardware: 'javascript:alert(1)' } } });
    assert.equal(garage.mallet.colors.primary, '#aabbcc');
    assert.equal(garage.mallet.colors.accent, '#d8dde2');
    assert.equal(garage.mallet.colors.hardware, '#8f9aa4');
});

test('a builtin decal survives and an unknown one degrades to none', () => {
    const good = normalizeGarage({ mallet: { decal: { type: 'builtin', id: DECALS[3].id, scale: 1.4 } } });
    assert.equal(good.mallet.decal.type, 'builtin');
    assert.equal(good.mallet.decal.id, DECALS[3].id);
    assert.equal(good.mallet.decal.scale, 1.4);

    const gone = normalizeGarage({ mallet: { decal: { type: 'builtin', id: 'decal.retired' } } });
    assert.equal(gone.mallet.decal.type, 'none');
    assert.equal(gone.mallet.decal.id, '');
});

test('a custom decal needs both a minted asset id and an https url', () => {
    const ok = normalizeGarage({ mallet: { decal: { type: 'custom', customAssetId: 'abc_123', customAssetUrl: 'https://cdn.example/x.png' } } });
    assert.equal(ok.mallet.decal.type, 'custom');

    for (const bad of [
        { type: 'custom', customAssetId: 'abc', customAssetUrl: 'http://cdn.example/x.png' },
        { type: 'custom', customAssetId: 'abc', customAssetUrl: 'data:image/png;base64,AAAA' },
        { type: 'custom', customAssetId: '', customAssetUrl: 'https://cdn.example/x.png' },
        { type: 'custom', customAssetUrl: 'https://cdn.example/x.png' },
    ]) {
        assert.equal(normalizeGarage({ mallet: { decal: bad } }).mallet.decal.type, 'none', JSON.stringify(bad));
    }
});

test('no data URI can ever reach a stored document', () => {
    const garage = normalizeGarage({ mallet: { decal: { type: 'custom', customAssetId: 'a', customAssetUrl: `data:image/png;base64,${'A'.repeat(4000)}` } } });
    assert.ok(!JSON.stringify(garage).includes('data:'));
});

test('presets seed parameters and the editor derives CUSTOM from the numbers', () => {
    const heavy = applyShapePreset(defaultGarage(), 'mallet.shape.heavy');
    assert.equal(matchingShapePresetId(heavy.mallet.geometry), 'mallet.shape.heavy');

    heavy.mallet.geometry.capHeight += 0.05;
    assert.equal(matchingShapePresetId(normalizeGarage(heavy).mallet.geometry), null);

    heavy.mallet.geometry.capHeight -= 0.05;
    assert.equal(matchingShapePresetId(normalizeGarage(heavy).mallet.geometry), 'mallet.shape.heavy');
});

test('a crownless preset is still recognised however the unused crown numbers sit', () => {
    const razor = applyShapePreset(defaultGarage(), 'mallet.shape.razor');
    razor.mallet.geometry.crownHeight = 0.27;
    assert.equal(matchingShapePresetId(normalizeGarage(razor).mallet.geometry), 'mallet.shape.razor');
});

test('material, surface, rail and goal presets each seed only their own section', () => {
    const base = defaultGarage();
    const material = applyMaterialPreset(base, 'mallet.material.chrome');
    assert.equal(matchingMaterialPresetId(material.mallet.material), 'mallet.material.chrome');
    assert.deepEqual(material.tableHalf, base.tableHalf);

    const surface = applySurfacePreset(base, 'table.surface.blueprint');
    assert.equal(surface.tableHalf.surface.preset, 'table.surface.blueprint');
    assert.deepEqual(surface.mallet, base.mallet);
    assert.deepEqual(surface.tableHalf.rails, base.tableHalf.rails);

    const rails = applyRailPreset(base, 'table.rail.championship-gold');
    assert.equal(rails.tableHalf.rails.topColor, '#c9a24a');
    assert.deepEqual(rails.tableHalf.surface, base.tableHalf.surface);

    const goal = applyGoalPreset(base, 'table.goal.halo');
    assert.equal(goal.tableHalf.goal.preset, 'table.goal.halo');
    assert.deepEqual(goal.tableHalf.rails, base.tableHalf.rails);
});

test('an unknown preset id leaves the garage alone', () => {
    const base = defaultGarage();
    assert.deepEqual(applyShapePreset(base, 'nope'), base);
    assert.deepEqual(applySurfacePreset(base, 'nope'), base);
});

test('serialize is normalize: an edited document cannot leave malformed', () => {
    const wild = { version: 99, mallet: { geometry: { shoulderRadius: 1e9 } }, extra: 'dropped' };
    const wire = serializeGarage(wild);
    assert.equal(wire.version, LOADOUT_VERSION);
    assert.equal(wire.extra, undefined);
    assert.deepEqual(wire, normalizeGarage(wire));
});
