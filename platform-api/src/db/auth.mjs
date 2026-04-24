import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

function sanitizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 320) : "";
}

function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export async function createAccount(db, { email, password, playerId }) {
  const normalizedEmail = sanitizeEmail(email);
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedEmail || !password || !normalizedPlayerId) return null;

  const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

  const result = await db.query(`
    insert into accounts (player_id, email, password_hash)
    values ($1, $2, $3)
    returning id, player_id, email, created_at
  `, [normalizedPlayerId, normalizedEmail, passwordHash]);

  return result?.rows?.[0] || null;
}

export async function findAccountByEmail(db, email) {
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

export async function findAccountByPlayerId(db, playerId) {
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

export async function verifyAccountPassword(account, password) {
  if (!account?.password_hash || !password) return false;
  try {
    return await bcrypt.compare(String(password), account.password_hash);
  } catch {
    return false;
  }
}
