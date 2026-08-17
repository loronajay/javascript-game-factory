import { readJsonBody, writeJson } from "../http-utils.mjs";

const VALID_OUTCOMES = new Set(["win", "loss", "draw"]);
const VALID_FORFEIT_ROLES = new Set(["leaver", "remaining"]);
const MAX_TRACK_STATS = 8;

// The optional progression block on a reported match. It says what was PLAYED —
// never what was earned: every XP amount is derived server-side from
// services/progression-catalog. A malformed or absent block costs the reporter
// their XP and nothing else, which is why it is normalized to null rather than
// rejecting a request that still carries a valid rating.
function normalizeProgression(raw: unknown): any {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const trackId = typeof value.trackId === "string" ? value.trackId.trim().slice(0, 60) : "";
  const modeId = typeof value.modeId === "string" ? value.modeId.trim().slice(0, 40) : "";
  if (!trackId || !modeId) return null;

  // Flat, bounded, and numeric: these are counters a mastery panel displays, and
  // the table stores them as jsonb, so an unbounded object would be a free
  // write-anything field on someone else's row shape.
  const stats: Record<string, number> = {};
  if (value.stats && typeof value.stats === "object") {
    for (const [key, entry] of Object.entries(value.stats as Record<string, unknown>)) {
      if (Object.keys(stats).length >= MAX_TRACK_STATS) break;
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(key)) continue;
      const parsed = Math.floor(Number(entry));
      if (Number.isFinite(parsed)) stats[key] = Math.max(0, Math.min(parsed, 1_000_000));
    }
  }

  return {
    trackId,
    modeId,
    performance: Math.max(0, Math.min(Math.floor(Number(value.performance)) || 0, 1_000_000)),
    forfeitRole: VALID_FORFEIT_ROLES.has(value.forfeitRole as string) ? value.forfeitRole : null,
    stats,
  };
}

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
    // Tactical Arena ranked matches are settled by the brokered ranked-match reporter.
    // Letting the older generic endpoint also write this slug would allow a client to
    // invent a session and outcome against the same public ladder.
    if (gameSlug === "tactical-arena") {
      writeJson(res, 403, { status: "error", error: "server_attestation_required", timestamp }, requestOrigin);
      return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const { opponentPlayerId, outcome, sessionId, progression, ranked } = body.value || {};
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
      // Whether this result moves ELO and the win/loss record. It defaults to
      // true because every caller that predates the split reports ranked play and
      // must keep doing so; a cabinet with a casual mode opts out explicitly.
      // A casual report is still a report — it carries its XP and stamps the
      // session — so the progression half is unaffected either way.
      ranked: ranked !== false,
      progression: normalizeProgression(progression),
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
