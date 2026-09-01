import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVenueHelpers, SURFACE_RECIPES } from '../scripts/render/venues/helpers.js';

class MeshStandardMaterial {
    constructor(options) { Object.assign(this, options); this.userData = {}; }
}

class DataTexture {
    constructor(data, width, height, format) {
        this.image = { data, width, height };
        this.format = format;
        this.repeat = { set: (x, y) => { this.repeatValue = [x, y]; } };
    }
}

const THREE = {
    MeshStandardMaterial,
    DataTexture,
    RGBAFormat: 'rgba',
    RepeatWrapping: 'repeat',
    SRGBColorSpace: 'srgb',
};

test('procedural venue surfaces create deterministic, repeating color textures', () => {
    const first = createVenueHelpers(THREE).makeSurface('concrete', 0x706e68, {
        accent: 0x312f2c,
        repeat: [6, 9],
        seed: 27,
    });
    const second = createVenueHelpers(THREE).makeSurface('concrete', 0x706e68, {
        accent: 0x312f2c,
        repeat: [6, 9],
        seed: 27,
    });

    assert.equal(first.userData.surfaceKind, 'concrete');
    assert.equal(first.map.wrapS, THREE.RepeatWrapping);
    assert.equal(first.map.wrapT, THREE.RepeatWrapping);
    assert.equal(first.map.colorSpace, THREE.SRGBColorSpace);
    assert.deepEqual(first.map.repeatValue, [6, 9]);
    assert.deepEqual(first.map.image.data, second.map.image.data);
    assert.ok(new Set(first.map.image.data).size > 16, 'texture should contain visible tonal variation');
});

test('surface library covers a distinct primary material for every arena', () => {
    const expected = {
        'hyper-arcade.js': 'rubber',
        'competition-circuit.js': 'arenaFloor',
        'park-jam.js': 'grass',
        'skyline-rooftop.js': 'roofing',
        'garage-club.js': 'concrete',
        'boardwalk-bash.js': 'wood',
        'freight-yard.js': 'asphalt',
        'zero-g-arena.js': 'spacePanels',
    };

    for (const [file, recipe] of Object.entries(expected)) {
        assert.ok(Object.hasOwn(SURFACE_RECIPES, recipe), `${recipe} recipe`);
        const source = readFileSync(new URL(`../scripts/render/venues/${file}`, import.meta.url), 'utf8');
        assert.match(source, new RegExp(`makeSurface\\(['\"]${recipe}['\"]`), `${file} should use ${recipe}`);
    }
});

test('surface materials gracefully remain flat when texture support is unavailable', () => {
    const helpers = createVenueHelpers({ MeshStandardMaterial });
    const material = helpers.makeSurface('wood', 0x72513b, { roughness: .86 });

    assert.equal(material.color, 0x72513b);
    assert.equal(material.map, undefined);
    assert.equal(material.userData.surfaceKind, 'wood');
});

test('the two broad daylight workspaces include authored, camera-readable surface details', () => {
    const freight = readFileSync(new URL('../scripts/render/venues/freight-yard.js', import.meta.url), 'utf8');
    const park = readFileSync(new URL('../scripts/render/venues/park-jam.js', import.meta.url), 'utf8');

    assert.match(freight, /containerRibs/, 'containers need modeled corrugation, not only colored boxes');
    assert.match(freight, /railSleepers/, 'the freight floor needs real track structure');
    assert.match(park, /courtMarkings/, 'the park slab needs authored paint and wear landmarks');
});
