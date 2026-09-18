import { readJsonBody, writeJson } from "../http-utils.mjs";
import { getAchievementGame, isAchievementGameSlug, listAchievementGames, presentAchievement } from "../services/achievement-catalog.mjs";

// Platform achievements: per-game catalogs, run submission, and a player's
// cross-game collection.
//
//   GET  /achievements                        every game with achievements    (public)
//   GET  /achievements/:slug                  one game's catalog, secrets masked (public)
//   POST /achievements/:slug/runs             submit a run                    (auth, self only)
//   GET  /players/:playerId/achievements[?game=slug]  a player's collection   (public)
//
// There is deliberately no "unlock :id" write. A client describes a run and
// the server's detector (services/achievement-catalog) decides what it
// earned; the achievement id never appears in a request. The acting player
// is always the token's playerId, never a body field.
//
// Reads are public for the leaderboards' reason: a trophy case exists to be
// shown, and the profile page reads other people's. Secrets are masked by
// the catalog's presenter until owned, so a public read of a locked secret
// shows "???" and never its title or condition.
//
// Dispatched before the /players family so /players/:id/achievements is not
// swallowed by a broader player route — the same ordering the ladder routes
// need.
export async function handleAchievementRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const { submitAchievementRun, getPlayerAchievements } = services ?? {};

  if (pathname === "/achievements" && method === "GET") {
    writeJson(res, 200, { games: listAchievementGames() }, requestOrigin);
    return true;
  }

  const catalogMatch = pathname.match(/^\/achievements\/([^/]+)$/);
  const runsMatch = pathname.match(/^\/achievements\/([^/]+)\/runs$/);
  const playerMatch = pathname.match(/^\/players\/([^/]+)\/achievements$/);
  if (!catalogMatch && !runsMatch && !playerMatch) return false;

  if (playerMatch && method === "GET") {
    if (typeof getPlayerAchievements !== "function") {
      writeJson(res, 503, { status: "error", error: "achievements_not_configured", timestamp }, requestOrigin);
      return true;
    }
    const searchParams = new URL(req.url || "/", "http://localhost").searchParams;
    const gameSlug = searchParams.get("game") || "";
    if (gameSlug && !isAchievementGameSlug(gameSlug)) {
      writeJson(res, 404, { status: "error", error: "unknown_achievement_game", timestamp }, requestOrigin);
      return true;
    }
    const collection = await getPlayerAchievements({ playerId: decodeURIComponent(playerMatch[1]), gameSlug });
    if (!collection) {
      writeJson(res, 500, { status: "error", error: "achievements_unavailable", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { collection }, requestOrigin);
    return true;
  }

  const gameSlug = decodeURIComponent((catalogMatch ?? runsMatch)![1]);
  // Unknown game is a 404, not an empty catalog: an empty list would read as
  // "this game has no achievements yet", which is the wrong conclusion for a
  // typo.
  if (!isAchievementGameSlug(gameSlug)) {
    writeJson(res, 404, { status: "error", error: "unknown_achievement_game", timestamp }, requestOrigin);
    return true;
  }

  if (catalogMatch && method === "GET") {
    const game = getAchievementGame(gameSlug)!;
    writeJson(res, 200, {
      game: {
        gameSlug: game.gameSlug,
        title: game.title,
        total: game.definitions.length,
        achievements: game.definitions.map((definition) => presentAchievement(definition, null)),
      },
    }, requestOrigin);
    return true;
  }

  if (runsMatch && method === "POST") {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
      return true;
    }
    if (typeof submitAchievementRun !== "function") {
      writeJson(res, 503, { status: "error", error: "achievements_not_configured", timestamp }, requestOrigin);
      return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const result = await submitAchievementRun({
      gameSlug,
      playerId: authClaims.playerId,
      run: body.value?.run,
    });
    if (!result) {
      writeJson(res, 500, { status: "error", error: "achievements_unavailable", timestamp }, requestOrigin);
      return true;
    }
    if (result.error) {
      writeJson(res, 400, { status: "error", error: result.error, timestamp }, requestOrigin);
      return true;
    }
    // A run that earned nothing is a 200 with an empty list. Most runs earn
    // nothing, and a client that treated that as a failure would show an
    // error after every ordinary game.
    writeJson(res, 200, { ok: true, ...result }, requestOrigin);
    return true;
  }

  return false;
}
