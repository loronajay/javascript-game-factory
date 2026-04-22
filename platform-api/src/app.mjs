function writeJson(res, statusCode, payload) {
  res.statusCode = statusCode;
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
  const saveThought = typeof options?.saveThought === "function"
    ? options.saveThought
    : async () => null;
  const deleteThought = typeof options?.deleteThought === "function"
    ? options.deleteThought
    : async () => false;
  const now = options?.now;

  return async function app(req, res) {
    const method = typeof req?.method === "string" ? req.method.toUpperCase() : "GET";
    const pathname = new URL(req?.url || "/", "http://localhost").pathname;
    const timestamp = buildTimestamp(now);
    const playerMatch = pathname.match(/^\/players\/([^/]+)$/);
    const profileMatch = pathname.match(/^\/players\/([^/]+)\/profile$/);
    const metricsMatch = pathname.match(/^\/players\/([^/]+)\/metrics$/);
    const relationshipsMatch = pathname.match(/^\/players\/([^/]+)\/relationships$/);

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
      const thoughts = await listThoughts();
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

    writeJson(res, 404, {
      status: "error",
      service: "platform-api",
      error: "not_found",
      timestamp,
    });
  };
}
