import { readJsonBody, writeJson, writeText } from "../http-utils.mjs";
import { FULFILLMENT_STATES } from "../db/calendar-orders.mjs";

// Calendar order fulfillment for the admin console.
//
// This file holds no authorization logic: admin-routes.mjs is the gate for the whole /admin/
// family and every request here has already passed it.

const CSV_COLUMNS: [string, (order: any) => any][] = [
  ["order_id", (order) => order.orderId],
  ["order_date", (order) => order.createdAt],
  ["paid_at", (order) => order.paidAt || ""],
  ["quantity", (order) => order.quantity],
  ["customer_name", (order) => order.customerName],
  ["email", (order) => order.customerEmail],
  ["address_line1", (order) => order.shippingAddress?.line1 || ""],
  ["address_line2", (order) => order.shippingAddress?.line2 || ""],
  ["city", (order) => order.shippingAddress?.city || ""],
  ["state", (order) => order.shippingAddress?.state || ""],
  ["postal_code", (order) => order.shippingAddress?.postalCode || ""],
  ["country", (order) => order.shippingAddress?.country || ""],
  ["payment_state", (order) => order.paymentState],
  ["fulfillment_state", (order) => order.fulfillmentState],
  ["tracking_number", (order) => order.trackingNumber],
  ["carrier", (order) => order.carrier],
  ["total", (order) => (order.totalAmountCents / 100).toFixed(2)],
  ["currency", (order) => order.currency],
  ["voucher_bonus", (order) => order.voucherBonusState],
];

/**
 * RFC 4180 escaping. A field is quoted whenever it contains a delimiter, a quote or a line
 * break -- addresses routinely contain commas, and an unescaped one silently shifts every
 * later column, which would ship calendars to the wrong place.
 */
function csvCell(value: any): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(orders: any[]): string {
  const rows = [CSV_COLUMNS.map(([header]) => header).join(",")];
  for (const order of orders) {
    rows.push(CSV_COLUMNS.map(([, read]) => csvCell(read(order))).join(","));
  }
  return `${rows.join("\r\n")}\r\n`;
}

const ORDER_ID_PATTERN = /^\/admin\/calendar\/orders\/([A-Za-z0-9-]{1,40})$/;

export async function handleAdminCalendarRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, requestOrigin, timestamp, services, adminPlayerId } = context;
  const {
    listCalendarOrders,
    getCalendarOrder,
    updateCalendarFulfillment,
    getCalendarPreorderMetrics,
    writeAuditLog,
  } = services;

  if (method === "GET" && pathname === "/admin/calendar/metrics") {
    const metrics = typeof getCalendarPreorderMetrics === "function"
      ? await getCalendarPreorderMetrics()
      : null;
    writeJson(res, 200, { metrics, timestamp }, requestOrigin);
    return true;
  }

  if (method === "GET" && pathname === "/admin/calendar/orders") {
    const url = new URL(req.url || "", "http://localhost");
    const orders = typeof listCalendarOrders === "function"
      ? await listCalendarOrders({
        paymentState: url.searchParams.get("paymentState"),
        fulfillmentState: url.searchParams.get("fulfillmentState"),
        search: url.searchParams.get("search"),
        limit: url.searchParams.get("limit"),
      })
      : [];
    writeJson(res, 200, { orders, fulfillmentStates: FULFILLMENT_STATES, timestamp }, requestOrigin);
    return true;
  }

  // Everything production needs to pack and post a run, without anyone opening a database.
  if (method === "GET" && pathname === "/admin/calendar/orders.csv") {
    const url = new URL(req.url || "", "http://localhost");
    const orders = typeof listCalendarOrders === "function"
      ? await listCalendarOrders({
        // Default to paid: an unpaid preorder must never reach a packing list.
        paymentState: url.searchParams.get("paymentState") || "paid",
        fulfillmentState: url.searchParams.get("fulfillmentState"),
        limit: 1000,
      })
      : [];
    writeText(res, 200, toCsv(orders), requestOrigin, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="calendar-orders.csv"',
    });
    return true;
  }

  const orderMatch = pathname.match(ORDER_ID_PATTERN);

  if (orderMatch && method === "GET") {
    const order = typeof getCalendarOrder === "function" ? await getCalendarOrder(orderMatch[1]) : null;
    if (!order) {
      writeJson(res, 404, { status: "error", error: "order_not_found", timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { order, timestamp }, requestOrigin);
    return true;
  }

  if (orderMatch && (method === "PATCH" || method === "PUT")) {
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    if (typeof updateCalendarFulfillment !== "function") {
      writeJson(res, 503, { status: "error", error: "fulfillment_not_configured", timestamp }, requestOrigin);
      return true;
    }

    const result = await updateCalendarFulfillment({
      orderId: orderMatch[1],
      fulfillmentState: body.value?.fulfillmentState,
      trackingNumber: body.value?.trackingNumber,
      carrier: body.value?.carrier,
      adminNote: body.value?.adminNote,
    });
    if (!result?.ok) {
      writeJson(res, result?.statusCode || 400, {
        status: "error",
        error: result?.error || "update_failed",
        timestamp,
      }, requestOrigin);
      return true;
    }

    if (typeof writeAuditLog === "function") {
      await writeAuditLog({
        actorPlayerId: adminPlayerId,
        action: "calendar.fulfillment.update",
        targetType: "calendar_order",
        targetId: orderMatch[1],
        detail: {
          fulfillmentState: result.order.fulfillmentState,
          trackingNumber: result.order.trackingNumber,
        },
      });
    }
    writeJson(res, 200, { order: result.order, timestamp }, requestOrigin);
    return true;
  }

  return false;
}
