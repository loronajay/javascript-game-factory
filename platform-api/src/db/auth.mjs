import bcrypt from "bcryptjs";
const BCRYPT_ROUNDS = 12;
function sanitizeEmail(value) {
    return typeof value === "string" ? value.trim().toLowerCase().slice(0, 320) : "";
}
function sanitizePlayerId(value) {
    return typeof value === "string" ? value.trim().slice(0, 80) : "";
}
function sanitizeSessionId(value) {
    return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
export async function createAccount(db, { email, password, playerId, sessionId }) {
    const normalizedEmail = sanitizeEmail(email);
    const normalizedPlayerId = sanitizePlayerId(playerId);
    const normalizedSessionId = sanitizeSessionId(sessionId);
    if (!normalizedEmail || !password || !normalizedPlayerId)
        return null;
    const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
    const result = await db.query(`
    insert into accounts (player_id, email, password_hash, current_session_id)
    values ($1, $2, $3, $4)
    returning id, player_id, email, current_session_id, created_at
  `, [normalizedPlayerId, normalizedEmail, passwordHash, normalizedSessionId]);
    return result?.rows?.[0] || null;
}
export async function findAccountByEmail(db, email) {
    const normalizedEmail = sanitizeEmail(email);
    if (!normalizedEmail)
        return null;
    const result = await db.query(`
    select id, player_id, email, password_hash, created_at
    from accounts
    where email = $1
    limit 1
  `, [normalizedEmail]);
    return result?.rows?.[0] || null;
}
export async function rotateAccountSession(db, playerId, sessionId) {
    const normalizedPlayerId = sanitizePlayerId(playerId);
    const normalizedSessionId = sanitizeSessionId(sessionId);
    if (!normalizedPlayerId || !normalizedSessionId)
        return null;
    const result = await db.query(`
    update accounts
    set current_session_id = $2, updated_at = now()
    where player_id = $1
    returning player_id, email, current_session_id
  `, [normalizedPlayerId, normalizedSessionId]);
    return result?.rows?.[0] || null;
}
export async function isAccountSessionCurrent(db, playerId, sessionId) {
    const normalizedPlayerId = sanitizePlayerId(playerId);
    const normalizedSessionId = sanitizeSessionId(sessionId);
    if (!normalizedPlayerId || !normalizedSessionId)
        return false;
    const result = await db.query(`
    select 1
    from accounts
    where player_id = $1 and current_session_id = $2
    limit 1
  `, [normalizedPlayerId, normalizedSessionId]);
    return (result?.rows?.length ?? 0) > 0;
}
export async function clearAccountSession(db, playerId, sessionId) {
    const normalizedPlayerId = sanitizePlayerId(playerId);
    const normalizedSessionId = sanitizeSessionId(sessionId);
    if (!normalizedPlayerId || !normalizedSessionId)
        return false;
    const result = await db.query(`
    update accounts
    set current_session_id = '', updated_at = now()
    where player_id = $1 and current_session_id = $2
    returning player_id
  `, [normalizedPlayerId, normalizedSessionId]);
    return (result?.rows?.length ?? 0) > 0;
}
export async function findAccountByPlayerId(db, playerId) {
    const normalizedPlayerId = sanitizePlayerId(playerId);
    if (!normalizedPlayerId)
        return null;
    const result = await db.query(`
    select id, player_id, email, created_at
    from accounts
    where player_id = $1
    limit 1
  `, [normalizedPlayerId]);
    return result?.rows?.[0] || null;
}
export async function verifyAccountPassword(account, password) {
    if (!account?.password_hash || !password)
        return false;
    try {
        return await bcrypt.compare(String(password), account.password_hash);
    }
    catch {
        return false;
    }
}
export async function createPasswordResetToken(db, { email, token, expiresAt }) {
    const normalizedEmail = sanitizeEmail(email);
    if (!normalizedEmail || !token || !expiresAt)
        return null;
    const result = await db.query(`
    insert into password_reset_tokens (token, email, expires_at)
    values ($1, $2, $3)
    returning token, email, expires_at, created_at
  `, [token, normalizedEmail, expiresAt]);
    return result?.rows?.[0] || null;
}
export async function findPasswordResetToken(db, token) {
    if (!token)
        return null;
    const result = await db.query(`
    select token, email, expires_at, used_at, created_at
    from password_reset_tokens
    where token = $1
    limit 1
  `, [token]);
    return result?.rows?.[0] || null;
}
export async function consumePasswordResetToken(db, token) {
    if (!token)
        return false;
    const result = await db.query(`
    update password_reset_tokens
    set used_at = now()
    where token = $1 and used_at is null
    returning token
  `, [token]);
    return (result?.rows?.length ?? 0) > 0;
}
export async function updateAccountPassword(db, email, newPassword) {
    const normalizedEmail = sanitizeEmail(email);
    if (!normalizedEmail || !newPassword)
        return false;
    const passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
    const result = await db.query(`
    update accounts
    set password_hash = $1, updated_at = now()
    where email = $2
    returning id
  `, [passwordHash, normalizedEmail]);
    return (result?.rows?.length ?? 0) > 0;
}
// Tables holding rows for one player, listed by the column(s) that name them. Only
// `players`, `accounts`, `player_profiles`, `player_metrics`, `player_relationships` and
// `player_photos` are wired with `on delete cascade`; everything below is joined by a plain
// text player id and has to be deleted explicitly, which is why this list exists rather than
// a single `delete from players`.
//
// `tests/account-deletion.test.mjs` reads the migrations and fails when a new player-scoped
// table appears that is neither cascading nor listed here.
const PLAYER_SCOPED_DELETES = Object.freeze([
    // Thoughts feed: the player's own posts plus their marks on other people's.
    ["thought_post_reactions", ["player_id"]],
    ["thought_post_shares", ["player_id"]],
    ["thought_post_comments", ["author_player_id"]],
    ["thought_posts", ["author_player_id"]],
    ["activity_items", ["actor_player_id"]],
    // Photo social. The player's own photos cascade with `players`; these are their marks
    // on other people's photos.
    ["photo_reactions", ["player_id"]],
    ["photo_comments", ["author_player_id"]],
    // Platform social graph. Both directions — a pending request or challenge is equally the
    // other party's row.
    ["friend_requests", ["from_player_id", "to_player_id"]],
    ["challenges", ["from_player_id", "to_player_id"]],
    ["notifications", ["recipient_player_id", "actor_player_id"]],
    // Deleting the conversation cascades its messages.
    ["conversations", ["player_a_id", "player_b_id"]],
    // Per-game progression and economy. Entitlements and claims are the record of what the
    // player owns and bought; leaving them behind means a "deleted" account still owns things.
    ["game_progress_profiles", ["player_id"]],
    ["game_entitlements", ["player_id"]],
    ["game_campaign_progress", ["player_id"]],
    ["game_inventory_items", ["player_id"]],
    ["game_progress_claims", ["player_id"]],
    ["game_run_records", ["player_id"]],
    ["game_loadouts", ["player_id"]],
    // The driver a player set up inside a cabinet — their name, face and pinned
    // cars. Cosmetic, but it is *shown to other people*, so an account that has
    // been deleted must stop having a face on anybody's VS card.
    ["game_driver_profiles", ["player_id"]],
    ["game_player_badges", ["player_id"]],
    // Ranked identity, standing, and any in-flight queue/match rows.
    ["game_ratings", ["player_id"]],
    ["ranked_profiles", ["player_id"]],
    ["ranked_unit_stats", ["player_id"]],
    ["ranked_queue", ["player_id"]],
    ["ranked_matches", ["player_a", "player_b"]],
    // Per-game social graph (Tactical Arena friends), kept separate from the platform one.
    ["game_friendships", ["player_id_a", "player_id_b"]],
    ["game_friend_requests", ["requester_player_id", "recipient_player_id"]],
    ["game_friend_blocks", ["blocker_player_id", "blocked_player_id"]],
]);
/**
 * Delete an account and the player data attached to it.
 *
 * Ordering matters: everything joined by a plain player id goes first, then `players` last so
 * its cascades (profile, metrics, relationships, photos, accounts) fire against a table that
 * nothing else still points at.
 *
 * Deliberately NOT deleted: `admin_audit_log` (an operator must not be able to erase their own
 * actions) and `content_reports` (a moderation record about someone else's content, which
 * keeps its value after the reporter leaves).
 */
export async function deletePlayerAccount(db, playerId) {
    const normalizedPlayerId = sanitizePlayerId(playerId);
    if (!normalizedPlayerId)
        return false;
    for (const [table, columns] of PLAYER_SCOPED_DELETES) {
        const where = columns.map((column) => `${column} = $1`).join(" or ");
        await db.query(`delete from ${table} where ${where}`, [normalizedPlayerId]);
    }
    // The relationship ledger is keyed by an "a::b" pair rather than by a player column.
    await db.query(`
    delete from relationship_ledger_entries
    where pair_key like $1 or pair_key like $2
  `, [`${normalizedPlayerId}::%`, `%::${normalizedPlayerId}`]);
    // Cascades to player_profiles, player_metrics, player_relationships, player_photos, accounts.
    const result = await db.query(`
    delete from players where player_id = $1 returning player_id
  `, [normalizedPlayerId]);
    return (result?.rows?.length ?? 0) > 0;
}
