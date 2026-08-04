import { readJsonBody, writeJson } from "../http-utils.mjs";

// Admin moderation: the report queue, content removal, suspensions, and admin roster.
//
//   GET    /admin/reports[?status=]              the queue (default: open)
//   POST   /admin/reports/:id/resolve            settle one report
//   DELETE /admin/content/:targetType/:targetId  remove content as an operator
//   GET    /admin/accounts/suspended             current suspensions
//   POST   /admin/accounts/:playerId/suspend     suspend for N days
//   DELETE /admin/accounts/:playerId/suspend     lift a suspension
//   GET    /admin/admins                         the admin roster
//   POST   /admin/admins/:playerId               grant admin
//   DELETE /admin/admins/:playerId               revoke admin
//   GET    /admin/audit[?limit=]                 recent admin actions
//
// NO AUTHORIZATION LOGIC LIVES HERE — admin-routes.mts gates the whole /admin/ family
// before this handler runs. See the note there before adding a route.

function statusForError(error: string): number {
  if (error === "not_found" || error === "no_account") return 404;
  if (error === "last_admin" || error === "not_suspendable") return 409;
  if (error === "invalid_request" || error === "unsupported_target") return 400;
  if (error === "database_unavailable") return 503;
  return 500;
}

export async function handleAdminModerationRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, requestUrl, adminPlayerId, requestOrigin, timestamp, services } = context;
  const {
    listReports, resolveReport, removeContentAsAdmin,
    listSuspendedAccounts, suspendAccount, liftSuspension,
    listAdmins, setAdminFlag, listAuditLog, writeAuditLog,
  } = services || {};

  const searchParams = requestUrl?.searchParams || new URL(req?.url || "/", "http://localhost").searchParams;
  const audit = (action: string, targetType: string, targetId: string, details: any = {}) =>
    writeAuditLog?.({ adminPlayerId, action, targetType, targetId, details });

  // ---- Report queue ----

  if (method === "GET" && pathname === "/admin/reports") {
    const reports = await listReports({
      status: searchParams.get("status") || "open",
      limit: searchParams.get("limit"),
    });
    writeJson(res, 200, { reports: reports || [] }, requestOrigin);
    return true;
  }

  const resolveMatch = pathname.match(/^\/admin\/reports\/([^/]+)\/resolve$/);
  if (resolveMatch && method === "POST") {
    const id = decodeURIComponent(resolveMatch[1]);
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }

    const nextStatus = body.value?.status || "resolved";
    const result = await resolveReport(id, nextStatus, adminPlayerId);
    if (!result?.ok) {
      writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
      return true;
    }
    await audit("report.resolve", "report", id, { status: nextStatus });
    writeJson(res, 200, { status: "ok" }, requestOrigin);
    return true;
  }

  // ---- Content removal ----
  //
  // The only path in the platform that deletes content the caller does not own. It is
  // one call into db/moderation.mts, which is the only module holding an ownership-free
  // delete; the player-facing deletes in db/thoughts.mts and db/photos.mts keep their
  // ownership predicates and are untouched by this route.

  const contentMatch = pathname.match(/^\/admin\/content\/([^/]+)\/([^/]+)$/);
  if (contentMatch && method === "DELETE") {
    const targetType = decodeURIComponent(contentMatch[1]);
    const targetId = decodeURIComponent(contentMatch[2]);

    const result = await removeContentAsAdmin(targetType, targetId);
    if (!result?.ok) {
      writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
      return true;
    }
    await audit("content.remove", targetType, targetId);
    writeJson(res, 200, { status: "ok" }, requestOrigin);
    return true;
  }

  // ---- Suspensions ----

  if (method === "GET" && pathname === "/admin/accounts/suspended") {
    writeJson(res, 200, { accounts: (await listSuspendedAccounts()) || [] }, requestOrigin);
    return true;
  }

  const suspendMatch = pathname.match(/^\/admin\/accounts\/([^/]+)\/suspend$/);
  if (suspendMatch && method === "POST") {
    const playerId = decodeURIComponent(suspendMatch[1]);
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }

    const result = await suspendAccount(playerId, body.value || {});
    if (!result?.ok) {
      writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
      return true;
    }
    await audit("account.suspend", "player", playerId, { until: result.until, days: body.value?.days });
    writeJson(res, 200, { status: "ok", until: result.until }, requestOrigin);
    return true;
  }

  if (suspendMatch && method === "DELETE") {
    const playerId = decodeURIComponent(suspendMatch[1]);
    const result = await liftSuspension(playerId);
    if (!result?.ok) {
      writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
      return true;
    }
    await audit("account.unsuspend", "player", playerId);
    writeJson(res, 200, { status: "ok" }, requestOrigin);
    return true;
  }

  // ---- Admin roster ----

  if (method === "GET" && pathname === "/admin/admins") {
    writeJson(res, 200, { admins: (await listAdmins()) || [] }, requestOrigin);
    return true;
  }

  const adminMatch = pathname.match(/^\/admin\/admins\/([^/]+)$/);
  if (adminMatch && (method === "POST" || method === "DELETE")) {
    const playerId = decodeURIComponent(adminMatch[1]);
    const granting = method === "POST";

    const result = await setAdminFlag(playerId, granting);
    if (!result?.ok) {
      writeJson(res, statusForError(result?.error || ""), { status: "error", error: result?.error, timestamp }, requestOrigin);
      return true;
    }
    await audit(granting ? "admin.grant" : "admin.revoke", "player", playerId);
    writeJson(res, 200, { status: "ok" }, requestOrigin);
    return true;
  }

  // ---- Audit trail ----

  if (method === "GET" && pathname === "/admin/audit") {
    const entries = await listAuditLog({ limit: searchParams.get("limit") });
    writeJson(res, 200, { entries: entries || [] }, requestOrigin);
    return true;
  }

  return false;
}
