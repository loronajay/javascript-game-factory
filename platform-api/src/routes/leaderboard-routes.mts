import { readJsonBody, writeJson } from "../http-utils.mjs";
import { getGameBoards, isBoardSlug, listBoardGames } from "../services/leaderboard-catalog.mjs";

// Solo leaderboards: personal bests, and the public boards built from them.
//
//   GET  /leaderboards                              every game with boards      (public)
//   GET  /leaderboards/:slug                        one game's board registry   (public)
//   GET  /leaderboards/:slug/board/:boardId[?limit=] public top-N for a board   (public)
//   GET  /leaderboards/:slug/records/:playerId      one player's bests          (public)
//   POST /leaderboards/:slug/runs                   submit a run                (auth, self only)
//
// Reads are public and the write is self-only, which is the same asymmetry the
// loadout routes keep — but for the opposite reason. There the private half was
// the garage, because a paint collection is nobody else's business; here nothing
// is private at all (a personal best is a boast) and the auth exists purely so a
// run is attributable. The acting player is always the token's playerId, never a
// body field, so there is no path to setting a record in someone else's name.
//
// A submitted run is a claim, not a fact. The route enforces the board's
// plausibility bounds via the catalog and stores the run's input log; verifying
// it by replaying that log through the deterministic sim is a later pass, and
// records read back with `verified: false` until it runs. See db/run-records.
//
// This handler must be dispatched before the /players family for the same reason
// the ladder routes are: a broader player route would swallow the records suffix.
export async function handleLeaderboardRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const { getBoardStandings, getPlayerRunRecords, recordRun } = services ?? {};

  if (pathname === "/leaderboards" && method === "GET") {
    writeJson(res, 200, { games: listBoardGames() }, requestOrigin);
    return true;
  }

  const registryMatch = pathname.match(/^\/leaderboards\/([^/]+)$/);
  const boardMatch = pathname.match(/^\/leaderboards\/([^/]+)\/board\/([^/]+)$/);
  const recordsMatch = pathname.match(/^\/leaderboards\/([^/]+)\/records\/([^/]+)$/);
  const runsMatch = pathname.match(/^\/leaderboards\/([^/]+)\/runs$/);
  if (!registryMatch && !boardMatch && !recordsMatch && !runsMatch) return false;

  const gameSlug = decodeURIComponent((registryMatch ?? boardMatch ?? recordsMatch ?? runsMatch)![1]);
  // A game with no registered boards is a 404 rather than an empty result. An
  // empty board and a misspelled slug look identical to a client, and the first
  // reads as "nobody has played yet" — which is exactly the wrong conclusion.
  if (!isBoardSlug(gameSlug)) {
    writeJson(res, 404, { status: "error", error: "unknown_leaderboard", timestamp }, requestOrigin);
    return true;
  }

  if (registryMatch && method === "GET") {
    writeJson(res, 200, { game: getGameBoards(gameSlug) }, requestOrigin);
    return true;
  }

  if (boardMatch && method === "GET") {
    if (typeof getBoardStandings !== "function") {
      writeJson(res, 503, { status: "error", error: "leaderboard_not_configured", timestamp }, requestOrigin);
      return true;
    }
    const searchParams = new URL(req.url || "/", "http://localhost").searchParams;
    const board = await getBoardStandings({
      gameSlug,
      boardId: decodeURIComponent(boardMatch[2]),
      limit: searchParams.get("limit"),
    });
    if (!board) {
      writeJson(res, 404, { status: "error", error: "unknown_board", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { board }, requestOrigin);
    return true;
  }

  if (recordsMatch && method === "GET") {
    if (typeof getPlayerRunRecords !== "function") {
      writeJson(res, 503, { status: "error", error: "leaderboard_not_configured", timestamp }, requestOrigin);
      return true;
    }
    const result = await getPlayerRunRecords({
      gameSlug,
      playerId: decodeURIComponent(recordsMatch[2]),
    });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "records_unavailable", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, result, requestOrigin);
    return true;
  }

  if (runsMatch && method === "POST") {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
      return true;
    }
    if (typeof recordRun !== "function") {
      writeJson(res, 503, { status: "error", error: "leaderboard_not_configured", timestamp }, requestOrigin);
      return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const { boardId, value, modelId, trackId, inputLog } = body.value ?? {};
    const result = await recordRun({
      gameSlug,
      playerId: authClaims.playerId,
      boardId,
      value,
      modelId,
      trackId,
      inputLog,
    });
    if (!result) {
      // Null covers both an unknown board and a failed write. The board is
      // knowable from the registry the client already read, so this is the
      // uninteresting case; a bad value gets its own error below.
      writeJson(res, 400, { status: "error", error: "run_rejected", timestamp }, requestOrigin);
      return true;
    }
    if (result.error) {
      writeJson(res, 400, { status: "error", error: result.error, timestamp }, requestOrigin);
      return true;
    }
    // `improved: false` is a 200. Most runs are not a personal best, and a
    // client that treats "you did not beat your own time" as an error would
    // show a failure every time somebody drove averagely.
    writeJson(res, 200, { ok: true, improved: result.improved === true, record: result.record ?? null }, requestOrigin);
    return true;
  }

  return false;
}
