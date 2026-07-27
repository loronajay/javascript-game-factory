// Ranked profile icon avatars: procedurally generated ids (avatar-001..avatar-128) across two
// 8x8 sprite sheets. Mirrors games/tactical-arena/src/ui/rankedAvatars.js — keep the sheet/count
// and free-tier constants in lockstep with that client catalog and with marketplace.js's pricing.
//
// The first RANKED_AVATAR_FREE_COUNT ids are a free starter set; the rest are Valor purchases
// (games/tactical-arena/src/progression/marketplace.js prices them, this module re-derives the
// same price server-side for valor-catalog.mts, same pattern as unit/skin Valor pricing).
export const RANKED_AVATAR_SHEET_COUNT = 2;
export const RANKED_AVATAR_PER_SHEET = 64;
export const RANKED_AVATAR_COUNT = RANKED_AVATAR_SHEET_COUNT * RANKED_AVATAR_PER_SHEET;
export const RANKED_AVATAR_FREE_COUNT = 16;
export const RANKED_AVATAR_VALOR_COST = 200;
const RANKED_AVATAR_ID_PATTERN = /^avatar-(\d{3})$/;
function rankedAvatarIndex(avatarId) {
    const match = typeof avatarId === "string" ? RANKED_AVATAR_ID_PATTERN.exec(avatarId) : null;
    return match ? Number(match[1]) : 0;
}
export function isValidRankedAvatarId(avatarId) {
    const index = rankedAvatarIndex(avatarId);
    return index >= 1 && index <= RANKED_AVATAR_COUNT;
}
export function isFreeRankedAvatarId(avatarId) {
    const index = rankedAvatarIndex(avatarId);
    return index >= 1 && index <= RANKED_AVATAR_FREE_COUNT;
}
export function rankedAvatarEntitlementId(avatarId) {
    return `avatar:${avatarId}`;
}
