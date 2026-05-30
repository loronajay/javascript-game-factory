import { readJsonBody, writeJson } from "../http-utils.mjs";

const VALID_OUTCOMES = new Set(["win", "loss", "draw"]);

// Accept any slug with the same format as game catalog entries (lowercase, hyphens, digits).
// No allowlist — any game the platform adds can use the ratings system without a code change here.
function isValidGameSlug(slug: unknown): boolean {
  return typeof slug === "string" && /^[a-z0-9-]{1,60}$/.test(slug);
}

export async function handleRatingRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const { getGameRating, recordMatchRating } = services;

  // GET /ratings/:gameSlug/:playerId — public; returns a player's rating for one game
  const getMatch = pathname.match(/^\/ratings\/([^/]+)\/([^/]+)$/);
  if (method === "GET" && getMatch) {
    const gameSlug = decodeURIComponent(getMatch[1]);
    const playerId = decodeURIComponent(getMatch[2]);
    if (!isValidGameSlug(gameSlug)) {
      writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
      return true;
    }
    const rating = await getGameRating(gameSlug, playerId);
    writeJson(res, 200, { rating }, requestOrigin);
    return true;
  }

  // POST /ratings/:gameSlug — auth required; reports a match result and updates ELO
  const postMatch = pathname.match(/^\/ratings\/([^/]+)$/);
  if (method === "POST" && postMatch) {
    const gameSlug = decodeURIComponent(postMatch[1]);
    if (!isValidGameSlug(gameSlug)) {
      writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
      return true;
    }
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
      return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const { opponentPlayerId, outcome, sessionId } = body.value || {};
    if (!opponentPlayerId || typeof opponentPlayerId !== "string") {
      writeJson(res, 400, { status: "error", error: "missing_opponent", timestamp }, requestOrigin);
      return true;
    }
    if (!VALID_OUTCOMES.has(outcome)) {
      writeJson(res, 400, { status: "error", error: "invalid_outcome", timestamp }, requestOrigin);
      return true;
    }
    if (!sessionId || typeof sessionId !== "string") {
      writeJson(res, 400, { status: "error", error: "missing_session_id", timestamp }, requestOrigin);
      return true;
    }
    const result = await recordMatchRating(gameSlug, {
      reporterPlayerId: authClaims.playerId,
      opponentPlayerId: opponentPlayerId.trim(),
      outcome,
      sessionId: sessionId.trim().slice(0, 200),
    });
    if (result === null) {
      writeJson(res, 500, { status: "error", error: "update_failed", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, result, requestOrigin);
    return true;
  }

  return false;
}
