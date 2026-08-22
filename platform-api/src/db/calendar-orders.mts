import { randomBytes } from "node:crypto";

import {
  CALENDAR_GAME_SLUG,
  CALENDAR_PRODUCT_ID,
} from "../services/calendar-catalog.mjs";

// Physical order persistence. This module knows how to ship a calendar; it knows nothing
// about Stripe, about vouchers, or about how either was decided.

const PAYMENT_STATES = ["pending", "paid", "refunded", "cancelled"] as const;

export const FULFILLMENT_STATES = Object.freeze([
  "preorder",
  "paid",
  "production",
  "ready_to_ship",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const);

const ADDRESS_FIELDS = ["line1", "line2", "city", "state", "postalCode", "country"] as const;

function cleanText(value: any, maxLength = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clampInt(value: any, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function isFulfillmentState(value: any): boolean {
  return (FULFILLMENT_STATES as readonly string[]).includes(cleanText(value, 40));
}

/**
 * A short, human-quotable order number. Customers read it to support and admins search it,
 * so it is not the checkout session id: ambiguous characters are excluded and the payment
 * reference stays an internal column.
 */
export function newCalendarOrderId(randomImpl: () => Buffer = () => randomBytes(8)): string {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY3456789";
  const bytes = randomImpl();
  let suffix = "";
  for (let index = 0; index < 6; index += 1) {
    suffix += alphabet[bytes[index % bytes.length] % alphabet.length];
  }
  return `YB27-${suffix}`;
}

export function normalizeShippingAddress(value: any): Record<string, string> {
  const source = value && typeof value === "object" ? value : {};
  const address: Record<string, string> = {};
  for (const field of ADDRESS_FIELDS) {
    const text = cleanText(source[field], 180);
    if (text) address[field] = text;
  }
  return address;
}

export function isShippableAddress(address: Record<string, string>): boolean {
  return Boolean(address.line1 && address.city && address.postalCode && address.country);
}

function rowToOrder(row: any): any {
  if (!row) return null;
  return {
    orderId: row.order_id,
    playerId: row.player_id,
    gameSlug: row.game_slug,
    productId: row.product_id,
    checkoutSessionId: row.checkout_session_id || "",
    paymentIntentId: row.payment_intent_id || "",
    quantity: Number(row.quantity) || 0,
    unitAmountCents: Number(row.unit_amount_cents) || 0,
    shippingAmountCents: Number(row.shipping_amount_cents) || 0,
    taxAmountCents: Number(row.tax_amount_cents) || 0,
    totalAmountCents: Number(row.total_amount_cents) || 0,
    currency: row.currency || "usd",
    customerName: row.customer_name || "",
    customerEmail: row.customer_email || "",
    shippingAddress: row.shipping_address || {},
    paymentState: row.payment_state,
    fulfillmentState: row.fulfillment_state,
    trackingNumber: row.tracking_number || "",
    carrier: row.carrier || "",
    voucherBonusState: row.voucher_bonus_state,
    voucherBonusQuantity: Number(row.voucher_bonus_quantity) || 0,
    adminNote: row.admin_note || "",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    paidAt: row.paid_at instanceof Date ? row.paid_at.toISOString() : row.paid_at,
    shippedAt: row.shipped_at instanceof Date ? row.shipped_at.toISOString() : row.shipped_at,
  };
}

/**
 * The customer-facing view. Internal payment references and admin notes are stripped: a
 * buyer needs their order number and its state, not our Stripe ids.
 */
export function toCustomerOrder(order: any): any {
  if (!order) return null;
  const {
    checkoutSessionId, paymentIntentId, adminNote, playerId, voucherBonusState, ...rest
  } = order;
  return { ...rest, voucherBonusState, bonusGranted: voucherBonusState === "granted" };
}

const SELECT = "select * from calendar_orders";

/** Create the pending order that a checkout session will later pay for. */
export async function createCalendarOrder(pool: any, params: any = {}): Promise<any> {
  const playerId = cleanText(params.playerId, 120);
  const checkoutSessionId = cleanText(params.checkoutSessionId, 200);
  const quantity = clampInt(params.quantity, 1, 100);
  if (!pool || !playerId || !checkoutSessionId) {
    return { ok: false, statusCode: 400, error: "invalid_order" };
  }

  const orderId = cleanText(params.orderId, 40) || newCalendarOrderId();
  const res = await pool.query(
    `insert into calendar_orders (
       order_id, player_id, game_slug, product_id, checkout_session_id,
       quantity, unit_amount_cents, currency, customer_email
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (checkout_session_id) where checkout_session_id <> ''
       do nothing
     returning *`,
    [
      orderId,
      playerId,
      cleanText(params.gameSlug, 60) || CALENDAR_GAME_SLUG,
      cleanText(params.productId, 80) || CALENDAR_PRODUCT_ID,
      checkoutSessionId,
      quantity,
      clampInt(params.unitAmountCents, 0),
      cleanText(params.currency, 10).toLowerCase() || "usd",
      cleanText(params.customerEmail, 200),
    ],
  );
  if (res.rowCount) return { ok: true, order: rowToOrder(res.rows[0]), created: true };

  const existing = await getCalendarOrderBySession(pool, checkoutSessionId);
  return existing
    ? { ok: true, order: existing, created: false }
    : { ok: false, statusCode: 500, error: "order_not_created" };
}

export async function getCalendarOrderBySession(pool: any, checkoutSessionId: any): Promise<any> {
  const sessionId = cleanText(checkoutSessionId, 200);
  if (!pool || !sessionId) return null;
  const res = await pool.query(`${SELECT} where checkout_session_id = $1`, [sessionId]);
  return rowToOrder(res.rows[0]);
}

export async function getCalendarOrder(pool: any, orderId: any): Promise<any> {
  const id = cleanText(orderId, 40);
  if (!pool || !id) return null;
  const res = await pool.query(`${SELECT} where order_id = $1`, [id]);
  return rowToOrder(res.rows[0]);
}

export async function findCalendarOrderByPaymentIntent(pool: any, paymentIntentId: any): Promise<any> {
  const id = cleanText(paymentIntentId, 200);
  if (!pool || !id) return null;
  const res = await pool.query(`${SELECT} where payment_intent_id = $1 order by created_at desc limit 1`, [id]);
  return rowToOrder(res.rows[0]);
}

/**
 * Settle a paid checkout session onto its order: the shipping details Stripe collected, the
 * amounts it actually charged, and the payment intent later refunds arrive with.
 *
 * Idempotent by state rather than by a ledger row -- the update only fires while the order
 * is still `pending`, so a redelivered webhook and a refreshed return page converge.
 */
export async function markCalendarOrderPaid(pool: any, params: any = {}): Promise<any> {
  const checkoutSessionId = cleanText(params.checkoutSessionId, 200);
  if (!pool || !checkoutSessionId) return { ok: false, statusCode: 400, error: "invalid_order" };

  const address = normalizeShippingAddress(params.shippingAddress);
  const res = await pool.query(
    `update calendar_orders set
       payment_state = 'paid',
       fulfillment_state = case when fulfillment_state = 'preorder' then 'paid' else fulfillment_state end,
       payment_intent_id = coalesce(nullif($2, ''), payment_intent_id),
       quantity = case when $3 > 0 then $3 else quantity end,
       shipping_amount_cents = $4,
       tax_amount_cents = $5,
       total_amount_cents = $6,
       customer_name = coalesce(nullif($7, ''), customer_name),
       customer_email = coalesce(nullif($8, ''), customer_email),
       shipping_address = case when $9::jsonb = '{}'::jsonb then shipping_address else $9::jsonb end,
       paid_at = now(),
       updated_at = now()
     where checkout_session_id = $1 and payment_state = 'pending'
     returning *`,
    [
      checkoutSessionId,
      cleanText(params.paymentIntentId, 200),
      clampInt(params.quantity, 0, 100),
      clampInt(params.shippingAmountCents, 0),
      clampInt(params.taxAmountCents, 0),
      clampInt(params.totalAmountCents, 0),
      cleanText(params.customerName, 180),
      cleanText(params.customerEmail, 200),
      JSON.stringify(address),
    ],
  );

  if (res.rowCount) return { ok: true, order: rowToOrder(res.rows[0]), alreadyPaid: false };
  const existing = await getCalendarOrderBySession(pool, checkoutSessionId);
  return existing
    ? { ok: true, order: existing, alreadyPaid: true }
    : { ok: false, statusCode: 404, error: "order_not_found" };
}

/** Record the outcome of the voucher bonus attempt against the order that triggered it. */
export async function recordCalendarBonus(pool: any, params: any = {}): Promise<any> {
  const orderId = cleanText(params.orderId, 40);
  const state = cleanText(params.state, 30);
  if (!pool || !orderId || !state) return null;
  const res = await pool.query(
    `update calendar_orders
     set voucher_bonus_state = $2,
         voucher_bonus_claim_id = coalesce(nullif($3, ''), voucher_bonus_claim_id),
         voucher_bonus_quantity = $4,
         updated_at = now()
     where order_id = $1
     returning *`,
    [orderId, state, cleanText(params.claimId, 200), clampInt(params.quantity, 0)],
  );
  return rowToOrder(res.rows[0]);
}

/**
 * Mark an order refunded or cancelled. Returns the order as it was *before* the change too,
 * so the caller can tell whether this order is the one that paid the promotional bonus.
 */
export async function markCalendarOrderClosed(pool: any, params: any = {}): Promise<any> {
  const paymentState = cleanText(params.paymentState, 30);
  if (!pool || !PAYMENT_STATES.includes(paymentState as any)) {
    return { ok: false, statusCode: 400, error: "invalid_payment_state" };
  }
  const sessionId = cleanText(params.checkoutSessionId, 200);
  const orderId = cleanText(params.orderId, 40);
  if (!sessionId && !orderId) return { ok: false, statusCode: 400, error: "invalid_order" };

  const res = await pool.query(
    `update calendar_orders
     set payment_state = $3,
         fulfillment_state = $3,
         updated_at = now()
     where ($1 <> '' and checkout_session_id = $1) or ($2 <> '' and order_id = $2)
     returning *`,
    [sessionId, orderId, paymentState],
  );
  return res.rowCount
    ? { ok: true, order: rowToOrder(res.rows[0]) }
    : { ok: false, statusCode: 404, error: "order_not_found" };
}

export async function listCalendarOrdersForPlayer(pool: any, playerId: any): Promise<any[]> {
  const id = cleanText(playerId, 120);
  if (!pool || !id) return [];
  const res = await pool.query(
    `${SELECT} where player_id = $1 order by created_at desc limit 50`,
    [id],
  );
  return res.rows.map(rowToOrder);
}

export async function listCalendarOrders(pool: any, options: any = {}): Promise<any[]> {
  if (!pool) return [];
  const filters: string[] = [];
  const values: any[] = [];
  const paymentState = cleanText(options.paymentState, 30);
  if (PAYMENT_STATES.includes(paymentState as any)) {
    values.push(paymentState);
    filters.push(`payment_state = $${values.length}`);
  }
  const fulfillmentState = cleanText(options.fulfillmentState, 40);
  if (isFulfillmentState(fulfillmentState)) {
    values.push(fulfillmentState);
    filters.push(`fulfillment_state = $${values.length}`);
  }
  const search = cleanText(options.search, 120);
  if (search) {
    values.push(`%${search.toLowerCase()}%`);
    const placeholder = `$${values.length}`;
    filters.push(`(lower(order_id) like ${placeholder} or lower(customer_email) like ${placeholder} or lower(customer_name) like ${placeholder})`);
  }
  values.push(clampInt(options.limit ?? 200, 1, 1000));

  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  const res = await pool.query(
    `${SELECT} ${where} order by created_at desc limit $${values.length}`,
    values,
  );
  return res.rows.map(rowToOrder);
}

export async function updateCalendarFulfillment(pool: any, params: any = {}): Promise<any> {
  const orderId = cleanText(params.orderId, 40);
  if (!pool || !orderId) return { ok: false, statusCode: 400, error: "invalid_order" };

  const fulfillmentState = cleanText(params.fulfillmentState, 40);
  if (fulfillmentState && !isFulfillmentState(fulfillmentState)) {
    return { ok: false, statusCode: 400, error: "invalid_fulfillment_state" };
  }
  const trackingNumber = cleanText(params.trackingNumber, 120);
  const carrier = cleanText(params.carrier, 80);
  const note = cleanText(params.adminNote, 500);
  if (!fulfillmentState && !trackingNumber && !carrier && !note) {
    return { ok: false, statusCode: 400, error: "nothing_to_update" };
  }

  const res = await pool.query(
    `update calendar_orders set
       fulfillment_state = coalesce(nullif($2, ''), fulfillment_state),
       tracking_number = coalesce(nullif($3, ''), tracking_number),
       carrier = coalesce(nullif($4, ''), carrier),
       admin_note = coalesce(nullif($5, ''), admin_note),
       shipped_at = case when $2 = 'shipped' and shipped_at is null then now() else shipped_at end,
       updated_at = now()
     where order_id = $1
     returning *`,
    [orderId, fulfillmentState, trackingNumber, carrier, note],
  );
  return res.rowCount
    ? { ok: true, order: rowToOrder(res.rows[0]) }
    : { ok: false, statusCode: 404, error: "order_not_found" };
}

/**
 * Preorder totals for a manufacturing decision. Orders and calendars are counted separately
 * because one customer may buy several, and it is the calendar count that sizes a print run.
 */
export async function getCalendarPreorderMetrics(pool: any): Promise<any> {
  if (!pool) return null;
  const res = await pool.query(
    `select
       count(*) filter (where payment_state = 'paid')                       as paid_orders,
       coalesce(sum(quantity) filter (where payment_state = 'paid'), 0)     as paid_calendars,
       coalesce(sum(total_amount_cents) filter (where payment_state = 'paid'), 0) as gross_cents,
       count(*) filter (where payment_state = 'refunded')                   as refunded_orders,
       coalesce(sum(quantity) filter (where payment_state = 'refunded'), 0) as refunded_calendars,
       count(*) filter (where payment_state = 'cancelled')                  as cancelled_orders,
       count(*) filter (where payment_state = 'pending')                    as pending_orders,
       count(*) filter (where payment_state = 'paid' and fulfillment_state = 'shipped') as shipped_orders
     from calendar_orders`,
  );
  const row = res.rows[0] || {};
  return {
    paidOrders: Number(row.paid_orders) || 0,
    paidCalendars: Number(row.paid_calendars) || 0,
    grossRevenueCents: Number(row.gross_cents) || 0,
    refundedOrders: Number(row.refunded_orders) || 0,
    refundedCalendars: Number(row.refunded_calendars) || 0,
    cancelledOrders: Number(row.cancelled_orders) || 0,
    pendingOrders: Number(row.pending_orders) || 0,
    shippedOrders: Number(row.shipped_orders) || 0,
  };
}
