import { readJsonBody, writeJson } from "../http-utils.mjs";
// Public reads of admin-authored content, plus the one write any signed-in player makes
// into the moderation system.
//
//   GET  /bulletins                the public board (published + public only)
//   GET  /bulletins/:slug          one public bulletin
//   GET  /events                   the public calendar (cancelled hidden)
//   GET  /events/:slug             one public event
//   GET  /site-config              cabinet overrides + keyed settings for the grid
//   POST /reports                  file a report (auth required)
//
// Deliberately unauthenticated on the reads: a bulletin board and an event calendar are
// public information, the same reasoning that keeps /ladders open. Draft and non-public
// rows are filtered in SQL, not here, so an unpublished item is never in the payload.
//
// Every read returns an EMPTY collection rather than an error when the database is cold
// or unreachable. The browser treats empty as "use the shipped fixtures", so a backend
// outage degrades to the pre-admin-console site instead of an error page.
export async function handleContentRoute(context) {
    const { req, res, method, pathname, requestUrl, authClaims, requestOrigin, timestamp, services } = context;
    const { listPublicBulletins, getPublicBulletinBySlug, listPublicEvents, getPublicEventBySlug, listCabinetOverrides, listSiteSettings, fileReport, } = services || {};
    const searchParams = requestUrl?.searchParams || new URL(req?.url || "/", "http://localhost").searchParams;
    if (method === "GET" && pathname === "/bulletins") {
        const bulletins = await listPublicBulletins({ limit: searchParams.get("limit") });
        writeJson(res, 200, { bulletins: bulletins || [] }, requestOrigin);
        return true;
    }
    const bulletinSlugMatch = pathname.match(/^\/bulletins\/([^/]+)$/);
    if (method === "GET" && bulletinSlugMatch) {
        const bulletin = await getPublicBulletinBySlug(decodeURIComponent(bulletinSlugMatch[1]));
        if (!bulletin) {
            writeJson(res, 404, { status: "error", error: "not_found", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { bulletin }, requestOrigin);
        return true;
    }
    if (method === "GET" && pathname === "/events") {
        const events = await listPublicEvents({ limit: searchParams.get("limit") });
        writeJson(res, 200, { events: events || [] }, requestOrigin);
        return true;
    }
    const eventSlugMatch = pathname.match(/^\/events\/([^/]+)$/);
    if (method === "GET" && eventSlugMatch) {
        const event = await getPublicEventBySlug(decodeURIComponent(eventSlugMatch[1]));
        if (!event) {
            writeJson(res, 404, { status: "error", error: "not_found", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { event }, requestOrigin);
        return true;
    }
    // The grid calls this on every load, so it must stay cheap and must never fail the
    // page. Two small unindexed-scan-sized tables; both fall back to empty.
    if (method === "GET" && pathname === "/site-config") {
        const [cabinets, settings] = await Promise.all([
            listCabinetOverrides(),
            listSiteSettings(),
        ]);
        writeJson(res, 200, {
            cabinets: cabinets || [],
            settings: settings || {},
        }, requestOrigin);
        return true;
    }
    if (method === "POST" && pathname === "/reports") {
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const result = await fileReport({
            ...(body.value || {}),
            reporterPlayerId: authClaims.playerId,
        });
        if (!result?.ok) {
            writeJson(res, 400, { status: "error", error: result?.error || "report_failed", timestamp }, requestOrigin);
            return true;
        }
        // A duplicate is reported as success. The player pressed Report and the item is
        // in the queue; whether their press was the one that filed it is not their concern.
        writeJson(res, 202, { status: "ok", duplicate: result.duplicate === true }, requestOrigin);
        return true;
    }
    return false;
}
