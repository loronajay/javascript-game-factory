import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

function sanitizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 320) : "";
}

function sanitizePlayerId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function sanitizeSessionId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export async function createAccount(db: any, { email, password, playerId, sessionId }: any): Promise<any> {
  const normalizedEmail = sanitizeEmail(email);
  const normalizedPlayerId = sanitizePlayerId(playerId);
  const normalizedSessionId = sanitizeSessionId(sessionId);
  if (!normalizedEmail || !password || !normalizedPlayerId) return null;

  const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

  const result = await db.query(`
    insert into accounts (player_id, email, password_hash, current_session_id)
    values ($1, $2, $3, $4)
    returning id, player_id, email, current_session_id, created_at
  `, [normalizedPlayerId, normalizedEmail, passwordHash, normalizedSessionId]);

  return result?.rows?.[0] || null;
}

export async function findAccountByEmail(db: any, email: any): Promise<any> {
  const normalizedEmail = sanitizeEmail(email);
  if (!normalizedEmail) return null;

  const result = await db.query(`
    select id, player_id, email, password_hash, created_at
    from accounts
    where email = $1
    limit 1
  `, [normalizedEmail]);

  return result?.rows?.[0] || null;
}

export async function rotateAccountSession(db: any, playerId: any, sessionId: any): Promise<any> {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  const normalizedSessionId = sanitizeSessionId(sessionId);
  if (!normalizedPlayerId || !normalizedSessionId) return null;

  const result = await db.query(`
    update accounts
    set current_session_id = $2, updated_at = now()
    where player_id = $1
    returning player_id, email, current_session_id
  `, [normalizedPlayerId, normalizedSessionId]);

  return result?.rows?.[0] || null;
}

export async function isAccountSessionCurrent(db: any, playerId: any, sessionId: any): Promise<boolean> {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  const normalizedSessionId = sanitizeSessionId(sessionId);
  if (!normalizedPlayerId || !normalizedSessionId) return false;

  const result = await db.query(`
    select 1
    from accounts
    where player_id = $1 and current_session_id = $2
    limit 1
  `, [normalizedPlayerId, normalizedSessionId]);

  return (result?.rows?.length ?? 0) > 0;
}

export async function clearAccountSession(db: any, playerId: any, sessionId: any): Promise<boolean> {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  const normalizedSessionId = sanitizeSessionId(sessionId);
  if (!normalizedPlayerId || !normalizedSessionId) return false;

  const result = await db.query(`
    update accounts
    set current_session_id = '', updated_at = now()
    where player_id = $1 and current_session_id = $2
    returning player_id
  `, [normalizedPlayerId, normalizedSessionId]);

  return (result?.rows?.length ?? 0) > 0;
}

export async function findAccountByPlayerId(db: any, playerId: any): Promise<any> {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const result = await db.query(`
    select id, player_id, email, created_at
    from accounts
    where player_id = $1
    limit 1
  `, [normalizedPlayerId]);

  return result?.rows?.[0] || null;
}

export async function verifyAccountPassword(account: any, password: any): Promise<boolean> {
  if (!account?.password_hash || !password) return false;
  try {
    return await bcrypt.compare(String(password), account.password_hash);
  } catch {
    return false;
  }
}

export async function createPasswordResetToken(db: any, { email, token, expiresAt }: any): Promise<any> {
  const normalizedEmail = sanitizeEmail(email);
  if (!normalizedEmail || !token || !expiresAt) return null;

  const result = await db.query(`
    insert into password_reset_tokens (token, email, expires_at)
    values ($1, $2, $3)
    returning token, email, expires_at, created_at
  `, [token, normalizedEmail, expiresAt]);

  return result?.rows?.[0] || null;
}

export async function findPasswordResetToken(db: any, token: any): Promise<any> {
  if (!token) return null;

  const result = await db.query(`
    select token, email, expires_at, used_at, created_at
    from password_reset_tokens
    where token = $1
    limit 1
  `, [token]);

  return result?.rows?.[0] || null;
}

export async function consumePasswordResetToken(db: any, token: any): Promise<boolean> {
  if (!token) return false;

  const result = await db.query(`
    update password_reset_tokens
    set used_at = now()
    where token = $1 and used_at is null
    returning token
  `, [token]);

  return (result?.rows?.length ?? 0) > 0;
}

export async function updateAccountPassword(db: any, email: any, newPassword: any): Promise<boolean> {
  const normalizedEmail = sanitizeEmail(email);
  if (!normalizedEmail || !newPassword) return false;

  const passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);

  const result = await db.query(`
    update accounts
    set password_hash = $1, updated_at = now()
    where email = $2
    returning id
  `, [passwordHash, normalizedEmail]);

  return (result?.rows?.length ?? 0) > 0;
}

export async function deletePlayerAccount(db: any, playerId: any): Promise<boolean> {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return false;

  // Remove reactions, shares, and comments the player made on others' posts
  // (thought_posts cascade handles cleanup of the player's own posts)
  await db.query(`delete from thought_post_reactions where player_id = $1`, [normalizedPlayerId]);
  await db.query(`delete from thought_post_shares where player_id = $1`, [normalizedPlayerId]);
  await db.query(`delete from thought_post_comments where author_player_id = $1`, [normalizedPlayerId]);
  await db.query(`delete from thought_posts where author_player_id = $1`, [normalizedPlayerId]);
  await db.query(`delete from activity_items where actor_player_id = $1`, [normalizedPlayerId]);
  await db.query(`
    delete from relationship_ledger_entries
    where pair_key like $1 or pair_key like $2
  `, [`${normalizedPlayerId}::%`, `%::${normalizedPlayerId}`]);

  // Deleting from players cascades to player_profiles, player_metrics,
  // player_relationships, and accounts
  const result = await db.query(`
    delete from players where player_id = $1 returning player_id
  `, [normalizedPlayerId]);

  return (result?.rows?.length ?? 0) > 0;
}
