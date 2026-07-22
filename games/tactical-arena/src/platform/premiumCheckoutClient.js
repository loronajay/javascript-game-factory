import { normalizeFactoryAccountSession } from "./factoryAccount.js";

export const CHECKOUT_API_UNAVAILABLE_ERROR = "CHECKOUT_API_UNAVAILABLE";
export const CHECKOUT_RESPONSE_INVALID_ERROR = "CHECKOUT_RESPONSE_INVALID";
export const CHECKOUT_OFFER_INVALID_ERROR = "CHECKOUT_OFFER_INVALID";
export const CHECKOUT_EMBED_UNAVAILABLE_ERROR = "CHECKOUT_EMBED_UNAVAILABLE";
export const DEFAULT_PREMIUM_CHECKOUT_ENDPOINT = "/api/tactical-arena/checkout-sessions";
export const DEFAULT_PREMIUM_CHECKOUT_FULFILLMENT_ENDPOINT = "/api/tactical-arena/checkout-sessions/fulfill";
export const PLATFORM_PREMIUM_CHECKOUT_PATH = "/payments/tactical-arena/checkout-sessions";
export const PLATFORM_PREMIUM_CHECKOUT_FULFILLMENT_PATH = "/payments/tactical-arena/checkout-sessions/fulfill";
export const PREMIUM_CHECKOUT_EVENT = "tacticalarena:premium-purchase-request";
export const PENDING_PREMIUM_CHECKOUT_SESSION_KEY = "tactical-arena.pendingPremiumCheckoutSessionId";
export const STRIPE_JS_URL = "https://js.stripe.com/clover/stripe.js";
export const TACTICAL_ARENA_GAME_SLUG = "tactical-arena";

function cleanText(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function checkoutError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function defaultLocationRef() {
  return globalThis.location;
}

function defaultFetchImpl() {
  return globalThis.fetch;
}

function defaultStorageRef() {
  return globalThis.localStorage || globalThis.sessionStorage;
}

function defaultDocumentRef() {
  return globalThis.document;
}

function configuredEndpoint() {
  const explicit = cleanText(globalThis.TACTICAL_ARENA_STRIPE_CHECKOUT_URL);
  if (explicit) return explicit;
  try {
    return cleanText(globalThis.document?.querySelector?.("meta[name='tactical-arena-checkout-endpoint']")?.content);
  } catch {
    return "";
  }
}

function configuredPlatformApiBaseUrl() {
  return cleanText(globalThis.__JGF_PLATFORM_API_URL__ || globalThis.JGF_PLATFORM_API_URL).replace(/\/+$/, "");
}

function defaultCheckoutEndpoint() {
  const platformApiBaseUrl = configuredPlatformApiBaseUrl();
  return platformApiBaseUrl
    ? `${platformApiBaseUrl}${PLATFORM_PREMIUM_CHECKOUT_PATH}`
    : DEFAULT_PREMIUM_CHECKOUT_ENDPOINT;
}

function defaultCheckoutFulfillmentEndpoint() {
  const platformApiBaseUrl = configuredPlatformApiBaseUrl();
  return platformApiBaseUrl
    ? `${platformApiBaseUrl}${PLATFORM_PREMIUM_CHECKOUT_FULFILLMENT_PATH}`
    : DEFAULT_PREMIUM_CHECKOUT_FULFILLMENT_ENDPOINT;
}

function defaultReturnUrl(locationRef = defaultLocationRef(), checkoutState = "success") {
  const href = cleanText(locationRef?.href) || "http://localhost/games/tactical-arena/index.html";
  const url = new URL(href);
  url.searchParams.set("checkout", checkoutState);
  if (checkoutState === "success") url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  return url.toString();
}

export function checkoutEndpointUrl({
  endpoint = "",
  currentHref = defaultLocationRef()?.href || "",
} = {}) {
  const selected = cleanText(endpoint) || configuredEndpoint() || defaultCheckoutEndpoint();
  return new URL(selected, cleanText(currentHref) || "http://localhost/games/tactical-arena/index.html").toString();
}

export function checkoutFulfillmentEndpointUrl({
  endpoint = "",
  currentHref = defaultLocationRef()?.href || "",
} = {}) {
  const selected = cleanText(endpoint) || defaultCheckoutFulfillmentEndpoint();
  return new URL(selected, cleanText(currentHref) || "http://localhost/games/tactical-arena/index.html").toString();
}

function readCheckoutSessionId(data) {
  return cleanText(data?.sessionId || data?.checkoutSessionId || data?.id, 200);
}

function readPendingCheckoutSessionId(storage = defaultStorageRef()) {
  try {
    return cleanText(storage?.getItem?.(PENDING_PREMIUM_CHECKOUT_SESSION_KEY), 200);
  } catch {
    return "";
  }
}

function writePendingCheckoutSessionId(storage = defaultStorageRef(), sessionId = "") {
  const cleanSessionId = cleanText(sessionId, 200);
  if (!cleanSessionId) return;
  try {
    storage?.setItem?.(PENDING_PREMIUM_CHECKOUT_SESSION_KEY, cleanSessionId);
  } catch {
    // Best effort only: the return URL still carries the session id.
  }
}

function clearPendingCheckoutSessionId(storage = defaultStorageRef()) {
  try {
    storage?.removeItem?.(PENDING_PREMIUM_CHECKOUT_SESSION_KEY);
  } catch {
    // Best effort only.
  }
}

export function checkoutSessionIdFromReturnUrl(locationRef = defaultLocationRef(), storage = defaultStorageRef()) {
  try {
    const url = new URL(cleanText(locationRef?.href) || "http://localhost/games/tactical-arena/index.html");
    if (url.searchParams.get("checkout") !== "success") return "";
    return cleanText(url.searchParams.get("session_id"), 200) || readPendingCheckoutSessionId(storage);
  } catch {
    return "";
  }
}

function offerIdentity(offer = {}) {
  if (!offer || typeof offer !== "object") return null;
  const kind = cleanText(offer.kind, 80);
  const sku = cleanText(offer.sku, 160);
  const id = cleanText(offer.id, 160);
  const entitlementId = cleanText(offer.entitlementId, 160);
  if (!kind || !sku || !id) return null;

  const base = { id, kind, sku };
  if (entitlementId) base.entitlementId = entitlementId;
  if (kind === "skin") {
    const type = cleanText(offer.type, 80);
    const slug = cleanText(offer.slug, 120);
    if (!type || !slug) return null;
    return { ...base, type, slug };
  }
  if (kind === "skin-pack") {
    const packId = cleanText(offer.packId, 120);
    if (!packId) return null;
    const unownedEntitlementIds = Array.isArray(offer.unownedSkins)
      ? offer.unownedSkins
        .map((skin) => cleanText(skin?.entitlementId || (skin?.type && skin?.slug ? `skin:${skin.type}:${skin.slug}` : ""), 160))
        .filter(Boolean)
      : [];
    return { ...base, packId, unownedEntitlementIds };
  }
  if (kind === "unit") {
    const type = cleanText(offer.type, 80);
    if (!type) return null;
    return { ...base, type };
  }
  if (kind === "consumable") {
    return base;
  }
  return null;
}

export function buildPremiumCheckoutPayload(offer, {
  account = {},
  successUrl = "",
  cancelUrl = "",
  gameSlug = TACTICAL_ARENA_GAME_SLUG,
} = {}) {
  const identity = offerIdentity(offer);
  if (!identity) throw checkoutError(CHECKOUT_OFFER_INVALID_ERROR, "That shop item cannot be sent to checkout.");
  const session = normalizeFactoryAccountSession(account);
  const payload = {
    gameSlug: cleanText(gameSlug, 120) || TACTICAL_ARENA_GAME_SLUG,
    playerId: session.playerId,
    offer: identity,
  };
  const cleanSuccessUrl = cleanText(successUrl, 1200);
  const cleanCancelUrl = cleanText(cancelUrl, 1200);
  if (cleanSuccessUrl) payload.successUrl = cleanSuccessUrl;
  if (cleanCancelUrl) payload.cancelUrl = cleanCancelUrl;
  return payload;
}

function readCheckoutUrl(data) {
  return cleanText(data?.url || data?.checkoutUrl || data?.checkoutSessionUrl, 2000);
}

function readClientSecret(data) {
  return cleanText(data?.clientSecret || data?.client_secret, 500);
}

function readPublishableKey(data) {
  return cleanText(data?.publishableKey || data?.stripePublishableKey, 500);
}

async function readJson(response) {
  if (!response || typeof response.json !== "function") return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function defaultStripeFactory() {
  return typeof globalThis.Stripe === "function" ? globalThis.Stripe : null;
}

function loadStripeFactory({
  documentRef = defaultDocumentRef(),
  stripeFactory = defaultStripeFactory(),
  stripeJsUrl = STRIPE_JS_URL,
} = {}) {
  if (typeof stripeFactory === "function") return Promise.resolve(stripeFactory);
  if (!documentRef?.createElement) return Promise.resolve(null);

  return new Promise((resolve) => {
    const existing = typeof documentRef.querySelector === "function"
      ? documentRef.querySelector(`script[src="${stripeJsUrl}"]`)
      : null;
    if (existing) {
      existing.addEventListener?.("load", () => resolve(defaultStripeFactory()), { once: true });
      existing.addEventListener?.("error", () => resolve(null), { once: true });
      if (defaultStripeFactory()) resolve(defaultStripeFactory());
      return;
    }

    const script = documentRef.createElement("script");
    script.src = stripeJsUrl;
    script.async = true;
    script.addEventListener("load", () => resolve(defaultStripeFactory()), { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
    const target = documentRef.head || documentRef.body || documentRef.documentElement;
    if (!target?.appendChild) {
      resolve(null);
      return;
    }
    target.appendChild(script);
  });
}

export async function startPremiumCheckout({
  offer,
  account = {},
  checkoutEndpoint = "",
  fetchImpl = defaultFetchImpl(),
  locationRef = defaultLocationRef(),
  storage = defaultStorageRef(),
  documentRef = defaultDocumentRef(),
  checkoutContainer = null,
  stripeFactory = defaultStripeFactory(),
  stripeJsUrl = STRIPE_JS_URL,
  onComplete = null,
  successUrl = "",
  cancelUrl = "",
  gameSlug = TACTICAL_ARENA_GAME_SLUG,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw checkoutError(CHECKOUT_API_UNAVAILABLE_ERROR, "Stripe checkout is not configured yet.");
  }
  const endpoint = checkoutEndpointUrl({
    endpoint: checkoutEndpoint,
    currentHref: locationRef?.href,
  });
  const session = normalizeFactoryAccountSession(account);
  const payload = buildPremiumCheckoutPayload(offer, {
    account: session,
    gameSlug,
    successUrl: successUrl || defaultReturnUrl(locationRef, "success"),
    cancelUrl: cancelUrl || defaultReturnUrl(locationRef, "cancel"),
  });
  const headers = {
    "Content-Type": "application/json",
  };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;

  let response = null;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    throw checkoutError(CHECKOUT_API_UNAVAILABLE_ERROR, "Stripe checkout is not reachable right now.");
  }

  const data = await readJson(response);
  if (!response?.ok) {
    const code = response?.status === 404
      ? CHECKOUT_API_UNAVAILABLE_ERROR
      : data?.errorCode || CHECKOUT_API_UNAVAILABLE_ERROR;
    throw checkoutError(code, data?.message || "Stripe checkout is not configured yet.");
  }

  const sessionId = readCheckoutSessionId(data);
  writePendingCheckoutSessionId(storage, sessionId);
  const clientSecret = readClientSecret(data);
  const publishableKey = readPublishableKey(data);
  if (checkoutContainer || clientSecret || publishableKey) {
    if (!checkoutContainer || !clientSecret || !publishableKey) {
      throw checkoutError(CHECKOUT_EMBED_UNAVAILABLE_ERROR, "Stripe embedded checkout is not configured yet.");
    }
    const stripeCtor = await loadStripeFactory({ documentRef, stripeFactory, stripeJsUrl });
    if (typeof stripeCtor !== "function") {
      throw checkoutError(CHECKOUT_EMBED_UNAVAILABLE_ERROR, "Stripe embedded checkout is not available right now.");
    }
    const stripe = stripeCtor(publishableKey);
    if (!stripe || typeof stripe.initEmbeddedCheckout !== "function") {
      throw checkoutError(CHECKOUT_EMBED_UNAVAILABLE_ERROR, "Stripe embedded checkout is not available right now.");
    }
    let embeddedCheckout = null;
    embeddedCheckout = await stripe.initEmbeddedCheckout({
      clientSecret,
      onComplete: async () => {
        const fulfillment = await fulfillReturnedPremiumCheckout({
          account: session,
          checkoutFulfillmentEndpoint: "",
          fetchImpl,
          locationRef,
          storage,
          sessionId,
        });
        if (typeof onComplete === "function") await onComplete(fulfillment);
      },
    });
    if (!embeddedCheckout || typeof embeddedCheckout.mount !== "function") {
      throw checkoutError(CHECKOUT_EMBED_UNAVAILABLE_ERROR, "Stripe embedded checkout is not available right now.");
    }
    embeddedCheckout.mount(checkoutContainer);
    return {
      embedded: true,
      checkout: embeddedCheckout,
      sessionId,
      clientSecret,
      publishableKey,
      response: data,
    };
  }

  const checkoutUrl = readCheckoutUrl(data);
  if (!checkoutUrl) {
    throw checkoutError(CHECKOUT_RESPONSE_INVALID_ERROR, "Stripe checkout did not return a redirect URL.");
  }
  if (typeof locationRef?.assign === "function") {
    locationRef.assign(checkoutUrl);
  } else if (locationRef) {
    locationRef.href = checkoutUrl;
  }
  return { url: checkoutUrl, response: data };
}

export async function fulfillReturnedPremiumCheckout({
  account = {},
  checkoutFulfillmentEndpoint = "",
  fetchImpl = defaultFetchImpl(),
  locationRef = defaultLocationRef(),
  storage = defaultStorageRef(),
  sessionId = checkoutSessionIdFromReturnUrl(locationRef, storage),
} = {}) {
  const cleanSessionId = cleanText(sessionId, 200);
  if (!cleanSessionId) return null;
  const session = normalizeFactoryAccountSession(account);
  if (!session.token) return null;
  const endpoint = checkoutFulfillmentEndpointUrl({
    endpoint: checkoutFulfillmentEndpoint,
    currentHref: locationRef?.href,
  });
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({ sessionId: cleanSessionId }),
  });
  const data = await readJson(response);
  if (response?.ok) clearPendingCheckoutSessionId(storage);
  return response?.ok ? data : null;
}

export function premiumCheckoutErrorMessage(error) {
  if (error?.code === CHECKOUT_OFFER_INVALID_ERROR) return "That shop item cannot be sent to checkout.";
  if (error?.code === CHECKOUT_RESPONSE_INVALID_ERROR) return "Stripe checkout did not return a redirect URL.";
  if (error?.code === CHECKOUT_EMBED_UNAVAILABLE_ERROR) return "Stripe embedded checkout is not configured yet.";
  return "Stripe checkout is not configured yet.";
}
