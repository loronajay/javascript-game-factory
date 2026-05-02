import { createServer } from "node:http";

import pg from "pg";

import { createApp } from "./app.mjs";
import { createUploadService } from "./services/upload.mjs";
import { listActivityItems, saveActivityItem } from "./db/activity.mjs";
import { readConfig } from "./config.mjs";
import { loadPlayerMetrics, savePlayerMetrics } from "./db/metrics.mjs";
import { applyMigrations } from "./db/migrations.mjs";
import { loadPlayerProfile, loadPlayerProfileByFriendCode, savePlayerProfile, searchPlayers } from "./db/profiles.mjs";
import {
  createFriendshipBetweenPlayers,
  loadPlayerRelationships,
  recordDirectInteractionBetweenPlayers,
  recordSharedEventBetweenPlayers,
  recordSharedSessionBetweenPlayers,
  removeFriendBetweenPlayers,
  savePlayerRelationships,
} from "./db/relationships.mjs";
import {
  commentOnThought,
  deleteThought,
  listThoughtComments,
  listThoughts,
  reactToThought,
  saveThought,
  shareThought,
} from "./db/thoughts.mjs";
import {
  deleteAccountService,
  loginAccountService,
  registerAccountService,
  requestPasswordResetService,
  resetPasswordService,
} from "./services/auth.mjs";
import { createEmailSender } from "./email.mjs";
import {
  createNotification,
  listNotifications,
  markAllNotificationsRead,
} from "./db/notifications.mjs";
import {
  createFriendRequest,
  getFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
} from "./db/friend-requests.mjs";
import {
  createChallenge,
  getChallenge,
  acceptChallenge,
  declineChallenge,
} from "./db/challenges.mjs";
import {
  findOrCreateConversation,
  findConversationBetween,
  listConversations,
  getConversation,
  listMessages,
  createMessage,
  markConversationRead,
} from "./db/messages.mjs";
import {
  savePlayerPhoto,
  listPlayerPhotos,
  getPlayerPhoto,
  deletePlayerPhoto,
  reactToPhoto,
  commentOnPhoto,
  listPhotoComments,
} from "./db/photos.mjs";

const { Pool } = pg;

function createDatabaseCheck(pool) {
  if (!pool) {
    return async () => false;
  }

  return async function checkDatabase() {
    try {
      await pool.query("select 1");
      return true;
    } catch {
      return false;
    }
  };
}

async function closePool(pool) {
  if (!pool) return;

  try {
    await pool.end();
  } catch {
    // Shutdown should stay best-effort for the first scaffold.
  }
}

async function bootstrap() {
  const config = readConfig();
  const pool = config.hasDatabaseUrl ? new Pool({ connectionString: config.databaseUrl }) : null;

  if (pool) {
    await applyMigrations(pool);
  }

  const emailSender = createEmailSender({
    apiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
  });

  const uploadService = createUploadService({
    cloudinaryCloudName: config.cloudinaryCloudName,
    cloudinaryApiKey: config.cloudinaryApiKey,
    cloudinaryApiSecret: config.cloudinaryApiSecret,
  });

  function avatarUrlResolver(assetId) {
    if (!assetId) return "";
    return `https://res.cloudinary.com/${config.cloudinaryCloudName}/image/upload/${assetId}`;
  }

  const app = createApp({
    config,
    uploadService,
    avatarUrlResolver,
    checkDatabase: createDatabaseCheck(pool),
    searchPlayers: (q) => searchPlayers(pool, q),
    registerAccount: (params) => registerAccountService(pool, params),
    loginAccount: (params) => loginAccountService(pool, params),
    requestPasswordReset: ({ email }) => requestPasswordResetService(pool, emailSender, { email, appBaseUrl: config.appBaseUrl }),
    resetPassword: (params) => resetPasswordService(pool, params),
    deleteAccount: (playerId) => deleteAccountService(pool, playerId),
    jwtSecret: config.jwtSecret,
    isProduction: config.isProduction,
    loadPlayerProfile: (playerId) => loadPlayerProfile(pool, playerId),
    loadPlayerProfileByFriendCode: (friendCode) => loadPlayerProfileByFriendCode(pool, friendCode),
    savePlayerProfile: (playerId, patch) => savePlayerProfile(pool, playerId, patch),
    loadPlayerMetrics: (playerId) => loadPlayerMetrics(pool, playerId),
    savePlayerMetrics: (playerId, patch) => savePlayerMetrics(pool, playerId, patch),
    loadPlayerRelationships: (playerId) => loadPlayerRelationships(pool, playerId),
    createFriendshipBetweenPlayers: (leftPlayerId, rightPlayerId, options) => createFriendshipBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    removeFriendBetweenPlayers: (leftPlayerId, rightPlayerId) => removeFriendBetweenPlayers(pool, leftPlayerId, rightPlayerId),
    recordSharedSessionBetweenPlayers: (leftPlayerId, rightPlayerId, options) => recordSharedSessionBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    recordSharedEventBetweenPlayers: (leftPlayerId, rightPlayerId, options) => recordSharedEventBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    recordDirectInteractionBetweenPlayers: (leftPlayerId, rightPlayerId, options) => recordDirectInteractionBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    savePlayerRelationships: (playerId, patch) => savePlayerRelationships(pool, playerId, patch),
    listActivityItems: () => listActivityItems(pool),
    saveActivityItem: (item) => saveActivityItem(pool, item),
    listThoughts: (options) => listThoughts(pool, options),
    listThoughtComments: (thoughtId, options) => listThoughtComments(pool, thoughtId, options),
    saveThought: (thought) => saveThought(pool, thought),
    shareThought: (thoughtId, viewerPlayerId, viewerAuthorDisplayName, options) => shareThought(pool, thoughtId, viewerPlayerId, viewerAuthorDisplayName, options),
    commentOnThought: (thoughtId, viewerPlayerId, viewerAuthorDisplayName, text) => commentOnThought(pool, thoughtId, viewerPlayerId, viewerAuthorDisplayName, text),
    reactToThought: (thoughtId, viewerPlayerId, reactionId) => reactToThought(pool, thoughtId, viewerPlayerId, reactionId),
    deleteThought: (thoughtId) => deleteThought(pool, thoughtId),
    createNotification: (params) => createNotification(pool, params),
    listNotifications: (recipientPlayerId) => listNotifications(pool, recipientPlayerId),
    markAllNotificationsRead: (recipientPlayerId) => markAllNotificationsRead(pool, recipientPlayerId),
    createFriendRequest: (params) => createFriendRequest(pool, params),
    getFriendRequest: (id) => getFriendRequest(pool, id),
    acceptFriendRequest: (id) => acceptFriendRequest(pool, id),
    rejectFriendRequest: (id) => rejectFriendRequest(pool, id),
    createChallenge: (params) => createChallenge(pool, params),
    getChallenge: (id) => getChallenge(pool, id),
    acceptChallenge: (id) => acceptChallenge(pool, id),
    declineChallenge: (id) => declineChallenge(pool, id),
    findOrCreateConversation: (p1, p2) => findOrCreateConversation(pool, p1, p2),
    findConversationBetween: (p1, p2) => findConversationBetween(pool, p1, p2),
    listConversations: (playerId) => listConversations(pool, playerId),
    getConversation: (convId) => getConversation(pool, convId),
    listMessages: (convId) => listMessages(pool, convId),
    createMessage: (params) => createMessage(pool, params),
    markConversationRead: (convId, playerId) => markConversationRead(pool, convId, playerId),
    savePlayerPhoto: (params) => savePlayerPhoto(pool, params),
    listPlayerPhotos: (playerId, opts) => listPlayerPhotos(pool, playerId, opts),
    getPlayerPhoto: (photoId, opts) => getPlayerPhoto(pool, photoId, opts),
    deletePlayerPhoto: (photoId, playerId) => deletePlayerPhoto(pool, photoId, playerId),
    reactToPhoto: (photoId, viewerPlayerId, reactionId) => reactToPhoto(pool, photoId, viewerPlayerId, reactionId),
    commentOnPhoto: (photoId, viewerPlayerId, displayName, text) => commentOnPhoto(pool, photoId, viewerPlayerId, displayName, text),
    listPhotoComments: (photoId) => listPhotoComments(pool, photoId),
  });
  const server = createServer(app);

  async function shutdown(signal) {
    server.close(async () => {
      await closePool(pool);
      process.exit(0);
    });

    setTimeout(async () => {
      await closePool(pool);
      process.exit(1);
    }, 5000).unref();

    if (signal) {
      process.stdout.write(`[platform-api] received ${signal}, shutting down\n`);
    }
  }

  server.listen(config.port, () => {
    process.stdout.write(`[platform-api] listening on port ${config.port}\n`);
  });

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

await bootstrap();
