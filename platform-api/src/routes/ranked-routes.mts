import { readJsonBody, writeJson } from "../http-utils.mjs";
import { isValidRankedSlug } from "../db/ranked.mjs";

const VALID_OUTCOMES = new Set(["win", "loss", "draw"]);

// Server-brokered ranked matchmaking + result attestation.
//   POST   /ranked/:gameSlug/queue     enqueue (rating is read server-side)
//   GET    /ranked/:gameSlug/queue     poll for a brokered match
//   DELETE /ranked/:gameSlug/queue     leave the queue
//   POST   /ranked/:gameSlug/report    attest a match result { matchId, outcome }
//   GET    /ranked/:gameSlug/standing  rating + tier + record + live match
export async function handleRankedRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const { enqueueRanked, pollRanked, cancelRanked, reportRankedResult, getRankedStanding, setRankedLobby } = services;

  const queueMatch = pathname.match(/^\/ranked\/([^/]+)\/queue$/);
  const reportMatch = pathname.match(/^\/ranked\/([^/]+)\/report$/);
  const standingMatch = pathname.match(/^\/ranked\/([^/]+)\/standing$/);
  const lobbyMatch = pathname.match(/^\/ranked\/([^/]+)\/lobby$/);

  if (!queueMatch && !reportMatch && !standingMatch && !lobbyMatch) return false;

  const gameSlug = decodeURIComponent((queueMatch || reportMatch || standingMatch || lobbyMatch)[1]);
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
    const result = await reportRankedResult(gameSlug, {
      matchId: matchId.trim().slice(0, 200),
      reporterPlayerId: playerId,
      outcome,
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

  return false;
}
