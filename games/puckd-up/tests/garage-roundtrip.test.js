import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { createApp } from '../../../platform-api/src/app.mjs';
import { signToken } from '../../../platform-api/src/auth-helpers.mjs';
import {
    normalizePuckdUpGarage, puckdUpLoadoutFromGarage,
} from '../../../platform-api/src/services/puckd-up-loadout-catalog.mjs';
import { createPlatformApiClient } from '../../../js/platform/api/platform-api.mjs';
import { createGarageStore } from '../scripts/garage/garage-store.js';
import { applyShapePreset, applySurfacePreset, defaultGarage } from '../scripts/cosmetics/loadout.js';

// The whole save path, over real HTTP.
//
// The cabinet's garage store, the shared platform client, the real API app with
// its real routes and real JWT auth, and the real Puck'd Up catalog. The ONLY
// stand-in is the `game_loadouts` row itself, held in a Map — everything
// between the button and the row is the shipping code.
//
// This test exists because the unit tests on either side of the network cannot
// see the network. A client that calls a method the shared client does not have
// passes every mocked test and saves nothing, which is exactly the bug this
// cabinet's sibling garages were carrying: they called `client.get`/`client.put`,
// which did not exist, and every real save failed silently into a local cache.

const SECRET = 'puckd-up-roundtrip-secret-at-least-32-chars';
const TOKEN_KEY = 'javascript-game-factory.authToken';
const PLAYER = 'roundtrip-player';

let server, base, rows, tokens;

before(async () => {
    rows = new Map();
    const app = createApp({
        jwtSecret: SECRET,
        getGarage: async ({ playerId, gameSlug }) => ({
            playerId, gameSlug,
            garage: normalizePuckdUpGarage(rows.get(`${playerId}:${gameSlug}`) ?? null),
            updatedAt: null,
        }),
        saveGarage: async ({ playerId, gameSlug, garage }) => {
            const normalized = normalizePuckdUpGarage(garage);
            rows.set(`${playerId}:${gameSlug}`, structuredClone(normalized));
            return { ok: true, garage: normalized };
        },
        getPublicLoadout: async ({ playerId, gameSlug }) => ({
            playerId, gameSlug, ...puckdUpLoadoutFromGarage(rows.get(`${playerId}:${gameSlug}`) ?? null),
        }),
        getPublicLoadouts: async ({ playerIds, gameSlug }) => (playerIds ?? []).map(playerId => ({
            playerId, gameSlug, ...puckdUpLoadoutFromGarage(rows.get(`${playerId}:${gameSlug}`) ?? null),
        })),
    });
    server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    // The one browser API the shared auth helper needs.
    tokens = new Map([[TOKEN_KEY, signToken({ playerId: PLAYER }, SECRET, { expiresInSeconds: 600 })]]);
    globalThis.localStorage = {
        getItem: key => tokens.get(key) ?? null,
        setItem: (key, value) => tokens.set(key, value),
        removeItem: key => tokens.delete(key),
    };
});

after(() => server?.close());

const client = () => createPlatformApiClient({ baseUrl: base, fetchImpl: fetch });
const storeFor = (playerId = PLAYER) =>
    createGarageStore({ session: { authenticated: true, playerId }, api: client() });

test('the shared platform client exposes the garage calls this cabinet makes', () => {
    const api = client();
    for (const method of ['fetchGameGarage', 'saveGameGarage', 'fetchGamePublicLoadout', 'fetchGamePublicLoadouts']) {
        assert.equal(typeof api[method], 'function', `platform client is missing ${method}`);
    }
});

test('a player with no saved row gets the factory loadout over the wire', async () => {
    const store = storeFor();
    const garage = await store.load();
    assert.equal(store.status, 'saved');
    assert.deepEqual(garage, defaultGarage());
});

test('PUT then GET: a design survives the round trip intact', async () => {
    const store = storeFor();
    await store.load();

    store.update(applySurfacePreset(applyShapePreset(store.garage, 'mallet.shape.champion'), 'table.surface.championship'));
    store.update(garage => ({
        ...garage,
        mallet: {
            ...garage.mallet,
            colors: { ...garage.mallet.colors, primary: '#2f8fd0' },
            decal: { ...garage.mallet.decal, type: 'builtin', id: 'decal.champion-crown', scale: 1.2 },
        },
    }));
    assert.equal(store.status, 'unsaved');
    assert.equal(rows.size, 0, 'nothing reaches the server before Save & Equip');

    assert.deepEqual(await store.save(), { ok: true });
    assert.equal(store.status, 'saved');
    assert.ok(rows.has(`${PLAYER}:puckd-up`), 'a row exists for this player');

    // A fresh page load, as far as the cabinet is concerned.
    const reopened = storeFor();
    const loaded = await reopened.load();
    assert.deepEqual(loaded, store.garage);
    assert.equal(loaded.mallet.shapePreset, 'mallet.shape.champion');
    assert.equal(loaded.mallet.colors.primary, '#2f8fd0');
    assert.equal(loaded.mallet.decal.id, 'decal.champion-crown');
    assert.equal(loaded.tableHalf.surface.preset, 'table.surface.championship');
});

test('an opponent can fetch the public loadout, and gets only the appearance', async () => {
    const loadout = await client().fetchGamePublicLoadout('puckd-up', PLAYER);
    assert.equal(loadout.mallet.shapePreset, 'mallet.shape.champion');
    assert.equal(loadout.tableHalf.surface.preset, 'table.surface.championship');
    assert.equal(loadout.version, undefined);
});

test('a lobby can fetch several halves in one call', async () => {
    const loadouts = await client().fetchGamePublicLoadouts('puckd-up', [PLAYER, 'stranger']);
    assert.equal(loadouts.length, 2);
    assert.equal(loadouts[0].mallet.shapePreset, 'mallet.shape.champion');
    assert.equal(loadouts[1].mallet.shapePreset, 'mallet.shape.classic');
});

test('another account sees their own garage, never this one', async () => {
    tokens.set(TOKEN_KEY, signToken({ playerId: 'someone-else' }, SECRET, { expiresInSeconds: 600 }));
    try {
        const garage = await storeFor('someone-else').load();
        assert.deepEqual(garage, defaultGarage());
    } finally {
        tokens.set(TOKEN_KEY, signToken({ playerId: PLAYER }, SECRET, { expiresInSeconds: 600 }));
    }
});

test('an unauthenticated save is refused by the route', async () => {
    tokens.delete(TOKEN_KEY);
    try {
        assert.equal(await client().saveGameGarage('puckd-up', { mallet: {} }), null);
    } finally {
        tokens.set(TOKEN_KEY, signToken({ playerId: PLAYER }, SECRET, { expiresInSeconds: 600 }));
    }
});

test("the server's normalized document becomes the client's state", async () => {
    const store = storeFor();
    await store.load();
    // Below the marking floor: the client clamps it, and the server clamps it
    // again, and what the editor ends up showing is the server's answer.
    store.update(garage => ({ ...garage, tableHalf: { ...garage.tableHalf, markings: { color: '#ffffff', opacity: 0 } } }));
    await store.save();
    assert.equal(store.garage.tableHalf.markings.opacity, 0.25);
    assert.deepEqual(store.garage, store.equipped);
    assert.equal(rows.get(`${PLAYER}:puckd-up`).tableHalf.markings.opacity, 0.25);
});

test('a save against a dead server fails loudly and keeps the design', async () => {
    const store = storeFor();
    await store.load();
    store.update(applyShapePreset(store.garage, 'mallet.shape.razor'));

    const offline = createGarageStore({
        session: { authenticated: true, playerId: PLAYER },
        api: createPlatformApiClient({ baseUrl: 'http://127.0.0.1:1', fetchImpl: fetch }),
    });
    offline.update(store.garage);
    const result = await offline.save();
    assert.equal(result.ok, false);
    assert.equal(offline.status, 'error');
    assert.equal(offline.garage.mallet.shapePreset, 'mallet.shape.razor');
});
