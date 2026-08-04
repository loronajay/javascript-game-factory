import { readJsonBody, writeJson } from "../http-utils.mjs";
// Admin authoring: bulletins, events, cabinet presentation, and keyed site settings.
//
//   GET    /admin/overview              console summary counts
//   GET    /admin/bulletins             every bulletin, any status
//   POST   /admin/bulletins             create
//   PATCH  /admin/bulletins/:id         replace the editable fields
//   DELETE /admin/bulletins/:id         remove
//   GET    /admin/events                every event, any status
//   POST   /admin/events                create
//   PATCH  /admin/events/:id            replace the editable fields
//   DELETE /admin/events/:id            remove
//   GET    /admin/cabinets              current grid overrides
//   PUT    /admin/cabinets/:slug        set this cabinet's overrides
//   DELETE /admin/cabinets/:slug        restore the cabinet's game.json presentation
//   PUT    /admin/settings/:key         write one keyed setting
//
// NO AUTHORIZATION LOGIC LIVES HERE — admin-routes.mts gates the whole /admin/ family
// before this handler runs. See the note there before adding a route.
async function readBody(req, res, requestOrigin, timestamp) {
    const body = await readJsonBody(req);
    if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return null;
    }
    return body.value || {};
}
// Maps the named errors the db layer returns onto status codes. Anything unrecognized is
// a 500: an unmapped error is a bug here, not a client mistake.
function statusForError(error) {
    if (error === "not_found")
        return 404;
    if (error === "slug_taken")
        return 409;
    if (error === "invalid_slug" || error === "invalid_key" || error === "invalid_request")
        return 400;
    if (error === "database_unavailable")
        return 503;
    return 500;
}
export async function handleAdminContentRoute(context) {
    const { req, res, method, pathname, adminPlayerId, requestOrigin, timestamp, services } = context;
    const { listAllBulletins, createBulletin, updateBulletin, deleteBulletin, listAllEvents, createEvent, updateEvent, deleteEvent, listCabinetOverrides, saveCabinetOverride, deleteCabinetOverride, listSiteSettings, saveSiteSetting, listReports, listSuspendedAccounts, listAdmins, writeAuditLog, announceBulletin, announceEvent, } = services || {};
    const audit = (action, targetType, targetId, details = {}) => writeAuditLog?.({ adminPlayerId, action, targetType, targetId, details });
    // Publishing a bulletin or an event notifies every account. The service decides whether
    // this particular save qualifies (publicly visible, never announced before) and swallows
    // its own failures, so every call site is one unconditional line and the operator's save
    // is never held hostage to a fan-out. It is awaited so the audit entry records what
    // actually happened rather than what was hoped for.
    const announce = async (announcer, record) => {
        if (typeof announcer !== "function")
            return { announced: false };
        try {
            return (await announcer(record, adminPlayerId)) || { announced: false };
        }
        catch {
            // The service already swallows its own failures; this is the belt for the braces, so
            // that a broken announcer can never turn a saved record into a 500.
            return { announced: false };
        }
    };
    // Both authoring flows report the fan-out the same way: `notified` in the response so the
    // console can say so, and notified/recipientCount in the audit entry so the Audit tab can
    // answer "did that actually go out?" long after the toast is gone.
    const announceDetails = (result) => ({
        notified: result.announced === true,
        recipientCount: result.recipientCount || 0,
    });
    if (method === "GET" && pathname === "/admin/overview") {
        const [bulletins, events, openReports, suspended, admins, cabinets] = await Promise.all([
            listAllBulletins(),
            listAllEvents(),
            listReports({ status: "open", limit: 250 }),
            listSuspendedAccounts(),
            listAdmins(),
            listCabinetOverrides(),
        ]);
        writeJson(res, 200, {
            overview: {
                bulletinCount: (bulletins || []).length,
                publishedBulletinCount: (bulletins || []).filter((entry) => entry.status === "published").length,
                eventCount: (events || []).length,
                upcomingEventCount: (events || []).filter((entry) => entry.status === "scheduled" || entry.status === "live").length,
                openReportCount: (openReports || []).length,
                suspendedCount: (suspended || []).length,
                adminCount: (admins || []).length,
                cabinetOverrideCount: (cabinets || []).length,
            },
        }, requestOrigin);
        return true;
    }
    // ---- Bulletins ----
    if (method === "GET" && pathname === "/admin/bulletins") {
        writeJson(res, 200, { bulletins: (await listAllBulletins()) || [] }, requestOrigin);
        return true;
    }
    if (method === "POST" && pathname === "/admin/bulletins") {
        const value = await readBody(req, res, requestOrigin, timestamp);
        if (!value)
            return true;
        const result = await createBulletin(value, adminPlayerId);
        if (!result?.ok) {
            writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
            return true;
        }
        const announced = await announce(announceBulletin, result.bulletin);
        await audit("bulletin.create", "bulletin", result.bulletin.id, {
            slug: result.bulletin.slug,
            status: result.bulletin.status,
            ...announceDetails(announced),
        });
        writeJson(res, 201, { bulletin: result.bulletin, notified: announced.announced === true }, requestOrigin);
        return true;
    }
    const bulletinIdMatch = pathname.match(/^\/admin\/bulletins\/([^/]+)$/);
    if (bulletinIdMatch && (method === "PATCH" || method === "PUT")) {
        const id = decodeURIComponent(bulletinIdMatch[1]);
        const value = await readBody(req, res, requestOrigin, timestamp);
        if (!value)
            return true;
        const result = await updateBulletin(id, value);
        if (!result?.ok) {
            writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
            return true;
        }
        // A draft published on an edit announces here, on the transition. Editing an
        // already-announced bulletin does not — the claim in the db layer has been spent.
        const announced = await announce(announceBulletin, result.bulletin);
        await audit("bulletin.update", "bulletin", id, {
            slug: result.bulletin.slug,
            status: result.bulletin.status,
            ...announceDetails(announced),
        });
        writeJson(res, 200, { bulletin: result.bulletin, notified: announced.announced === true }, requestOrigin);
        return true;
    }
    if (bulletinIdMatch && method === "DELETE") {
        const id = decodeURIComponent(bulletinIdMatch[1]);
        const result = await deleteBulletin(id);
        if (!result?.ok) {
            writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
            return true;
        }
        await audit("bulletin.delete", "bulletin", id);
        writeJson(res, 200, { status: "ok" }, requestOrigin);
        return true;
    }
    // ---- Events ----
    if (method === "GET" && pathname === "/admin/events") {
        writeJson(res, 200, { events: (await listAllEvents()) || [] }, requestOrigin);
        return true;
    }
    if (method === "POST" && pathname === "/admin/events") {
        const value = await readBody(req, res, requestOrigin, timestamp);
        if (!value)
            return true;
        const result = await createEvent(value, adminPlayerId);
        if (!result?.ok) {
            writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
            return true;
        }
        // Unlike a bulletin, an event has no draft: a `scheduled` event is on the public
        // calendar the moment it is created, so this first save is usually the one that
        // notifies. Creating as `cancelled` is the way to stage one quietly.
        const announced = await announce(announceEvent, result.event);
        await audit("event.create", "event", result.event.id, {
            slug: result.event.slug,
            status: result.event.status,
            ...announceDetails(announced),
        });
        writeJson(res, 201, { event: result.event, notified: announced.announced === true }, requestOrigin);
        return true;
    }
    const eventIdMatch = pathname.match(/^\/admin\/events\/([^/]+)$/);
    if (eventIdMatch && (method === "PATCH" || method === "PUT")) {
        const id = decodeURIComponent(eventIdMatch[1]);
        const value = await readBody(req, res, requestOrigin, timestamp);
        if (!value)
            return true;
        const result = await updateEvent(id, value);
        if (!result?.ok) {
            writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
            return true;
        }
        const announced = await announce(announceEvent, result.event);
        await audit("event.update", "event", id, {
            slug: result.event.slug,
            status: result.event.status,
            ...announceDetails(announced),
        });
        writeJson(res, 200, { event: result.event, notified: announced.announced === true }, requestOrigin);
        return true;
    }
    if (eventIdMatch && method === "DELETE") {
        const id = decodeURIComponent(eventIdMatch[1]);
        const result = await deleteEvent(id);
        if (!result?.ok) {
            writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
            return true;
        }
        await audit("event.delete", "event", id);
        writeJson(res, 200, { status: "ok" }, requestOrigin);
        return true;
    }
    // ---- Cabinet presentation ----
    //
    // These only ever change how the GRID renders a cabinet. They cannot change what a
    // game does: no game code reads this table, and the browser merges overrides on top of
    // the cabinet's own game.json rather than replacing it.
    if (method === "GET" && pathname === "/admin/cabinets") {
        const [cabinets, settings] = await Promise.all([listCabinetOverrides(), listSiteSettings()]);
        writeJson(res, 200, { cabinets: cabinets || [], settings: settings || {} }, requestOrigin);
        return true;
    }
    const cabinetSlugMatch = pathname.match(/^\/admin\/cabinets\/([^/]+)$/);
    if (cabinetSlugMatch && (method === "PUT" || method === "PATCH")) {
        const slug = decodeURIComponent(cabinetSlugMatch[1]);
        const value = await readBody(req, res, requestOrigin, timestamp);
        if (!value)
            return true;
        const result = await saveCabinetOverride(slug, value, adminPlayerId);
        if (!result?.ok) {
            writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
            return true;
        }
        await audit("cabinet.override", "cabinet", slug, { hidden: result.override.hidden, sortOrder: result.override.sortOrder });
        writeJson(res, 200, { cabinet: result.override }, requestOrigin);
        return true;
    }
    if (cabinetSlugMatch && method === "DELETE") {
        const slug = decodeURIComponent(cabinetSlugMatch[1]);
        const result = await deleteCabinetOverride(slug);
        if (!result?.ok) {
            writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
            return true;
        }
        await audit("cabinet.reset", "cabinet", slug);
        writeJson(res, 200, { status: "ok" }, requestOrigin);
        return true;
    }
    // ---- Keyed settings ----
    const settingKeyMatch = pathname.match(/^\/admin\/settings\/([^/]+)$/);
    if (settingKeyMatch && (method === "PUT" || method === "PATCH")) {
        const key = decodeURIComponent(settingKeyMatch[1]);
        const value = await readBody(req, res, requestOrigin, timestamp);
        if (!value)
            return true;
        // The payload is wrapped in { value } so a setting can legitimately be a bare
        // string, number, or null without the body being ambiguous.
        const result = await saveSiteSetting(key, value.value, adminPlayerId);
        if (!result?.ok) {
            writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
            return true;
        }
        await audit("setting.update", "setting", key);
        writeJson(res, 200, { status: "ok" }, requestOrigin);
        return true;
    }
    return false;
}
