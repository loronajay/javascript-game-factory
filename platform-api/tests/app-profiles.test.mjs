import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.mjs";
import { signToken } from "../src/auth-helpers.mjs";

const TEST_SECRET = "test-jwt-secret-at-least-32-chars-long";

function authHeadersFor(playerId) {
  const token = signToken({ playerId, email: "player@example.com" }, TEST_SECRET);
  return { authorization: `Bearer ${token}` };
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value = "") {
      this.body = value;
    },
  };
}

async function invoke(app, { method = "GET", url = "/", body = null, headers = {} } = {}) {
  const req = {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== null) {
        yield Buffer.from(body);
      }
    },
  };
  const res = createMockResponse();
  await app(req, res);
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    json: JSON.parse(res.body),
  };
}

test("GET /players/:playerId returns 404 when no profile exists", async () => {
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    loadPlayerProfile: async () => null,
  });

  const response = await invoke(app, { url: "/players/player-1" });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json.error, "player_not_found");
});

test("GET /players/:playerId/profile repairs a signed-in player's missing profile", async () => {
  let savedInput = null;
  const app = createApp({
    config: { hasDatabaseUrl: true },
    jwtSecret: TEST_SECRET,
    now: () => "2026-04-22T00:00:00.000Z",
    loadPlayerProfile: async () => null,
    savePlayerProfile: async (playerId, patch) => {
      savedInput = { playerId, patch };
      return {
        playerId,
        profileName: "",
        friendCode: "SELF1234",
      };
    },
  });

  const response = await invoke(app, {
    url: "/players/player-1/profile",
    headers: authHeadersFor("player-1"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(savedInput, {
    playerId: "player-1",
    patch: {},
  });
  assert.deepEqual(response.json, {
    player: {
      playerId: "player-1",
      profileName: "",
      friendCode: "SELF1234",
    },
  });
});

test("GET /players/:playerId/profile does not create another player's missing profile", async () => {
  let saveCalls = 0;
  const app = createApp({
    config: { hasDatabaseUrl: true },
    jwtSecret: TEST_SECRET,
    now: () => "2026-04-22T00:00:00.000Z",
    loadPlayerProfile: async () => null,
    savePlayerProfile: async () => {
      saveCalls += 1;
      return null;
    },
  });

  const response = await invoke(app, {
    url: "/players/player-2/profile",
    headers: authHeadersFor("player-1"),
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json.error, "player_not_found");
  assert.equal(saveCalls, 0);
});

test("GET /players/:playerId returns a profile payload", async () => {
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    loadPlayerProfile: async () => ({
      playerId: "player-1",
      profileName: "Leo",
      bio: "",
    }),
  });

  const response = await invoke(app, { url: "/players/player-1" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, {
    player: {
      playerId: "player-1",
      profileName: "Leo",
      bio: "",
    },
  });
});

test("GET /players/by-friend-code/:friendCode returns 404 when no profile exists", async () => {
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    loadPlayerProfileByFriendCode: async () => null,
  });

  const response = await invoke(app, { url: "/players/by-friend-code/ABCD1234" });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json.error, "player_not_found");
});

test("GET /players/by-friend-code/:friendCode returns a profile payload", async () => {
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    loadPlayerProfileByFriendCode: async (friendCode) => ({
      playerId: "player-1",
      profileName: "Leo",
      friendCode,
      bio: "",
    }),
  });

  const response = await invoke(app, { url: "/players/by-friend-code/ABCD1234" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, {
    player: {
      playerId: "player-1",
      profileName: "Leo",
      friendCode: "ABCD1234",
      bio: "",
    },
  });
});

test("GET /players/:playerId/profile also returns a profile payload", async () => {
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    loadPlayerProfile: async () => ({
      playerId: "player-1",
      profileName: "Leo",
      bio: "",
    }),
  });

  const response = await invoke(app, { url: "/players/player-1/profile" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, {
    player: {
      playerId: "player-1",
      profileName: "Leo",
      bio: "",
    },
  });
});

test("GET /players/:playerId/profile resolves nested friend avatar asset ids", async () => {
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    avatarUrlResolver: (assetId) => `https://cdn.example.com/${assetId}.png`,
    loadPlayerProfile: async () => ({
      playerId: "player-1",
      profileName: "Leo",
      avatarAssetId: "asset-owner",
      friendsPreview: [{
        playerId: "player-2",
        profileName: "Maya",
        avatarAssetId: "asset-friend",
      }],
      mainSqueeze: {
        playerId: "player-3",
        profileName: "Tori",
        avatarAssetId: "asset-squeeze",
      },
    }),
  });

  const response = await invoke(app, { url: "/players/player-1/profile" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.player.avatarUrl, "https://cdn.example.com/asset-owner.png");
  assert.equal(response.json.player.friendsPreview[0].avatarUrl, "https://cdn.example.com/asset-friend.png");
  assert.equal(response.json.player.mainSqueeze.avatarUrl, "https://cdn.example.com/asset-squeeze.png");
});

test("PUT /players/:playerId/profile saves the profile payload", async () => {
  let savedInput = null;
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    savePlayerProfile: async (playerId, patch) => {
      savedInput = { playerId, patch };
      return {
        playerId,
        profileName: patch.profileName,
        bio: patch.bio,
      };
    },
  });

  const response = await invoke(app, {
    method: "PUT",
    url: "/players/player-1/profile",
    body: JSON.stringify({
      profileName: "Leo",
      bio: "Arcade builder",
    }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(savedInput, {
    playerId: "player-1",
    patch: {
      profileName: "Leo",
      bio: "Arcade builder",
    },
  });
  assert.deepEqual(response.json, {
    player: {
      playerId: "player-1",
      profileName: "Leo",
      bio: "Arcade builder",
    },
  });
});

test("PUT /players/:playerId/profile rejects invalid json", async () => {
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
  });

  const response = await invoke(app, {
    method: "PUT",
    url: "/players/player-1/profile",
    body: "{bad json",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json.error, "invalid_json");
});
