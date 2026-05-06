import { writeJson } from "../http-utils.mjs";

// Notifications are a small auth-only surface, but extracting them keeps the
// top-level app focused on dispatch instead of endpoint details.
export async function handleNotificationRoute(context) {
  const {
    res,
    method,
    pathname,
    authClaims,
    requestOrigin,
    timestamp,
    services,
  } = context;
  const {
    listNotifications,
    markAllNotificationsRead,
  } = services;

  if (method === "GET" && pathname === "/notifications") {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const result = await listNotifications(authClaims.playerId);
    writeJson(res, 200, result, requestOrigin);
    return true;
  }

  if (method === "POST" && pathname === "/notifications/read-all") {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    await markAllNotificationsRead(authClaims.playerId);
    writeJson(res, 200, { ok: true }, requestOrigin);
    return true;
  }

  return false;
}
