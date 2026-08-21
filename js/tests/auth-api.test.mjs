// Auth client behaviours that outlive the request itself — specifically, which calls are
// responsible for dropping the locally stored token.

import test from "node:test";
import assert from "node:assert/strict";

import { createAuthApiClient } from "../platform/api/auth-api.mjs";

const TOKEN_KEY = "javascript-game-factory.authToken";

function withFakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return {
    store,
    restore() {
      if (previous === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previous;
    },
  };
}

function clientWith(response) {
  return createAuthApiClient({
    baseUrl: "https://api.example",
    fetchImpl: async () => ({
      ok: response.ok !== false,
      status: response.status ?? 200,
      json: async () => response.body ?? { ok: true },
    }),
  });
}

// Deleting the account destroys the server session, so keeping the token would leave the app
// claiming to be signed in (the only local test is "is a token present") with every
// subsequent call failing as a 401. logout() already clears it; delete has to as well.
test("deleteAccount clears the stored token on success", async () => {
  const storage = withFakeStorage({ [TOKEN_KEY]: "jwt-1" });
  try {
    const auth = clientWith({ body: { ok: true } });
    const result = await auth.deleteAccount();

    assert.equal(result.ok, true);
    assert.equal(storage.store.has(TOKEN_KEY), false);
  } finally {
    storage.restore();
  }
});

// A failed delete must not sign the player out — the account still exists and the session
// is still good, so dropping the token would strand them for no reason.
test("a failed deleteAccount keeps the session", async () => {
  const storage = withFakeStorage({ [TOKEN_KEY]: "jwt-1" });
  try {
    const auth = clientWith({ ok: false, status: 400, body: { status: "error", error: "delete_failed" } });
    const result = await auth.deleteAccount();

    assert.notEqual(result.ok, true);
    assert.equal(storage.store.get(TOKEN_KEY), "jwt-1");
  } finally {
    storage.restore();
  }
});

test("getSession exposes the HTTP status so callers distinguish rejection from deploy downtime", async () => {
  const unavailable = await clientWith({
    ok: false,
    status: 503,
    body: { status: "error", error: "service_unavailable" },
  }).getSession();
  const rejected = await clientWith({
    ok: false,
    status: 401,
    body: { status: "error", error: "not_authenticated" },
  }).getSession();

  assert.equal(unavailable.httpStatus, 503);
  assert.equal(rejected.httpStatus, 401);
});
