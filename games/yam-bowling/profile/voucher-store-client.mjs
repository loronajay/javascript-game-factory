const GAME_SLUG = "yam-bowling";
const PENDING_SESSION_KEY = "yam-bowling.pendingVoucherCheckoutSessionId";
const PLATFORM_CHECKOUT_PATH = "/payments/yam-bowling/checkout-sessions";

export const VOUCHER_STORE_OFFERS = Object.freeze([
  Object.freeze({
    id: "skin-voucher",
    kind: "inventory",
    sku: "yb.voucher.skin.1",
    itemId: "skin-voucher",
    quantity: 1,
    cents: 99,
    currency: "USD",
    name: "Skin Voucher",
    description: "Unlock one normal skin.",
    asset: "assets/vouchers/skin-voucher.webp",
  }),
  Object.freeze({
    id: "swimsuit-voucher",
    kind: "inventory",
    sku: "yb.voucher.swimsuit.1",
    itemId: "swimsuit-voucher",
    quantity: 1,
    cents: 199,
    currency: "USD",
    name: "Swimsuit Voucher",
    description: "Unlock one premium Swimsuit outfit. Regular Skin Vouchers cannot be used on swimsuits.",
    asset: "assets/vouchers/swimsuit-voucher.webp",
  }),
  Object.freeze({
    id: "emote-voucher",
    kind: "inventory",
    sku: "yb.voucher.emote.1",
    itemId: "emote-voucher",
    quantity: 1,
    cents: 99,
    currency: "USD",
    name: "Emote Voucher",
    description: "Unlock any voucher-exclusive lane reaction. Also earnable through play.",
    asset: "assets/vouchers/emote-voucher.webp",
  }),
]);

function clean(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function formatVoucherPrice(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((Number(cents) || 0) / 100);
}

function configuredPlatformBase() {
  return clean(globalThis.__JGF_PLATFORM_API_URL__ || globalThis.JGF_PLATFORM_API_URL).replace(/\/+$/, "");
}

function endpoint(path, locationRef, explicit = "") {
  const base = configuredPlatformBase();
  const selected = clean(explicit) || (base ? `${base}${path}` : path.replace("/payments/", "/api/"));
  return new URL(selected, clean(locationRef?.href) || "http://localhost/games/yam-bowling/index.html").toString();
}

function checkoutReturnUrl(locationRef, state) {
  const url = new URL(clean(locationRef?.href) || "http://localhost/games/yam-bowling/index.html");
  url.search = "";
  url.searchParams.set("checkout", state);
  if (state === "success") url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  return url.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
}

async function readJson(response) {
  try { return await response?.json?.(); } catch { return null; }
}

function readPending(storage) {
  try { return clean(storage?.getItem?.(PENDING_SESSION_KEY), 200); } catch { return ""; }
}

function setPending(storage, value) {
  try { storage?.setItem?.(PENDING_SESSION_KEY, value); } catch { /* return URL is the fallback */ }
}

function clearPending(storage) {
  try { storage?.removeItem?.(PENDING_SESSION_KEY); } catch { /* best effort */ }
}

export function createVoucherStoreClient({
  account = () => ({}),
  fetchImpl = globalThis.fetch?.bind(globalThis),
  locationRef = globalThis.location,
  storage = globalThis.localStorage,
  checkoutEndpoint = "",
  fulfillmentEndpoint = "",
} = {}) {
  let state = { status: "idle", error: "" };

  function auth() {
    const value = typeof account === "function" ? account() : account;
    return { playerId: clean(value?.playerId, 120), token: clean(value?.token, 4000) };
  }

  function offerById(id) {
    return VOUCHER_STORE_OFFERS.find((offer) => offer.id === id) || null;
  }

  async function purchase(offerId) {
    const offer = offerById(offerId);
    const session = auth();
    if (!offer || !session.token || typeof fetchImpl !== "function" || state.status === "checkout") return false;
    state = { status: "checkout", error: "" };
    try {
      const response = await fetchImpl(endpoint(PLATFORM_CHECKOUT_PATH, locationRef, checkoutEndpoint), {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json; charset=utf-8",
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          gameSlug: GAME_SLUG,
          playerId: session.playerId,
          offer: { id: offer.id, kind: offer.kind, sku: offer.sku },
          successUrl: checkoutReturnUrl(locationRef, "success"),
          cancelUrl: checkoutReturnUrl(locationRef, "cancel"),
        }),
      });
      const body = await readJson(response);
      if (!response?.ok || !body?.url) throw new Error(body?.error || "checkout_failed");
      if (body.sessionId) setPending(storage, clean(body.sessionId, 200));
      state = { status: "redirecting", error: "" };
      if (typeof locationRef?.assign === "function") locationRef.assign(body.url);
      else locationRef.href = body.url;
      return true;
    } catch (error) {
      state = { status: "error", error: clean(error?.message) || "checkout_failed" };
      return false;
    }
  }

  async function fulfillReturn() {
    if (typeof fetchImpl !== "function") return null;
    let url;
    try { url = new URL(clean(locationRef?.href)); } catch { return null; }
    if (url.searchParams.get("checkout") !== "success") return null;
    const sessionId = clean(url.searchParams.get("session_id"), 200) || readPending(storage);
    const session = auth();
    if (!sessionId || !session.token) return null;
    state = { status: "fulfilling", error: "" };
    try {
      const response = await fetchImpl(endpoint(`${PLATFORM_CHECKOUT_PATH}/fulfill`, locationRef, fulfillmentEndpoint), {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json; charset=utf-8",
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      const body = await readJson(response);
      if (!response?.ok || !body?.ok || !body?.progress) throw new Error(body?.error || "fulfillment_failed");
      clearPending(storage);
      state = { status: "ready", error: "" };
      return body;
    } catch (error) {
      state = { status: "error", error: clean(error?.message) || "fulfillment_failed" };
      return null;
    }
  }

  return {
    fulfillReturn,
    getOffers: () => VOUCHER_STORE_OFFERS,
    getState: () => ({ ...state }),
    purchase,
  };
}
