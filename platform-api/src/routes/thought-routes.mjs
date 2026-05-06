import { readJsonBody, writeJson } from "../http-utils.mjs";

function buildThoughtNotificationPayload(type, { actorPlayerId, actorDisplayName, commentRecord, share, thought }) {
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
export async function handleThoughtRoute(context) {
  const {
    req,
    res,
    method,
    pathname,
    requestUrl,
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
    createNotification,
  } = services;

  const thoughtDeleteMatch = pathname.match(/^\/thoughts\/([^/]+)$/);
  const thoughtReactionMatch = pathname.match(/^\/thoughts\/([^/]+)\/reactions$/);
  const thoughtShareMatch = pathname.match(/^\/thoughts\/([^/]+)\/shares$/);
  const thoughtCommentMatch = pathname.match(/^\/thoughts\/([^/]+)\/comments$/);

  if (method === "GET" && pathname === "/thoughts") {
    const thoughts = await listThoughts({
      viewerPlayerId: requestUrl.searchParams.get("viewerPlayerId") || "",
    });
    writeJson(res, 200, { thoughts }, requestOrigin);
    return true;
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
      return true;
    }

    const thought = await saveThought(body.value);
    writeJson(res, 200, { thought }, requestOrigin);
    return true;
  }

  if (method === "GET" && thoughtCommentMatch) {
    const comments = await listThoughtComments(decodeURIComponent(thoughtCommentMatch[1]));
    writeJson(res, 200, { comments }, requestOrigin);
    return true;
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
      return true;
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
      void createNotification(buildThoughtNotificationPayload("thought_comment", {
        actorPlayerId,
        actorDisplayName,
        commentRecord,
      }));
    }
    return true;
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
      return true;
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
      void createNotification(buildThoughtNotificationPayload("thought_share", {
        actorPlayerId,
        actorDisplayName,
        share,
      }));
    }
    return true;
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
      return true;
    }

    const actorPlayerId = String(body.value?.viewerPlayerId || "");
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

  if (method === "DELETE" && thoughtDeleteMatch) {
    const thoughtId = decodeURIComponent(thoughtDeleteMatch[1]);
    const deleted = await deleteThought(thoughtId);
    writeJson(res, 200, {
      deleted,
      id: thoughtId,
    }, requestOrigin);
    return true;
  }

  return false;
}
