import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DECALS, DECAL_BY_ID, FALLBACK_DECAL_ID } from '../scripts/cosmetics/decal-catalog.js';

// The approved decal art is the source of truth and this cabinet does not touch
// it. These tests exist so a rename, a deletion or a duplicated id is caught
// here rather than as a missing texture on somebody's mallet.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const approved = JSON.parse(readFileSync(join(root, 'assets/decals/catalog.json'), 'utf8'));

test('the module and the approved catalog list the same decals in the same order', () => {
    assert.equal(DECALS.length, approved.length);
    assert.deepEqual(DECALS.map(decal => decal.id), approved.map(entry => entry.id));
    assert.deepEqual(DECALS.map(decal => decal.slug), approved.map(entry => entry.slug));
    assert.deepEqual(DECALS.map(decal => decal.name), approved.map(entry => entry.displayName));
});

test('every catalog asset exists on disk', () => {
    for (const decal of DECALS) {
        const file = join(root, decal.asset.replace(/^\.\//, ''));
        assert.ok(existsSync(file), `missing decal asset: ${decal.asset}`);
    }
});

test('every shipped decal PNG has exactly one catalog record', () => {
    const shipped = readdirSync(join(root, 'assets/decals')).filter(name => name.endsWith('.png')).sort();
    assert.deepEqual(shipped, DECALS.map(decal => `${decal.slug}.png`).sort());
});

test('no duplicate ids or slugs', () => {
    assert.equal(new Set(DECALS.map(decal => decal.id)).size, DECALS.length);
    assert.equal(new Set(DECALS.map(decal => decal.slug)).size, DECALS.length);
    assert.equal(DECAL_BY_ID.size, DECALS.length);
});

test('the fallback decal is a real catalog entry', () => {
    assert.ok(DECAL_BY_ID.has(FALLBACK_DECAL_ID));
});

test('ids are namespaced and well formed', () => {
    for (const decal of DECALS) {
        assert.match(decal.id, /^decal\.[a-z0-9]+(?:-[a-z0-9]+)*$/);
        assert.equal(decal.id, `decal.${decal.slug}`);
    }
});
