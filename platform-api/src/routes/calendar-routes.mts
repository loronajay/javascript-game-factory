import { readJsonBody, writeJson } from "../http-utils.mjs";
import { CALENDAR_OFFER, priceCalendarPreorder } from "../services/calendar-catalog.mjs";
import { toCustomerOrder } from "../db/calendar-orders.mjs";

// Customer-facing calendar routes: what the product costs, how to buy it, and where my
// order got to. Admin fulfillment lives behind /admin/, gated by admin-routes.

function unauthorized(res: any, timestamp: any, requestOrigin: any): true {
  writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
  return true;
}

export async function handleCalendarRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const {
    createCalendarCheckoutSession,
    fulfillCalendarCheckoutFromReturn,
    listCalendarOrdersForPlayer,
  } = services;

  // The offer itself is public: the page prices the product before anyone signs in, and the
  // price a buyer sees has to be the one the server will charge.
  if (method === "GET" && pathname === "/calendar/offer") {
    writeJson(res, 200, {
      productId: CALENDAR_OFFER.productId,
      name: "Yam Bowling 2027 Pinup Calendar",
      preorder: true,
      unitAmountCents: CALENDAR_OFFER.unitAmountCents,
      currency: CALENDAR_OFFER.currency,
      maxQuantity: CALENDAR_OFFER.maxQuantity,
      shippingChargedSeparately: true,
      bonus: {
        itemId: CALENDAR_OFFER.bonus.itemId,
        quantity: CALENDAR_OFFER.bonus.quantity,
        perAccount: CALENDAR_OFFER.bonus.perAccount,
        label: `${CALENDAR_OFFER.bonus.quantity} Skin Vouchers`,
      },
      timestamp,
    }, requestOrigin);
    return true;
  }

  if (method === "POST" && pathname === "/calendar/checkout-sessions") {
    // Signed-in only. The bonus needs an authoritative recipient, and a typed-in checkout
    // email is not one.
    if (!authClaims?.playerId) return unauthorized(res, timestamp, requestOrigin);

    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    if (typeof createCalendarCheckoutSession !== "function") {
      writeJson(res, 503, { status: "error", error: "checkout_not_configured", timestamp }, requestOrigin);
      return true;
    }

    const result = await createCalendarCheckoutSession({
      playerId: authClaims.playerId,
      customerEmail: authClaims.email || "",
      body: body.value,
    });
    if (!result?.ok) {
      writeJson(res, result?.statusCode || 400, {
        status: "error",
        error: result?.error || "checkout_failed",
        message: result?.message || undefined,
        timestamp,
      }, requestOrigin);
      return true;
    }
    writeJson(res, 200, {
      url: result.url,
      sessionId: result.sessionId,
      orderId: result.orderId,
      quantity: result.quantity,
      subtotalCents: result.subtotalCents,
      currency: result.currency,
    }, requestOrigin);
    return true;
  }

  // The buyer's return from Stripe. The webhook is the authority; this exists so someone who
  // lands back first still sees a confirmed order, and it settles the same rows.
  if (method === "POST" && pathname === "/calendar/checkout-sessions/fulfill") {
    if (!authClaims?.playerId) return unauthorized(res, timestamp, requestOrigin);

    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    if (typeof fulfillCalendarCheckoutFromReturn !== "function") {
      writeJson(res, 503, { status: "error", error: "checkout_fulfillment_not_configured", timestamp }, requestOrigin);
      return true;
    }

    const result = await fulfillCalendarCheckoutFromReturn({
      playerId: authClaims.playerId,
      body: body.value,
    });
    if (!result?.ok) {
      writeJson(res, result?.statusCode || 400, {
        status: "error",
        error: result?.error || "fulfillment_failed",
        timestamp,
      }, requestOrigin);
      return true;
    }
    writeJson(res, 200, {
      orderId: result.orderId,
      bonusState: result.bonusState,
      bonusQuantity: result.bonusQuantity,
      alreadyProcessed: result.alreadyProcessed === true,
    }, requestOrigin);
    return true;
  }

  if (method === "GET" && pathname === "/calendar/orders") {
    if (!authClaims?.playerId) return unauthorized(res, timestamp, requestOrigin);
    if (typeof listCalendarOrdersForPlayer !== "function") {
      writeJson(res, 200, { orders: [], timestamp }, requestOrigin);
      return true;
    }
    const orders = await listCalendarOrdersForPlayer(authClaims.playerId);
    // Internal payment references never leave the building.
    writeJson(res, 200, { orders: orders.map(toCustomerOrder), timestamp }, requestOrigin);
    return true;
  }

  // A price quote for a quantity, so the page can show a running subtotal without guessing
  // at the server's arithmetic.
  if (method === "GET" && pathname === "/calendar/quote") {
    const url = new URL(req.url || "", "http://localhost");
    writeJson(res, 200, { ...priceCalendarPreorder(url.searchParams.get("quantity")), timestamp }, requestOrigin);
    return true;
  }

  return false;
}
