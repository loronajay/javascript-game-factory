import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountAccess } from '../scripts/platform/account-access.js';

test('online rejects guests before looking up a session; solo needs no account', async () => {
    let calls = 0;
    const access = createAccountAccess({ readAccount: () => ({}), authApi: { getSession() { calls++; } } });
    await assert.rejects(access.resolve(), /Sign in/);
    assert.equal(calls, 0);
    assert.equal(access.isEligible(), false);
});

test('online reads canonical account identity on every request, not an old local profile', async () => {
    let name = 'FactoryOne';
    const access = createAccountAccess({
        readAccount: () => ({ authenticated: true, token: 'secret' }),
        authApi: { getSession: async () => ({ ok: true, playerId: 'account-1', profileName: name }) },
    });
    assert.deepEqual(await access.resolve(), { playerId: 'account-1', displayName: 'FactoryOne' });
    name = 'NewName';
    assert.deepEqual(await access.resolve(), { playerId: 'account-1', displayName: 'NewName' });
});

test('expired, unavailable, or changed sessions never produce a lobby identity', async () => {
    for (const response of [{ ok: false, httpStatus: 401 }, { ok: false, httpStatus: 0 }, { ok: true }]) {
        const access = createAccountAccess({ readAccount: () => ({ authenticated: true, token: 'secret' }), authApi: { getSession: async () => response } });
        await assert.rejects(access.resolve());
    }
    let signedIn = true;
    const access = createAccountAccess({
        readAccount: () => signedIn ? { authenticated: true, token: 'secret' } : {},
        authApi: { getSession: async () => { signedIn = false; return { ok: true, playerId: 'a', profileName: 'A' }; } },
    });
    await assert.rejects(access.resolve());
});

test('account changes during validation are rejected; a normal token refresh is accepted', async () => {
    let token = 'old';
    const readAccount = () => ({ authenticated: true, token });
    const access = createAccountAccess({ readAccount, authApi: { getSession: async () => {
        token = 'another-account'; return { ok: true, playerId: 'old-account', profileName: 'Old' };
    } } });
    await assert.rejects(access.resolve(), /changed/);
    const refresh = createAccountAccess({ readAccount, authApi: { getSession: async () => {
        token = 'refreshed'; return { ok: true, playerId: 'current', profileName: 'Current', token };
    } } });
    assert.equal((await refresh.resolve()).playerId, 'current');
});

test('expired sessions use the shared unauthorized handler but network errors do not', async () => {
    let expired = 0;
    for (const httpStatus of [401, 0]) {
        const access = createAccountAccess({
            readAccount: () => ({ authenticated: true, token: 'secret' }),
            authApi: { getSession: async () => ({ ok: false, httpStatus }) },
            onUnauthorized: () => { expired++; },
        });
        await assert.rejects(access.resolve());
    }
    assert.equal(expired, 1);
});
