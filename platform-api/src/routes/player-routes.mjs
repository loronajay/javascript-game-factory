import { readJsonBody, writeJson } from "../http-utils.mjs";

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

// Player profile, metrics, relationships, and player-to-player mutations are
// one platform surface, so they move together as a route family.
export async function handlePlayerRoute(context) {
  const {
    req,
    res,
    method,
    pathname,
    requestUrl,
    authClaims,
    requestOrigin,
    timestamp,
    avatarUrlResolver,
    services,
  } = context;
  const {
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
  } = services;

  const playerMatch = pathname.match(/^\/players\/([^/]+)$/);
  const friendCodeMatch = pathname.match(/^\/players\/by-friend-code\/([^/]+)$/);
  const profileMatch = pathname.match(/^\/players\/([^/]+)\/profile$/);
  const metricsMatch = pathname.match(/^\/players\/([^/]+)\/metrics$/);
  const relationshipsMatch = pathname.match(/^\/players\/([^/]+)\/relationships$/);
  const playerFriendMatch = pathname.match(/^\/players\/([^/]+)\/friends\/([^/]+)$/);

  if (method === "GET" && pathname === "/players/search") {
    const q = requestUrl.searchParams.get("q") || "";
    if (!q.trim()) {
      writeJson(res, 200, { players: [] }, requestOrigin);
      return true;
    }
    const players = await searchPlayers(q);
    writeJson(res, 200, {
      players: players.map((player) => resolveProfileAvatarUrl(player, avatarUrlResolver)),
    }, requestOrigin);
    return true;
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
      return true;
    }

    writeJson(res, 200, {
      player: resolveProfileAvatarUrl(profile, avatarUrlResolver),
    }, requestOrigin);
    return true;
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
      return true;
    }

    writeJson(res, 200, {
      player: resolveProfileAvatarUrl(profile, avatarUrlResolver),
    }, requestOrigin);
    return true;
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
      return true;
    }

    const profile = await savePlayerProfile(decodeURIComponent(profileMatch[1]), body.value);
    writeJson(res, 200, { player: profile }, requestOrigin);
    return true;
  }

  if (method === "GET" && metricsMatch) {
    const metrics = await loadPlayerMetrics(decodeURIComponent(metricsMatch[1]));
    writeJson(res, 200, { metrics }, requestOrigin);
    return true;
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
      return true;
    }

    const metrics = await savePlayerMetrics(decodeURIComponent(metricsMatch[1]), body.value);
    writeJson(res, 200, { metrics }, requestOrigin);
    return true;
  }

  if (method === "GET" && relationshipsMatch) {
    const relationships = await loadPlayerRelationships(decodeURIComponent(relationshipsMatch[1]));
    writeJson(res, 200, { relationships }, requestOrigin);
    return true;
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
      return true;
    }

    const relationships = await savePlayerRelationships(decodeURIComponent(relationshipsMatch[1]), body.value);
    writeJson(res, 200, { relationships }, requestOrigin);
    return true;
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
      return true;
    }

    const friendship = await createFriendshipBetweenPlayers(
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      body.value,
    );
    writeJson(res, 200, { friendship }, requestOrigin);
    return true;
  }

  if (method === "DELETE" && playerFriendMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const viewerPlayerId = decodeURIComponent(playerFriendMatch[1]);
    const targetPlayerId = decodeURIComponent(playerFriendMatch[2]);
    if (authClaims.playerId !== viewerPlayerId) {
      writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
      return true;
    }
    const result = await removeFriendBetweenPlayers(viewerPlayerId, targetPlayerId);
    writeJson(res, 200, { removed: result?.removed ?? false }, requestOrigin);
    return true;
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
      return true;
    }

    const relationshipUpdate = await recordSharedSessionBetweenPlayers(
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      body.value,
    );
    writeJson(res, 200, { relationshipUpdate }, requestOrigin);
    return true;
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
      return true;
    }

    const relationshipUpdate = await recordSharedEventBetweenPlayers(
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      body.value,
    );
    writeJson(res, 200, { relationshipUpdate }, requestOrigin);
    return true;
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
      return true;
    }

    const relationshipUpdate = await recordDirectInteractionBetweenPlayers(
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      body.value,
    );
    writeJson(res, 200, { relationshipUpdate }, requestOrigin);
    return true;
  }

  return false;
}
