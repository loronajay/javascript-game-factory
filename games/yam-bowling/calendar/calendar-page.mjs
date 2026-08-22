import { createPlatformApiClient } from "../../../js/platform/api/platform-api.mjs";
import { getStoredAuthToken } from "../../../js/platform/api/auth-token.mjs";
import { createFactoryAccountSignInUrl } from "../../../js/platform/api/factory-account-gate.mjs";
import { CALENDAR_PAGES, MONTH_PAGES } from "./calendar-manifest.mjs";
import { createCalendarViewer } from "./calendar-viewer.mjs";

// The preorder page. It owns presentation and the buy button; every number it shows about
// money comes from the server, and the vouchers are granted nowhere near here.

const UNIT_PRICE_CENTS = 2999;

const $ = (id) => document.getElementById(id);

function money(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() })
    .format((Number(cents) || 0) / 100);
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/* ---- viewer ------------------------------------------------------------------------- */

createCalendarViewer({
  mount: $("calendarViewer"),
  pages: CALENDAR_PAGES,
  reducedMotion: prefersReducedMotion(),
});

$("calRoster").innerHTML = MONTH_PAGES
  .map((entry) => `<li><span class="cal-roster__month">${entry.label}</span>
    <span class="cal-roster__name">${entry.bowlerName}</span></li>`)
  .join("");

/* ---- commerce ----------------------------------------------------------------------- */

const api = createPlatformApiClient();
const status = $("calStatus");
const quantityInput = $("calQuantity");
const totalLine = $("calTotal");
const cta = $("calPreorderCta");

function setStatus(message, tone = "") {
  status.textContent = message;
  status.dataset.tone = tone;
}

function isSignedIn() {
  return Boolean(getStoredAuthToken());
}

function clampQuantity() {
  const raw = Math.floor(Number(quantityInput.value));
  const quantity = Number.isFinite(raw) ? Math.max(1, Math.min(10, raw)) : 1;
  if (String(quantity) !== quantityInput.value) quantityInput.value = String(quantity);
  return quantity;
}

// A local subtotal so the line responds instantly. It is a preview only -- the charge is
// priced by the server, and shipping and tax are added by the payment provider.
function paintTotal() {
  const quantity = clampQuantity();
  const noun = quantity === 1 ? "calendar" : "calendars";
  totalLine.textContent =
    `${quantity} ${noun} · ${money(UNIT_PRICE_CENTS * quantity)} plus shipping and tax`;
}

quantityInput.addEventListener("input", paintTotal);
quantityInput.addEventListener("change", paintTotal);
paintTotal();

$("calBonusSignin").hidden = isSignedIn();

$("calBuyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const quantity = clampQuantity();

  // Route through sign-in before taking any money: the bonus needs an authoritative
  // recipient, and a checkout email is not one. `createFactoryAccountSignInUrl` brings the
  // buyer back to this page.
  if (!isSignedIn()) {
    setStatus("Taking you to sign-in so your vouchers reach your account…");
    globalThis.location.href = createFactoryAccountSignInUrl();
    return;
  }

  cta.disabled = true;
  setStatus("Opening secure checkout…");
  try {
    const result = await api.createCalendarCheckoutSession({ quantity });
    if (!result?.url) throw new Error(result?.error || "checkout_failed");
    globalThis.location.href = result.url;
  } catch (error) {
    cta.disabled = false;
    setStatus(
      error?.message === "authentication_required"
        ? "Please sign in and try again."
        : "Checkout could not be opened. Please try again in a moment.",
      "error",
    );
  }
});

/* ---- return from checkout ----------------------------------------------------------- */

function orderCard(order) {
  const state = String(order.fulfillmentState || "preorder");
  const label = {
    preorder: "Preorder confirmed",
    paid: "Preorder confirmed",
    production: "In production",
    ready_to_ship: "Ready to ship",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
    refunded: "Refunded",
  }[state] || "Preorder confirmed";

  const tracking = order.trackingNumber
    ? `<p class="cal-order__tracking">Tracking: <strong>${order.trackingNumber}</strong>
       ${order.carrier ? `<span>(${order.carrier})</span>` : ""}</p>`
    : "";
  const bonus = order.bonusGranted
    ? `<p class="cal-order__bonus">Bonus: <strong>10 Skin Vouchers</strong> added to your account</p>`
    : order.voucherBonusState === "already_held"
      ? `<p class="cal-order__bonus">Bonus: already claimed on this account</p>`
      : "";

  return `<article class="cal-order">
    <p class="cal-order__state" data-state="${state}">${label}</p>
    <h3 class="cal-order__title">Yam Bowling 2027 Pinup Calendar</h3>
    <p class="cal-order__line">Quantity: ${order.quantity}</p>
    <p class="cal-order__line">${money(order.totalAmountCents, order.currency)} paid
      <span>(incl. shipping and tax)</span></p>
    ${bonus}
    ${tracking}
    <p class="cal-order__id">Order ${order.orderId}</p>
  </article>`;
}

async function paintOrders() {
  if (!isSignedIn()) return;
  const section = $("calOrdersSection");
  try {
    const result = await api.listCalendarOrders();
    const orders = (result?.orders || []).filter((order) => order.paymentState !== "pending");
    if (!orders.length) return;
    $("calOrders").innerHTML = orders.map(orderCard).join("");
    section.hidden = false;
  } catch {
    // A failed read is not worth an error banner on a product page.
  }
}

async function settleReturnFromCheckout() {
  const params = new URLSearchParams(globalThis.location.search);
  if (params.get("checkout") === "cancel") {
    setStatus("Checkout cancelled — nothing was charged.");
    return;
  }
  const sessionId = params.get("session_id");
  if (params.get("checkout") !== "success" || !sessionId || !isSignedIn()) return;

  setStatus("Confirming your preorder…");
  try {
    const result = await api.fulfillCalendarCheckout({ sessionId });
    setStatus(
      result?.bonusState === "granted"
        ? "Preorder confirmed. 10 Skin Vouchers have been added to your account."
        : "Preorder confirmed.",
      "ok",
    );
  } catch {
    // The webhook is the authority and will settle this regardless; say so rather than
    // implying the payment failed.
    setStatus("Payment received. Your order will appear here shortly.");
  } finally {
    // Drop the checkout params so a refresh cannot look like a second purchase.
    const url = new URL(globalThis.location.href);
    url.search = "";
    globalThis.history?.replaceState({}, "", url);
    await paintOrders();
  }
}

settleReturnFromCheckout();
paintOrders();
