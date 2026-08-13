// The packaged app's account surface.
//
// This is the only place in the app a player can reach their account, which makes it the
// only place account DELETION can live — and Google Play requires an in-app deletion path
// for any app that lets you create an account in-app (the auth panel does). So these tests
// are as much a compliance guard as a behaviour one: if the delete choice disappears from
// this menu, the app stops meeting the policy it shipped under.

import test from "node:test";
import assert from "node:assert/strict";

import { openAccountPanel } from "../src/ui/accountMenu.js";

const SIGNED_IN = { authenticated: true, playerId: "player-1" };

// Records what the menu offered and answers with a scripted sequence of picks.
function fakeChooser(picks) {
  const queue = [...picks];
  const shown = [];
  const choose = async (options) => {
    shown.push(options);
    return queue.length ? queue.shift() : null;
  };
  return { choose, shown, labels: () => shown.map((s) => (s.choices || []).map((c) => c.label)) };
}

function fakeAuth(overrides = {}) {
  const calls = [];
  return {
    calls,
    isConfigured: true,
    async getSession() { calls.push("getSession"); return { ok: true, playerId: "player-1", profileName: "Jay" }; },
    async logout() { calls.push("logout"); return { ok: true }; },
    async deleteAccount() { calls.push("deleteAccount"); return { ok: true }; },
    ...overrides,
  };
}

test("a signed-in player is offered both sign out and account deletion", async () => {
  const chooser = fakeChooser([null]);
  await openAccountPanel({ auth: fakeAuth(), session: SIGNED_IN, choose: chooser.choose });

  const labels = chooser.labels()[0];
  assert.ok(labels.includes("Sign Out"), `expected a sign-out choice, got ${labels.join(" / ")}`);
  assert.ok(labels.includes("Delete Account"), `expected a delete choice, got ${labels.join(" / ")}`);
});

test("deleting asks for confirmation before it calls the server", async () => {
  // Pick delete, then decline the confirmation.
  const chooser = fakeChooser(["deleteAccount", null]);
  const auth = fakeAuth();
  const result = await openAccountPanel({ auth, session: SIGNED_IN, choose: chooser.choose });

  assert.equal(chooser.shown.length, 2, "a second, confirming prompt should appear");
  assert.equal(auth.calls.includes("deleteAccount"), false, "backing out must not delete");
  assert.equal(result, null);
});

test("confirming deletion deletes the account and reports the session ended", async () => {
  const chooser = fakeChooser(["deleteAccount", "confirmDelete"]);
  const auth = fakeAuth();
  let changed = null;
  const result = await openAccountPanel({
    auth,
    session: SIGNED_IN,
    choose: chooser.choose,
    onChanged: async (payload) => { changed = payload; },
  });

  assert.equal(auth.calls.includes("deleteAccount"), true);
  assert.deepEqual(result, { ok: true, deleted: true, signedOut: true });
  assert.equal(changed?.deleted, true);
});

// The confirmation has to state that this is permanent and takes purchases with it —
// a player deleting an account holding paid entitlements should not be surprised.
test("the confirmation warns that deletion is permanent and covers purchases", async () => {
  const chooser = fakeChooser(["deleteAccount", null]);
  await openAccountPanel({ auth: fakeAuth(), session: SIGNED_IN, choose: chooser.choose });

  const confirm = `${chooser.shown[1].title} ${chooser.shown[1].subtitle}`.toLowerCase();
  assert.match(confirm, /permanent|cannot be undone|forever/);
  assert.match(confirm, /purchase|entitlement|owned|progress/);
});

// A failed delete must leave the player signed in rather than half-dropping them.
test("a failed deletion keeps the player signed in", async () => {
  const chooser = fakeChooser(["deleteAccount", "confirmDelete"]);
  const auth = fakeAuth({ async deleteAccount() { return { ok: false, error: "delete_failed" }; } });
  const result = await openAccountPanel({ auth, session: SIGNED_IN, choose: chooser.choose });

  assert.equal(result?.ok, false);
  assert.equal(result?.deleted, undefined);
});

test("signing out still works and does not delete anything", async () => {
  const chooser = fakeChooser(["signOut"]);
  const auth = fakeAuth();
  const result = await openAccountPanel({ auth, session: SIGNED_IN, choose: chooser.choose });

  assert.equal(auth.calls.includes("logout"), true);
  assert.equal(auth.calls.includes("deleteAccount"), false);
  assert.deepEqual(result, { ok: true, signedOut: true });
});
