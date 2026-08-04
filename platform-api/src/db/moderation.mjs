import { enumValue, singleLine, textBlock, toIso } from "./content-shared.mjs";
// Moderation: player-filed reports, operator removal of content, and suspensions.
//
// WHY THE DELETES LIVE HERE AND NOT AS A FLAG ON THE EXISTING ONES.
// db/thoughts.mts and db/photos.mts bind ownership directly into the delete predicate
// (`where id = $1 and author_player_id = $2`). Threading an `asAdmin` escape hatch
// through those functions would mean the ownership rule for ordinary players is now one
// mistaken argument away from being skipped. Instead the admin removals are separate
// functions with no ownership predicate at all, reachable only from an admin-gated
// route. The ownership-enforcing paths keep their unconditional guarantee.
const TARGET_TYPES = ["thought", "thought_comment", "photo", "photo_comment", "player"];
const REPORT_REASONS = ["spam", "harassment", "hate", "sexual", "violence", "impersonation", "other"];
const REPORT_STATUSES = ["open", "resolved", "dismissed"];
function mapReportRow(row) {
    return {
        id: String(row.id),
        targetType: enumValue(row.target_type, TARGET_TYPES, "thought"),
        targetId: String(row.target_id || ""),
        targetOwnerPlayerId: String(row.target_owner_player_id || ""),
        targetOwnerName: String(row.target_owner_name || ""),
        reporterPlayerId: String(row.reporter_player_id || ""),
        reporterName: String(row.reporter_name || ""),
        reason: String(row.reason || "other"),
        details: String(row.details || ""),
        status: enumValue(row.status, REPORT_STATUSES, "open"),
        createdAt: toIso(row.created_at),
        resolvedAt: toIso(row.resolved_at),
        resolvedBy: String(row.resolved_by || ""),
    };
}
// Filing a report. The unique partial index on (target, reporter) where status='open'
// makes a repeat filing a silent no-op rather than an error: a player who taps Report
// twice should not see a failure, and the queue should not gain a duplicate.
export async function fileReport(pool, input = {}) {
    if (!pool)
        return { ok: false, error: "database_unavailable" };
    const targetType = enumValue(input.targetType, TARGET_TYPES, "thought");
    const targetId = singleLine(input.targetId, 120);
    const reporterPlayerId = singleLine(input.reporterPlayerId, 80);
    if (!targetId || !reporterPlayerId)
        return { ok: false, error: "invalid_request" };
    try {
        const result = await pool.query(`insert into content_reports
         (target_type, target_id, target_owner_player_id, reporter_player_id, reason, details)
       values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing
       returning id`, [
            targetType,
            targetId,
            singleLine(input.targetOwnerPlayerId, 80),
            reporterPlayerId,
            enumValue(input.reason, REPORT_REASONS, "other"),
            textBlock(input.details, 600),
        ]);
        return result?.rowCount ? { ok: true } : { ok: true, duplicate: true };
    }
    catch (err) {
        process.stderr.write(`[moderation] fileReport error: ${err?.message || err}\n`);
        return { ok: false, error: "server_error" };
    }
}
export async function listReports(pool, options = {}) {
    if (!pool)
        return [];
    const status = enumValue(options?.status, [...REPORT_STATUSES, "all"], "open");
    const limit = Math.min(Math.max(Number.parseInt(String(options?.limit || "100"), 10) || 100, 1), 250);
    try {
        const result = await pool.query(`select r.id, r.target_type, r.target_id, r.target_owner_player_id, r.reporter_player_id,
              r.reason, r.details, r.status, r.created_at, r.resolved_at, r.resolved_by,
              coalesce(reporter.profile_name, '') as reporter_name,
              coalesce(owner.profile_name, '')    as target_owner_name
         from content_reports r
         left join players reporter on reporter.player_id = r.reporter_player_id
         left join players owner    on owner.player_id    = r.target_owner_player_id
        where ($1 = 'all' or r.status = $1)
        order by r.created_at desc, r.id desc
        limit $2`, [status, limit]);
        return (result?.rows || []).map(mapReportRow);
    }
    catch {
        return [];
    }
}
export async function resolveReport(pool, id, status, adminPlayerId) {
    if (!pool || !id)
        return { ok: false, error: "invalid_request" };
    const nextStatus = enumValue(status, ["resolved", "dismissed"], "resolved");
    try {
        const result = await pool.query(`update content_reports
          set status = $2, resolved_at = now(), resolved_by = $3
        where id = $1 and status = 'open'`, [String(id), nextStatus, String(adminPlayerId || "")]);
        return result?.rowCount ? { ok: true } : { ok: false, error: "not_found" };
    }
    catch {
        return { ok: false, error: "server_error" };
    }
}
// Operator removal, by id, with no ownership predicate. See the note at the top of this
// file for why this is a separate function rather than a flag on the player-facing path.
// The table is chosen from a fixed map, never interpolated from the request.
const REMOVAL_TARGETS = {
    thought: { table: "thought_posts", label: "thought" },
    thought_comment: { table: "thought_post_comments", label: "thought comment" },
    photo: { table: "player_photos", label: "photo" },
    photo_comment: { table: "photo_comments", label: "photo comment" },
};
export async function removeContentAsAdmin(pool, targetType, targetId) {
    if (!pool)
        return { ok: false, error: "database_unavailable" };
    const target = REMOVAL_TARGETS[enumValue(targetType, TARGET_TYPES, "thought")];
    const id = singleLine(targetId, 120);
    if (!target)
        return { ok: false, error: "unsupported_target" };
    if (!id)
        return { ok: false, error: "invalid_request" };
    try {
        const result = await pool.query(`delete from ${target.table} where id = $1`, [id]);
        if (!result?.rowCount)
            return { ok: false, error: "not_found" };
        // Any open reports about this item are settled by its removal — leaving them in the
        // queue would ask the operator to re-review content that no longer exists.
        await pool.query(`update content_reports
          set status = 'resolved', resolved_at = now()
        where target_type = $1 and target_id = $2 and status = 'open'`, [targetType, id]).catch(() => { });
        return { ok: true };
    }
    catch (err) {
        process.stderr.write(`[moderation] removeContentAsAdmin error: ${err?.message || err}\n`);
        return { ok: false, error: "server_error" };
    }
}
// Suspension is time-boxed rather than a boolean ban: an expiry that passes on its own
// means no operator has to remember to lift it, and there is no "permanently banned"
// state that can be set by accident. A very long duration is still available explicitly.
export async function suspendAccount(pool, playerId, options = {}) {
    if (!pool || !playerId)
        return { ok: false, error: "invalid_request" };
    const days = Math.min(Math.max(Number.parseInt(String(options?.days || "7"), 10) || 7, 1), 3650);
    const reason = textBlock(options?.reason, 400);
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    try {
        const result = await pool.query(`update accounts set suspended_until = $2, suspended_reason = $3, updated_at = now()
        where player_id = $1 and is_admin = false
        returning player_id`, [String(playerId), until, reason]);
        // `is_admin = false` in the predicate is the guard, not an oversight: an operator
        // must not be able to suspend a fellow operator (or themselves) and lock the
        // console. Demote first if that is genuinely intended.
        return result?.rowCount ? { ok: true, until } : { ok: false, error: "not_suspendable" };
    }
    catch (err) {
        process.stderr.write(`[moderation] suspendAccount error: ${err?.message || err}\n`);
        return { ok: false, error: "server_error" };
    }
}
export async function liftSuspension(pool, playerId) {
    if (!pool || !playerId)
        return { ok: false, error: "invalid_request" };
    try {
        const result = await pool.query(`update accounts set suspended_until = null, suspended_reason = null, updated_at = now()
        where player_id = $1`, [String(playerId)]);
        return result?.rowCount ? { ok: true } : { ok: false, error: "no_account" };
    }
    catch {
        return { ok: false, error: "server_error" };
    }
}
export async function listSuspendedAccounts(pool) {
    if (!pool)
        return [];
    try {
        const result = await pool.query(`select a.player_id, a.email, a.suspended_until, a.suspended_reason,
              coalesce(p.profile_name, '') as profile_name
         from accounts a
         left join players p on p.player_id = a.player_id
        where a.suspended_until is not null and a.suspended_until > now()
        order by a.suspended_until asc`);
        return (result?.rows || []).map((row) => ({
            playerId: String(row.player_id),
            email: String(row.email || ""),
            profileName: String(row.profile_name || ""),
            suspendedUntil: toIso(row.suspended_until),
            suspendedReason: String(row.suspended_reason || ""),
        }));
    }
    catch {
        return [];
    }
}
