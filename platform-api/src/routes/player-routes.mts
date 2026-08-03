import { readJsonBody, writeJson } from "../http-utils.mjs";

function requireAuthenticatedPlayer(res: any, authClaims: any, requestOrigin: string, timestamp: string): string {
  const playerId = typeof authClaims?.playerId === "string" ? authClaims.playerId.trim() : "";
  if (!playerId) {
    writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
  }
  return playerId;
}

function requirePlayerOwner(res: any, authClaims: any, targetPlayerId: string, requestOrigin: string, timestamp: string): string {
  const playerId = requireAuthenticatedPlayer(res, authClaims, requestOrigin, timestamp);
  if (playerId && playerId !== targetPlayerId) {
    writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
    return "";
  }
  return playerId;
}

function requirePairParticipant(res: any, authClaims: any, leftPlayerId: any, rightPlayerId: any, requestOrigin: string, timestamp: string): string {
  const playerId = requireAuthenticatedPlayer(res, authClaims, requestOrigin, timestamp);
  if (playerId && playerId !== leftPlayerId && playerId !== rightPlayerId) {
    writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
    return "";
  }
  return playerId;
}

function resolveProfileAvatarUrl(profile: any, resolver: any): any {
  if (!profile || !resolver) return profile;

  const resolveFriendAvatar = (entry: any) => {
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
export async function handlePlayerRoute(context: any): Promise<boolean> {
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
    incrementPlayerProfileView,
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
  const profileViewMatch = pathname.match(/^\/players\/([^/]+)\/profile-view$/);
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
      players: players.map((player: any) => resolveProfileAvatarUrl(player, avatarUrlResolver)),
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
    const targetPlayerId = decodeURIComponent(profileMatch[1]);
    if (!requirePlayerOwner(res, authClaims, targetPlayerId, requestOrigin, timestamp)) return true;
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

    const profile = await savePlayerProfile(targetPlayerId, body.value);
    writeJson(res, 200, { player: profile }, requestOrigin);
    return true;
  }

  if (method === "GET" && metricsMatch) {
    const metrics = await loadPlayerMetrics(decodeURIComponent(metricsMatch[1]));
    writeJson(res, 200, { metrics }, requestOrigin);
    return true;
  }

  if (method === "PUT" && metricsMatch) {
    const targetPlayerId = decodeURIComponent(metricsMatch[1]);
    if (!requirePlayerOwner(res, authClaims, targetPlayerId, requestOrigin, timestamp)) return true;
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

    // Public-facing counters are derived elsewhere. The only legacy client-written metric
    // is the signed-in player's thought count; do not let a broad patch overwrite ratings,
    // relationship totals, or analytics fields.
    const metrics = await savePlayerMetrics(targetPlayerId, {
      thoughtPostCount: body.value?.thoughtPostCount,
    });
    writeJson(res, 200, { metrics }, requestOrigin);
    return true;
  }

  if (method === "POST" && profileViewMatch) {
    const viewerPlayerId = requireAuthenticatedPlayer(res, authClaims, requestOrigin, timestamp);
    if (!viewerPlayerId) return true;
    if (typeof incrementPlayerProfileView !== "function") {
      writeJson(res, 503, { status: "error", error: "metrics_unavailable", timestamp }, requestOrigin);
      return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const targetPlayerId = decodeURIComponent(profileViewMatch[1]);
    const metrics = await incrementPlayerProfileView(targetPlayerId, {
      source: body.value?.source,
      viewerPlayerId,
    });
    writeJson(res, 200, { metrics }, requestOrigin);
    return true;
  }

  if (method === "GET" && relationshipsMatch) {
    const relationships = await loadPlayerRelationships(decodeURIComponent(relationshipsMatch[1]));
    writeJson(res, 200, { relationships }, requestOrigin);
    return true;
  }

  if (method === "PUT" && relationshipsMatch) {
    const targetPlayerId = decodeURIComponent(relationshipsMatch[1]);
    if (!requirePlayerOwner(res, authClaims, targetPlayerId, requestOrigin, timestamp)) return true;
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

    const relationships = await savePlayerRelationships(targetPlayerId, body.value);
    writeJson(res, 200, { relationships }, requestOrigin);
    return true;
  }

  if (method === "POST" && pathname === "/friendships") {
    if (!requireAuthenticatedPlayer(res, authClaims, requestOrigin, timestamp)) return true;
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

    if (!requirePairParticipant(
      res,
      authClaims,
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      requestOrigin,
      timestamp,
    )) return true;

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
    if (!requireAuthenticatedPlayer(res, authClaims, requestOrigin, timestamp)) return true;
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

    if (!requirePairParticipant(
      res,
      authClaims,
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      requestOrigin,
      timestamp,
    )) return true;

    const relationshipUpdate = await recordSharedSessionBetweenPlayers(
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      body.value,
    );
    writeJson(res, 200, { relationshipUpdate }, requestOrigin);
    return true;
  }

  if (method === "POST" && pathname === "/relationships/shared-event") {
    if (!requireAuthenticatedPlayer(res, authClaims, requestOrigin, timestamp)) return true;
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

    if (!requirePairParticipant(
      res,
      authClaims,
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      requestOrigin,
      timestamp,
    )) return true;

    const relationshipUpdate = await recordSharedEventBetweenPlayers(
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      body.value,
    );
    writeJson(res, 200, { relationshipUpdate }, requestOrigin);
    return true;
  }

  if (method === "POST" && pathname === "/relationships/direct-interaction") {
    if (!requireAuthenticatedPlayer(res, authClaims, requestOrigin, timestamp)) return true;
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

    if (!requirePairParticipant(
      res,
      authClaims,
      body.value?.leftPlayerId,
      body.value?.rightPlayerId,
      requestOrigin,
      timestamp,
    )) return true;

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
