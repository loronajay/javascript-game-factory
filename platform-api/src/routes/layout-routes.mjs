import { readJsonBody, writeJson } from "../http-utils.mjs";

export async function handleLayoutRoute(context) {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const { loadPlayerLayout, savePlayerLayout } = services;

  // Public: GET /players/:id/layout — returns any player's saved layout (no auth needed).
  const playerLayoutMatch = pathname.match(/^\/players\/([^/]+)\/layout$/);
  if (method === "GET" && playerLayoutMatch) {
    const targetPlayerId = decodeURIComponent(playerLayoutMatch[1]);
    const layout = await loadPlayerLayout(targetPlayerId);
    writeJson(res, 200, { layout: layout ?? null }, requestOrigin);
    return true;
  }

  if (pathname !== "/profile/layout") return false;

  if (!authClaims?.playerId) {
    writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
    return true;
  }

  const playerId = authClaims.playerId;

  if (method === "GET") {
    const layout = await loadPlayerLayout(playerId);
    writeJson(res, 200, { layout: layout ?? null }, requestOrigin);
    return true;
  }

  if (method === "POST") {
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }

    const incoming = body.value;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      writeJson(res, 400, { status: "error", error: "invalid_layout", timestamp }, requestOrigin);
      return true;
    }

    const saved = await savePlayerLayout(playerId, incoming);
    if (!saved) {
      writeJson(res, 500, { status: "error", error: "save_failed", timestamp }, requestOrigin);
      return true;
    }

    writeJson(res, 200, { layout: saved }, requestOrigin);
    return true;
  }

  return false;
}
