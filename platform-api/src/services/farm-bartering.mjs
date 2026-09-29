// Server-owned Bartering rules. Keep the price constants equal to
// js/farm-bartering.mts; only completed NPC transactions award its XP.
export const MAX_PURCHASE_DISCOUNT = 0.2;
export const MAX_SALE_BONUS = 0.25;
export const PURCHASE_DISCOUNT_PER_LEVEL = 0.002;
export const SALE_BONUS_PER_LEVEL = 0.0025;
export function barteringBenefits(level) {
    const earnedLevels = Math.max(0, Math.min(98, Math.floor(Number(level) || 1) - 1));
    return Object.freeze({
        purchaseDiscount: Math.min(MAX_PURCHASE_DISCOUNT, earnedLevels * PURCHASE_DISCOUNT_PER_LEVEL),
        saleBonus: Math.min(MAX_SALE_BONUS, earnedLevels * SALE_BONUS_PER_LEVEL),
    });
}
export function barterPurchasePrice(basePrice, level) {
    const base = Math.max(0, Math.floor(Number(basePrice) || 0));
    return base > 0 ? Math.max(1, Math.round(base * (1 - barteringBenefits(level).purchaseDiscount))) : 0;
}
export function barterSalePrice(basePrice, level) {
    const base = Math.max(0, Math.floor(Number(basePrice) || 0));
    return base > 0 ? Math.max(1, Math.ceil(base * (1 + barteringBenefits(level).saleBonus))) : 0;
}
/** Deliberately sublinear: large purchases help, but cannot skip the whole skill. */
export function barteringXp(ticketValue) {
    const value = Math.max(0, Math.floor(Number(ticketValue) || 0));
    return value > 0 ? Math.max(1, Math.round(Math.sqrt(value) * 2)) : 0;
}
