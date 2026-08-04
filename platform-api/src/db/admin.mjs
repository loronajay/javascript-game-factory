// Platform authority and its audit trail.
//
// Every other db module answers "does this player own this row?". This one answers the
// only question that rule cannot express: "is this player an operator of the platform?".
// Authority is read from the `accounts` row on every request rather than trusted from a
// JWT claim, so revoking an admin takes effect on their next call instead of when their
// 30-day token happens to expire.
// The single authority check. Returns false for every failure mode — no account, no
// database, a query error — because "we could not confirm you are an admin" and "you are
// not an admin" must lead to the same refusal. Never invert this to fail open.
export async function isAdminPlayer(pool, playerId) {
    if (!pool || !playerId)
        return false;
    try {
        const result = await pool.query("select is_admin from accounts where player_id = $1", [String(playerId)]);
        return result?.rows?.[0]?.is_admin === true;
    }
    catch {
        return false;
    }
}
// Suspension is checked on the same hot path as authority, so it lives here rather than
// in a moderation module the request path would otherwise never import.
export async function getAccountSuspension(pool, playerId) {
    if (!pool || !playerId)
        return null;
    try {
        const result = await pool.query(`select suspended_until, suspended_reason
         from accounts
        where player_id = $1 and suspended_until is not null and suspended_until > now()`, [String(playerId)]);
        const row = result?.rows?.[0];
        if (!row)
            return null;
        return {
            until: row.suspended_until instanceof Date ? row.suspended_until.toISOString() : String(row.suspended_until),
            reason: String(row.suspended_reason || ""),
        };
    }
    catch {
        return null;
    }
}
// Promotes accounts listed in the ADMIN_EMAILS env var at boot. This is the bootstrap
// path only: it can GRANT but never REVOKE, so removing an address from the env var
// leaves the existing admin in place to be demoted deliberately through the console.
// That asymmetry is intentional — a typo in an env var should not silently strip
// authority from a live operator.
export async function seedAdminsFromEmails(pool, rawEmails) {
    if (!pool)
        return [];
    const emails = String(rawEmails || "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
    if (!emails.length)
        return [];
    try {
        const result = await pool.query(`update accounts set is_admin = true, updated_at = now()
        where lower(email) = any($1::text[]) and is_admin = false
        returning email`, [emails]);
        return (result?.rows || []).map((row) => String(row.email || ""));
    }
    catch (err) {
        process.stderr.write(`[admin] seedAdminsFromEmails error: ${err?.message || err}\n`);
        return [];
    }
}
export async function listAdmins(pool) {
    if (!pool)
        return [];
    try {
        const result = await pool.query(`select a.player_id, a.email, a.created_at, coalesce(p.profile_name, '') as profile_name
         from accounts a
         left join players p on p.player_id = a.player_id
        where a.is_admin
        order by a.created_at asc`);
        return (result?.rows || []).map((row) => ({
            playerId: String(row.player_id),
            email: String(row.email || ""),
            profileName: String(row.profile_name || ""),
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at || null,
        }));
    }
    catch {
        return [];
    }
}
// Demotion guard: the platform must never reach a state with zero admins, because there
// would then be no way to grant the flag back through the console. The count and the
// update run in one transaction so two concurrent demotions cannot both pass the check.
export async function setAdminFlag(pool, playerId, isAdmin) {
    if (!pool || !playerId)
        return { ok: false, error: "invalid_request" };
    const client = await pool.connect();
    try {
        await client.query("begin");
        if (!isAdmin) {
            const remaining = await client.query("select count(*)::int as count from accounts where is_admin and player_id <> $1", [String(playerId)]);
            if ((remaining?.rows?.[0]?.count || 0) < 1) {
                await client.query("rollback");
                return { ok: false, error: "last_admin" };
            }
        }
        const updated = await client.query("update accounts set is_admin = $2, updated_at = now() where player_id = $1 returning player_id", [String(playerId), isAdmin === true]);
        if (!updated?.rowCount) {
            await client.query("rollback");
            return { ok: false, error: "no_account" };
        }
        await client.query("commit");
        return { ok: true };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[admin] setAdminFlag error: ${err?.message || err}\n`);
        return { ok: false, error: "server_error" };
    }
    finally {
        client.release();
    }
}
// Audit writes are deliberately best-effort: a logging failure must not roll back the
// action the operator actually asked for. Failures are surfaced on stderr instead.
export async function writeAuditLog(pool, entry = {}) {
    if (!pool || !entry?.adminPlayerId || !entry?.action)
        return;
    try {
        await pool.query(`insert into admin_audit_log (admin_player_id, action, target_type, target_id, details)
       values ($1, $2, $3, $4, $5::jsonb)`, [
            String(entry.adminPlayerId),
            String(entry.action).slice(0, 80),
            String(entry.targetType || "").slice(0, 40),
            String(entry.targetId || "").slice(0, 120),
            JSON.stringify(entry.details && typeof entry.details === "object" ? entry.details : {}),
        ]);
    }
    catch (err) {
        process.stderr.write(`[admin] writeAuditLog error: ${err?.message || err}\n`);
    }
}
export async function listAuditLog(pool, options = {}) {
    if (!pool)
        return [];
    const limit = Math.min(Math.max(Number.parseInt(String(options?.limit || "100"), 10) || 100, 1), 250);
    try {
        const result = await pool.query(`select l.id, l.admin_player_id, l.action, l.target_type, l.target_id, l.details, l.created_at,
              coalesce(p.profile_name, '') as admin_name
         from admin_audit_log l
         left join players p on p.player_id = l.admin_player_id
        order by l.created_at desc, l.id desc
        limit $1`, [limit]);
        return (result?.rows || []).map((row) => ({
            id: String(row.id),
            adminPlayerId: String(row.admin_player_id),
            adminName: String(row.admin_name || ""),
            action: String(row.action || ""),
            targetType: String(row.target_type || ""),
            targetId: String(row.target_id || ""),
            details: row.details && typeof row.details === "object" ? row.details : {},
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at || null,
        }));
    }
    catch {
        return [];
    }
}
