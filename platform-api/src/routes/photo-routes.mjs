import { readJsonBody, writeJson } from "../http-utils.mjs";
import { normalizeThoughtPost } from "../normalize.mjs";

function buildPhotoThoughtRecord({ playerId, authorDisplayName, subject, text, visibility, imageUrl, caption }) {
  return normalizeThoughtPost({
    id: `thought-photo-${playerId.slice(0, 24)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    authorPlayerId: playerId,
    authorDisplayName,
    subject: String(subject || ""),
    text: String(text || caption || ""),
    visibility: String(visibility || "public"),
    imageUrl: String(imageUrl),
    commentCount: 0,
    shareCount: 0,
    reactionTotals: {},
    repostOfId: "",
    createdAt: new Date().toISOString(),
    editedAt: "",
  });
}

function buildPhotoNotificationPayload(type, { actorPlayerId, actorDisplayName, commentRecord, photo }) {
  if (type === "photo_comment") {
    return {
      recipientPlayerId: commentRecord.photo.playerId,
      actorPlayerId,
      actorDisplayName,
      type,
      payload: {
        photoId: commentRecord.photo.id,
        photoOwnerId: commentRecord.photo.playerId,
        commentId: commentRecord.comment?.id || "",
        commentText: String(commentRecord.comment?.text || "").slice(0, 80),
        photoCaption: String(commentRecord.photo.caption || "").slice(0, 80),
      },
    };
  }

  return {
    recipientPlayerId: photo.playerId,
    actorPlayerId,
    actorDisplayName,
    type,
    payload: {
      photoId: photo.id,
      photoOwnerId: photo.playerId,
      reactionId: photo.viewerReaction,
      photoCaption: String(photo.caption || "").slice(0, 80),
    },
  };
}

// Gallery and photo-social routes share the same ownership and feed-post
// rules, so they stay together as one extracted route family.
export async function handlePhotoRoute(context) {
  const {
    req,
    res,
    method,
    pathname,
    requestUrl,
    authClaims,
    requestOrigin,
    timestamp,
    services,
  } = context;
  const {
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
  } = services;

  const playerPhotosMatch = pathname.match(/^\/players\/([^/]+)\/photos$/);
  const playerPhotoMatch = pathname.match(/^\/players\/([^/]+)\/photos\/([^/]+)$/);
  const photoReactionsMatch = pathname.match(/^\/photos\/([^/]+)\/reactions$/);
  const photoCommentsMatch = pathname.match(/^\/photos\/([^/]+)\/comments$/);

  if (method === "GET" && playerPhotosMatch) {
    const targetPlayerId = decodeURIComponent(playerPhotosMatch[1]);
    const visibilityParam = requestUrl.searchParams.get("visibility") || null;
    const viewerPlayerId = authClaims?.playerId || "";
    const isOwner = viewerPlayerId === targetPlayerId;
    const resolvedVisibility = isOwner ? visibilityParam : "public";
    const photos = await listPlayerPhotos(targetPlayerId, { visibility: resolvedVisibility });
    writeJson(res, 200, { photos }, requestOrigin);
    return true;
  }

  if (method === "POST" && playerPhotosMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const targetPlayerId = decodeURIComponent(playerPhotosMatch[1]);
    if (authClaims.playerId !== targetPlayerId) {
      writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
      return true;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }

    const { assetId, imageUrl, caption, visibility, postToFeed, subject, thoughtText } = body.value || {};
    if (!assetId || !imageUrl) {
      writeJson(res, 400, { status: "error", error: "missing_asset", timestamp }, requestOrigin);
      return true;
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
      return true;
    }

    let thought = null;
    if (postToFeed) {
      const ownerProfile = await loadPlayerProfile(targetPlayerId).catch(() => null);
      const authorDisplayName = ownerProfile?.profileName || targetPlayerId;
      const normalized = buildPhotoThoughtRecord({
        playerId: targetPlayerId,
        authorDisplayName,
        subject,
        text: thoughtText,
        visibility,
        imageUrl,
        caption,
      });
      thought = await saveThought(normalized).catch(() => null);
    }

    writeJson(res, 201, { photo, thought }, requestOrigin);
    return true;
  }

  if (method === "GET" && playerPhotoMatch) {
    const photoId = decodeURIComponent(playerPhotoMatch[2]);
    const viewerPlayerId = authClaims?.playerId || "";
    const photo = await getPlayerPhoto(photoId, { viewerPlayerId });
    if (!photo) {
      writeJson(res, 404, { status: "error", error: "not_found", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { photo }, requestOrigin);
    return true;
  }

  if (method === "DELETE" && playerPhotoMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const targetPlayerId = decodeURIComponent(playerPhotoMatch[1]);
    const photoId = decodeURIComponent(playerPhotoMatch[2]);
    if (authClaims.playerId !== targetPlayerId) {
      writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
      return true;
    }
    const deleted = await deletePlayerPhoto(photoId, targetPlayerId);
    writeJson(res, 200, { ok: deleted }, requestOrigin);
    return true;
  }

  if (method === "GET" && photoCommentsMatch) {
    const photoId = decodeURIComponent(photoCommentsMatch[1]);
    const comments = await listPhotoComments(photoId);
    writeJson(res, 200, { comments }, requestOrigin);
    return true;
  }

  if (method === "POST" && photoCommentsMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const photoId = decodeURIComponent(photoCommentsMatch[1]);
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const actorPlayerId = String(body.value?.viewerPlayerId || "");
    const actorDisplayName = String(body.value?.viewerAuthorDisplayName || "");
    const commentRecord = await commentOnPhoto(photoId, actorPlayerId, actorDisplayName, body.value?.text);
    if (!commentRecord) {
      writeJson(res, 400, { status: "error", error: "comment_failed", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { commentRecord }, requestOrigin);
    if (commentRecord.photo?.playerId && actorPlayerId && commentRecord.photo.playerId !== actorPlayerId) {
      void createNotification(buildPhotoNotificationPayload("photo_comment", {
        actorPlayerId,
        actorDisplayName,
        commentRecord,
      }));
    }
    return true;
  }

  if (method === "POST" && photoReactionsMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const photoId = decodeURIComponent(photoReactionsMatch[1]);
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const actorPlayerId = String(body.value?.viewerPlayerId || "");
    const actorDisplayName = String(body.value?.actorDisplayName || "");
    const photo = await reactToPhoto(photoId, actorPlayerId, body.value?.reactionId);
    if (!photo) {
      writeJson(res, 400, { status: "error", error: "reaction_failed", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { photo }, requestOrigin);
    if (photo.playerId && actorPlayerId && photo.playerId !== actorPlayerId && photo.viewerReaction) {
      void createNotification(buildPhotoNotificationPayload("photo_reaction", {
        actorPlayerId,
        actorDisplayName,
        photo,
      }));
    }
    return true;
  }

  return false;
}
