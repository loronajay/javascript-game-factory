import test from "node:test";
import assert from "node:assert/strict";

import {
  loadPlayerProfile,
  loadPlayerProfileByFriendCode,
  savePlayerProfile,
} from "../src/db/profiles.mjs";

function createMockDb(overrides = {}) {
  return {
    async query(sql, params = []) {
      if (typeof overrides.query === "function") {
        return overrides.query(String(sql), params);
      }

      return { rows: [] };
    },
  };
}

test("loadPlayerProfile returns null when the player does not exist", async () => {
  const db = createMockDb();

  const record = await loadPlayerProfile(db, "player-1");

  assert.equal(record, null);
});

test("loadPlayerProfile maps player and profile rows into the current contract", async () => {
  const db = createMockDb({
    async query() {
      return {
        rows: [{
          player_id: "player-1",
          profile_name: "Leo",
          friend_code: "ABCD1234",
          real_name: "Leo J",
          bio: "Arcade builder",
          tagline: "Still coding",
          avatar_asset_id: "avatar-1",
          background_image_url: "https://example.com/bg.png",
          presence: "online",
          favorite_game_slug: "lovers-lost",
          ladder_placements: [{ gameSlug: "lovers-lost", rank: 1, ratingLabel: "999 ELO", score: 999 }],
          friends_preview: [{ playerId: "player-2", profileName: "Maya" }],
          main_squeeze: { playerId: "player-2", profileName: "Maya" },
          badge_ids: ["founder"],
          favorites: ["lovers-lost"],
          friends: ["player-2"],
          recent_partners: ["player-2"],
          links: [{ id: "link-1", label: "site", url: "https://example.com", kind: "external", createdAt: "" }],
          preferences: { theme: "arcade" },
          featured_games: ["battleshits"],
          recent_activity: [{ id: "activity-1" }],
          thought_count: 3,
        }],
      };
    },
  });

  const record = await loadPlayerProfile(db, "player-1");

  assert.deepEqual(record, {
    version: 1,
    playerId: "player-1",
    profileName: "Leo",
    friendCode: "ABCD1234",
    realName: "Leo J",
    bio: "Arcade builder",
    tagline: "Still coding",
    avatarAssetId: "avatar-1",
    backgroundImageUrl: "https://example.com/bg.png",
    backgroundStyle: "blend",
    presence: "online",
    favoriteGameSlug: "lovers-lost",
    ladderPlacements: [{ gameSlug: "lovers-lost", rank: 1, ratingLabel: "999 ELO", score: 999 }],
    friendsPreview: [{
      playerId: "player-2",
      profileName: "Maya",
      presence: "offline",
      friendPoints: 0,
      isMainSqueeze: false,
      avatarAssetId: "",
      avatarUrl: "",
    }],
    mainSqueeze: {
      playerId: "player-2",
      profileName: "Maya",
      presence: "offline",
      friendPoints: 0,
      isMainSqueeze: true,
      avatarAssetId: "",
      avatarUrl: "",
    },
    badgeIds: ["founder"],
    favorites: ["lovers-lost"],
    friends: ["player-2"],
    recentPartners: ["player-2"],
    links: [{ id: "link-1", label: "site", url: "https://example.com/", kind: "external", createdAt: "" }],
    preferences: { theme: "arcade" },
    featuredGames: ["battleshits"],
    recentActivity: [{ id: "activity-1" }],
    thoughtCount: 3,
    discoverable: true,
    profileMusicPlaylist: [],
    hasAccount: false,
  });
});

test("loadPlayerProfileByFriendCode finds a player through the stored friend code", async () => {
  const db = createMockDb({
    async query(sql) {
      if (sql.includes("where pp.friend_code = $1")) {
        return {
          rows: [{
            player_id: "player-2",
            profile_name: "Maya",
            friend_code: "MAYA7777",
            real_name: "",
            bio: "",
            tagline: "",
            avatar_asset_id: "",
            background_image_url: "",
            presence: "offline",
            favorite_game_slug: "",
            ladder_placements: [],
            friends_preview: [],
            main_squeeze: null,
            badge_ids: [],
            favorites: [],
            friends: [],
            recent_partners: [],
            links: [],
            preferences: {},
            featured_games: [],
            recent_activity: [],
            thought_count: 0,
          }],
        };
      }

      return { rows: [] };
    },
  });

  const record = await loadPlayerProfileByFriendCode(db, "maya-7777");

  assert.equal(record.playerId, "player-2");
  assert.equal(record.friendCode, "MAYA7777");
});

test("savePlayerProfile upserts player and profile rows", async () => {
  const calls = [];
  const db = createMockDb({
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (sql.includes("insert into players")) {
        return { rows: [] };
      }

      if (sql.includes("insert into player_profiles")) {
        return {
          rows: [{
            player_id: "player-1",
            profile_name: "Leo",
            friend_code: "ABCD1234",
            real_name: "",
            bio: "",
            tagline: "",
            avatar_asset_id: "",
            background_image_url: "",
            presence: "offline",
            favorite_game_slug: "",
            ladder_placements: [],
            friends_preview: [],
            main_squeeze: null,
            badge_ids: [],
            favorites: [],
            friends: [],
            recent_partners: [],
            links: [],
            preferences: {},
            featured_games: [],
            recent_activity: [],
            thought_count: 0,
          }],
        };
      }

      return { rows: [] };
    },
  });

  const saved = await savePlayerProfile(db, "player-1", {
    profileName: "Leo",
  });

  assert.equal(saved.playerId, "player-1");
  assert.equal(saved.profileName, "Leo");
  assert.equal(saved.friendCode, "ABCD1234");
  assert.ok(calls.some((entry) => entry.sql.includes("insert into players")));
  assert.ok(calls.some((entry) => entry.sql.includes("insert into player_profiles")));
});

test("savePlayerProfile preserves canonical fields omitted by a narrow patch", async () => {
  let upsertParams = null;
  const existingRow = {
    player_id: "player-1",
    profile_name: "Old Name",
    friend_code: "ABCD1234",
    real_name: "Leo",
    bio: "Arcade builder",
    tagline: "Still coding",
    avatar_asset_id: "avatar/cloudinary-id",
    background_image_url: "https://example.com/background.png",
    background_style: "cover",
    presence: "online",
    favorite_game_slug: "tactical-arena",
    ladder_placements: [],
    friends_preview: [],
    main_squeeze: null,
    badge_ids: ["founder"],
    favorites: ["tactical-arena"],
    friends: ["player-2"],
    recent_partners: [],
    links: [],
    preferences: { discoverable: true },
    featured_games: ["tactical-arena"],
    recent_activity: [],
    thought_count: 2,
    profile_music_playlist: [{
      title: "Factory Theme",
      artist: "Jay",
      url: "https://example.com/theme.mp3",
    }],
    has_account: true,
  };
  const db = createMockDb({
    async query(sql, params = []) {
      if (sql.includes("from players p")) {
        return { rows: [existingRow] };
      }
      if (sql.includes("select player_id") && sql.includes("where friend_code = $1")) {
        return { rows: [{ player_id: "player-1" }] };
      }
      if (sql.includes("insert into players")) {
        return { rows: [] };
      }
      if (sql.includes("insert into player_profiles")) {
        upsertParams = params;
        return { rows: [{ ...existingRow, profile_name: params[1] }] };
      }
      return { rows: [] };
    },
  });

  await savePlayerProfile(db, "player-1", { profileName: "New Name" });

  assert.equal(upsertParams[1], "New Name");
  assert.equal(upsertParams[6], "avatar/cloudinary-id");
  assert.equal(upsertParams[7], "https://example.com/background.png");
  assert.deepEqual(JSON.parse(upsertParams[23]), existingRow.profile_music_playlist);
});
