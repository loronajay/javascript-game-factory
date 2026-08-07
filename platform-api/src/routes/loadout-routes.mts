import { readJsonBody, writeJson } from "../http-utils.mjs";
import { isValidLoadoutSlug } from "../db/game-loadouts.mjs";

// Per-game cosmetic loadouts: the car a player has built and the configs saved
// for it.
//
//   GET  /games/:slug/garage              my whole garage            (auth, self only)
//   PUT  /games/:slug/garage              replace my whole garage    (auth, self only)
//   GET  /games/:slug/loadout/:playerId   one player's current car   (public)
//   POST /games/:slug/loadouts            several players' cars      (public)
//
// The asymmetry is the privacy boundary and is deliberate. The garage routes are
// self-only — the acting player is always the token's playerId, never a body
// field, so there is no path to another player's saved paints at all. The
// loadout routes are public but resolve to a single `{ modelId, livery }` first,
// which is exactly what an opponent needs to draw your car and nothing more.
//
// The batch POST exists because a lobby needs several cars at once while a
// countdown is running, and N sequential fetches is how a race starts with
// half the field on default paint.

export async function handleLoadoutRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const { getGarage, saveGarage, getPublicLoadout, getPublicLoadouts } = services ?? {};

  const garageMatch = pathname.match(/^\/games\/([^/]+)\/garage$/);
  const loadoutMatch = pathname.match(/^\/games\/([^/]+)\/loadout\/([^/]+)$/);
  const batchMatch = pathname.match(/^\/games\/([^/]+)\/loadouts$/);
  if (!garageMatch && !loadoutMatch && !batchMatch) return false;

  const gameSlug = decodeURIComponent((garageMatch ?? loadoutMatch ?? batchMatch)![1]);
  // An unknown slug is refused rather than stored: a cabinet with no catalog has
  // nothing validating its payload, and accepting unvalidated JSON from anyone
  // who invents a slug is the hole the catalog registry exists to close.
  if (!isValidLoadoutSlug(gameSlug)) {
    writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
    return true;
  }

  if (garageMatch && (method === "GET" || method === "PUT")) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
      return true;
    }
    if (typeof getGarage !== "function" || typeof saveGarage !== "function") {
      writeJson(res, 503, { status: "error", error: "garage_not_configured", timestamp }, requestOrigin);
      return true;
    }

    if (method === "GET") {
      const result = await getGarage({ playerId: authClaims.playerId, gameSlug });
      if (!result) {
        writeJson(res, 500, { status: "error", error: "garage_unavailable", timestamp }, requestOrigin);
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
    const result = await saveGarage({
      playerId: authClaims.playerId,
      gameSlug,
      garage: body.value?.garage,
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
    writeJson(res, 200, { ok: true, garage: result.garage }, requestOrigin);
    return true;
  }

  if (loadoutMatch && method === "GET") {
    if (typeof getPublicLoadout !== "function") {
      writeJson(res, 503, { status: "error", error: "loadout_not_configured", timestamp }, requestOrigin);
      return true;
    }
    const loadout = await getPublicLoadout({
      playerId: decodeURIComponent(loadoutMatch[2]),
      gameSlug,
    });
    if (!loadout) {
      writeJson(res, 500, { status: "error", error: "loadout_unavailable", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { loadout }, requestOrigin);
    return true;
  }

  if (batchMatch && method === "POST") {
    if (typeof getPublicLoadouts !== "function") {
      writeJson(res, 503, { status: "error", error: "loadout_not_configured", timestamp }, requestOrigin);
      return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const loadouts = await getPublicLoadouts({ playerIds: body.value?.playerIds, gameSlug });
    writeJson(res, 200, { loadouts }, requestOrigin);
    return true;
  }

  return false;
}
