function applyCorsHeaders(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function writeJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  applyCorsHeaders(res);
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

function buildTimestamp(now) {
  if (typeof now === "function") {
    const value = now();
    return typeof value === "string" && value.trim() ? value : new Date().toISOString();
  }

  return new Date().toISOString();
}

export function createApp(options = {}) {
  const config = options?.config && typeof options.config === "object"
    ? options.config
    : { hasDatabaseUrl: false };
  const checkDatabase = typeof options?.checkDatabase === "function"
    ? options.checkDatabase
    : async () => false;
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
  const now = options?.now;

  return async function app(req, res) {
    const method = typeof req?.method === "string" ? req.method.toUpperCase() : "GET";
    const requestUrl = new URL(req?.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;
    const timestamp = buildTimestamp(now);
    const playerMatch = pathname.match(/^\/players\/([^/]+)$/);
    const friendCodeMatch = pathname.match(/^\/players\/by-friend-code\/([^/]+)$/);
    const profileMatch = pathname.match(/^\/players\/([^/]+)\/profile$/);
    const metricsMatch = pathname.match(/^\/players\/([^/]+)\/metrics$/);
    const relationshipsMatch = pathname.match(/^\/players\/([^/]+)\/relationships$/);

    if (method === "OPTIONS") {
      res.statusCode = 204;
      applyCorsHeaders(res);
      res.end("");
      return;
    }

    if (method === "GET" && pathname === "/health") {
      writeJson(res, 200, {
        status: "ok",
        service: "platform-api",
        databaseConfigured: Boolean(config.hasDatabaseUrl),
        timestamp,
      });
      return;
    }

    if (method === "GET" && pathname === "/ready") {
      if (!config.hasDatabaseUrl) {
        writeJson(res, 503, {
          status: "error",
          service: "platform-api",
          database: "missing_configuration",
          timestamp,
        });
        return;
      }

      const isDatabaseReady = await checkDatabase();
      writeJson(res, isDatabaseReady ? 200 : 503, {
        status: isDatabaseReady ? "ok" : "error",
        service: "platform-api",
        database: isDatabaseReady ? "up" : "down",
        timestamp,
      });
      return;
    }

    if (method === "GET" && pathname === "/activity") {
      const items = await listActivityItems();
      writeJson(res, 200, { items });
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
        });
        return;
      }

      const item = await saveActivityItem(body.value);
      writeJson(res, 200, { item });
      return;
    }

    if (method === "GET" && pathname === "/thoughts") {
      const thoughts = await listThoughts({
        viewerPlayerId: requestUrl.searchParams.get("viewerPlayerId") || "",
      });
      writeJson(res, 200, { thoughts });
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
        });
        return;
      }

      const thought = await saveThought(body.value);
      writeJson(res, 200, { thought });
      return;
    }

    const thoughtDeleteMatch = pathname.match(/^\/thoughts\/([^/]+)$/);
    const thoughtReactionMatch = pathname.match(/^\/thoughts\/([^/]+)\/reactions$/);
    const thoughtShareMatch = pathname.match(/^\/thoughts\/([^/]+)\/shares$/);
    const thoughtCommentMatch = pathname.match(/^\/thoughts\/([^/]+)\/comments$/);
    if (method === "GET" && thoughtCommentMatch) {
      const comments = await listThoughtComments(decodeURIComponent(thoughtCommentMatch[1]));
      writeJson(res, 200, { comments });
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
        });
        return;
      }

      const commentRecord = await commentOnThought(
        decodeURIComponent(thoughtCommentMatch[1]),
        body.value?.viewerPlayerId,
        body.value?.viewerAuthorDisplayName,
        body.value?.text,
      );
      writeJson(res, 200, { commentRecord });
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
        });
        return;
      }

      const share = await shareThought(
        decodeURIComponent(thoughtShareMatch[1]),
        body.value?.viewerPlayerId,
        body.value?.viewerAuthorDisplayName,
        body.value,
      );
      writeJson(res, 200, { share });
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
        });
        return;
      }

      const thought = await reactToThought(
        decodeURIComponent(thoughtReactionMatch[1]),
        body.value?.viewerPlayerId,
        body.value?.reactionId,
      );
      writeJson(res, 200, { thought });
      return;
    }

    if (method === "DELETE" && thoughtDeleteMatch) {
      const thoughtId = decodeURIComponent(thoughtDeleteMatch[1]);
      const deleted = await deleteThought(thoughtId);
      writeJson(res, 200, {
        deleted,
        id: thoughtId,
      });
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
        });
        return;
      }

      writeJson(res, 200, {
        player: profile,
      });
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
        });
        return;
      }

      writeJson(res, 200, {
        player: profile,
      });
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
        });
        return;
      }

      const profile = await savePlayerProfile(decodeURIComponent(profileMatch[1]), body.value);
      writeJson(res, 200, {
        player: profile,
      });
      return;
    }

    if (method === "GET" && metricsMatch) {
      const metrics = await loadPlayerMetrics(decodeURIComponent(metricsMatch[1]));
      writeJson(res, 200, {
        metrics,
      });
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
        });
        return;
      }

      const metrics = await savePlayerMetrics(decodeURIComponent(metricsMatch[1]), body.value);
      writeJson(res, 200, {
        metrics,
      });
      return;
    }

    if (method === "GET" && relationshipsMatch) {
      const relationships = await loadPlayerRelationships(decodeURIComponent(relationshipsMatch[1]));
      writeJson(res, 200, {
        relationships,
      });
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
        });
        return;
      }

      const relationships = await savePlayerRelationships(decodeURIComponent(relationshipsMatch[1]), body.value);
      writeJson(res, 200, {
        relationships,
      });
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
        });
        return;
      }

      const friendship = await createFriendshipBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { friendship });
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
        });
        return;
      }

      const relationshipUpdate = await recordSharedSessionBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { relationshipUpdate });
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
        });
        return;
      }

      const relationshipUpdate = await recordSharedEventBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { relationshipUpdate });
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
        });
        return;
      }

      const relationshipUpdate = await recordDirectInteractionBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { relationshipUpdate });
      return;
    }

    writeJson(res, 404, {
      status: "error",
      service: "platform-api",
      error: "not_found",
      timestamp,
    });
  };
}
