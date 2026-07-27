// Ranked identity (cosmetic profile) storage — title, avatar unit/skin, and the equipped
// badge. Split out of ranked.mts; cosmetic only, never part of the online state hash.
// getRankedProfile also backs the read views in ranked-queries.mts.
//
// The badge and a purchasable icon avatar are VALIDATED, not merely sanitized: both assert
// a purchase, so the equip path checks the player actually earned/bought it. A legacy
// portrait avatar (unit type or unit:skin slug) stays client-gated — no separate economic
// value in picking one you don't own.

import { playerHasGameBadge } from "./game-social/game-badges.mjs";
import { playerHasGameEntitlement } from "./game-progress.mjs";
import { isFreeRankedAvatarId, isValidRankedAvatarId, rankedAvatarEntitlementId } from "../services/ranked-avatar-catalog.mjs";

export const RANKED_TITLE_MAX_LENGTH = 60;
const AVATAR_ID_MAX_LENGTH = 60;

function sanitizeTitle(value: any): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, RANKED_TITLE_MAX_LENGTH);
  return trimmed.length ? trimmed : null;
}

// Length/emptiness guard shared by every avatar/badge field. Ownership, where it applies,
// is layered on top by resolveAvatarUnit/resolveBadgeId below.
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
      `select title, avatar_unit, avatar_skin, badge_id, updated_at from ranked_profiles where player_id=$1 and game_slug=$2`,
      [playerId, gameSlug],
    );
    const row = res.rows[0] || null;
    return {
      title: row?.title || null,
      avatarUnit: row?.avatar_unit || null,
      avatarSkin: row?.avatar_skin || null,
      badgeId: row?.badge_id || null,
      updatedAt: row?.updated_at || null,
    };
  } catch (err: any) {
    process.stderr.write(`[ranked] getRankedProfile error: ${err?.message || err}\n`);
    return null;
  }
}

// Resolve the badge to store. Undefined keeps the stored pick; null/blank unequips; a
// badge the player has not earned is refused and leaves the stored pick untouched, so a
// forged equip is a no-op rather than a way to wear someone else's proof of purchase.
async function resolveBadgeId(pool: any, { playerId, gameSlug, badgeId, existing }: any): Promise<string | null> {
  if (badgeId === undefined) return existing ?? null;
  const next = sanitizeAvatarId(badgeId);
  if (!next) return null;
  const earned = await playerHasGameBadge(pool, { gameSlug, playerId, badgeId: next });
  return earned ? next : (existing ?? null);
}

// Resolve avatarUnit. An icon-avatar id (avatar-NNN) must be free or owned via
// game_entitlements; an unowned pick is refused the same way an unearned badge is. Any
// other string is a legacy unit/skin portrait id and stays sanitized-only (unchanged).
async function resolveAvatarUnit(pool: any, { playerId, gameSlug, avatarUnit, existing }: any): Promise<string | null> {
  if (avatarUnit === undefined) return existing ?? null;
  const next = sanitizeAvatarId(avatarUnit);
  if (!next || !isValidRankedAvatarId(next)) return next;
  if (isFreeRankedAvatarId(next)) return next;
  const owned = await playerHasGameEntitlement(pool, { playerId, gameSlug, entitlementId: rankedAvatarEntitlementId(next) });
  return owned ? next : (existing ?? null);
}

// Upsert my ranked identity. Patch semantics: an undefined field keeps the stored
// value; an explicit null (or blank string) clears it. A null avatar unit also
// clears the skin (a skin is meaningless without its unit).
export async function saveRankedProfile(pool: any, { playerId, gameSlug, title, avatarUnit, avatarSkin, badgeId }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  try {
    const existing = await getRankedProfile(pool, { playerId, gameSlug });
    const nextTitle = title === undefined ? (existing?.title ?? null) : sanitizeTitle(title);
    let nextUnit = await resolveAvatarUnit(pool, { playerId, gameSlug, avatarUnit, existing: existing?.avatarUnit });
    let nextSkin = avatarSkin === undefined ? (existing?.avatarSkin ?? null) : sanitizeAvatarId(avatarSkin);
    if (!nextUnit) nextSkin = null;
    const nextBadge = await resolveBadgeId(pool, { playerId, gameSlug, badgeId, existing: existing?.badgeId });

    await pool.query(
      `insert into ranked_profiles (player_id, game_slug, title, avatar_unit, avatar_skin, badge_id, updated_at)
       values ($1,$2,$3,$4,$5,$6, now())
       on conflict (player_id, game_slug) do update
         set title=excluded.title, avatar_unit=excluded.avatar_unit,
             avatar_skin=excluded.avatar_skin, badge_id=excluded.badge_id, updated_at=now()`,
      [playerId, gameSlug, nextTitle, nextUnit, nextSkin, nextBadge],
    );
    return { title: nextTitle, avatarUnit: nextUnit, avatarSkin: nextSkin, badgeId: nextBadge };
  } catch (err: any) {
    process.stderr.write(`[ranked] saveRankedProfile error: ${err?.message || err}\n`);
    return null;
  }
}
