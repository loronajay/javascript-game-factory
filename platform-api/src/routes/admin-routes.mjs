import { writeJson } from "../http-utils.mjs";
import { handleAdminContentRoute } from "./admin-content-routes.mjs";
import { handleAdminModerationRoute } from "./admin-moderation-routes.mjs";
// The admin console's single front door.
//
// THIS FILE IS THE ONLY PLACE THE ADMIN CHECK HAPPENS. Everything under /admin/ passes
// through the gate below before any sub-handler sees the request, and the sub-handlers
// deliberately contain no authorization logic of their own. That is the point: a new
// admin endpoint added to either sub-handler is gated by construction, and there is no
// way to add one that forgets to check. Do not move the check downward, and do not add
// an /admin/ route anywhere else in the dispatch chain.
//
// Authority is re-read from the database on every request rather than taken from the
// JWT. Tokens live 30 days; a revoked admin must lose access on their next call, not
// when their session happens to expire.
export async function handleAdminRoute(context) {
    const { res, pathname, authClaims, requestOrigin, timestamp, services } = context;
    if (pathname !== "/admin" && !pathname.startsWith("/admin/"))
        return false;
    if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return true;
    }
    const isAdmin = typeof services?.isAdminPlayer === "function"
        ? await services.isAdminPlayer(authClaims.playerId)
        : false;
    if (!isAdmin) {
        // 403, not 404. The console is not a secret — the whole platform links to it for the
        // people who have it — and pretending the routes do not exist would only make a
        // genuine permission problem look like a broken deploy.
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return true;
    }
    const adminContext = { ...context, adminPlayerId: authClaims.playerId };
    if (await handleAdminContentRoute(adminContext))
        return true;
    if (await handleAdminModerationRoute(adminContext))
        return true;
    writeJson(res, 404, { status: "error", error: "unknown_admin_route", timestamp }, requestOrigin);
    return true;
}
