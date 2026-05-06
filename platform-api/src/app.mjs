import {
  extractTokenFromRequest,
  verifyToken,
} from "./auth-helpers.mjs";
import { readJsonBody, readMultipartFile, applyCorsHeaders, writeJson } from "./http-utils.mjs";
import { handleAuthRoute } from "./routes/auth-routes.mjs";
import { handleMessageRoute } from "./routes/message-routes.mjs";
import { handleNotificationRoute } from "./routes/notification-routes.mjs";
import { handlePlayerRoute } from "./routes/player-routes.mjs";
import { handleThoughtRoute } from "./routes/thought-routes.mjs";
import { handlePhotoRoute } from "./routes/photo-routes.mjs";

function resolveProfileAvatarUrl(profile, resolver) {
  if (!profile || !resolver) return profile;

  const resolveFriendAvatar = (entry) => {
    if (!entry) return entry;
    const resolvedAvatarUrl = entry.avatarAssetId
      ? resolver(entry.avatarAssetId)
      : (entry.avatarUrl || "");
    return {
      ...entry,
      avatarUrl: resolvedAvatarUrl || "",
    };
  };

  return {
    ...profile,
    avatarUrl: profile.avatarAssetId ? resolver(profile.avatarAssetId) : (profile.avatarUrl || ""),
    friendsPreview: Array.isArray(profile.friendsPreview)
      ? profile.friendsPreview.map(resolveFriendAvatar)
      : profile.friendsPreview,
    mainSqueeze: resolveFriendAvatar(profile.mainSqueeze),
  };
}

function buildTimestamp(now) {
  if (typeof now === "function") {
    const value = now();
    return typeof value === "string" && value.trim() ? value : new Date().toISOString();
  }

  return new Date().toISOString();
}

const VALID_GESTURE_TYPES = new Set(["poke", "hug", "kick", "blowkiss", "nudge"]);

export function createApp(options = {}) {
  const config = options?.config && typeof options.config === "object"
    ? options.config
    : { hasDatabaseUrl: false };
  const checkDatabase = typeof options?.checkDatabase === "function"
    ? options.checkDatabase
    : async () => false;
  const searchPlayers = typeof options?.searchPlayers === "function"
    ? options.searchPlayers
    : async () => [];
  const loadPlayerProfile = typeof options?.loadPlayerProfile === "function"
    ? options.loadPlayerProfile
    : async () => null;
  const loadPlayerProfileByFriendCode = typeof options?.loadPlayerProfileByFriendCode === "function"
    ? options.loadPlayerProfileByFriendCode
    : async () => null;
  const savePlayerProfile = typeof options?.savePlayerProfile === "function"
    ? options.savePlayerProfile
    : async () => null;
  const loadPlayerMetrics = typeof options?.loadPlayerMetrics === "function"
    ? options.loadPlayerMetrics
    : async () => null;
  const savePlayerMetrics = typeof options?.savePlayerMetrics === "function"
    ? options.savePlayerMetrics
    : async () => null;
  const loadPlayerRelationships = typeof options?.loadPlayerRelationships === "function"
    ? options.loadPlayerRelationships
    : async () => null;
  const createFriendshipBetweenPlayers = typeof options?.createFriendshipBetweenPlayers === "function"
    ? options.createFriendshipBetweenPlayers
    : async () => null;
  const removeFriendBetweenPlayers = typeof options?.removeFriendBetweenPlayers === "function"
    ? options.removeFriendBetweenPlayers
    : async () => null;
  const recordSharedSessionBetweenPlayers = typeof options?.recordSharedSessionBetweenPlayers === "function"
    ? options.recordSharedSessionBetweenPlayers
    : async () => null;
  const recordSharedEventBetweenPlayers = typeof options?.recordSharedEventBetweenPlayers === "function"
    ? options.recordSharedEventBetweenPlayers
    : async () => null;
  const recordDirectInteractionBetweenPlayers = typeof options?.recordDirectInteractionBetweenPlayers === "function"
    ? options.recordDirectInteractionBetweenPlayers
    : async () => null;
  const savePlayerRelationships = typeof options?.savePlayerRelationships === "function"
    ? options.savePlayerRelationships
    : async () => null;
  const listActivityItems = typeof options?.listActivityItems === "function"
    ? options.listActivityItems
    : async () => [];
  const saveActivityItem = typeof options?.saveActivityItem === "function"
    ? options.saveActivityItem
    : async () => null;
  const listThoughts = typeof options?.listThoughts === "function"
    ? options.listThoughts
    : async () => [];
  const listThoughtComments = typeof options?.listThoughtComments === "function"
    ? options.listThoughtComments
    : async () => [];
  const saveThought = typeof options?.saveThought === "function"
    ? options.saveThought
    : async () => null;
  const shareThought = typeof options?.shareThought === "function"
    ? options.shareThought
    : async () => null;
  const commentOnThought = typeof options?.commentOnThought === "function"
    ? options.commentOnThought
    : async () => null;
  const reactToThought = typeof options?.reactToThought === "function"
    ? options.reactToThought
    : async () => null;
  const deleteThought = typeof options?.deleteThought === "function"
    ? options.deleteThought
    : async () => false;
  const createNotification = typeof options?.createNotification === "function"
    ? options.createNotification
    : async () => null;
  const listNotifications = typeof options?.listNotifications === "function"
    ? options.listNotifications
    : async () => ({ notifications: [], unreadCount: 0 });
  const markAllNotificationsRead = typeof options?.markAllNotificationsRead === "function"
    ? options.markAllNotificationsRead
    : async () => {};
  const createFriendRequest = typeof options?.createFriendRequest === "function"
    ? options.createFriendRequest
    : async () => null;
  const getFriendRequest = typeof options?.getFriendRequest === "function"
    ? options.getFriendRequest
    : async () => null;
  const acceptFriendRequest = typeof options?.acceptFriendRequest === "function"
    ? options.acceptFriendRequest
    : async () => null;
  const rejectFriendRequest = typeof options?.rejectFriendRequest === "function"
    ? options.rejectFriendRequest
    : async () => null;
  const createChallenge = typeof options?.createChallenge === "function"
    ? options.createChallenge
    : async () => null;
  const getChallenge = typeof options?.getChallenge === "function"
    ? options.getChallenge
    : async () => null;
  const acceptChallenge = typeof options?.acceptChallenge === "function"
    ? options.acceptChallenge
    : async () => null;
  const declineChallenge = typeof options?.declineChallenge === "function"
    ? options.declineChallenge
    : async () => null;
  const findOrCreateConversation = typeof options?.findOrCreateConversation === "function"
    ? options.findOrCreateConversation
    : async () => null;
  const findConversationBetween = typeof options?.findConversationBetween === "function"
    ? options.findConversationBetween
    : async () => null;
  const listConversations = typeof options?.listConversations === "function"
    ? options.listConversations
    : async () => [];
  const getConversation = typeof options?.getConversation === "function"
    ? options.getConversation
    : async () => null;
  const listMessages = typeof options?.listMessages === "function"
    ? options.listMessages
    : async () => [];
  const createMessage = typeof options?.createMessage === "function"
    ? options.createMessage
    : async () => null;
  const markConversationRead = typeof options?.markConversationRead === "function"
    ? options.markConversationRead
    : async () => {};
  const savePlayerPhoto = typeof options?.savePlayerPhoto === "function"
    ? options.savePlayerPhoto
    : async () => null;
  const listPlayerPhotos = typeof options?.listPlayerPhotos === "function"
    ? options.listPlayerPhotos
    : async () => [];
  const getPlayerPhoto = typeof options?.getPlayerPhoto === "function"
    ? options.getPlayerPhoto
    : async () => null;
  const deletePlayerPhoto = typeof options?.deletePlayerPhoto === "function"
    ? options.deletePlayerPhoto
    : async () => false;
  const reactToPhoto = typeof options?.reactToPhoto === "function"
    ? options.reactToPhoto
    : async () => null;
  const commentOnPhoto = typeof options?.commentOnPhoto === "function"
    ? options.commentOnPhoto
    : async () => null;
  const listPhotoComments = typeof options?.listPhotoComments === "function"
    ? options.listPhotoComments
    : async () => [];
  const registerAccount = typeof options?.registerAccount === "function"
    ? options.registerAccount
    : async () => ({ error: "not_configured" });
  const loginAccount = typeof options?.loginAccount === "function"
    ? options.loginAccount
    : async () => ({ error: "not_configured" });
  const requestPasswordReset = typeof options?.requestPasswordReset === "function"
    ? options.requestPasswordReset
    : async () => ({ ok: true });
  const resetPassword = typeof options?.resetPassword === "function"
    ? options.resetPassword
    : async () => ({ error: "not_configured" });
  const deleteAccount = typeof options?.deleteAccount === "function"
    ? options.deleteAccount
    : async () => ({ error: "not_configured" });
  const uploadService = options?.uploadService && typeof options.uploadService.uploadImage === "function"
    ? options.uploadService
    : null;
  const avatarUrlResolver = typeof options?.avatarUrlResolver === "function"
    ? options.avatarUrlResolver
    : null;
  const jwtSecret = typeof options?.jwtSecret === "string" ? options.jwtSecret : "";
  const isProduction = Boolean(options?.isProduction);
  const now = options?.now;
  const authServices = {
    registerAccount,
    loginAccount,
    requestPasswordReset,
    resetPassword,
    deleteAccount,
    jwtSecret,
    isProduction,
  };
  const messageServices = {
    listConversations,
    findConversationBetween,
    findOrCreateConversation,
    getConversation,
    listMessages,
    createMessage,
    markConversationRead,
    loadPlayerProfile,
    createNotification,
  };
  const thoughtServices = {
    listThoughts,
    listThoughtComments,
    saveThought,
    shareThought,
    commentOnThought,
    reactToThought,
    deleteThought,
    createNotification,
  };
  const photoServices = {
    savePlayerPhoto,
    listPlayerPhotos,
    getPlayerPhoto,
    deletePlayerPhoto,
    reactToPhoto,
    commentOnPhoto,
    listPhotoComments,
    loadPlayerProfile,
    saveThought,
    createNotification,
  };
  const playerServices = {
    searchPlayers,
    loadPlayerProfile,
    loadPlayerProfileByFriendCode,
    savePlayerProfile,
    loadPlayerMetrics,
    savePlayerMetrics,
    loadPlayerRelationships,
    savePlayerRelationships,
    createFriendshipBetweenPlayers,
    removeFriendBetweenPlayers,
    recordSharedSessionBetweenPlayers,
    recordSharedEventBetweenPlayers,
    recordDirectInteractionBetweenPlayers,
  };
  const notificationServices = {
    listNotifications,
    markAllNotificationsRead,
  };

  return async function app(req, res) {
    const requestOrigin = req?.headers?.origin || "";
    const timestamp = buildTimestamp(now);
    try {
      const method = typeof req?.method === "string" ? req.method.toUpperCase() : "GET";
      const requestUrl = new URL(req?.url || "/", "http://localhost");
      const pathname = requestUrl.pathname;

      const rawToken = extractTokenFromRequest(req);
      const authClaims = rawToken && jwtSecret ? verifyToken(rawToken, jwtSecret) : null;

      const playerGestureMatch = pathname.match(/^\/players\/([^/]+)\/gesture$/);
      const friendRequestActionMatch = pathname.match(/^\/friend-requests\/([^/]+)\/(accept|reject)$/);
      const challengeActionMatch = pathname.match(/^\/challenges\/([^/]+)\/(accept|decline)$/);
    if (method === "OPTIONS") {
      res.statusCode = 204;
      applyCorsHeaders(res, requestOrigin);
      res.end("");
      return;
    }

    if (method === "GET" && pathname === "/health") {
      writeJson(res, 200, {
        status: "ok",
        service: "platform-api",
        databaseConfigured: Boolean(config.hasDatabaseUrl),
        timestamp,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && pathname === "/ready") {
      if (!config.hasDatabaseUrl) {
        writeJson(res, 503, {
          status: "error",
          service: "platform-api",
          database: "missing_configuration",
          timestamp,
        }, requestOrigin);
        return;
      }

      const isDatabaseReady = await checkDatabase();
      writeJson(res, isDatabaseReady ? 200 : 503, {
        status: isDatabaseReady ? "ok" : "error",
        service: "platform-api",
        database: isDatabaseReady ? "up" : "down",
        timestamp,
      }, requestOrigin);
      return;
    }

    // Upload routes
    if (method === "POST" && (pathname === "/upload/avatar" || pathname === "/upload/photo" || pathname === "/upload/background")) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return;
      }

      if (!uploadService) {
        writeJson(res, 503, { status: "error", error: "upload_not_configured", timestamp }, requestOrigin);
        return;
      }

      const multipart = await readMultipartFile(req);
      if (!multipart.ok) {
        const statusCode = multipart.error === "file_too_large" ? 413 : 400;
        writeJson(res, statusCode, { status: "error", error: multipart.error, timestamp }, requestOrigin);
        return;
      }

      const isAvatar = pathname === "/upload/avatar";
      const isBackground = pathname === "/upload/background";
      const folder = isAvatar ? "uploads/avatars" : isBackground ? "uploads/backgrounds" : "uploads/player-photos";
      const maxWidth = isAvatar ? 800 : isBackground ? 1920 : 1200;

      const result = await uploadService.uploadImage(multipart.buffer, {
        folder,
        maxWidth,
        mimeType: multipart.mimeType,
      });

      if (!result.ok) {
        const statusCode = result.error === "unsupported_file_type" ? 415 : 500;
        writeJson(res, statusCode, { status: "error", error: result.error, timestamp }, requestOrigin);
        return;
      }

      writeJson(res, 200, { assetId: result.assetId, url: result.url }, requestOrigin);
      return;
    }

    // Auth routes
    if (await handleAuthRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: authServices,
    })) {
      return;
    }

    if (await handleMessageRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: messageServices,
    })) {
      return;
    }

    if (await handleThoughtRoute({
      req,
      res,
      method,
      pathname,
      requestUrl,
      requestOrigin,
      timestamp,
      services: thoughtServices,
    })) {
      return;
    }

    if (await handlePhotoRoute({
      req,
      res,
      method,
      pathname,
      requestUrl,
      authClaims,
      requestOrigin,
      timestamp,
      services: photoServices,
    })) {
      return;
    }

    if (await handlePlayerRoute({
      req,
      res,
      method,
      pathname,
      requestUrl,
      authClaims,
      requestOrigin,
      timestamp,
      avatarUrlResolver,
      services: playerServices,
    })) {
      return;
    }

    if (await handleNotificationRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: notificationServices,
    })) {
      return;
    }

    if (method === "GET" && pathname === "/activity") {
      const items = await listActivityItems();
      writeJson(res, 200, { items }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/activity") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const item = await saveActivityItem(body.value);
      writeJson(res, 200, { item }, requestOrigin);
      return;
    }

    // Friend request routes (auth required)
    if (method === "POST" && pathname === "/friend-requests") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }
      const { toPlayerId, fromDisplayName } = body.value || {};
      const fromPlayerId = authClaims.playerId;
      if (!toPlayerId || toPlayerId === fromPlayerId) {
        writeJson(res, 400, { status: "error", error: "invalid_target", timestamp }, requestOrigin);
        return;
      }
      // create request first so we have the ID for the notification payload
      const request = await createFriendRequest({
        fromPlayerId,
        toPlayerId,
        fromDisplayName: String(fromDisplayName || ""),
      });
      if (!request) {
        writeJson(res, 409, { status: "error", error: "request_already_pending", timestamp }, requestOrigin);
        return;
      }
      void createNotification({
        recipientPlayerId: toPlayerId,
        actorPlayerId: fromPlayerId,
        actorDisplayName: String(fromDisplayName || ""),
        type: "friend_request",
        payload: { requestId: request.id },
      });
      writeJson(res, 201, { request }, requestOrigin);
      return;
    }

    if (method === "POST" && friendRequestActionMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const requestId = decodeURIComponent(friendRequestActionMatch[1]);
      const action = friendRequestActionMatch[2];
      const friendRequest = await getFriendRequest(requestId);
      if (!friendRequest) {
        writeJson(res, 404, { status: "error", error: "request_not_found", timestamp }, requestOrigin);
        return;
      }
      if (friendRequest.toPlayerId !== authClaims.playerId) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }
      if (action === "accept") {
        const acceptBody = await readJsonBody(req).catch(() => ({ ok: false }));
        const acceptorDisplayName = String(acceptBody?.value?.acceptorDisplayName || "");
        const accepted = await acceptFriendRequest(requestId);
        if (!accepted) {
          writeJson(res, 409, { status: "error", error: "request_not_pending", timestamp }, requestOrigin);
          return;
        }
        // create actual friendship — awaited so failures surface rather than being silently swallowed
        try {
          await createFriendshipBetweenPlayers(accepted.fromPlayerId, accepted.toPlayerId, {});
        } catch (err) {
          process.stderr.write(`[accept-friend-request] createFriendshipBetweenPlayers failed: ${err?.message || err}\n`);
        }
        // notify the sender — prefer name from body, then profile lookup, then generic fallback
        const resolvedAcceptorName = acceptorDisplayName
          || (await loadPlayerProfile(accepted.toPlayerId).catch(() => null))?.profileName
          || "A player";
        void createNotification({
          recipientPlayerId: accepted.fromPlayerId,
          actorPlayerId: accepted.toPlayerId,
          actorDisplayName: resolvedAcceptorName,
          type: "friend_accept",
          payload: { requestId },
        });
        writeJson(res, 200, { ok: true, request: accepted }, requestOrigin);
      } else {
        const rejected = await rejectFriendRequest(requestId);
        if (!rejected) {
          writeJson(res, 409, { status: "error", error: "request_not_pending", timestamp }, requestOrigin);
          return;
        }
        writeJson(res, 200, { ok: true, request: rejected }, requestOrigin);
      }
      return;
    }

    // Challenge routes (auth required)
    const VALID_GAME_SLUGS = new Set(["lovers-lost", "battleshits"]);
    if (method === "POST" && pathname === "/challenges") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }
      const { toPlayerId, gameSlug, gameTitle, fromDisplayName } = body.value || {};
      const fromPlayerId = authClaims.playerId;
      if (!toPlayerId || toPlayerId === fromPlayerId) {
        writeJson(res, 400, { status: "error", error: "invalid_target", timestamp }, requestOrigin);
        return;
      }
      if (!gameSlug || !VALID_GAME_SLUGS.has(gameSlug)) {
        writeJson(res, 400, { status: "error", error: "invalid_game", timestamp }, requestOrigin);
        return;
      }
      const actorProfile = await loadPlayerProfile(fromPlayerId).catch(() => null);
      const actorDisplayName = actorProfile?.profileName || String(fromDisplayName || "");
      const challenge = await createChallenge({
        fromPlayerId,
        toPlayerId,
        fromDisplayName: actorDisplayName,
        gameSlug,
        gameTitle: String(gameTitle || gameSlug),
      });
      if (!challenge) {
        writeJson(res, 500, { status: "error", error: "create_failed", timestamp }, requestOrigin);
        return;
      }
      void createNotification({
        recipientPlayerId: toPlayerId,
        actorPlayerId: fromPlayerId,
        actorDisplayName,
        type: "player_challenge",
        payload: { challengeId: challenge.id, gameSlug, gameTitle: String(gameTitle || gameSlug) },
      });
      writeJson(res, 201, { challenge }, requestOrigin);
      return;
    }

    if (method === "POST" && challengeActionMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const challengeId = decodeURIComponent(challengeActionMatch[1]);
      const action = challengeActionMatch[2];
      const challenge = await getChallenge(challengeId);
      if (!challenge) {
        writeJson(res, 404, { status: "error", error: "challenge_not_found", timestamp }, requestOrigin);
        return;
      }
      if (challenge.toPlayerId !== authClaims.playerId) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }
      if (action === "accept") {
        const accepted = await acceptChallenge(challengeId);
        if (!accepted) {
          writeJson(res, 409, { status: "error", error: "challenge_not_pending", timestamp }, requestOrigin);
          return;
        }
        const acceptorProfile = await loadPlayerProfile(authClaims.playerId).catch(() => null);
        const acceptorName = acceptorProfile?.profileName || "A player";
        void createNotification({
          recipientPlayerId: accepted.fromPlayerId,
          actorPlayerId: authClaims.playerId,
          actorDisplayName: acceptorName,
          type: "challenge_accepted",
          payload: { challengeId, gameSlug: accepted.gameSlug, gameTitle: accepted.gameTitle },
        });
        writeJson(res, 200, { ok: true, challenge: accepted }, requestOrigin);
      } else {
        const declined = await declineChallenge(challengeId);
        if (!declined) {
          writeJson(res, 409, { status: "error", error: "challenge_not_pending", timestamp }, requestOrigin);
          return;
        }
        const declinerProfile = await loadPlayerProfile(authClaims.playerId).catch(() => null);
        const declinerName = declinerProfile?.profileName || "A player";
        void createNotification({
          recipientPlayerId: declined.fromPlayerId,
          actorPlayerId: authClaims.playerId,
          actorDisplayName: declinerName,
          type: "challenge_declined",
          payload: { challengeId, gameSlug: declined.gameSlug, gameTitle: declined.gameTitle },
        });
        writeJson(res, 200, { ok: true, challenge: declined }, requestOrigin);
      }
      return;
    }

    // Gesture routes (auth required)
    if (method === "POST" && playerGestureMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const toPlayerId = decodeURIComponent(playerGestureMatch[1]);
      const actorPlayerId = authClaims.playerId;
      if (toPlayerId === actorPlayerId) {
        writeJson(res, 400, { status: "error", error: "invalid_target", timestamp }, requestOrigin);
        return;
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }
      const gestureType = String(body.value?.gestureType || "").toLowerCase();
      if (!VALID_GESTURE_TYPES.has(gestureType)) {
        writeJson(res, 400, { status: "error", error: "invalid_gesture_type", timestamp }, requestOrigin);
        return;
      }
      const actorProfile = await loadPlayerProfile(actorPlayerId).catch(() => null);
      const actorDisplayName = actorProfile?.profileName || String(body.value?.fromDisplayName || "");
      void createNotification({
        recipientPlayerId: toPlayerId,
        actorPlayerId,
        actorDisplayName,
        type: "player_gesture",
        payload: { gestureType },
      });
      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

      writeJson(res, 404, {
        status: "error",
        service: "platform-api",
        error: "not_found",
        timestamp,
      }, requestOrigin);
    } catch (error) {
      process.stderr.write(`[platform-api] unhandled request error: ${error?.stack || error?.message || error}\n`);
      writeJson(res, 500, {
        status: "error",
        service: "platform-api",
        error: "internal_error",
        timestamp,
      }, requestOrigin);
    }
  };
}
