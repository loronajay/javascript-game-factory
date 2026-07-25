import { readJsonBody, writeJson } from "../http-utils.mjs";

function buildThoughtNotificationPayload(type: any, { actorPlayerId, actorDisplayName, commentRecord, share, thought }: any): any {
  if (type === "thought_comment") {
    return {
      recipientPlayerId: commentRecord.thought.authorPlayerId,
      actorPlayerId,
      actorDisplayName,
      type,
      payload: {
        thoughtId: commentRecord.thought.id,
        commentId: commentRecord.comment?.id || "",
        commentText: String(commentRecord.comment?.text || "").slice(0, 80),
        thoughtText: String(commentRecord.thought.text || "").slice(0, 80),
      },
    };
  }

  if (type === "thought_share") {
    return {
      recipientPlayerId: share.originalThought.authorPlayerId,
      actorPlayerId,
      actorDisplayName,
      type,
      payload: {
        thoughtId: share.originalThought.id,
        thoughtText: String(share.originalThought.text || "").slice(0, 80),
      },
    };
  }

  return {
    recipientPlayerId: thought.authorPlayerId,
    actorPlayerId,
    actorDisplayName,
    type,
    payload: {
      thoughtId: thought.id,
      reactionId: thought.viewerReaction,
      thoughtText: String(thought.text || "").slice(0, 80),
    },
  };
}

// Thoughts are a shared platform surface with their own feed, mutations, and
// social side effects, so they deserve a dedicated route family.
export async function handleThoughtRoute(context: any): Promise<boolean> {
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
    listThoughts,
    listThoughtComments,
    saveThought,
    shareThought,
    commentOnThought,
    reactToThought,
    deleteThought,
    deleteThoughtComment,
    createNotification,
    deleteNotificationsByPayloadRef,
  } = services;

  const thoughtDeleteMatch = pathname.match(/^\/thoughts\/([^/]+)$/);
  const thoughtReactionMatch = pathname.match(/^\/thoughts\/([^/]+)\/reactions$/);
  const thoughtShareMatch = pathname.match(/^\/thoughts\/([^/]+)\/shares$/);
  const thoughtCommentMatch = pathname.match(/^\/thoughts\/([^/]+)\/comments$/);
  const thoughtCommentDeleteMatch = pathname.match(/^\/thoughts\/([^/]+)\/comments\/([^/]+)$/);

  if (method === "GET" && pathname === "/thoughts") {
    const thoughts = await listThoughts({
      viewerPlayerId: requestUrl.searchParams.get("viewerPlayerId") || "",
    });
    writeJson(res, 200, { thoughts }, requestOrigin);
    return true;
  }

  // Posting is account-holders-only, and the author is always the verified session — a
  // body-supplied authorPlayerId would let any caller post as anyone.
  if (method === "POST" && pathname === "/thoughts") {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, {
        status: "error",
        service: "platform-api",
        error: body.error,
        timestamp,
      }, requestOrigin);
      return true;
    }

    const thought = await saveThought({
      ...body.value,
      authorPlayerId: authClaims.playerId,
    });
    writeJson(res, 200, { thought }, requestOrigin);
    return true;
  }

  if (method === "GET" && thoughtCommentMatch) {
    const comments = await listThoughtComments(decodeURIComponent(thoughtCommentMatch[1]));
    writeJson(res, 200, { comments }, requestOrigin);
    return true;
  }

  if (method === "POST" && thoughtCommentMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, {
        status: "error",
        service: "platform-api",
        error: body.error,
        timestamp,
      }, requestOrigin);
      return true;
    }

    const actorPlayerId = String(authClaims.playerId);
    const actorDisplayName = String(body.value?.viewerAuthorDisplayName || "");
    const commentRecord = await commentOnThought(
      decodeURIComponent(thoughtCommentMatch[1]),
      actorPlayerId,
      actorDisplayName,
      body.value?.text,
    );
    writeJson(res, 200, { commentRecord }, requestOrigin);
    if (commentRecord?.thought?.authorPlayerId && actorPlayerId && commentRecord.thought.authorPlayerId !== actorPlayerId) {
      void createNotification(buildThoughtNotificationPayload("thought_comment", {
        actorPlayerId,
        actorDisplayName,
        commentRecord,
      }));
    }
    return true;
  }

  // Comment removal is the one thought mutation that must be identity-checked, so it reads
  // the verified session rather than a body-supplied player id.
  if (method === "DELETE" && thoughtCommentDeleteMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }

    const result = await deleteThoughtComment(
      decodeURIComponent(thoughtCommentDeleteMatch[1]),
      decodeURIComponent(thoughtCommentDeleteMatch[2]),
      authClaims.playerId,
    );

    if (!result?.ok) {
      const reason = result?.reason || "delete_failed";
      const statusCode = reason === "forbidden" ? 403 : (reason === "not_found" ? 404 : 400);
      writeJson(res, statusCode, { status: "error", error: reason, timestamp }, requestOrigin);
      return true;
    }

    // The comment is gone, so the notification announcing it has nothing left to point at.
    await deleteNotificationsByPayloadRef("commentId", result.commentId);

    writeJson(res, 200, {
      deleted: true,
      commentId: result.commentId,
      thought: result.thought,
    }, requestOrigin);
    return true;
  }

  if (method === "POST" && thoughtShareMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, {
        status: "error",
        service: "platform-api",
        error: body.error,
        timestamp,
      }, requestOrigin);
      return true;
    }

    const actorPlayerId = String(authClaims.playerId);
    const actorDisplayName = String(body.value?.viewerAuthorDisplayName || "");
    const share = await shareThought(
      decodeURIComponent(thoughtShareMatch[1]),
      actorPlayerId,
      actorDisplayName,
      body.value,
    );
    writeJson(res, 200, { share }, requestOrigin);
    if (share?.sharedThought && share?.originalThought?.authorPlayerId && actorPlayerId && share.originalThought.authorPlayerId !== actorPlayerId) {
      void createNotification(buildThoughtNotificationPayload("thought_share", {
        actorPlayerId,
        actorDisplayName,
        share,
      }));
    }
    return true;
  }

  if (method === "POST" && thoughtReactionMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, {
        status: "error",
        service: "platform-api",
        error: body.error,
        timestamp,
      }, requestOrigin);
      return true;
    }

    const actorPlayerId = String(authClaims.playerId);
    const actorDisplayName = String(body.value?.actorDisplayName || "");
    const thought = await reactToThought(
      decodeURIComponent(thoughtReactionMatch[1]),
      actorPlayerId,
      body.value?.reactionId,
    );
    writeJson(res, 200, { thought }, requestOrigin);
    if (thought?.authorPlayerId && actorPlayerId && thought.authorPlayerId !== actorPlayerId && thought.viewerReaction) {
      void createNotification(buildThoughtNotificationPayload("thought_reaction", {
        actorPlayerId,
        actorDisplayName,
        thought,
      }));
    }
    return true;
  }

  // A post may only be deleted by its author, established from the verified session.
  if (method === "DELETE" && thoughtDeleteMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }

    const thoughtId = decodeURIComponent(thoughtDeleteMatch[1]);
    const result = await deleteThought(thoughtId, authClaims.playerId);

    if (!result?.ok) {
      const reason = result?.reason || "delete_failed";
      const statusCode = reason === "forbidden" ? 403 : (reason === "not_found" ? 404 : 400);
      writeJson(res, statusCode, { status: "error", error: reason, timestamp }, requestOrigin);
      return true;
    }

    // Comment, share, and reaction notifications all reference the post that is now gone.
    await deleteNotificationsByPayloadRef("thoughtId", thoughtId);

    writeJson(res, 200, {
      deleted: true,
      id: thoughtId,
    }, requestOrigin);
    return true;
  }

  return false;
}
