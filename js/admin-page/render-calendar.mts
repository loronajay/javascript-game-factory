import type { AdminState } from "./admin-state.mjs";
import {
  badge,
  button,
  emptyState,
  escapeHtml,
  formatDate,
  panel,
  select,
  textInput,
} from "./render-shared.mjs";

// The physical calendar fulfillment panel. Pure renderer: it reads state and returns markup,
// and every write goes back through actions.mjs like the rest of the console.

const FULFILLMENT_STATES = [
  "preorder", "paid", "production", "ready_to_ship", "shipped", "delivered", "cancelled", "refunded",
] as const;

const PAYMENT_FILTERS = ["paid", "pending", "refunded", "cancelled"] as const;

function money(cents: unknown, currency = "usd"): string {
  const amount = (Number(cents) || 0) / 100;
  return `${currency.toUpperCase() === "USD" ? "$" : ""}${amount.toFixed(2)}`;
}

function addressLines(address: any): string {
  if (!address || typeof address !== "object") return "<em>no address</em>";
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(" "),
    address.country,
  ].filter(Boolean);
  return parts.length
    ? parts.map((line: string) => escapeHtml(line)).join("<br>")
    : "<em>no address</em>";
}

/**
 * Orders and calendars are counted separately and labelled as such. One customer may buy
 * several, and it is the calendar count -- not the order count -- that sizes a print run.
 */
function renderMetrics(state: AdminState): string {
  const metrics = state.calendarMetrics;
  if (!metrics) return emptyState("Preorder totals are unavailable.");

  const tiles = [
    ["Paid orders", String(metrics.paidOrders), "customers who have paid"],
    ["Calendars ordered", String(metrics.paidCalendars), "units to manufacture"],
    ["Gross revenue", money(metrics.grossRevenueCents), "incl. shipping and tax"],
    ["Refunded / cancelled", String(metrics.refundedOrders + metrics.cancelledOrders), "excluded from the run"],
    ["Awaiting payment", String(metrics.pendingOrders), "started checkout, never paid"],
    ["Shipped", String(metrics.shippedOrders), "orders on their way"],
  ];

  return `<div class="admin-metrics">${tiles.map(([label, value, hint]) => `
    <div class="admin-metric">
      <p class="admin-metric__value">${escapeHtml(value)}</p>
      <p class="admin-metric__label">${escapeHtml(label)}</p>
      <p class="admin-metric__hint">${escapeHtml(hint)}</p>
    </div>`).join("")}</div>`;
}

function renderOrder(order: any): string {
  const tone = order.paymentState === "paid"
    ? "good"
    : order.paymentState === "pending" ? "warn" : "muted";

  return `<form class="admin-order" data-form data-order-id="${escapeHtml(order.orderId)}">
    <header class="admin-order__head">
      <div>
        <p class="admin-order__id">${escapeHtml(order.orderId)}</p>
        <p class="admin-order__meta">${escapeHtml(formatDate(order.createdAt))}</p>
      </div>
      <div class="admin-order__flags">
        ${badge(order.paymentState, tone)}
        ${badge(order.fulfillmentState)}
        ${badge(
          order.voucherBonusState === "granted" ? "10 vouchers paid"
            : order.voucherBonusState === "already_held" ? "bonus already held"
              : order.voucherBonusState === "revoked" ? "bonus revoked" : "bonus pending",
          order.voucherBonusState === "granted" ? "good" : "muted",
        )}
      </div>
    </header>

    <div class="admin-order__grid">
      <div>
        <p class="admin-order__label">Customer</p>
        <p>${escapeHtml(order.customerName || "—")}</p>
        <p class="admin-order__meta">${escapeHtml(order.customerEmail || "—")}</p>
      </div>
      <div>
        <p class="admin-order__label">Ship to</p>
        <p>${addressLines(order.shippingAddress)}</p>
      </div>
      <div>
        <p class="admin-order__label">Order</p>
        <p>${escapeHtml(String(order.quantity))} &times; calendar</p>
        <p class="admin-order__meta">${escapeHtml(money(order.totalAmountCents, order.currency))} total</p>
      </div>
    </div>

    <div class="admin-order__actions">
      ${select("fulfillmentState", order.fulfillmentState, FULFILLMENT_STATES)}
      ${textInput("trackingNumber", order.trackingNumber, { placeholder: "Tracking number" })}
      ${textInput("carrier", order.carrier, { placeholder: "Carrier" })}
      ${button("calendar-order-save", "Save", { tone: "primary", value: order.orderId })}
    </div>
  </form>`;
}

export function renderCalendar(state: AdminState): string {
  const filters = `<form class="admin-filters" data-form>
    ${PAYMENT_FILTERS.map((value) => `
      <button type="button" data-action="calendar-filter" data-value="${value}"
        class="admin-filter${state.calendarFilter === value ? " is-active" : ""}">${escapeHtml(value)}</button>`).join("")}
    <input type="search" name="calendarSearch" value="${escapeHtml(state.calendarSearch)}"
      placeholder="Order number, name or email" class="admin-search">
    ${button("calendar-search", "Search", { type: "submit" })}
  </form>`;

  // Everything production needs to pack and post a run, without anyone opening a database.
  // It exports whatever the current filter shows, so the label names it.
  const exportAction = button("calendar-export", `Export ${state.calendarFilter} orders (CSV)`);

  const body = state.calendarOrders.length
    ? `<div class="admin-orders">${state.calendarOrders.map(renderOrder).join("")}</div>`
    : emptyState("No calendar orders match this filter.");

  return [
    panel("Preorder totals", renderMetrics(state)),
    panel("Calendar orders", `${filters}${body}`, exportAction),
  ].join("");
}
