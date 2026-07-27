import { createServer } from "node:http";

import pg from "pg";

import { createApp } from "./app.mjs";
import { createUploadService } from "./services/upload.mjs";
import { listActivityItems, saveActivityItem } from "./db/activity.mjs";
import { readConfig } from "./config.mjs";
import { loadPlayerMetrics, savePlayerMetrics } from "./db/metrics.mjs";
import { applyMigrations } from "./db/migrations.mjs";
import { activateInventoryItem, backfillLocalOwnership, findPlayPurchaseClaim, findStripeGrant, getGameProgress, recordGameProgressClaim, regrantStripeEntitlements, resetCampaignProgress, revokeGameEntitlements, spendValorForEntitlement } from "./db/game-progress.mjs";
import { loadPlayerLayout, loadPlayerProfile, loadPlayerProfileByFriendCode, savePlayerLayout, savePlayerProfile, searchPlayers } from "./db/profiles.mjs";
import { getGameRating, recordMatchRating } from "./db/ratings.mjs";
import { getLadderStandings, getPlayerLadderPlacements } from "./db/ladders.mjs";
import {
  cancelRanked,
  enqueueRanked,
  getPublicRankedCard,
  getRankedLeaderboard,
  getRankedMatchDetail,
  getRankedMatches,
  getRankedStanding,
  getRankedUnitStats,
  pollRanked,
  recordRankedHeartbeat,
  reportRankedResult,
  saveRankedProfile,
  setRankedLobbyCode,
  startRankedMatch,
} from "./db/ranked.mjs";
import {
  blockGamePlayer,
  cancelGameFriendRequest,
  getGamePlayerBadges,
  getGamePlayerRelationship,
  listGameBlocks,
  listGameFriendRequests,
  listGameFriends,
  removeGameFriend,
  respondToGameFriendRequest,
  searchGamePlayers,
  sendGameFriendRequest,
  unblockGamePlayer,
} from "./db/game-social.mjs";
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
  deleteThoughtComment,
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
import {
  createTacticalArenaCheckoutSession,
  fulfillPremiumCheckoutSessionFromReturn,
  fulfillStripeWebhook,
} from "./services/payments.mjs";
import { createPlayAccessTokenProvider, fulfillPlayPurchase } from "./services/play-billing.mjs";
import { createEmailSender } from "./email.mjs";
import {
  createNotification,
  deleteNotificationsByPayloadRef,
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
  deletePhotoComment,
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

  // One provider for the process: it caches the androidpublisher access token, so every
  // purchase verification after the first reuses it instead of re-signing a JWT.
  const getPlayAccessToken = createPlayAccessTokenProvider({
    serviceAccountKey: config.playServiceAccountKey,
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
    deleteThought: (thoughtId: any, requesterPlayerId: any) => deleteThought(pool, thoughtId, requesterPlayerId),
    deleteThoughtComment: (thoughtId: any, commentId: any, requesterPlayerId: any) =>
      deleteThoughtComment(pool, thoughtId, commentId, requesterPlayerId),
    createNotification: (params: any) => createNotification(pool, params),
    deleteNotificationsByPayloadRef: (payloadKey: any, payloadValue: any) =>
      deleteNotificationsByPayloadRef(pool, payloadKey, payloadValue),
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
    enqueueRanked: (gameSlug: any, params: any) => enqueueRanked(pool, { ...params, gameSlug }),
    pollRanked: (gameSlug: any, params: any) => pollRanked(pool, { ...params, gameSlug }),
    cancelRanked: (gameSlug: any, params: any) => cancelRanked(pool, { ...params, gameSlug }),
    startRankedMatch: (gameSlug: any, params: any) => startRankedMatch(pool, { ...params, gameSlug }),
    reportRankedResult: (gameSlug: any, params: any) => reportRankedResult(pool, { ...params, gameSlug }),
    recordRankedHeartbeat: (gameSlug: any, params: any) => recordRankedHeartbeat(pool, { ...params, gameSlug }),
    getRankedStanding: (gameSlug: any, params: any) => getRankedStanding(pool, { ...params, gameSlug }),
    setRankedLobby: (gameSlug: any, params: any) => setRankedLobbyCode(pool, { ...params, gameSlug }),
    saveRankedProfile: (gameSlug: any, params: any) => saveRankedProfile(pool, { ...params, gameSlug }),
    getRankedCard: (gameSlug: any, params: any) => getPublicRankedCard(pool, { ...params, gameSlug }),
    getRankedUnitStats: (gameSlug: any, params: any) => getRankedUnitStats(pool, { ...params, gameSlug }),
    getRankedMatches: (gameSlug: any, params: any) => getRankedMatches(pool, { ...params, gameSlug }),
    getRankedMatchDetail: (gameSlug: any, params: any) => getRankedMatchDetail(pool, { ...params, gameSlug }),
    getRankedLeaderboard: (gameSlug: any, params: any) => getRankedLeaderboard(pool, { ...params, gameSlug }),
    listGameFriends: (gameSlug: any, params: any) => listGameFriends(pool, { ...params, gameSlug }),
    removeGameFriend: (gameSlug: any, params: any) => removeGameFriend(pool, { ...params, gameSlug }),
    listGameFriendRequests: (gameSlug: any, params: any) => listGameFriendRequests(pool, { ...params, gameSlug }),
    sendGameFriendRequest: (gameSlug: any, params: any) => sendGameFriendRequest(pool, { ...params, gameSlug }),
    respondToGameFriendRequest: (gameSlug: any, params: any) => respondToGameFriendRequest(pool, { ...params, gameSlug }),
    cancelGameFriendRequest: (gameSlug: any, params: any) => cancelGameFriendRequest(pool, { ...params, gameSlug }),
    listGameBlocks: (gameSlug: any, params: any) => listGameBlocks(pool, { ...params, gameSlug }),
    blockGamePlayer: (gameSlug: any, params: any) => blockGamePlayer(pool, { ...params, gameSlug }),
    unblockGamePlayer: (gameSlug: any, params: any) => unblockGamePlayer(pool, { ...params, gameSlug }),
    searchGamePlayers: (gameSlug: any, params: any) => searchGamePlayers(pool, { ...params, gameSlug }),
    getGamePlayerRelationship: (gameSlug: any, params: any) => getGamePlayerRelationship(pool, { ...params, gameSlug }),
    getGamePlayerBadges: (gameSlug: any, params: any) => getGamePlayerBadges(pool, { ...params, gameSlug }),
    getLadderStandings: (gameSlug: any, params: any) => getLadderStandings(pool, { ...params, gameSlug }),
    getPlayerLadderPlacements: (playerId: any, params: any) => getPlayerLadderPlacements(pool, { ...params, playerId }),
    getGameProgress: (playerId: any, gameSlug: any) => getGameProgress(pool, playerId, gameSlug),
    recordGameProgressClaim: (params: any) => recordGameProgressClaim(pool, params),
    spendValor: (params: any) => spendValorForEntitlement(pool, params),
    resetCampaign: (params: any) => resetCampaignProgress(pool, params.playerId, params.gameSlug),
    backfillOwnership: (params: any) => backfillLocalOwnership(pool, params),
    activateConsumable: (params: any) => activateInventoryItem(pool, params),
    createPremiumCheckoutSession: (params: any) => createTacticalArenaCheckoutSession({
      ...params,
      stripeApiKey: config.stripeApiKey,
      stripePublishableKey: config.stripePublishableKey,
      appBaseUrl: config.appBaseUrl,
      getGameProgress: (playerId: any, gameSlug: any) => getGameProgress(pool, playerId, gameSlug),
    }),
    fulfillPremiumCheckoutSession: (params: any) => fulfillPremiumCheckoutSessionFromReturn({
      ...params,
      stripeApiKey: config.stripeApiKey,
      getGameProgress: (playerId: any, gameSlug: any) => getGameProgress(pool, playerId, gameSlug),
      recordGameProgressClaim: (claim: any) => recordGameProgressClaim(pool, { ...claim, allowPremiumKinds: true }),
    }),
    fulfillStripeWebhook: (params: any) => fulfillStripeWebhook({
      ...params,
      stripeWebhookSecret: config.stripeWebhookSecret,
      stripeApiKey: config.stripeApiKey,
      getGameProgress: (playerId: any, gameSlug: any) => getGameProgress(pool, playerId, gameSlug),
      recordGameProgressClaim: (claim: any) => recordGameProgressClaim(pool, { ...claim, allowPremiumKinds: true }),
      findStripeGrant: (lookup: any) => findStripeGrant(pool, lookup),
      revokeGameEntitlements: (revocation: any) => revokeGameEntitlements(pool, revocation),
      regrantStripeEntitlements: (regrant: any) => regrantStripeEntitlements(pool, regrant),
    }),
    fulfillPlayPurchase: config.hasPlayBilling
      ? (params: any) => fulfillPlayPurchase({
        ...params,
        packageName: config.playPackageName,
        getAccessToken: getPlayAccessToken,
        getGameProgress: (playerId: any, gameSlug: any) => getGameProgress(pool, playerId, gameSlug),
        recordGameProgressClaim: (claim: any) => recordGameProgressClaim(pool, { ...claim, allowPremiumKinds: true }),
        findPlayPurchaseClaim: (lookup: any) => findPlayPurchaseClaim(pool, lookup),
      })
      : null,
    savePlayerPhoto: (params: any) => savePlayerPhoto(pool, params),
    listPlayerPhotos: (playerId: any, opts: any) => listPlayerPhotos(pool, playerId, opts),
    getPlayerPhoto: (photoId: any, opts: any) => getPlayerPhoto(pool, photoId, opts),
    deletePlayerPhoto: (photoId: any, playerId: any) => deletePlayerPhoto(pool, photoId, playerId),
    reactToPhoto: (photoId: any, viewerPlayerId: any, reactionId: any) => reactToPhoto(pool, photoId, viewerPlayerId, reactionId),
    commentOnPhoto: (photoId: any, viewerPlayerId: any, displayName: any, text: any) => commentOnPhoto(pool, photoId, viewerPlayerId, displayName, text),
    listPhotoComments: (photoId: any) => listPhotoComments(pool, photoId),
    deletePhotoComment: (photoId: any, commentId: any, requesterPlayerId: any) =>
      deletePhotoComment(pool, photoId, commentId, requesterPlayerId),
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
