import busboy from "busboy";

import {
  buildClearCookieHeader,
  buildSetCookieHeader,
  extractTokenFromRequest,
  signToken,
  verifyToken,
} from "./auth-helpers.mjs";
import { normalizeThoughtPost } from "./normalize.mjs";

function applyCorsHeaders(res, requestOrigin) {
  if (requestOrigin) {
    res.setHeader("access-control-allow-origin", requestOrigin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  } else {
    res.setHeader("access-control-allow-origin", "*");
  }
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function writeJson(res, statusCode, payload, requestOrigin) {
  res.statusCode = statusCode;
  applyCorsHeaders(res, requestOrigin);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];

  try {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    return { ok: false, error: "invalid_body" };
  }

  if (chunks.length === 0) {
    return { ok: true, value: {} };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

function readMultipartFile(req) {
  return new Promise((resolve) => {
    const contentType = req.headers?.["content-type"] || "";
    if (!contentType.startsWith("multipart/form-data")) {
      resolve({ ok: false, error: "not_multipart" });
      return;
    }

    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
    } catch {
      resolve({ ok: false, error: "invalid_multipart" });
      return;
    }

    let fileBuffer = null;
    let mimeType = "";
    let fileSizeLimitHit = false;

    bb.on("file", (_fieldname, fileStream, info) => {
      mimeType = info.mimeType || "";
      const chunks = [];
      fileStream.on("data", (chunk) => chunks.push(chunk));
      fileStream.on("limit", () => { fileSizeLimitHit = true; fileStream.resume(); });
      fileStream.on("end", () => {
        if (!fileSizeLimitHit) {
          fileBuffer = Buffer.concat(chunks);
        }
      });
    });

    bb.on("finish", () => {
      if (fileSizeLimitHit) {
        resolve({ ok: false, error: "file_too_large" });
      } else if (!fileBuffer) {
        resolve({ ok: false, error: "no_file" });
      } else {
        resolve({ ok: true, buffer: fileBuffer, mimeType });
      }
    });

    bb.on("error", () => resolve({ ok: false, error: "multipart_parse_error" }));
    req.pipe(bb);
  });
}

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

function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  const atIdx = trimmed.indexOf("@");
  if (atIdx < 1) return false;
  const afterAt = trimmed.slice(atIdx + 1);
  return afterAt.includes(".") && afterAt.length > 2 && !trimmed.includes(" ");
}

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
  const deletePlayerPhoto = typeof options?.deletePlayerPhoto === "function"
    ? options.deletePlayerPhoto
    : async () => false;
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

  return async function app(req, res) {
    const requestOrigin = req?.headers?.origin || "";
    const timestamp = buildTimestamp(now);
    try {
      const method = typeof req?.method === "string" ? req.method.toUpperCase() : "GET";
      const requestUrl = new URL(req?.url || "/", "http://localhost");
      const pathname = requestUrl.pathname;

      const rawToken = extractTokenFromRequest(req);
      const authClaims = rawToken && jwtSecret ? verifyToken(rawToken, jwtSecret) : null;

      const playerMatch = pathname.match(/^\/players\/([^/]+)$/);
      const friendCodeMatch = pathname.match(/^\/players\/by-friend-code\/([^/]+)$/);
      const profileMatch = pathname.match(/^\/players\/([^/]+)\/profile$/);
      const metricsMatch = pathname.match(/^\/players\/([^/]+)\/metrics$/);
      const relationshipsMatch = pathname.match(/^\/players\/([^/]+)\/relationships$/);
      const playerFriendMatch = pathname.match(/^\/players\/([^/]+)\/friends\/([^/]+)$/);
      const playerGestureMatch = pathname.match(/^\/players\/([^/]+)\/gesture$/);
      const playerPhotosMatch = pathname.match(/^\/players\/([^/]+)\/photos$/);
      const playerPhotoMatch = pathname.match(/^\/players\/([^/]+)\/photos\/([^/]+)$/);
      const friendRequestActionMatch = pathname.match(/^\/friend-requests\/([^/]+)\/(accept|reject)$/);
      const challengeActionMatch = pathname.match(/^\/challenges\/([^/]+)\/(accept|decline)$/);
      const messagesWithMatch = pathname.match(/^\/messages\/with\/([^/]+)$/);
      const conversationMatch = pathname.match(/^\/messages\/([^/]+)$/);
      const conversationReadMatch = pathname.match(/^\/messages\/([^/]+)\/read$/);

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
    if (method === "POST" && pathname === "/auth/register") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }

      const { email, password, profileName, claimPlayerId } = body.value || {};

      if (!isValidEmail(email)) {
        writeJson(res, 400, { status: "error", error: "invalid_email", timestamp }, requestOrigin);
        return;
      }

      if (!password || String(password).length < 8) {
        writeJson(res, 400, { status: "error", error: "password_too_short", timestamp }, requestOrigin);
        return;
      }

      if (!jwtSecret) {
        writeJson(res, 503, { status: "error", error: "auth_not_configured", timestamp }, requestOrigin);
        return;
      }

      const result = await registerAccount({ email, password, profileName, claimPlayerId });

      if (!result?.ok) {
        const statusCode = result?.error === "email_taken" ? 409 : 400;
        writeJson(res, statusCode, { status: "error", error: result?.error || "register_failed", timestamp }, requestOrigin);
        return;
      }

      const token = signToken({ playerId: result.playerId, email: result.email }, jwtSecret);
      res.setHeader("set-cookie", buildSetCookieHeader(token, isProduction));
      writeJson(res, 201, { playerId: result.playerId, profileName: result.profileName, email: result.email }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/auth/login") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }

      const { email, password } = body.value || {};

      if (!isValidEmail(email) || !password) {
        writeJson(res, 400, { status: "error", error: "missing_credentials", timestamp }, requestOrigin);
        return;
      }

      if (!jwtSecret) {
        writeJson(res, 503, { status: "error", error: "auth_not_configured", timestamp }, requestOrigin);
        return;
      }

      const result = await loginAccount({ email, password });

      if (!result?.ok) {
        writeJson(res, 401, { status: "error", error: "invalid_credentials", timestamp }, requestOrigin);
        return;
      }

      const token = signToken({ playerId: result.playerId, email: result.email }, jwtSecret);
      res.setHeader("set-cookie", buildSetCookieHeader(token, isProduction));
      writeJson(res, 200, { playerId: result.playerId, email: result.email }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/auth/logout") {
      res.setHeader("set-cookie", buildClearCookieHeader(isProduction));
      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

    if (method === "GET" && pathname === "/auth/me") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      writeJson(res, 200, { playerId: authClaims.playerId, email: authClaims.email }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/auth/forgot-password") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }

      const { email } = body.value || {};
      if (!isValidEmail(email)) {
        // Still return 200 to avoid leaking whether the email exists
        writeJson(res, 200, { ok: true }, requestOrigin);
        return;
      }

      await requestPasswordReset({ email });
      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/auth/reset-password") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }

      const { token, newPassword } = body.value || {};
      const result = await resetPassword({ token, newPassword });

      if (!result?.ok) {
        const statusCode = result?.error === "token_expired" || result?.error === "token_already_used"
          ? 410
          : 400;
        writeJson(res, statusCode, { status: "error", error: result?.error || "reset_failed", timestamp }, requestOrigin);
        return;
      }

      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

    if (method === "DELETE" && pathname === "/auth/account") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }

      const result = await deleteAccount(authClaims.playerId);

      if (!result?.ok) {
        writeJson(res, 400, { status: "error", error: result?.error || "delete_failed", timestamp }, requestOrigin);
        return;
      }

      res.setHeader("set-cookie", buildClearCookieHeader(isProduction));
      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

    if (method === "GET" && pathname === "/players/search") {
      const q = requestUrl.searchParams.get("q") || "";
      if (!q.trim()) {
        writeJson(res, 200, { players: [] }, requestOrigin);
        return;
      }
      const players = await searchPlayers(q);
      writeJson(res, 200, {
        players: players.map((p) => resolveProfileAvatarUrl(p, avatarUrlResolver)),
      }, requestOrigin);
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

    if (method === "GET" && pathname === "/thoughts") {
      const thoughts = await listThoughts({
        viewerPlayerId: requestUrl.searchParams.get("viewerPlayerId") || "",
      });
      writeJson(res, 200, { thoughts }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/thoughts") {
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

      const thought = await saveThought(body.value);
      writeJson(res, 200, { thought }, requestOrigin);
      return;
    }

    const thoughtDeleteMatch = pathname.match(/^\/thoughts\/([^/]+)$/);
    const thoughtReactionMatch = pathname.match(/^\/thoughts\/([^/]+)\/reactions$/);
    const thoughtShareMatch = pathname.match(/^\/thoughts\/([^/]+)\/shares$/);
    const thoughtCommentMatch = pathname.match(/^\/thoughts\/([^/]+)\/comments$/);
    if (method === "GET" && thoughtCommentMatch) {
      const comments = await listThoughtComments(decodeURIComponent(thoughtCommentMatch[1]));
      writeJson(res, 200, { comments }, requestOrigin);
      return;
    }

    if (method === "POST" && thoughtCommentMatch) {
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

      const actorPlayerId = String(body.value?.viewerPlayerId || "");
      const actorDisplayName = String(body.value?.viewerAuthorDisplayName || "");
      const commentRecord = await commentOnThought(
        decodeURIComponent(thoughtCommentMatch[1]),
        actorPlayerId,
        actorDisplayName,
        body.value?.text,
      );
      writeJson(res, 200, { commentRecord }, requestOrigin);
      if (commentRecord?.thought?.authorPlayerId && actorPlayerId && commentRecord.thought.authorPlayerId !== actorPlayerId) {
        void createNotification({
          recipientPlayerId: commentRecord.thought.authorPlayerId,
          actorPlayerId,
          actorDisplayName,
          type: "thought_comment",
          payload: {
            thoughtId: commentRecord.thought.id,
            commentId: commentRecord.comment?.id || "",
            commentText: String(commentRecord.comment?.text || "").slice(0, 80),
            thoughtText: String(commentRecord.thought.text || "").slice(0, 80),
          },
        });
      }
      return;
    }

    if (method === "POST" && thoughtShareMatch) {
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

      const actorPlayerId = String(body.value?.viewerPlayerId || "");
      const actorDisplayName = String(body.value?.viewerAuthorDisplayName || "");
      const share = await shareThought(
        decodeURIComponent(thoughtShareMatch[1]),
        actorPlayerId,
        actorDisplayName,
        body.value,
      );
      writeJson(res, 200, { share }, requestOrigin);
      if (share?.sharedThought && share?.originalThought?.authorPlayerId && actorPlayerId && share.originalThought.authorPlayerId !== actorPlayerId) {
        void createNotification({
          recipientPlayerId: share.originalThought.authorPlayerId,
          actorPlayerId,
          actorDisplayName,
          type: "thought_share",
          payload: {
            thoughtId: share.originalThought.id,
            thoughtText: String(share.originalThought.text || "").slice(0, 80),
          },
        });
      }
      return;
    }

    if (method === "POST" && thoughtReactionMatch) {
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

      const actorPlayerId = String(body.value?.viewerPlayerId || "");
      const actorDisplayName = String(body.value?.actorDisplayName || "");
      const thought = await reactToThought(
        decodeURIComponent(thoughtReactionMatch[1]),
        actorPlayerId,
        body.value?.reactionId,
      );
      writeJson(res, 200, { thought }, requestOrigin);
      // fire-and-forget notification when reaction is set (not removed) on someone else's thought
      if (thought?.authorPlayerId && actorPlayerId && thought.authorPlayerId !== actorPlayerId && thought.viewerReaction) {
        void createNotification({
          recipientPlayerId: thought.authorPlayerId,
          actorPlayerId,
          actorDisplayName,
          type: "thought_reaction",
          payload: {
            thoughtId: thought.id,
            reactionId: thought.viewerReaction,
            thoughtText: String(thought.text || "").slice(0, 80),
          },
        });
      }
      return;
    }

    if (method === "DELETE" && thoughtDeleteMatch) {
      const thoughtId = decodeURIComponent(thoughtDeleteMatch[1]);
      const deleted = await deleteThought(thoughtId);
      writeJson(res, 200, {
        deleted,
        id: thoughtId,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && (playerMatch || profileMatch)) {
      const profile = await loadPlayerProfile(decodeURIComponent((profileMatch || playerMatch)[1]));
      if (!profile) {
        writeJson(res, 404, {
          status: "error",
          service: "platform-api",
          error: "player_not_found",
          timestamp,
        }, requestOrigin);
        return;
      }

      writeJson(res, 200, {
        player: resolveProfileAvatarUrl(profile, avatarUrlResolver),
      }, requestOrigin);
      return;
    }

    if (method === "GET" && friendCodeMatch) {
      const profile = await loadPlayerProfileByFriendCode(decodeURIComponent(friendCodeMatch[1]));
      if (!profile) {
        writeJson(res, 404, {
          status: "error",
          service: "platform-api",
          error: "player_not_found",
          timestamp,
        }, requestOrigin);
        return;
      }

      writeJson(res, 200, {
        player: resolveProfileAvatarUrl(profile, avatarUrlResolver),
      }, requestOrigin);
      return;
    }

    if (method === "PUT" && profileMatch) {
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

      const profile = await savePlayerProfile(decodeURIComponent(profileMatch[1]), body.value);
      writeJson(res, 200, {
        player: profile,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && metricsMatch) {
      const metrics = await loadPlayerMetrics(decodeURIComponent(metricsMatch[1]));
      writeJson(res, 200, {
        metrics,
      }, requestOrigin);
      return;
    }

    if (method === "PUT" && metricsMatch) {
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

      const metrics = await savePlayerMetrics(decodeURIComponent(metricsMatch[1]), body.value);
      writeJson(res, 200, {
        metrics,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && relationshipsMatch) {
      const relationships = await loadPlayerRelationships(decodeURIComponent(relationshipsMatch[1]));
      writeJson(res, 200, {
        relationships,
      }, requestOrigin);
      return;
    }

    if (method === "PUT" && relationshipsMatch) {
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

      const relationships = await savePlayerRelationships(decodeURIComponent(relationshipsMatch[1]), body.value);
      writeJson(res, 200, {
        relationships,
      }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/friendships") {
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

      const friendship = await createFriendshipBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { friendship }, requestOrigin);
      return;
    }

    if (method === "DELETE" && playerFriendMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const viewerPlayerId = decodeURIComponent(playerFriendMatch[1]);
      const targetPlayerId = decodeURIComponent(playerFriendMatch[2]);
      if (authClaims.playerId !== viewerPlayerId) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }
      const result = await removeFriendBetweenPlayers(viewerPlayerId, targetPlayerId);
      writeJson(res, 200, { removed: result?.removed ?? false }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/relationships/shared-session") {
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

      const relationshipUpdate = await recordSharedSessionBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { relationshipUpdate }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/relationships/shared-event") {
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

      const relationshipUpdate = await recordSharedEventBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { relationshipUpdate }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/relationships/direct-interaction") {
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

      const relationshipUpdate = await recordDirectInteractionBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { relationshipUpdate }, requestOrigin);
      return;
    }

    // Notification routes (auth required)
    if (method === "GET" && pathname === "/notifications") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const result = await listNotifications(authClaims.playerId);
      writeJson(res, 200, result, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/notifications/read-all") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      await markAllNotificationsRead(authClaims.playerId);
      writeJson(res, 200, { ok: true }, requestOrigin);
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

    // Photo gallery routes
    if (method === "GET" && playerPhotosMatch) {
      const targetPlayerId = decodeURIComponent(playerPhotosMatch[1]);
      const visibilityParam = requestUrl.searchParams.get("visibility") || null;
      const viewerPlayerId = authClaims?.playerId || "";
      const isOwner = viewerPlayerId === targetPlayerId;
      const resolvedVisibility = isOwner ? visibilityParam : "public";
      const photos = await listPlayerPhotos(targetPlayerId, { visibility: resolvedVisibility });
      writeJson(res, 200, { photos }, requestOrigin);
      return;
    }

    if (method === "POST" && playerPhotosMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const targetPlayerId = decodeURIComponent(playerPhotosMatch[1]);
      if (authClaims.playerId !== targetPlayerId) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }

      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }

      const { assetId, imageUrl, caption, visibility, postToFeed, subject, thoughtText } = body.value || {};
      if (!assetId || !imageUrl) {
        writeJson(res, 400, { status: "error", error: "missing_asset", timestamp }, requestOrigin);
        return;
      }

      const photo = await savePlayerPhoto({
        playerId: targetPlayerId,
        assetId: String(assetId),
        imageUrl: String(imageUrl),
        caption: String(caption || ""),
        visibility: String(visibility || "public"),
      });

      if (!photo) {
        writeJson(res, 500, { status: "error", error: "save_failed", timestamp }, requestOrigin);
        return;
      }

      let thought = null;
      if (postToFeed) {
        const ownerProfile = await loadPlayerProfile(targetPlayerId).catch(() => null);
        const authorDisplayName = ownerProfile?.profileName || targetPlayerId;
        const normalized = normalizeThoughtPost({
          id: `thought-photo-${targetPlayerId.slice(0, 24)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          authorPlayerId: targetPlayerId,
          authorDisplayName,
          subject: String(subject || ""),
          text: String(thoughtText || caption || ""),
          visibility: String(visibility || "public"),
          imageUrl: String(imageUrl),
          commentCount: 0,
          shareCount: 0,
          reactionTotals: {},
          repostOfId: "",
          createdAt: new Date().toISOString(),
          editedAt: "",
        });
        thought = await saveThought(normalized).catch(() => null);
      }

      writeJson(res, 201, { photo, thought }, requestOrigin);
      return;
    }

    if (method === "DELETE" && playerPhotoMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const targetPlayerId = decodeURIComponent(playerPhotoMatch[1]);
      const photoId = decodeURIComponent(playerPhotoMatch[2]);
      if (authClaims.playerId !== targetPlayerId) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }
      const deleted = await deletePlayerPhoto(photoId, targetPlayerId);
      writeJson(res, 200, { ok: deleted }, requestOrigin);
      return;
    }

    // Direct message routes (auth required)
    if (method === "GET" && pathname === "/messages") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const conversations = await listConversations(authClaims.playerId);
      writeJson(res, 200, { conversations }, requestOrigin);
      return;
    }

    if (method === "GET" && messagesWithMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const otherPlayerId = decodeURIComponent(messagesWithMatch[1]);
      const conversation = await findConversationBetween(authClaims.playerId, otherPlayerId);
      writeJson(res, 200, { conversation: conversation || null }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/messages") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }
      const { toPlayerId, text } = body.value || {};
      const fromPlayerId = authClaims.playerId;
      if (!toPlayerId || toPlayerId === fromPlayerId) {
        writeJson(res, 400, { status: "error", error: "invalid_target", timestamp }, requestOrigin);
        return;
      }
      if (!text?.trim()) {
        writeJson(res, 400, { status: "error", error: "empty_message", timestamp }, requestOrigin);
        return;
      }
      const conversation = await findOrCreateConversation(fromPlayerId, toPlayerId);
      if (!conversation) {
        writeJson(res, 500, { status: "error", error: "conversation_failed", timestamp }, requestOrigin);
        return;
      }
      const message = await createMessage({ conversationId: conversation.id, fromPlayerId, text });
      if (!message) {
        writeJson(res, 500, { status: "error", error: "send_failed", timestamp }, requestOrigin);
        return;
      }
      const senderProfile = await loadPlayerProfile(fromPlayerId).catch(() => null);
      const senderName = senderProfile?.profileName || "";
      void createNotification({
        recipientPlayerId: toPlayerId,
        actorPlayerId: fromPlayerId,
        actorDisplayName: senderName,
        type: "new_message",
        payload: { conversationId: conversation.id, preview: String(text).trim().slice(0, 80) },
      });
      writeJson(res, 201, { message, conversationId: conversation.id }, requestOrigin);
      return;
    }

    if (method === "GET" && conversationMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const convId = decodeURIComponent(conversationMatch[1]);
      const conversation = await getConversation(convId);
      if (!conversation) {
        writeJson(res, 404, { status: "error", error: "conversation_not_found", timestamp }, requestOrigin);
        return;
      }
      const isParticipant = conversation.playerAId === authClaims.playerId || conversation.playerBId === authClaims.playerId;
      if (!isParticipant) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }
      const otherPlayerId = conversation.playerAId === authClaims.playerId ? conversation.playerBId : conversation.playerAId;
      const [messages, otherProfile] = await Promise.all([
        listMessages(convId),
        loadPlayerProfile(otherPlayerId).catch(() => null),
      ]);
      const isPlayerA = conversation.playerAId === authClaims.playerId;
      writeJson(res, 200, {
        conversation: {
          ...conversation,
          otherPlayerId,
          otherProfileName: otherProfile?.profileName || "",
          unreadCount: isPlayerA ? conversation.unreadCountA : conversation.unreadCountB,
        },
        messages,
      }, requestOrigin);
      return;
    }

    if (method === "POST" && conversationReadMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const convId = decodeURIComponent(conversationReadMatch[1]);
      const conversation = await getConversation(convId);
      if (!conversation) {
        writeJson(res, 404, { status: "error", error: "conversation_not_found", timestamp }, requestOrigin);
        return;
      }
      const isParticipant = conversation.playerAId === authClaims.playerId || conversation.playerBId === authClaims.playerId;
      if (!isParticipant) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }
      await markConversationRead(convId, authClaims.playerId);
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
