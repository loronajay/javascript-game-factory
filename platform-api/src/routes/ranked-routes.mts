import { readJsonBody, writeJson } from "../http-utils.mjs";
import { isValidRankedSlug } from "../db/ranked.mjs";

const VALID_OUTCOMES = new Set(["win", "loss", "draw"]);

// Server-brokered ranked matchmaking + result attestation.
//   POST   /ranked/:gameSlug/queue     enqueue (rating is read server-side)
//   GET    /ranked/:gameSlug/queue     poll for a brokered match
//   DELETE /ranked/:gameSlug/queue     leave the queue
//   POST   /ranked/:gameSlug/report    attest a match result { matchId, outcome }
//   GET    /ranked/:gameSlug/standing  rating + tier + record + my cosmetic profile + live match
//   PUT    /ranked/:gameSlug/profile   save my ranked title/avatar (auth = me)
//   GET    /ranked/:gameSlug/card/:playerId    public ranked card for another player
//   GET    /ranked/:gameSlug/units/:playerId   public per-unit ranked stats
//   GET    /ranked/:gameSlug/matches/:playerId  public recent resolved match history
//   GET    /ranked/:gameSlug/leaderboard[?limit=]  public top-N ranked ladder
export async function handleRankedRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const { enqueueRanked, pollRanked, cancelRanked, reportRankedResult, getRankedStanding, setRankedLobby, saveRankedProfile, getRankedCard, getRankedUnitStats, getRankedMatches, getRankedLeaderboard } = services;

  const queueMatch = pathname.match(/^\/ranked\/([^/]+)\/queue$/);
  const reportMatch = pathname.match(/^\/ranked\/([^/]+)\/report$/);
  const standingMatch = pathname.match(/^\/ranked\/([^/]+)\/standing$/);
  const lobbyMatch = pathname.match(/^\/ranked\/([^/]+)\/lobby$/);
  const profileMatch = pathname.match(/^\/ranked\/([^/]+)\/profile$/);
  const cardMatch = pathname.match(/^\/ranked\/([^/]+)\/card\/([^/]+)$/);
  const unitsMatch = pathname.match(/^\/ranked\/([^/]+)\/units\/([^/]+)$/);
  const matchesMatch = pathname.match(/^\/ranked\/([^/]+)\/matches\/([^/]+)$/);
  const leaderboardMatch = pathname.match(/^\/ranked\/([^/]+)\/leaderboard$/);

  if (!queueMatch && !reportMatch && !standingMatch && !lobbyMatch && !profileMatch && !cardMatch && !unitsMatch && !matchesMatch && !leaderboardMatch) return false;

  const gameSlug = decodeURIComponent((queueMatch || reportMatch || standingMatch || lobbyMatch || profileMatch || cardMatch || unitsMatch || matchesMatch || leaderboardMatch)[1]);
  if (!isValidRankedSlug(gameSlug)) {
    writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
    return true;
  }
  if (!authClaims?.playerId) {
    writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
    return true;
  }
  const playerId = authClaims.playerId;

  if (queueMatch && method === "POST") {
    const result = await enqueueRanked(gameSlug, { playerId });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "queue_failed", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, result, requestOrigin);
    return true;
  }

  if (queueMatch && method === "GET") {
    const result = await pollRanked(gameSlug, { playerId });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "poll_failed", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, result, requestOrigin);
    return true;
  }

  if (queueMatch && method === "DELETE") {
    const result = await cancelRanked(gameSlug, { playerId });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "cancel_failed", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, result, requestOrigin);
    return true;
  }

  if (reportMatch && method === "POST") {
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const { matchId, outcome } = body.value || {};
    if (!matchId || typeof matchId !== "string") {
      writeJson(res, 400, { status: "error", error: "missing_match_id", timestamp }, requestOrigin);
      return true;
    }
    if (!VALID_OUTCOMES.has(outcome)) {
      writeJson(res, 400, { status: "error", error: "invalid_outcome", timestamp }, requestOrigin);
      return true;
    }
    // Optional per-unit reporting (Phase 2). squad/unitResults are sanitized in the db
    // layer; a legacy client that omits them still reports outcome as before.
    const { squad, unitResults } = body.value || {};
    const result = await reportRankedResult(gameSlug, {
      matchId: matchId.trim().slice(0, 200),
      reporterPlayerId: playerId,
      outcome,
      squad: Array.isArray(squad) ? squad : undefined,
      unitResults: unitResults && typeof unitResults === "object" ? unitResults : undefined,
    });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "report_failed", timestamp }, requestOrigin);
      return true;
    }
    if (result.error) {
      const code = result.error === "match_not_found" ? 404 : result.error === "not_a_member" ? 403 : 400;
      writeJson(res, code, { status: "error", error: result.error, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, result, requestOrigin);
    return true;
  }

  if (lobbyMatch && method === "POST") {
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const { matchId, lobbyCode } = body.value || {};
    if (!matchId || typeof matchId !== "string") {
      writeJson(res, 400, { status: "error", error: "missing_match_id", timestamp }, requestOrigin);
      return true;
    }
    if (!lobbyCode || typeof lobbyCode !== "string") {
      writeJson(res, 400, { status: "error", error: "missing_lobby_code", timestamp }, requestOrigin);
      return true;
    }
    const result = await setRankedLobby(gameSlug, {
      matchId: matchId.trim().slice(0, 200),
      lobbyCode: lobbyCode.trim().slice(0, 16),
      reporterPlayerId: playerId,
    });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "lobby_failed", timestamp }, requestOrigin);
      return true;
    }
    if (result.error) {
      const code = result.error === "match_not_found" ? 404 : result.error === "not_lobby_owner" ? 403 : 400;
      writeJson(res, code, { status: "error", error: result.error, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, result, requestOrigin);
    return true;
  }

  if (standingMatch && method === "GET") {
    const result = await getRankedStanding(gameSlug, { playerId });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "standing_unavailable", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { standing: result }, requestOrigin);
    return true;
  }

  if (profileMatch && method === "PUT") {
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    // Undefined keys keep the stored value; explicit null/blank clears. Avatar ids
    // are opaque strings (ownership is client-gated in v1); the db layer sanitizes.
    const { title, avatarUnit, avatarSkin } = body.value || {};
    const result = await saveRankedProfile(gameSlug, { playerId, title, avatarUnit, avatarSkin });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "profile_save_failed", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { profile: result }, requestOrigin);
    return true;
  }

  if (cardMatch && method === "GET") {
    const targetPlayerId = decodeURIComponent(cardMatch[2]);
    const result = await getRankedCard(gameSlug, { playerId: targetPlayerId });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "card_unavailable", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { card: result }, requestOrigin);
    return true;
  }

  if (unitsMatch && method === "GET") {
    const targetPlayerId = decodeURIComponent(unitsMatch[2]);
    const result = await getRankedUnitStats(gameSlug, { playerId: targetPlayerId });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "unit_stats_unavailable", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { unitStats: result }, requestOrigin);
    return true;
  }

  if (matchesMatch && method === "GET") {
    const targetPlayerId = decodeURIComponent(matchesMatch[2]);
    const result = await getRankedMatches(gameSlug, { playerId: targetPlayerId });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "matches_unavailable", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { matches: result }, requestOrigin);
    return true;
  }

  if (leaderboardMatch && method === "GET") {
    const limitParam = new URL(req.url || "/", "http://localhost").searchParams.get("limit");
    const result = await getRankedLeaderboard(gameSlug, { limit: limitParam });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "leaderboard_unavailable", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { leaderboard: result }, requestOrigin);
    return true;
  }

  return false;
}
