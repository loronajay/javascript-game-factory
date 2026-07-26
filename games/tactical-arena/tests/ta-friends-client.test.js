import test from "node:test";
import assert from "node:assert/strict";

import {
  createTaFriendsClient,
  isTaSocialApiReady,
  normalizeTaPlayer,
  taSocialAvailability,
  TA_SOCIAL_SIGNED_OUT,
  TA_SOCIAL_UNAVAILABLE,
} from "../src/platform/taFriendsClient.js";

const SLUG = "tactical-arena";

function fakeApi(overrides = {}) {
  const calls = [];
  const stub = (name, value) => (...args) => { calls.push([name, ...args]); return Promise.resolve(value); };
  return {
    calls,
    isConfigured: true,
    fetchGameFriends: stub("fetchGameFriends", { friends: [] }),
    fetchGameFriendRequests: stub("fetchGameFriendRequests", { incoming: [], outgoing: [] }),
    fetchGameBlocks: stub("fetchGameBlocks", { blocked: [] }),
    sendGameFriendRequest: stub("sendGameFriendRequest", { status: "pending", requestId: "1" }),
    acceptGameFriendRequest: stub("acceptGameFriendRequest", { status: "accepted" }),
    declineGameFriendRequest: stub("declineGameFriendRequest", { status: "declined" }),
    cancelGameFriendRequest: stub("cancelGameFriendRequest", { status: "canceled" }),
    removeGameFriend: stub("removeGameFriend", { status: "removed" }),
    blockGamePlayer: stub("blockGamePlayer", { status: "blocked" }),
    unblockGamePlayer: stub("unblockGamePlayer", { status: "unblocked" }),
    searchGamePlayers: stub("searchGamePlayers", { query: "bob", results: [] }),
    fetchGamePlayerRelationship: stub("fetchGamePlayerRelationship", { relationship: "none" }),
    fetchGamePlayerBadges: stub("fetchGamePlayerBadges", { badges: [] }),
    ...overrides,
  };
}

test("availability distinguishes signed-out from a service that isn't there", () => {
  const api = fakeApi();
  assert.equal(taSocialAvailability({ apiClient: api, account: { authenticated: false } }), TA_SOCIAL_SIGNED_OUT);
  // Signed in but the platform client isn't configured — telling this player to
  // "sign in" would be wrong, so it must report unavailable instead.
  assert.equal(
    taSocialAvailability({ apiClient: { isConfigured: false }, account: { authenticated: true, playerId: "me", token: "t" } }),
    TA_SOCIAL_UNAVAILABLE,
  );
  assert.equal(
    taSocialAvailability({ apiClient: api, account: { authenticated: true, playerId: "me", token: "t" } }),
    "ready",
  );
});

test("an older platform client missing the social methods reads as unavailable", () => {
  assert.equal(isTaSocialApiReady(null), false);
  assert.equal(isTaSocialApiReady({ isConfigured: true }), false);
  const partial = fakeApi();
  delete partial.searchGamePlayers;
  assert.equal(isTaSocialApiReady(partial), false);
  assert.equal(isTaSocialApiReady(fakeApi()), true);
});

test("a player payload normalizes to the shape every surface renders", () => {
  const player = normalizeTaPlayer({
    playerId: "  p1  ",
    displayName: "  Bobcat  ",
    tagline: "Never skips bans",
    avatarUnit: "sniper",
    avatarSkin: "halloween",
    rating: "1300",
    tier: { id: "gold", label: "Gold" },
    wins: 5,
    losses: "1",
    draws: -3,
    relationship: "friend",
  });
  assert.equal(player.playerId, "p1", "ids are trimmed");
  assert.equal(player.displayName, "Bobcat");
  assert.equal(player.rating, 1300, "numeric strings become numbers");
  assert.deepEqual(player.tier, { id: "gold", label: "Gold" });
  assert.equal(player.losses, 1);
  assert.equal(player.draws, 0, "a negative count is not a real count");
  assert.equal(player.relationship, "friend");
});

test("a payload without a player id is dropped rather than rendered blank", () => {
  assert.equal(normalizeTaPlayer(null), null);
  assert.equal(normalizeTaPlayer({}), null);
  assert.equal(normalizeTaPlayer({ playerId: "   " }), null);
  assert.equal(normalizeTaPlayer({ playerId: "p1" }).relationship, "none", "relationship defaults, never undefined");
});

test("every read passes the game slug and normalizes the response", async () => {
  const api = fakeApi({
    fetchGameFriends: async () => ({
      friends: [
        { playerId: "p1", displayName: "Bobcat", rating: 1300 },
        { nonsense: true },
      ],
    }),
  });
  const client = createTaFriendsClient({ apiClient: api, gameSlug: SLUG });

  const friends = await client.listFriends();
  assert.deepEqual(friends.friends.map((f) => f.playerId), ["p1"], "malformed entries are dropped");

  await client.listRequests();
  await client.search("bob");
  assert.deepEqual(api.calls.find(([name]) => name === "searchGamePlayers"), ["searchGamePlayers", SLUG, "bob", undefined]);
});

test("the friends and blocked lists carry their own relationship", async () => {
  // The list endpoints don't repeat the relationship per row. Without stamping it, a
  // friend row falls back to "none" and offers the player an Add Friend button.
  const api = fakeApi({
    fetchGameFriends: async () => ({ friends: [{ playerId: "p1", displayName: "Bobcat" }] }),
    fetchGameBlocks: async () => ({ blocked: [{ playerId: "p9", displayName: "Jerk" }] }),
  });
  const client = createTaFriendsClient({ apiClient: api, gameSlug: SLUG });

  const friends = await client.listFriends();
  assert.deepEqual(friends.friends.map((f) => f.relationship), ["friend"]);

  const blocked = await client.listBlocked();
  assert.deepEqual(blocked.blocked.map((p) => p.relationship), ["blocked"]);
});

test("every mutation forwards to the matching endpoint with the slug", async () => {
  const api = fakeApi();
  const client = createTaFriendsClient({ apiClient: api, gameSlug: SLUG });

  await client.sendRequest("p2");
  await client.acceptRequest("7");
  await client.declineRequest("8");
  await client.cancelRequest("9");
  await client.removeFriend("p3");
  await client.blockPlayer("p4");
  await client.unblockPlayer("p5");

  assert.deepEqual(api.calls, [
    ["sendGameFriendRequest", SLUG, "p2"],
    ["acceptGameFriendRequest", SLUG, "7"],
    ["declineGameFriendRequest", SLUG, "8"],
    ["cancelGameFriendRequest", SLUG, "9"],
    ["removeGameFriend", SLUG, "p3"],
    ["blockGamePlayer", SLUG, "p4"],
    ["unblockGamePlayer", SLUG, "p5"],
  ]);
});

test("a rejected request resolves to null instead of throwing into the UI", async () => {
  const client = createTaFriendsClient({
    apiClient: fakeApi({ fetchGameFriends: async () => { throw new Error("network down"); } }),
    gameSlug: SLUG,
  });
  assert.equal(await client.listFriends(), null);
});

test("an unconfigured client refuses every call rather than half-working", async () => {
  const client = createTaFriendsClient({ apiClient: { isConfigured: false }, gameSlug: SLUG });
  assert.equal(client.isReady, false);
  assert.equal(await client.listFriends(), null);
  assert.equal(await client.sendRequest("p2"), null);
  assert.equal(await client.search("bob"), null);
});

test("a server refusal is passed through so the UI can explain it", async () => {
  const client = createTaFriendsClient({
    apiClient: fakeApi({ sendGameFriendRequest: async () => ({ error: "already_friends" }) }),
    gameSlug: SLUG,
  });
  assert.deepEqual(await client.sendRequest("p2"), { error: "already_friends" });
});
