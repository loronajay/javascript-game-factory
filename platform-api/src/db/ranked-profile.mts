// Ranked identity (cosmetic profile) storage — title + avatar unit/skin. Split out of
// ranked.mts. Title/avatar are cosmetic and derived; they never enter the online state
// hash or authoritative battle state. The server owns them so opponents can read a card.
// getRankedProfile is also consumed by the read views in ranked-queries.mts.

export const RANKED_TITLE_MAX_LENGTH = 60;
const AVATAR_ID_MAX_LENGTH = 60;

function sanitizeTitle(value: any): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, RANKED_TITLE_MAX_LENGTH);
  return trimmed.length ? trimmed : null;
}

// Avatar unit/skin ids are opaque strings — ownership is client-gated (v1). The
// server only rejects absurd lengths and empties so a bad payload can't poison the row.
function sanitizeAvatarId(value: any): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length || trimmed.length > AVATAR_ID_MAX_LENGTH) return null;
  return trimmed;
}

export async function getRankedProfile(pool: any, { playerId, gameSlug }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  try {
    const res = await pool.query(
      `select title, avatar_unit, avatar_skin, updated_at from ranked_profiles where player_id=$1 and game_slug=$2`,
      [playerId, gameSlug],
    );
    const row = res.rows[0] || null;
    return {
      title: row?.title || null,
      avatarUnit: row?.avatar_unit || null,
      avatarSkin: row?.avatar_skin || null,
      updatedAt: row?.updated_at || null,
    };
  } catch (err: any) {
    process.stderr.write(`[ranked] getRankedProfile error: ${err?.message || err}\n`);
    return null;
  }
}

// Upsert my ranked identity. Patch semantics: an undefined field keeps the stored
// value; an explicit null (or blank string) clears it. A null avatar unit also
// clears the skin (a skin is meaningless without its unit).
export async function saveRankedProfile(pool: any, { playerId, gameSlug, title, avatarUnit, avatarSkin }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  try {
    const existing = await getRankedProfile(pool, { playerId, gameSlug });
    const nextTitle = title === undefined ? (existing?.title ?? null) : sanitizeTitle(title);
    let nextUnit = avatarUnit === undefined ? (existing?.avatarUnit ?? null) : sanitizeAvatarId(avatarUnit);
    let nextSkin = avatarSkin === undefined ? (existing?.avatarSkin ?? null) : sanitizeAvatarId(avatarSkin);
    if (!nextUnit) nextSkin = null;

    await pool.query(
      `insert into ranked_profiles (player_id, game_slug, title, avatar_unit, avatar_skin, updated_at)
       values ($1,$2,$3,$4,$5, now())
       on conflict (player_id, game_slug) do update
         set title=excluded.title, avatar_unit=excluded.avatar_unit,
             avatar_skin=excluded.avatar_skin, updated_at=now()`,
      [playerId, gameSlug, nextTitle, nextUnit, nextSkin],
    );
    return { title: nextTitle, avatarUnit: nextUnit, avatarSkin: nextSkin };
  } catch (err: any) {
    process.stderr.write(`[ranked] saveRankedProfile error: ${err?.message || err}\n`);
    return null;
  }
}
