import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    defaultGarage, normalizeGarage, serializeGarage, garagesEqual,
    applyShapePreset, applyMaterialPreset, applySurfacePreset, applyRailPreset, applyGoalPreset,
    matchingShapePresetId, matchingMaterialPresetId, LOADOUT_VERSION,
    equippedLoadout, defaultLoadout, addLoadout, removeLoadout, renameLoadout, selectLoadout,
    replaceLoadout, MAX_LOADOUTS, LOADOUT_NAME_LIMIT,
} from '../scripts/cosmetics/loadout.js';

/**
 * The design a document normalizes to.
 *
 * Every parameter rule below is a rule about ONE LOADOUT, so these tests go
 * through the equipped slot rather than reaching into the list — the same way
 * the renderer and the public route do.
 */
const design = (input) => equippedLoadout(normalizeGarage(input));
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
    const high = design({ mallet: { geometry: { shoulderRadius: 9999, capHeight: 42 } } });
    assert.equal(high.mallet.geometry.shoulderRadius, MALLET_GEOMETRY_BOUNDS.shoulderRadius.max);
    assert.equal(high.mallet.geometry.capHeight, MALLET_GEOMETRY_BOUNDS.capHeight.max);
    const low = design({ mallet: { geometry: { shoulderRadius: -50, capHeight: 0 } } });
    assert.equal(low.mallet.geometry.shoulderRadius, MALLET_GEOMETRY_BOUNDS.shoulderRadius.min);
    assert.equal(low.mallet.geometry.capHeight, MALLET_GEOMETRY_BOUNDS.capHeight.min);
});

test('non-finite numbers fall back instead of poisoning the document', () => {
    const garage = design({ mallet: { geometry: { shoulderRadius: NaN, capLift: Infinity, capHeight: 'wide' } } });
    const defaults = MALLET_SHAPE_BY_ID.get('mallet.shape.classic').geometry;
    assert.equal(garage.mallet.geometry.shoulderRadius, defaults.shoulderRadius);
    assert.equal(garage.mallet.geometry.capHeight, defaults.capHeight);
    assert.ok(Number.isFinite(garage.mallet.geometry.capLift));
});

test('marking opacity has a floor so a goal mouth cannot be erased', () => {
    const garage = design({ tableHalf: { markings: { opacity: 0 } } });
    assert.equal(garage.tableHalf.markings.opacity, TABLE_MARKING_BOUNDS.opacity.min);
    assert.ok(garage.tableHalf.markings.opacity > 0);
});

test('unknown cosmetic ids fall back to the default rather than failing the document', () => {
    const garage = design({
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
        assert.equal(design({ tableHalf: { surface: { preset: banned } } }).tableHalf.surface.preset,
            'table.surface.factory-graphite');
    }
});

test('colors accept short hex and reject anything else', () => {
    const garage = design({ mallet: { colors: { primary: '#ABC', accent: 'red', hardware: 'javascript:alert(1)' } } });
    assert.equal(garage.mallet.colors.primary, '#aabbcc');
    assert.equal(garage.mallet.colors.accent, '#d8dde2');
    assert.equal(garage.mallet.colors.hardware, '#8f9aa4');
});

test('a builtin decal survives and an unknown one degrades to none', () => {
    const good = design({ mallet: { decal: { type: 'builtin', id: DECALS[3].id, scale: 1.4 } } });
    assert.equal(good.mallet.decal.type, 'builtin');
    assert.equal(good.mallet.decal.id, DECALS[3].id);
    assert.equal(good.mallet.decal.scale, 1.4);

    const gone = design({ mallet: { decal: { type: 'builtin', id: 'decal.retired' } } });
    assert.equal(gone.mallet.decal.type, 'none');
    assert.equal(gone.mallet.decal.id, '');
});

test('a custom decal needs both a minted asset id and an https url', () => {
    const ok = design({ mallet: { decal: { type: 'custom', customAssetId: 'abc_123', customAssetUrl: 'https://cdn.example/x.png' } } });
    assert.equal(ok.mallet.decal.type, 'custom');

    for (const bad of [
        { type: 'custom', customAssetId: 'abc', customAssetUrl: 'http://cdn.example/x.png' },
        { type: 'custom', customAssetId: 'abc', customAssetUrl: 'data:image/png;base64,AAAA' },
        { type: 'custom', customAssetId: '', customAssetUrl: 'https://cdn.example/x.png' },
        { type: 'custom', customAssetUrl: 'https://cdn.example/x.png' },
    ]) {
        assert.equal(design({ mallet: { decal: bad } }).mallet.decal.type, 'none', JSON.stringify(bad));
    }
});

test('no data URI can ever reach a stored document', () => {
    const garage = normalizeGarage({ mallet: { decal: { type: 'custom', customAssetId: 'a', customAssetUrl: `data:image/png;base64,${'A'.repeat(4000)}` } } });
    assert.ok(!JSON.stringify(garage).includes('data:'));
});

test('presets seed parameters and the editor derives CUSTOM from the numbers', () => {
    const heavy = applyShapePreset(defaultGarage(), 'mallet.shape.heavy');
    assert.equal(matchingShapePresetId(equippedLoadout(heavy).mallet.geometry), 'mallet.shape.heavy');

    heavy.loadouts[0].mallet.geometry.capHeight += 0.05;
    assert.equal(matchingShapePresetId(design(heavy).mallet.geometry), null);

    heavy.loadouts[0].mallet.geometry.capHeight -= 0.05;
    assert.equal(matchingShapePresetId(design(heavy).mallet.geometry), 'mallet.shape.heavy');
});

test('a crownless preset is still recognised however the unused crown numbers sit', () => {
    const razor = applyShapePreset(defaultGarage(), 'mallet.shape.razor');
    razor.loadouts[0].mallet.geometry.crownHeight = 0.27;
    assert.equal(matchingShapePresetId(design(razor).mallet.geometry), 'mallet.shape.razor');
});

test('material, surface, rail and goal presets each seed only their own section', () => {
    const base = defaultGarage(), factory = equippedLoadout(base);
    const material = equippedLoadout(applyMaterialPreset(base, 'mallet.material.chrome'));
    assert.equal(matchingMaterialPresetId(material.mallet.material), 'mallet.material.chrome');
    assert.deepEqual(material.tableHalf, factory.tableHalf);

    const surface = equippedLoadout(applySurfacePreset(base, 'table.surface.blueprint'));
    assert.equal(surface.tableHalf.surface.preset, 'table.surface.blueprint');
    assert.deepEqual(surface.mallet, factory.mallet);
    assert.deepEqual(surface.tableHalf.rails, factory.tableHalf.rails);

    const rails = equippedLoadout(applyRailPreset(base, 'table.rail.championship-gold'));
    assert.equal(rails.tableHalf.rails.topColor, '#c9a24a');
    assert.deepEqual(rails.tableHalf.surface, factory.tableHalf.surface);

    const goal = equippedLoadout(applyGoalPreset(base, 'table.goal.halo'));
    assert.equal(goal.tableHalf.goal.preset, 'table.goal.halo');
    assert.deepEqual(goal.tableHalf.rails, factory.tableHalf.rails);
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

// ---------------------------------------------------------------------------
// SLOTS
// ---------------------------------------------------------------------------

test('the factory garage is one named, equipped loadout', () => {
    const garage = defaultGarage();
    assert.equal(garage.loadouts.length, 1);
    assert.equal(garage.equippedId, garage.loadouts[0].id);
    assert.equal(garage.loadouts[0].name, 'Loadout 1');
    assert.deepEqual(equippedLoadout(garage), garage.loadouts[0]);
});

test('a version-1 document migrates into slot one with its design intact', () => {
    // Exactly what a row saved before loadouts existed looks like.
    const legacy = { version: 1, mallet: { shapePreset: 'mallet.shape.champion' }, tableHalf: { goal: { preset: 'table.goal.halo' } } };
    const migrated = normalizeGarage(legacy);
    assert.equal(migrated.version, LOADOUT_VERSION);
    assert.equal(migrated.loadouts.length, 1);
    assert.equal(migrated.loadouts[0].mallet.shapePreset, 'mallet.shape.champion');
    assert.equal(migrated.loadouts[0].tableHalf.goal.preset, 'table.goal.halo');
    assert.equal(migrated.equippedId, migrated.loadouts[0].id);
});

test('adding a slot copies a design and equips the copy', () => {
    const base = applyShapePreset(defaultGarage(), 'mallet.shape.razor');
    const next = addLoadout(base, { from: base.equippedId });
    assert.equal(next.loadouts.length, 2);
    assert.equal(next.equippedId, next.loadouts[1].id);
    assert.notEqual(next.loadouts[1].id, next.loadouts[0].id);
    assert.deepEqual(equippedLoadout(next).mallet, base.loadouts[0].mallet);
    // The source is untouched: a copy is a copy.
    assert.deepEqual(next.loadouts[0], base.loadouts[0]);
});

test('an empty slot starts from the factory design, not from whatever was on', () => {
    const base = applyShapePreset(defaultGarage(), 'mallet.shape.industrial');
    const next = addLoadout(base);
    assert.deepEqual(equippedLoadout(next).mallet, defaultLoadout().mallet);
});

test('editing the equipped slot leaves every other slot alone', () => {
    let garage = addLoadout(defaultGarage(), { from: 'loadout-1' });
    const untouched = garage.loadouts[0];
    garage = applyShapePreset(garage, 'mallet.shape.turbine');
    assert.equal(equippedLoadout(garage).mallet.shapePreset, 'mallet.shape.turbine');
    assert.deepEqual(garage.loadouts[0], untouched);
});

test('the cap is enforced by the document, not only by the button', () => {
    let garage = defaultGarage();
    for (let i = 0; i < MAX_LOADOUTS + 4; i += 1) garage = addLoadout(garage);
    assert.equal(garage.loadouts.length, MAX_LOADOUTS);
    // And a hand-written document over the cap is trimmed rather than rejected.
    const flood = normalizeGarage({ loadouts: Array.from({ length: 40 }, () => ({})) });
    assert.equal(flood.loadouts.length, MAX_LOADOUTS);
});

test('the last loadout cannot be deleted', () => {
    const garage = defaultGarage();
    assert.deepEqual(removeLoadout(garage, garage.equippedId), garage);
});

test('deleting the equipped slot equips a neighbour', () => {
    let garage = addLoadout(addLoadout(defaultGarage()));
    assert.equal(garage.loadouts.length, 3);
    const removed = garage.equippedId;
    garage = removeLoadout(garage, removed);
    assert.equal(garage.loadouts.length, 2);
    assert.ok(garage.loadouts.some((loadout) => loadout.id === garage.equippedId));
    assert.ok(!garage.loadouts.some((loadout) => loadout.id === removed));
});

test('equipping an unknown id changes nothing', () => {
    const garage = addLoadout(defaultGarage());
    assert.deepEqual(selectLoadout(garage, 'loadout-99'), garage);
    assert.equal(selectLoadout(garage, 'loadout-1').equippedId, 'loadout-1');
});

test('an equippedId naming no slot falls back to the first', () => {
    const garage = normalizeGarage({ equippedId: 'gone', loadouts: [{ id: 'a' }, { id: 'b' }] });
    assert.equal(garage.equippedId, 'a');
});

test('names are trimmed, collapsed, capped, and never blank', () => {
    const garage = normalizeGarage({
        loadouts: [
            { id: 'a', name: '  Night   Shift \n' },
            { id: 'b', name: '   ' },
            { id: 'c', name: 'x'.repeat(200) },
            { id: 'd', name: 42 },
        ],
    });
    assert.equal(garage.loadouts[0].name, 'Night Shift');
    assert.equal(garage.loadouts[1].name, 'Loadout 2');
    assert.equal(garage.loadouts[2].name.length, LOADOUT_NAME_LIMIT);
    assert.equal(garage.loadouts[3].name, 'Loadout 4');
    assert.equal(renameLoadout(garage, 'a', ' Blue').loadouts[0].name, 'Blue');
});

test('a duplicate or unusable id is renumbered rather than dropped', () => {
    const garage = normalizeGarage({
        loadouts: [
            { id: 'same', mallet: { shapePreset: 'mallet.shape.razor' } },
            { id: 'same', mallet: { shapePreset: 'mallet.shape.heavy' } },
            { id: 'not a valid id!', mallet: { shapePreset: 'mallet.shape.minimal' } },
        ],
    });
    assert.equal(garage.loadouts.length, 3);
    assert.equal(new Set(garage.loadouts.map((loadout) => loadout.id)).size, 3);
    assert.deepEqual(garage.loadouts.map((loadout) => loadout.mallet.shapePreset),
        ['mallet.shape.razor', 'mallet.shape.heavy', 'mallet.shape.minimal']);
});

test('replacing a loadout addresses it by id and cannot change that id', () => {
    const garage = addLoadout(defaultGarage());
    const edited = { ...garage.loadouts[0], id: 'hijacked', name: 'Renamed' };
    const next = replaceLoadout(garage, { ...edited, id: garage.loadouts[0].id });
    assert.equal(next.loadouts[0].name, 'Renamed');
    assert.equal(next.loadouts[0].id, garage.loadouts[0].id);
    // A loadout that is not in the document is not a way to add one.
    assert.deepEqual(replaceLoadout(garage, { ...edited }), garage);
});
