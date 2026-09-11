import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultGarage, normalizeGarage } from '../scripts/cosmetics/loadout.js';
import {
    defaultPuckdUpGarage, normalizePuckdUpGarage, puckdUpLoadoutFromGarage, PUCK_D_UP_GAME_SLUG,
} from '../../../platform-api/src/services/puckd-up-loadout-catalog.mjs';

// The cabinet and the API each normalize the garage — the cabinet so it never
// draws a document it would not have written, the API because it is the only
// one of the two that can be trusted. Two normalizers is two chances to drift,
// so this is the test that says they have not.
//
// It reaches across into `platform-api/` deliberately. This is one checkout;
// the API deploys on its own and cannot import the cabinet's files, but nothing
// stops a test from holding both up next to each other.

test('the client default and the server default are the same document', () => {
    assert.deepEqual(defaultGarage(), defaultPuckdUpGarage());
});

test('a player with no saved row gets exactly what their own cabinet draws', () => {
    assert.deepEqual(normalizePuckdUpGarage(null), defaultGarage());
});

test('both normalizers clamp the same way', () => {
    const cases = [
        null,
        {},
        { mallet: { geometry: { shoulderRadius: 99, capHeight: -3, crownEnabled: 'yes' } } },
        { mallet: { material: { preset: 'mallet.material.chrome', roughness: -1, metalness: 8 } } },
        { mallet: { colors: { primary: '#ABC', accent: 'nope' } } },
        { mallet: { hardware: { style: 'mallet.hardware.reactor', radius: 100, thickness: 0 } } },
        { mallet: { decal: { type: 'custom', customAssetId: 'x', customAssetUrl: 'http://insecure/x.png' } } },
        { mallet: { decal: { type: 'builtin', id: 'decal.skull', rotation: 5000, opacity: 0 } } },
        { tableHalf: { markings: { opacity: 0 } } },
        { tableHalf: { surface: { preset: 'table.surface.street-paint', patternOpacity: 5 } } },
        { tableHalf: { rails: { preset: 'table.rail.championship-gold', metalness: -4 } } },
        { tableHalf: { goal: { preset: 'table.goal.reactor', glowIntensity: 99 } } },
        { version: 84, mallet: 'no', tableHalf: [1, 2, 3], junk: { deeply: { nested: true } } },
    ];
    for (const input of cases) {
        assert.deepEqual(normalizeGarage(input), normalizePuckdUpGarage(input), JSON.stringify(input));
    }
});

test('the public loadout carries the appearance and nothing else', () => {
    const garage = normalizePuckdUpGarage({ mallet: { shapePreset: 'mallet.shape.champion' } });
    const loadout = puckdUpLoadoutFromGarage(garage);
    assert.deepEqual(Object.keys(loadout).sort(), ['mallet', 'tableHalf']);
    assert.equal(loadout.mallet.shapePreset, 'mallet.shape.champion');
    assert.equal(loadout.version, undefined);
});

test('an unknown player resolves to the default appearance, not an error', () => {
    const loadout = puckdUpLoadoutFromGarage(null);
    assert.deepEqual(loadout.mallet, defaultGarage().mallet);
    assert.deepEqual(loadout.tableHalf, defaultGarage().tableHalf);
});

test('the cabinet and the registry agree on the slug', () => {
    assert.equal(PUCK_D_UP_GAME_SLUG, 'puckd-up');
});
