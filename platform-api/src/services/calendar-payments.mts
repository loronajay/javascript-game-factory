import {
  CALENDAR_GAME_SLUG,
  CALENDAR_OFFER,
  CALENDAR_PREORDER_CLAIM_KIND,
  CALENDAR_PRODUCT_ID,
  calendarBonusClaimId,
  calendarBonusInventoryItems,
  priceCalendarPreorder,
} from "./calendar-catalog.mjs";
import {
  appendMetadata,
  cleanText,
  logStripeCheckoutError,
  moneyCents,
  retrieveStripeCheckoutSession,
  stripeCheckoutError,
  stripeError,
  stripeFetchHeaders,
  STRIPE_CHECKOUT_SESSIONS_URL,
} from "./payments.mjs";

// Checkout and fulfillment for the physical calendar.
//
// It reuses the arcade's existing Stripe plumbing wholesale -- the same API version, the same
// signature verification, the same claim ledger. What is new here is what a *physical* order
// needs and a digital one does not: a shipping address, a courier-facing order row, and a
// promotional bonus that is capped per account rather than per unit.
//
// Two separate idempotency guarantees, on purpose:
//   - the order  is unique on checkout_session_id (one paid session ships one order)
//   - the bonus  is unique on (player, game, promotion claim id) in game_progress_claims
// A payment retry collides with both. A second *order* by the same player collides only with
// the bonus, which is exactly the "5 calendars still means 10 vouchers" rule.

const STRIPE_CHECKOUT_INTEGRATION_IDENTIFIER = "yam_calendar_checkout_hprkzwvd";

// Countries the preorder ships to. Stripe collects and validates the address against this.
const SHIPPING_COUNTRIES = ["US", "CA", "GB", "AU", "NZ", "IE", "DE", "FR", "NL", "SE", "NO", "DK", "FI", "ES", "IT"];

function checkoutUrl(appBaseUrl: any, status: "success" | "cancel"): string {
  const base = cleanText(appBaseUrl, 300).replace(/\/+$/, "");
  const path = `/games/yam-bowling/calendar/?checkout=${status}`;
  return base ? `${base}${path}` : path;
}

/**
 * Open a Stripe Checkout session for a preorder and stage the pending physical order beside
 * it. The browser supplies only a quantity; price, currency and bonus all come from the
 * server catalog.
 */
export async function createCalendarCheckoutSession(params: any = {}): Promise<any> {
  const stripeApiKey = cleanText(params.stripeApiKey, 500);
  if (!stripeApiKey) return stripeError(503, "checkout_not_configured");

  const playerId = cleanText(params.playerId, 120);
  // Signed-in only. The bonus needs an authoritative recipient, and a checkout email is not
  // one -- anyone can type any address into a payment form.
  if (!playerId) return stripeError(401, "authentication_required");

  const body = params.body && typeof params.body === "object" ? params.body : {};
  const priced = priceCalendarPreorder(body.quantity);

  const fetchImpl = typeof params.fetchImpl === "function" ? params.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== "function") return stripeError(503, "fetch_not_configured");

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", checkoutUrl(params.appBaseUrl, "success") + "&session_id={CHECKOUT_SESSION_ID}");
  form.set("cancel_url", checkoutUrl(params.appBaseUrl, "cancel"));
  form.set("integration_identifier", STRIPE_CHECKOUT_INTEGRATION_IDENTIFIER);
  form.set("client_reference_id", playerId);
  form.set("line_items[0][quantity]", String(priced.quantity));
  form.set("line_items[0][price_data][currency]", priced.currency);
  form.set("line_items[0][price_data][unit_amount]", String(priced.unitAmountCents));
  form.set("line_items[0][price_data][product_data][name]", CALENDAR_OFFER.name);
  form.set("line_items[0][price_data][product_data][description]", CALENDAR_OFFER.description);
  form.set("line_items[0][price_data][product_data][tax_code]", CALENDAR_OFFER.taxCode);
  form.set("line_items[0][price_data][product_data][metadata][productId]", CALENDAR_PRODUCT_ID);

  // Physical goods: the provider collects and validates the address, and quotes postage.
  // Postage is deliberately not computed here.
  form.set("billing_address_collection", "required");
  SHIPPING_COUNTRIES.forEach((country, index) => {
    form.set(`shipping_address_collection[allowed_countries][${index}]`, country);
  });
  form.set("phone_number_collection[enabled]", "false");
  form.set("automatic_tax[enabled]", "true");
  if (cleanText(params.customerEmail, 200)) {
    form.set("customer_email", cleanText(params.customerEmail, 200));
  }

  appendMetadata(form, {
    gameSlug: CALENDAR_GAME_SLUG,
    playerId,
    productId: CALENDAR_PRODUCT_ID,
    offerKind: "calendar-preorder",
    quantity: String(priced.quantity),
  });

  const response = await fetchImpl(STRIPE_CHECKOUT_SESSIONS_URL, {
    method: "POST",
    headers: { ...stripeFetchHeaders(stripeApiKey), "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    logStripeCheckoutError(json);
    return stripeCheckoutError(json);
  }

  const sessionId = cleanText(json?.id, 200);
  const url = cleanText(json?.url, 900);
  if (!sessionId || !url) return stripeError(502, "stripe_checkout_failed");

  // Stage the order now so an abandoned checkout is still visible to support, and so
  // fulfillment has a row to settle rather than one to invent under webhook pressure.
  const createOrder = typeof params.createCalendarOrder === "function" ? params.createCalendarOrder : null;
  const staged = createOrder
    ? await createOrder({
      playerId,
      checkoutSessionId: sessionId,
      quantity: priced.quantity,
      unitAmountCents: priced.unitAmountCents,
      currency: priced.currency,
      customerEmail: cleanText(params.customerEmail, 200),
    })
    : null;

  return {
    ok: true,
    url,
    sessionId,
    orderId: staged?.order?.orderId || "",
    quantity: priced.quantity,
    subtotalCents: priced.subtotalCents,
    currency: priced.currency,
  };
}

function addressFromSession(session: any): Record<string, string> {
  const shipping = session?.collected_information?.shipping_details
    || session?.shipping_details
    || session?.customer_details;
  const address = shipping?.address || {};
  return {
    line1: cleanText(address.line1, 180),
    line2: cleanText(address.line2, 180),
    city: cleanText(address.city, 180),
    state: cleanText(address.state, 180),
    postalCode: cleanText(address.postal_code, 40),
    country: cleanText(address.country, 8),
  };
}

function quantityFromSession(session: any, metadata: any): number {
  const fromLineItem = Number(session?.line_items?.data?.[0]?.quantity);
  if (Number.isFinite(fromLineItem) && fromLineItem > 0) return Math.floor(fromLineItem);
  const fromMetadata = Number(metadata?.quantity);
  return Number.isFinite(fromMetadata) && fromMetadata > 0 ? Math.floor(fromMetadata) : 0;
}

/**
 * Settle a paid calendar checkout session: mark the physical order paid, then pay the
 * promotional vouchers through the platform's existing claim + inventory path.
 *
 * The bonus is attempted on every delivery of the event and is safe to attempt: its claim id
 * is promotion-scoped, so the second attempt reports `alreadyProcessed` and grants nothing.
 */
export async function fulfillCalendarCheckoutSession(params: any = {}): Promise<any> {
  const session = params.session && typeof params.session === "object" ? params.session : {};
  const metadata = session.metadata && typeof session.metadata === "object" ? session.metadata : {};
  const playerId = cleanText(metadata.playerId || session.client_reference_id, 120);
  const sessionId = cleanText(session.id, 200);
  if (!playerId || !sessionId) return stripeError(400, "invalid_checkout_session");

  const markPaid = typeof params.markCalendarOrderPaid === "function" ? params.markCalendarOrderPaid : null;
  const recordClaim = typeof params.recordGameProgressClaim === "function" ? params.recordGameProgressClaim : null;
  if (!markPaid || !recordClaim) return stripeError(503, "fulfillment_not_configured");

  const customer = session.customer_details || {};
  const shipping = session.collected_information?.shipping_details || session.shipping_details || {};
  const settled = await markPaid({
    checkoutSessionId: sessionId,
    paymentIntentId: cleanText(session.payment_intent, 200),
    quantity: quantityFromSession(session, metadata),
    shippingAmountCents: moneyCents(session.shipping_cost?.amount_total),
    taxAmountCents: moneyCents(session.total_details?.amount_tax),
    totalAmountCents: moneyCents(session.amount_total),
    customerName: cleanText(shipping.name || customer.name, 180),
    customerEmail: cleanText(customer.email, 200),
    shippingAddress: addressFromSession(session),
  });
  if (!settled?.ok) return settled || stripeError(500, "order_not_settled");

  const order = settled.order;
  const claimId = calendarBonusClaimId();
  const inventoryItems = calendarBonusInventoryItems();
  const claim = await recordClaim({
    playerId,
    gameSlug: CALENDAR_GAME_SLUG,
    claimId,
    kind: CALENDAR_PREORDER_CLAIM_KIND,
    sourceId: sessionId,
    payload: {
      sessionId,
      orderId: order?.orderId || "",
      productId: CALENDAR_PRODUCT_ID,
      promotionId: CALENDAR_OFFER.bonus.promotionId,
      inventoryItems,
      amountTotal: moneyCents(session.amount_total),
      currency: cleanText(session.currency, 10).toLowerCase(),
      // The join key refund and dispute events arrive with.
      paymentIntentId: cleanText(session.payment_intent, 200),
    },
  });

  // A claim that came back already-processed means this account was paid by an earlier
  // qualifying order. That is the promotion working, not a failure.
  const granted = Boolean(claim?.ok) && claim.alreadyProcessed !== true;
  const bonusState = claim?.ok ? (granted ? "granted" : "already_held") : "pending";

  const recordBonus = typeof params.recordCalendarBonus === "function" ? params.recordCalendarBonus : null;
  if (recordBonus && order?.orderId) {
    await recordBonus({
      orderId: order.orderId,
      state: bonusState,
      claimId: claim?.ok ? claimId : "",
      quantity: granted ? CALENDAR_OFFER.bonus.quantity : 0,
    });
  }

  return {
    ok: true,
    orderId: order?.orderId || "",
    alreadyProcessed: settled.alreadyPaid === true,
    bonusState,
    bonusQuantity: granted ? CALENDAR_OFFER.bonus.quantity : 0,
  };
}

/**
 * Fulfill from the buyer's return to the success page. The webhook is the authority, but a
 * buyer who lands back before it arrives should still see a confirmed order, and this path
 * converges on the same rows.
 */
export async function fulfillCalendarCheckoutFromReturn(params: any = {}): Promise<any> {
  const playerId = cleanText(params.playerId, 120);
  const body = params.body && typeof params.body === "object" ? params.body : {};
  const sessionId = cleanText(body.sessionId, 200);
  if (!playerId || !sessionId) return stripeError(400, "invalid_checkout_session");

  const retrieved = await retrieveStripeCheckoutSession({
    stripeApiKey: params.stripeApiKey,
    sessionId,
    fetchImpl: params.fetchImpl,
  });
  if (!retrieved.ok) return retrieved;

  const session = retrieved.session;
  const metadata = session?.metadata && typeof session.metadata === "object" ? session.metadata : {};
  if (cleanText(metadata.playerId || session?.client_reference_id, 120) !== playerId) {
    return stripeError(403, "player_mismatch");
  }
  // A created session is not a purchase. Nothing ships and no voucher is paid until Stripe
  // says the money moved.
  if (session?.payment_status !== "paid") return stripeError(409, "checkout_not_paid");

  return fulfillCalendarCheckoutSession({ ...params, session });
}

/**
 * Refund/chargeback. The physical order is closed, and the promotional vouchers are taken
 * back through the platform's existing inventory revocation -- but only from the order that
 * actually paid them, so a refund of a second copy cannot strip a bonus the first one earned.
 *
 * Revocation is clamped at zero by `revokeInventoryItem`: quantity already spent on a skin is
 * gone, and the entitlement it bought is deliberately left alone. Clawing back a redeemed
 * cosmetic is a larger piece of work and is documented as out of scope rather than half-built.
 */
export async function closeCalendarOrderForStripeEvent(params: any = {}): Promise<any> {
  const object = params.eventObject && typeof params.eventObject === "object" ? params.eventObject : {};
  const paymentIntentId = cleanText(object.payment_intent, 200);
  const findOrder = typeof params.findCalendarOrderByPaymentIntent === "function"
    ? params.findCalendarOrderByPaymentIntent
    : null;
  if (!findOrder || !paymentIntentId) return { ok: true, ignored: true, reason: "order_not_found" };

  const order = await findOrder(paymentIntentId);
  if (!order) return { ok: true, ignored: true, reason: "order_not_found" };

  const close = typeof params.markCalendarOrderClosed === "function" ? params.markCalendarOrderClosed : null;
  const closed = close
    ? await close({ orderId: order.orderId, paymentState: params.paymentState || "refunded" })
    : null;

  let revoked = null;
  if (order.voucherBonusState === "granted" && order.voucherBonusQuantity > 0) {
    const revoke = typeof params.revokeGameEntitlements === "function" ? params.revokeGameEntitlements : null;
    if (revoke) {
      revoked = await revoke({
        playerId: order.playerId,
        gameSlug: CALENDAR_GAME_SLUG,
        sessionId: order.checkoutSessionId,
        entitlementIds: [],
        inventoryItems: [{ itemId: CALENDAR_OFFER.bonus.itemId, quantity: order.voucherBonusQuantity }],
        revocationId: cleanText(params.revocationId, 200) || `calendar:${order.orderId}`,
        reason: params.reason || "refund",
      });
    }
    const recordBonus = typeof params.recordCalendarBonus === "function" ? params.recordCalendarBonus : null;
    if (recordBonus && revoked?.ok) {
      await recordBonus({ orderId: order.orderId, state: "revoked", quantity: 0 });
    }
  }

  return { ok: true, orderId: order.orderId, closed: Boolean(closed?.ok), revoked: Boolean(revoked?.ok) };
}

/** Does this Stripe session belong to the calendar rather than a game cabinet? */
export function isCalendarCheckoutSession(session: any): boolean {
  const metadata = session?.metadata && typeof session.metadata === "object" ? session.metadata : {};
  return cleanText(metadata.offerKind, 40) === "calendar-preorder"
    || cleanText(metadata.productId, 80) === CALENDAR_PRODUCT_ID;
}
