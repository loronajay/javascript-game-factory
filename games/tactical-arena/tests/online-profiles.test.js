import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneRemoteProfile,
  shapeSessionProfiles,
  resolveRankedIdentity,
  rankedProfileFromStanding,
} from "../src/ui/onlineProfiles.js";

test("cloneRemoteProfile deep-copies the nested ranked profile and rejects non-objects", () => {
  assert.equal(cloneRemoteProfile(null), null);
  assert.equal(cloneRemoteProfile("nope"), null);

  const original = { clientId: "c1", seat: 2, rankedProfile: { title: "Ace" } };
  const copy = cloneRemoteProfile(original);
  assert.notEqual(copy, original);
  assert.notEqual(copy.rankedProfile, original.rankedProfile);
  original.rankedProfile.title = "Changed";
  assert.equal(copy.rankedProfile.title, "Ace");

  assert.equal(cloneRemoteProfile({ clientId: "c2" }).rankedProfile, null);
});

test("shapeSessionProfiles returns the other seats, seat-stamped and cloned", () => {
  const byClient = new Map([
    ["a", { displayName: "Alice", rankedProfile: { title: "A" } }],
    ["b", { displayName: "Bob", rankedProfile: null }],
  ]);
  const out = shapeSessionProfiles({
    membersAtStart: ["a", "b"],
    mySeat: 1,
    profilesByClientId: byClient,
    profilesBySeat: new Map(),
  });
  assert.equal(out.length, 1); // seat 1 (mine) excluded
  assert.equal(out[0].seat, 2);
  assert.equal(out[0].displayName, "Bob");
  assert.notEqual(out[0], byClient.get("b"));

  assert.deepEqual(shapeSessionProfiles({ membersAtStart: null, mySeat: 1, profilesByClientId: byClient, profilesBySeat: new Map() }), []);
});

test("shapeSessionProfiles falls back to seat lookup when the client id is unknown", () => {
  const bySeat = new Map([[2, { displayName: "Seat2" }]]);
  const out = shapeSessionProfiles({
    membersAtStart: ["me", "unknown"],
    mySeat: 1,
    profilesByClientId: new Map(),
    profilesBySeat: bySeat,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].displayName, "Seat2");
});

test("resolveRankedIdentity prefers the fetched profile, else builds from the fallback tagline", () => {
  const fetched = { title: "Fetched" };
  assert.equal(resolveRankedIdentity(fetched, "ignored"), fetched);
  assert.deepEqual(resolveRankedIdentity(null, "Legacy"), { title: "Legacy", tagline: "Legacy" });
  assert.equal(resolveRankedIdentity(null, ""), null);
  assert.equal(resolveRankedIdentity(null, null), null);
});

test("rankedProfileFromStanding maps a server standing into the compact profile", () => {
  assert.equal(rankedProfileFromStanding(null), null);
  assert.equal(rankedProfileFromStanding("x"), null);

  const shaped = rankedProfileFromStanding({
    title: "  Champ  ",
    rating: 1487.6,
    avatarUnit: "swordsman",
    avatarSkin: 123, // non-string -> null
    tier: { id: "gold", label: "Gold" },
    wins: 5,
    losses: "2", // numeric string coerces to 2
    draws: undefined, // NaN -> 0
  });
  assert.equal(shaped.title, "Champ");
  assert.equal(shaped.tagline, "Champ");
  assert.equal(shaped.rating, 1488);
  assert.equal(shaped.avatarUnit, "swordsman");
  assert.equal(shaped.avatarSkin, null);
  assert.deepEqual(shaped.tier, { id: "gold", label: "Gold" });
  assert.equal(shaped.wins, 5);
  assert.equal(shaped.losses, 2);
  assert.equal(shaped.draws, 0);

  assert.equal(rankedProfileFromStanding({ rating: "n/a" }).rating, undefined);
});
