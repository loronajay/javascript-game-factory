import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createGarageStore, GAME_SLUG,
    STATUS_SIGNED_OUT, STATUS_SAVED, STATUS_UNSAVED, STATUS_ERROR,
} from '../scripts/garage/garage-store.js';
import {
    defaultGarage, normalizeGarage, equippedLoadout, replaceLoadout, applyShapePreset, addLoadout,
} from '../scripts/cosmetics/loadout.js';
import { normalizePuckdUpGarage } from '../../../platform-api/src/services/puckd-up-loadout-catalog.mjs';

const signedIn = { authenticated: true, playerId: 'p1' };
const signedOut = { authenticated: false, playerId: '' };

/** A stand-in for the shared platform client, recording what it was asked to do. */
function fakeApi({ garage = null, saveResult = undefined, throwOn = '' } = {}) {
    const calls = [];
    return {
        calls,
        isConfigured: true,
        async fetchGameGarage(slug) {
            calls.push(['get', slug]);
            if (throwOn === 'get') throw new Error('network');
            return garage;
        },
        async saveGameGarage(slug, body) {
            calls.push(['put', slug, body]);
            if (throwOn === 'put') throw new Error('network');
            // The real route echoes the SERVER-normalized document back.
            return saveResult === undefined ? { ok: true, garage: normalizePuckdUpGarage(body) } : saveResult;
        },
    };
}

test('signed out the garage previews but reports that saving needs an account', async () => {
    const store = createGarageStore({ session: signedOut, api: fakeApi() });
    assert.equal(store.available, false);
    assert.deepEqual(await store.load(), defaultGarage());
    assert.equal(store.status, STATUS_SIGNED_OUT);

    store.update(garage => applyShapePreset(garage, 'mallet.shape.razor'));
    assert.equal(store.status, STATUS_SIGNED_OUT);

    const result = await store.save();
    assert.deepEqual(result, { ok: false, reason: 'signed-out' });
    assert.equal(store.status, STATUS_SIGNED_OUT);
});

test('signed out never issues a request at all', async () => {
    const api = fakeApi();
    const store = createGarageStore({ session: signedOut, api });
    await store.load();
    await store.save();
    assert.deepEqual(api.calls, []);
});

test('load reads the account garage from the generic route', async () => {
    const stored = normalizeGarage({ mallet: { shapePreset: 'mallet.shape.champion' } });
    const api = fakeApi({ garage: { garage: stored } });
    const store = createGarageStore({ session: signedIn, api });
    const loaded = await store.load();
    assert.deepEqual(api.calls, [['get', GAME_SLUG]]);
    assert.equal(equippedLoadout(loaded).mallet.shapePreset, 'mallet.shape.champion');
    assert.equal(store.status, STATUS_SAVED);
    assert.equal(store.dirty, false);
});

test('a failed load says so rather than silently offering a default to overwrite with', async () => {
    const store = createGarageStore({ session: signedIn, api: fakeApi({ throwOn: 'get' }) });
    assert.deepEqual(await store.load(), defaultGarage());
    assert.equal(store.status, STATUS_ERROR);
    assert.match(store.lastError, /could not load/i);
});

test('an edit is UNSAVED until the server has it', async () => {
    const store = createGarageStore({ session: signedIn, api: fakeApi({ garage: { garage: defaultGarage() } }) });
    await store.load();
    store.update(garage => applyShapePreset(garage, 'mallet.shape.razor'));
    assert.equal(store.status, STATUS_UNSAVED);
    assert.equal(store.dirty, true);
    // The equipped copy is still the account's, so the menu shows what is kept.
    assert.equal(store.equipped.mallet.shapePreset, 'mallet.shape.classic');
});

test('editing back to the saved document reports SAVED again', async () => {
    const store = createGarageStore({ session: signedIn, api: fakeApi({ garage: { garage: defaultGarage() } }) });
    await store.load();
    store.update(garage => applyShapePreset(garage, 'mallet.shape.razor'));
    store.update(defaultGarage());
    assert.equal(store.status, STATUS_SAVED);
});

test('save PUTs the whole garage and never a playerId', async () => {
    const api = fakeApi({ garage: { garage: defaultGarage() } });
    const store = createGarageStore({ session: signedIn, api });
    await store.load();
    store.update(garage => applyShapePreset(garage, 'mallet.shape.turbine'));
    assert.deepEqual(await store.save(), { ok: true });

    const [verb, slug, body] = api.calls.at(-1);
    assert.equal(verb, 'put');
    assert.equal(slug, GAME_SLUG);
    assert.equal(equippedLoadout(body).mallet.shapePreset, 'mallet.shape.turbine');
    assert.ok(!('playerId' in body));
    assert.ok(!JSON.stringify(body).includes('p1'));
    assert.equal(store.status, STATUS_SAVED);
    assert.equal(store.dirty, false);
});

test('the server response becomes the source of truth, clamps included', async () => {
    const api = fakeApi({ garage: { garage: defaultGarage() } });
    const store = createGarageStore({ session: signedIn, api });
    await store.load();
    // Something the client would clamp differently if it were the authority.
    store.update(garage => replaceLoadout(garage, {
        ...equippedLoadout(garage),
        tableHalf: { ...equippedLoadout(garage).tableHalf, markings: { color: '#ffffff', opacity: 0 } },
    }));
    await store.save();
    assert.equal(store.editing.tableHalf.markings.opacity, 0.25);
    assert.deepEqual(store.editing, store.equipped);
});

test('a failed save keeps the design and admits the failure', async () => {
    const api = fakeApi({ garage: { garage: defaultGarage() }, saveResult: null });
    const store = createGarageStore({ session: signedIn, api });
    await store.load();
    store.update(garage => applyShapePreset(garage, 'mallet.shape.arcade'));
    const result = await store.save();

    assert.equal(result.ok, false);
    assert.equal(store.status, STATUS_ERROR);
    assert.equal(store.editing.mallet.shapePreset, 'mallet.shape.arcade');
    assert.equal(store.dirty, true);
    assert.equal(store.equipped.mallet.shapePreset, 'mallet.shape.classic');
});

test('a save that throws is a failure, not a success', async () => {
    const store = createGarageStore({ session: signedIn, api: fakeApi({ garage: { garage: defaultGarage() }, throwOn: 'put' }) });
    await store.load();
    store.update(garage => applyShapePreset(garage, 'mallet.shape.arcade'));
    assert.equal((await store.save()).ok, false);
    assert.equal(store.status, STATUS_ERROR);
});

test('an unconfigured client cannot report a save', async () => {
    const api = { ...fakeApi(), isConfigured: false };
    const store = createGarageStore({ session: signedIn, api });
    assert.equal(store.available, false);
    assert.equal((await store.save()).reason, 'signed-out');
});

test('revert throws away unsaved work and restores the account copy', async () => {
    const store = createGarageStore({ session: signedIn, api: fakeApi({ garage: { garage: defaultGarage() } }) });
    await store.load();
    store.update(garage => applyShapePreset(garage, 'mallet.shape.heavy'));
    store.revert();
    assert.deepEqual(store.garage, defaultGarage());
    assert.equal(store.status, STATUS_SAVED);
});

test('subscribers are told every time the status moves', async () => {
    const store = createGarageStore({ session: signedIn, api: fakeApi({ garage: { garage: defaultGarage() } }) });
    let notifications = 0;
    const stop = store.subscribe(() => { notifications += 1; });
    await store.load();
    store.update(garage => applyShapePreset(garage, 'mallet.shape.heavy'));
    await store.save();
    stop();
    assert.ok(notifications >= 3);
});

test('the store exposes every saved design and which one is on', async () => {
    const stored = addLoadout(applyShapePreset(defaultGarage(), 'mallet.shape.razor'), { from: 'loadout-1', name: 'Night Shift' });
    const store = createGarageStore({ session: signedIn, api: fakeApi({ garage: { garage: stored } }) });
    await store.load();
    assert.deepEqual(store.loadouts.map(loadout => loadout.name), ['Loadout 1', 'Night Shift']);
    assert.equal(store.editing.name, 'Night Shift');
    assert.equal(store.equipped.mallet.shapePreset, 'mallet.shape.razor');
});

test('equipping a saved design writes the choice to the account', async () => {
    const stored = addLoadout(defaultGarage(), { from: 'loadout-1' });
    const api = fakeApi({ garage: { garage: stored } });
    const store = createGarageStore({ session: signedIn, api });
    await store.load();
    assert.equal(store.garage.equippedId, 'loadout-2');

    assert.deepEqual(await store.equip('loadout-1'), { ok: true });
    assert.equal(api.calls.at(-1)[0], 'put');
    assert.equal(api.calls.at(-1)[2].equippedId, 'loadout-1');
    assert.equal(store.equipped.id, 'loadout-1');
    assert.equal(store.status, STATUS_SAVED);
    assert.equal(store.dirty, false);
});

test('equipping an unknown design is a no-op, not a save of something else', async () => {
    const api = fakeApi({ garage: { garage: defaultGarage() } });
    const store = createGarageStore({ session: signedIn, api });
    await store.load();
    await store.equip('loadout-404');
    assert.equal(store.equipped.id, 'loadout-1');
    assert.equal(store.dirty, false);
});

test('a failed equip leaves the account on what it had', async () => {
    const stored = addLoadout(defaultGarage(), { from: 'loadout-1' });
    const store = createGarageStore({ session: signedIn, api: fakeApi({ garage: { garage: stored }, saveResult: null }) });
    await store.load();
    const result = await store.equip('loadout-1');
    assert.equal(result.ok, false);
    assert.equal(store.status, STATUS_ERROR);
    // The preview follows the click; the ACCOUNT does not, and the status says so.
    assert.equal(store.editing.id, 'loadout-1');
    assert.equal(store.equipped.id, 'loadout-2');
});

test('signed out, equipping previews but never claims to have saved', async () => {
    const api = fakeApi();
    const store = createGarageStore({ session: signedOut, api });
    await store.load();
    store.update(garage => addLoadout(garage, { from: 'loadout-1' }));
    assert.deepEqual(await store.equip('loadout-1'), { ok: false, reason: 'signed-out' });
    assert.equal(store.editing.id, 'loadout-1');
    assert.deepEqual(api.calls, []);
});
