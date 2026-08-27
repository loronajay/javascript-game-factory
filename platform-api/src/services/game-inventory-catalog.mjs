import { getConsumableOffer } from "./consumable-catalog.mjs";
// Which inventory items a paid grant may create, per cabinet.
//
// Before this registry existed, every inventory grant was validated against the Tactical
// Arena consumable catalog, so a second cabinet's item was silently dropped rather than
// refused -- the purchase succeeded and the player got nothing. Grantability is a per-game
// server contract, so it is declared per game here and nowhere else.
//
// This says only what MAY be granted and how much of it at once. It never says what a
// player owns; that stays in game_inventory_items.
/** A single purchase may never add more of one item than this, whatever a payload claims. */
export const MAX_INVENTORY_GRANT_QUANTITY = 99;
const POLICIES = Object.freeze({
    "tactical-arena": Object.freeze({
        resolveItemId: (itemId) => getConsumableOffer(itemId)?.id || "",
        maxQuantity: MAX_INVENTORY_GRANT_QUANTITY,
    }),
    "yam-bowling": Object.freeze({
        // The calendar preorder bonus pays the skin voucher that already exists -- the same item
        // the circuit and the reward ladders pay, redeemed through the same voucher path. A
        // promotion never mints a currency of its own.
        resolveItemId: (itemId) => (["skin-voucher", "swimsuit-voucher", "emote-voucher"].includes(itemId) ? itemId : ""),
        maxQuantity: MAX_INVENTORY_GRANT_QUANTITY,
    }),
});
function cleanText(value, maxLength = 120) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function policyFor(gameSlug) {
    return POLICIES[cleanText(gameSlug, 60).toLowerCase()] || null;
}
export function isGrantableInventoryItem(gameSlug, itemId) {
    return Boolean(policyFor(gameSlug)?.resolveItemId(cleanText(itemId)));
}
/**
 * Normalize the inventory grants carried on a claim payload for one game. Item ids are
 * resolved against that game's policy, so a tampered payload can never invent an item or
 * borrow another cabinet's; quantities are summed per item and clamped.
 */
export function normalizeInventoryGrants(gameSlug, rows) {
    const policy = policyFor(gameSlug);
    if (!policy || !Array.isArray(rows))
        return [];
    const byItemId = new Map();
    for (const row of rows) {
        const itemId = policy.resolveItemId(cleanText(row?.itemId));
        if (!itemId)
            continue;
        const raw = Math.floor(Number(row?.quantity ?? 1));
        const quantity = Number.isFinite(raw) ? Math.max(1, Math.min(policy.maxQuantity, raw)) : 1;
        byItemId.set(itemId, Math.min(policy.maxQuantity, (byItemId.get(itemId) || 0) + quantity));
    }
    return [...byItemId].map(([itemId, quantity]) => ({ itemId, quantity }));
}
