import { readJsonBody, writeJson } from "../http-utils.mjs";
import { isValidGameProfileSlug } from "../db/game-profiles.mjs";

// Per-game driver profiles: the name, face and pinned cars a player has set up
// inside one cabinet.
//
//   GET  /games/:slug/driver              my driver profile          (auth, self only)
//   PUT  /games/:slug/driver              replace mine               (auth, self only)
//   GET  /games/:slug/driver/:playerId    one player's driver        (public)
//   POST /games/:slug/drivers             several players' drivers   (public)
//
// The write is self-only — the acting player is always the token's playerId,
// never a body field — and the read is public **whole**, with nothing resolved
// away. That is the opposite of the loadout family's asymmetry and it is
// deliberate: a garage is private because how many paints somebody has saved is
// nobody's business, whereas a name, a face and five favourite cars exist to be
// shown. The run records make the same argument for the same reason.
//
// Nothing here is authentication. This is the name over the door of one cabinet,
// defaulted from the factory profile and edited locally; canonical identity
// stays with the shell.

export async function handleGameProfileRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const { getGameProfile, saveGameProfile, getGameProfiles } = services ?? {};

  const mineMatch = pathname.match(/^\/games\/([^/]+)\/driver$/);
  const playerMatch = pathname.match(/^\/games\/([^/]+)\/driver\/([^/]+)$/);
  const batchMatch = pathname.match(/^\/games\/([^/]+)\/drivers$/);
  if (!mineMatch && !playerMatch && !batchMatch) return false;

  const gameSlug = decodeURIComponent((mineMatch ?? playerMatch ?? batchMatch)![1]);
  // An unknown slug is refused rather than stored, the loadout family's rule: a
  // cabinet with no catalog has nothing validating its payload.
  if (!isValidGameProfileSlug(gameSlug)) {
    writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
    return true;
  }

  if (mineMatch && (method === "GET" || method === "PUT")) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
      return true;
    }
    if (typeof getGameProfile !== "function" || typeof saveGameProfile !== "function") {
      writeJson(res, 503, { status: "error", error: "driver_not_configured", timestamp }, requestOrigin);
      return true;
    }

    if (method === "GET") {
      const result = await getGameProfile({ playerId: authClaims.playerId, gameSlug });
      if (!result) {
        writeJson(res, 500, { status: "error", error: "driver_unavailable", timestamp }, requestOrigin);
        return true;
      }
      writeJson(res, 200, result, requestOrigin);
      return true;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const result = await saveGameProfile({
      playerId: authClaims.playerId,
      gameSlug,
      profile: body.value?.profile,
    });
    if (!result?.ok) {
      writeJson(
        res,
        result?.statusCode || 400,
        { status: "error", error: result?.error || "save_failed", timestamp },
        requestOrigin,
      );
      return true;
    }
    writeJson(res, 200, { ok: true, profile: result.profile }, requestOrigin);
    return true;
  }

  if (playerMatch && method === "GET") {
    if (typeof getGameProfile !== "function") {
      writeJson(res, 503, { status: "error", error: "driver_not_configured", timestamp }, requestOrigin);
      return true;
    }
    const result = await getGameProfile({
      playerId: decodeURIComponent(playerMatch[2]),
      gameSlug,
    });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "driver_unavailable", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, result, requestOrigin);
    return true;
  }

  if (batchMatch && method === "POST") {
    if (typeof getGameProfiles !== "function") {
      writeJson(res, 503, { status: "error", error: "driver_not_configured", timestamp }, requestOrigin);
      return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const drivers = await getGameProfiles({ playerIds: body.value?.playerIds, gameSlug });
    writeJson(res, 200, { drivers }, requestOrigin);
    return true;
  }

  return false;
}
