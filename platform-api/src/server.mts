import { createServer } from "node:http";

import pg from "pg";

import { createApp } from "./app.mjs";
import { createUploadService } from "./services/upload.mjs";
import { listActivityItems, saveActivityItem } from "./db/activity.mjs";
import { readConfig } from "./config.mjs";
import { loadPlayerMetrics, savePlayerMetrics } from "./db/metrics.mjs";
import { applyMigrations } from "./db/migrations.mjs";
import { getGameProgress, recordGameProgressClaim } from "./db/game-progress.mjs";
import { loadPlayerLayout, loadPlayerProfile, loadPlayerProfileByFriendCode, savePlayerLayout, savePlayerProfile, searchPlayers } from "./db/profiles.mjs";
import { getGameRating, recordMatchRating } from "./db/ratings.mjs";
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
  logoutAccountService,
  registerAccountService,
  requestPasswordResetService,
  resetPasswordService,
  verifyAccountSessionService,
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

function createDatabaseCheck(pool: any) {
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

async function closePool(pool: any): Promise<void> {
  if (!pool) return;

  try {
    await pool.end();
  } catch {
    // Shutdown should stay best-effort for the first scaffold.
  }
}

async function bootstrap(): Promise<void> {
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

  function avatarUrlResolver(assetId: any): string {
    if (!assetId) return "";
    return `https://res.cloudinary.com/${config.cloudinaryCloudName}/image/upload/${assetId}`;
  }

  const app = createApp({
    config,
    uploadService,
    avatarUrlResolver,
    checkDatabase: createDatabaseCheck(pool),
    searchPlayers: (q: any) => searchPlayers(pool, q),
    registerAccount: (params: any) => registerAccountService(pool, params),
    loginAccount: (params: any) => loginAccountService(pool, params),
    verifyAccountSession: (playerId: any, sessionId: any) => verifyAccountSessionService(pool, playerId, sessionId),
    logoutAccount: (playerId: any, sessionId: any) => logoutAccountService(pool, playerId, sessionId),
    requestPasswordReset: ({ email }: any) => requestPasswordResetService(pool, emailSender, { email, appBaseUrl: config.appBaseUrl }),
    resetPassword: (params: any) => resetPasswordService(pool, params),
    deleteAccount: (playerId: any) => deleteAccountService(pool, playerId),
    jwtSecret: config.jwtSecret,
    isProduction: config.isProduction,
    loadPlayerLayout: (playerId: any) => loadPlayerLayout(pool, playerId),
    savePlayerLayout: (playerId: any, layout: any) => savePlayerLayout(pool, playerId, layout),
    loadPlayerProfile: (playerId: any) => loadPlayerProfile(pool, playerId),
    loadPlayerProfileByFriendCode: (friendCode: any) => loadPlayerProfileByFriendCode(pool, friendCode),
    savePlayerProfile: (playerId: any, patch: any) => savePlayerProfile(pool, playerId, patch),
    loadPlayerMetrics: (playerId: any) => loadPlayerMetrics(pool, playerId),
    savePlayerMetrics: (playerId: any, patch: any) => savePlayerMetrics(pool, playerId, patch),
    loadPlayerRelationships: (playerId: any) => loadPlayerRelationships(pool, playerId),
    createFriendshipBetweenPlayers: (leftPlayerId: any, rightPlayerId: any, options: any) => createFriendshipBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    removeFriendBetweenPlayers: (leftPlayerId: any, rightPlayerId: any) => removeFriendBetweenPlayers(pool, leftPlayerId, rightPlayerId),
    recordSharedSessionBetweenPlayers: (leftPlayerId: any, rightPlayerId: any, options: any) => recordSharedSessionBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    recordSharedEventBetweenPlayers: (leftPlayerId: any, rightPlayerId: any, options: any) => recordSharedEventBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    recordDirectInteractionBetweenPlayers: (leftPlayerId: any, rightPlayerId: any, options: any) => recordDirectInteractionBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    savePlayerRelationships: (playerId: any, patch: any) => savePlayerRelationships(pool, playerId, patch),
    listActivityItems: () => listActivityItems(pool),
    saveActivityItem: (item: any) => saveActivityItem(pool, item),
    listThoughts: (options: any) => listThoughts(pool, options),
    listThoughtComments: (thoughtId: any, options: any) => listThoughtComments(pool, thoughtId, options),
    saveThought: (thought: any) => saveThought(pool, thought),
    shareThought: (thoughtId: any, viewerPlayerId: any, viewerAuthorDisplayName: any, options: any) => shareThought(pool, thoughtId, viewerPlayerId, viewerAuthorDisplayName, options),
    commentOnThought: (thoughtId: any, viewerPlayerId: any, viewerAuthorDisplayName: any, text: any) => commentOnThought(pool, thoughtId, viewerPlayerId, viewerAuthorDisplayName, text),
    reactToThought: (thoughtId: any, viewerPlayerId: any, reactionId: any) => reactToThought(pool, thoughtId, viewerPlayerId, reactionId),
    deleteThought: (thoughtId: any) => deleteThought(pool, thoughtId),
    createNotification: (params: any) => createNotification(pool, params),
    listNotifications: (recipientPlayerId: any) => listNotifications(pool, recipientPlayerId),
    markAllNotificationsRead: (recipientPlayerId: any) => markAllNotificationsRead(pool, recipientPlayerId),
    createFriendRequest: (params: any) => createFriendRequest(pool, params),
    getFriendRequest: (id: any) => getFriendRequest(pool, id),
    acceptFriendRequest: (id: any) => acceptFriendRequest(pool, id),
    rejectFriendRequest: (id: any) => rejectFriendRequest(pool, id),
    createChallenge: (params: any) => createChallenge(pool, params),
    getChallenge: (id: any) => getChallenge(pool, id),
    acceptChallenge: (id: any) => acceptChallenge(pool, id),
    declineChallenge: (id: any) => declineChallenge(pool, id),
    findOrCreateConversation: (p1: any, p2: any) => findOrCreateConversation(pool, p1, p2),
    findConversationBetween: (p1: any, p2: any) => findConversationBetween(pool, p1, p2),
    listConversations: (playerId: any) => listConversations(pool, playerId),
    getConversation: (convId: any) => getConversation(pool, convId),
    listMessages: (convId: any) => listMessages(pool, convId),
    createMessage: (params: any) => createMessage(pool, params),
    markConversationRead: (convId: any, playerId: any) => markConversationRead(pool, convId, playerId),
    getGameRating: (gameSlug: any, playerId: any) => getGameRating(pool, playerId, gameSlug),
    recordMatchRating: (gameSlug: any, params: any) => recordMatchRating(pool, { ...params, gameSlug }),
    getGameProgress: (playerId: any, gameSlug: any) => getGameProgress(pool, playerId, gameSlug),
    recordGameProgressClaim: (params: any) => recordGameProgressClaim(pool, params),
    savePlayerPhoto: (params: any) => savePlayerPhoto(pool, params),
    listPlayerPhotos: (playerId: any, opts: any) => listPlayerPhotos(pool, playerId, opts),
    getPlayerPhoto: (photoId: any, opts: any) => getPlayerPhoto(pool, photoId, opts),
    deletePlayerPhoto: (photoId: any, playerId: any) => deletePlayerPhoto(pool, photoId, playerId),
    reactToPhoto: (photoId: any, viewerPlayerId: any, reactionId: any) => reactToPhoto(pool, photoId, viewerPlayerId, reactionId),
    commentOnPhoto: (photoId: any, viewerPlayerId: any, displayName: any, text: any) => commentOnPhoto(pool, photoId, viewerPlayerId, displayName, text),
    listPhotoComments: (photoId: any) => listPhotoComments(pool, photoId),
  });
  const server = createServer(app);

  async function shutdown(signal: any): Promise<void> {
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
