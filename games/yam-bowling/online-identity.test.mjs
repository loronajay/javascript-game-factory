import test from "node:test";
import assert from "node:assert/strict";

import { createYamOnlineIdentity } from "./online-identity.mjs";

const profile = (profileName) => ({ playerId: "factory-p1", profileName });

test("the display name is read per call, not captured once", () => {
  let stored = profile("");
  const identity = createYamOnlineIdentity({ readProfile: () => stored });

  assert.equal(identity.displayName, "");
  stored = profile("Jay");
  assert.equal(identity.displayName, "Jay");
  assert.equal(identity.resolve().playerId, "factory-p1");
});

test("a signed-in account fills in a name the local cache never got", async () => {
  const identity = createYamOnlineIdentity({
    readProfile: () => profile(""),
    authApi: { isConfigured: true, getSession: async () => ({ ok: true, profileName: "Jay" }) },
  });

  assert.equal(identity.displayName, "");
  await identity.seedFromAccount();
  assert.equal(identity.displayName, "Jay");
  // The playerId stays the factory one: every other Yam surface is keyed on it.
  assert.equal(identity.resolve().playerId, "factory-p1");
});

test("the factory profile wins over the account name", async () => {
  const identity = createYamOnlineIdentity({
    readProfile: () => profile("Local Name"),
    authApi: { isConfigured: true, getSession: async () => ({ ok: true, profileName: "Account Name" }) },
  });

  await identity.seedFromAccount();
  assert.equal(identity.displayName, "Local Name");
});

test("an unreachable account leaves the local profile as the only answer", async () => {
  const identity = createYamOnlineIdentity({
    readProfile: () => profile(""),
    authApi: { isConfigured: true, getSession: async () => { throw new Error("offline"); } },
  });

  await identity.seedFromAccount();
  assert.equal(identity.displayName, "");
});
