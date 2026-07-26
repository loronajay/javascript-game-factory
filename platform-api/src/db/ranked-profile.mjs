// Ranked identity (cosmetic profile) storage — title, avatar unit/skin, and the equipped
// badge. Split out of ranked.mts. These are cosmetic; they never enter the online state
// hash or authoritative battle state. The server owns them so opponents can read a card.
// getRankedProfile is also consumed by the read views in ranked-queries.mts.
//
// The badge is the one field here that is VALIDATED rather than merely sanitized: avatar
// ids are opaque cosmetics, but a badge asserts a purchase or a record, so the equip path
// asks the badge layer whether the player actually earned it. That is the only reason
// this module reaches into game-social, and the dependency runs one way (badges never
// read ranked identity).
import { playerHasGameBadge } from "./game-social/game-badges.mjs";
export const RANKED_TITLE_MAX_LENGTH = 60;
const AVATAR_ID_MAX_LENGTH = 60;
function sanitizeTitle(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim().replace(/\s+/g, " ").slice(0, RANKED_TITLE_MAX_LENGTH);
    return trimmed.length ? trimmed : null;
}
// Avatar unit/skin ids are opaque strings — ownership is client-gated (v1). The
// server only rejects absurd lengths and empties so a bad payload can't poison the row.
function sanitizeAvatarId(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!trimmed.length || trimmed.length > AVATAR_ID_MAX_LENGTH)
        return null;
    return trimmed;
}
export async function getRankedProfile(pool, { playerId, gameSlug }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    try {
        const res = await pool.query(`select title, avatar_unit, avatar_skin, badge_id, updated_at from ranked_profiles where player_id=$1 and game_slug=$2`, [playerId, gameSlug]);
        const row = res.rows[0] || null;
        return {
            title: row?.title || null,
            avatarUnit: row?.avatar_unit || null,
            avatarSkin: row?.avatar_skin || null,
            badgeId: row?.badge_id || null,
            updatedAt: row?.updated_at || null,
        };
    }
    catch (err) {
        process.stderr.write(`[ranked] getRankedProfile error: ${err?.message || err}\n`);
        return null;
    }
}
// Resolve the badge to store. Undefined keeps the stored pick; null/blank unequips; a
// badge the player has not earned is refused and leaves the stored pick untouched, so a
// forged equip is a no-op rather than a way to wear someone else's proof of purchase.
async function resolveBadgeId(pool, { playerId, gameSlug, badgeId, existing }) {
    if (badgeId === undefined)
        return existing ?? null;
    const next = sanitizeAvatarId(badgeId);
    if (!next)
        return null;
    const earned = await playerHasGameBadge(pool, { gameSlug, playerId, badgeId: next });
    return earned ? next : (existing ?? null);
}
// Upsert my ranked identity. Patch semantics: an undefined field keeps the stored
// value; an explicit null (or blank string) clears it. A null avatar unit also
// clears the skin (a skin is meaningless without its unit).
export async function saveRankedProfile(pool, { playerId, gameSlug, title, avatarUnit, avatarSkin, badgeId }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    try {
        const existing = await getRankedProfile(pool, { playerId, gameSlug });
        const nextTitle = title === undefined ? (existing?.title ?? null) : sanitizeTitle(title);
        let nextUnit = avatarUnit === undefined ? (existing?.avatarUnit ?? null) : sanitizeAvatarId(avatarUnit);
        let nextSkin = avatarSkin === undefined ? (existing?.avatarSkin ?? null) : sanitizeAvatarId(avatarSkin);
        if (!nextUnit)
            nextSkin = null;
        const nextBadge = await resolveBadgeId(pool, { playerId, gameSlug, badgeId, existing: existing?.badgeId });
        await pool.query(`insert into ranked_profiles (player_id, game_slug, title, avatar_unit, avatar_skin, badge_id, updated_at)
       values ($1,$2,$3,$4,$5,$6, now())
       on conflict (player_id, game_slug) do update
         set title=excluded.title, avatar_unit=excluded.avatar_unit,
             avatar_skin=excluded.avatar_skin, badge_id=excluded.badge_id, updated_at=now()`, [playerId, gameSlug, nextTitle, nextUnit, nextSkin, nextBadge]);
        return { title: nextTitle, avatarUnit: nextUnit, avatarSkin: nextSkin, badgeId: nextBadge };
    }
    catch (err) {
        process.stderr.write(`[ranked] saveRankedProfile error: ${err?.message || err}\n`);
        return null;
    }
}
