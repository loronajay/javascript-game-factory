import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.mjs";
import { signToken } from "../src/auth-helpers.mjs";

const TEST_SECRET = "test-secret";

function authHeadersFor(playerId) {
  return { authorization: `Bearer ${signToken({ playerId, email: "a@b.com", sessionId: "s1" }, TEST_SECRET)}` };
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
    jwtSecret: TEST_SECRET,
    loadPlayerProfile: async () => null,
  });

  const response = await invoke(app, { url: "/players/player-1" });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json.error, "player_not_found");
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
    jwtSecret: TEST_SECRET,
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
    headers: authHeadersFor("player-1"),
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

test("PUT /players/:playerId/profile requires authentication", async () => {
  let saved = false;
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    jwtSecret: TEST_SECRET,
    savePlayerProfile: async () => {
      saved = true;
      return {};
    },
  });

  const response = await invoke(app, {
    method: "PUT",
    url: "/players/player-1/profile",
    body: JSON.stringify({ profileName: "Attacker" }),
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.error, "not_authenticated");
  assert.equal(saved, false);
});

test("PUT /players/:playerId/profile cannot edit a different account", async () => {
  let saved = false;
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    jwtSecret: TEST_SECRET,
    savePlayerProfile: async () => {
      saved = true;
      return {};
    },
  });

  const response = await invoke(app, {
    method: "PUT",
    url: "/players/player-2/profile",
    headers: authHeadersFor("player-1"),
    body: JSON.stringify({ profileName: "Attacker" }),
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "forbidden");
  assert.equal(saved, false);
});

test("POST /players/:playerId/profile-view increments on the server for the signed-in viewer", async () => {
  const calls = [];
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    jwtSecret: TEST_SECRET,
    incrementPlayerProfileView: async (playerId, options) => {
      calls.push({ playerId, options });
      return { profileViewCount: 12, profileOpenSources: { search: 3 } };
    },
  });

  const response = await invoke(app, {
    method: "POST",
    url: "/players/player-2/profile-view",
    headers: authHeadersFor("player-1"),
    body: JSON.stringify({ source: "search", profileViewCount: 999999 }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{ playerId: "player-2", options: { source: "search", viewerPlayerId: "player-1" } }]);
  assert.equal(response.json.metrics.profileViewCount, 12);
});

test("PUT /players/:playerId/profile rejects invalid json", async () => {
  const app = createApp({
    config: { hasDatabaseUrl: true },
    now: () => "2026-04-22T00:00:00.000Z",
    jwtSecret: TEST_SECRET,
  });

  const response = await invoke(app, {
    method: "PUT",
    url: "/players/player-1/profile",
    headers: authHeadersFor("player-1"),
    body: "{bad json",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json.error, "invalid_json");
});
