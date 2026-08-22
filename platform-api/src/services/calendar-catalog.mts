// The physical calendar offer, in one place.
//
// This is the server's word on what the calendar costs and what a preorder is worth. The
// browser sends a quantity and nothing else -- never a price, never a bonus size -- so a
// tampered checkout request can only ask for more calendars, at the price declared here.
//
// The bonus pays the skin voucher Yam Bowling already has. No new currency, no new
// inventory, no calendar-specific voucher type.

export const CALENDAR_GAME_SLUG = "yam-bowling";
export const CALENDAR_PRODUCT_ID = "yam-bowling-2027-calendar";
export const CALENDAR_PREORDER_CLAIM_KIND = "premium-calendar-preorder";

/** The promotion the bonus belongs to. It scopes the once-per-account claim id. */
export const CALENDAR_PROMOTION_ID = "yb-2027-calendar-preorder";

export const CALENDAR_OFFER = Object.freeze({
  productId: CALENDAR_PRODUCT_ID,
  gameSlug: CALENDAR_GAME_SLUG,
  name: "Yam Bowling 2027 Pinup Calendar - Preorder",
  description: "12 months, 12 featured bowlers. Top-bound wall calendar, approx. 11 x 8.5 in closed.",
  unitAmountCents: 2999,
  currency: "usd",
  /** Physical goods; shipping is quoted by the payment provider, never computed here. */
  physical: true,
  maxQuantity: 10,
  // Stripe product tax code for printed matter / physical goods.
  taxCode: "txcd_99999999",
  bonus: Object.freeze({
    promotionId: CALENDAR_PROMOTION_ID,
    itemId: "skin-voucher",
    quantity: 10,
    /**
     * The bonus is per qualifying account, not per calendar: buying five copies still pays
     * ten vouchers. Without this the physical store would quietly become a bulk voucher
     * store, which is worth more than the calendar and would be bought for that reason.
     */
    perAccount: true,
  }),
});

function clampInt(value: any, min: number, max: number): number {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function normalizeCalendarQuantity(value: any): number {
  return clampInt(value ?? 1, 1, CALENDAR_OFFER.maxQuantity);
}

/**
 * Price a preorder server-side. `quantity` is the only buyer-supplied number that reaches
 * this; shipping and tax are added by Stripe at checkout and reconciled from the paid
 * session, so they are deliberately absent here.
 */
export function priceCalendarPreorder(quantity: any): {
  quantity: number;
  unitAmountCents: number;
  subtotalCents: number;
  currency: string;
} {
  const normalized = normalizeCalendarQuantity(quantity);
  return {
    quantity: normalized,
    unitAmountCents: CALENDAR_OFFER.unitAmountCents,
    subtotalCents: CALENDAR_OFFER.unitAmountCents * normalized,
    currency: CALENDAR_OFFER.currency,
  };
}

/**
 * The claim id that carries the voucher bonus. It names the promotion and the player and
 * *not* the order, because game_progress_claims is keyed on (player, game, claim id): a
 * second order from the same account collides with the first and grants nothing, which is
 * exactly the per-account rule. Payment retries collide the same way.
 */
export function calendarBonusClaimId(): string {
  return `calendar-bonus:${CALENDAR_PROMOTION_ID}`;
}

/** The inventory rows a qualifying preorder pays. Quantity never scales with the order. */
export function calendarBonusInventoryItems(): { itemId: string; quantity: number }[] {
  return [{ itemId: CALENDAR_OFFER.bonus.itemId, quantity: CALENDAR_OFFER.bonus.quantity }];
}
