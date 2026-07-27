// Google Play purchase flow for the packaged Android app.
//
// Mirrors premiumCheckoutClient.js (the Stripe path) in shape and in trust model:
// the client never grants anything. The order is deliberate and load-bearing —
//
//   1. Play takes the money and hands back a purchase token.
//   2. The token goes to platform-api, which verifies it with Google and grants
//      the entitlement.
//   3. ONLY THEN do we acknowledge (durable) or consume (consumable).
//
// Step 3 must not happen before step 2 succeeds. Google auto-refunds any purchase
// left unacknowledged for three days, so a failed grant refunds the player instead
// of taking their money and delivering nothing. Every failure path below therefore
// leaves the purchase untouched.
//
// All I/O is injected so the whole flow is testable without a device or a store.

import { fetchGameProgressSnapshot } from "./gameProgressClient.js";
import { isOfferFullyOwned } from "./offerOwnership.js";
import { playProductIdForOffer } from "./playProducts.js";

export const PLAY_PURCHASE_CANCELLED = "PURCHASE_CANCELLED";

const ERROR_COPY = Object.freeze({
  PURCHASE_CANCELLED: "Purchase cancelled.",
  PURCHASE_FAILED: "Google Play could not complete that purchase. Please try again.",
  PURCHASE_IN_PROGRESS: "Another purchase is still finishing. Give it a moment and try again.",
  PRODUCT_NOT_FOUND: "That item is not available in the store right now.",
  LAUNCH_FAILED: "Google Play could not open the purchase screen. Please try again.",
  BILLING_UNAVAILABLE: "Google Play billing is unavailable. Make sure the Play Store is up to date.",
  QUERY_FAILED: "Could not reach Google Play. Check your connection and try again.",
  BAD_REQUEST: "That shop item cannot be purchased right now.",
  verification_failed: "We could not confirm that purchase. You have not been charged for it.",
  offer_invalid: "That shop item cannot be purchased right now.",
  bridge_missing: "Purchases are unavailable in this build.",
  // Stopped by the preflight: the purchase sheet never opened, so there is no charge.
  offer_already_owned: "You already own this, so there is nothing to buy. You have not been charged.",
  // The backstop, for the narrow race where ownership changed between the preflight and
  // the purchase completing. Google took the money; we decline the grant and leave the
  // purchase unacknowledged, which makes Google refund it — hence the promise in this copy.
  offer_already_owned_refunding: "You already own this. Google Play will refund the charge automatically within a few days.",
  purchase_already_redeemed: "That purchase has already been applied to a different account.",
});

const GENERIC = "Something went wrong with that purchase. Please try again.";

export function playPurchaseErrorMessage(code) {
  const key = typeof code === "string" ? code : "";
  return ERROR_COPY[key] || GENERIC;
}

function bridgeFrom(plugins) {
  const source = plugins ?? globalThis.Capacitor?.Plugins;
  const bridge = source && typeof source === "object" ? source.PlayBilling : null;
  return bridge && typeof bridge.purchase === "function" ? bridge : null;
}

function errorCode(error) {
  return typeof error?.code === "string" ? error.code : typeof error?.message === "string" ? error.message : "";
}

// Durable goods stay owned; consumables must be consumed to be re-purchasable.
// The server decides (it owns the catalog); the offer kind is only a fallback for
// recovery, where we may not have the original offer to hand.
function shouldConsume(verification, offer, productId) {
  if (typeof verification?.consume === "boolean") return verification.consume;
  if (offer?.kind === "consumable") return true;
  return typeof productId === "string" && productId.startsWith("ta.consumable.");
}

async function settle(bridge, { consume, purchaseToken }) {
  if (consume) await bridge.consume({ purchaseToken });
  else await bridge.acknowledge({ purchaseToken });
}

// Ownership preflight, run BEFORE Google's purchase sheet opens.
//
// This is the only place a duplicate purchase can be stopped without money moving. The
// Stripe rail gets this for free — the server refuses to create a checkout session for an
// owned offer, so nothing is ever charged. Play is inverted: Google takes the money and
// hands us a token, and the server only sees the purchase afterwards. By then the only
// remedy is to decline the grant and let Google auto-refund, which works but costs the
// player several days.
//
// So: ask the server what they own first, and never open the sheet for something redundant.
//
// Fails OPEN. If the snapshot cannot be fetched — offline, server down, signed out — the
// purchase proceeds: a network blip must not block a legitimate sale, and the server-side
// refusal plus auto-refund is still behind it. Note that an unreachable server also means
// the purchase could not have been verified anyway.
export function createOwnedOfferGuard({ fetchSnapshot = fetchGameProgressSnapshot } = {}) {
  return async function assertOfferPurchasable({ offer, account = null } = {}) {
    let snapshot = null;
    try {
      snapshot = await fetchSnapshot({ account });
    } catch {
      return { owned: false, snapshot: null, checked: false };
    }
    if (!snapshot) return { owned: false, snapshot: null, checked: false };
    return { owned: isOfferFullyOwned(offer, snapshot), snapshot, checked: true };
  };
}

export async function purchaseWithPlay(offer, { plugins = null, verifyPurchase, account = null, assertOfferPurchasable = null } = {}) {
  const bridge = bridgeFrom(plugins);
  if (!bridge) return { ok: false, error: "bridge_missing" };

  const productId = playProductIdForOffer(offer);
  if (!productId) return { ok: false, error: "offer_invalid" };

  const guard = assertOfferPurchasable ?? createOwnedOfferGuard();
  const verdict = await guard({ offer, account });
  if (verdict?.owned) {
    // Nothing has been charged: Google's sheet was never opened. The snapshot rides along
    // so the caller can correct the shop, which was showing this as unowned a moment ago.
    return { ok: false, error: "offer_already_owned", blocked: true, snapshot: verdict.snapshot ?? null };
  }

  let purchase;
  try {
    const response = await bridge.purchase({ productId });
    purchase = response?.purchases?.[0] ?? null;
  } catch (error) {
    const code = errorCode(error);
    return { ok: false, error: code || "PURCHASE_FAILED", cancelled: code === PLAY_PURCHASE_CANCELLED };
  }
  if (!purchase?.purchaseToken) return { ok: false, error: "PURCHASE_FAILED" };

  let verification;
  try {
    verification = await verifyPurchase({
      productId,
      purchaseToken: purchase.purchaseToken,
      orderId: purchase.orderId ?? null,
      offer: offer ?? null,
      account,
    });
  } catch {
    // Deliberately NOT acknowledged: Google refunds it, the player is made whole.
    return { ok: false, error: "verification_failed", purchaseToken: purchase.purchaseToken };
  }

  if (!verification?.ok) {
    // Ownership changed between the preflight and the sheet closing — bought on another
    // device mid-flow. Distinguished from the preflight block because this one WAS charged,
    // and the player needs to be told a refund is coming rather than that nothing happened.
    const error = verification?.error === "offer_already_owned"
      ? "offer_already_owned_refunding"
      : verification?.error || "verification_failed";
    return { ok: false, error, purchaseToken: purchase.purchaseToken };
  }

  try {
    await settle(bridge, {
      consume: shouldConsume(verification, offer, productId),
      purchaseToken: purchase.purchaseToken,
    });
  } catch {
    // The grant already happened server-side, so the player has their item. A failed
    // acknowledge is retried by recoverPendingPlayPurchases() on the next boot.
  }

  return { ok: true, productId, purchaseToken: purchase.purchaseToken, entitlements: verification.entitlements ?? [] };
}

// Purchases Google has recorded that we may never have granted — the app was killed
// mid-flow, or the grant call failed. Runs on boot so nothing is paid for but
// undelivered. Safe to call repeatedly: the server grant is idempotent and an
// already-settled purchase stops appearing here.
export async function recoverPendingPlayPurchases({ plugins = null, verifyPurchase, account = null } = {}) {
  const bridge = bridgeFrom(plugins);
  if (!bridge || typeof bridge.getPendingPurchases !== "function") {
    return { skipped: true, recovered: 0, failed: 0 };
  }

  let pending = [];
  try {
    const response = await bridge.getPendingPurchases();
    pending = Array.isArray(response?.purchases) ? response.purchases : [];
  } catch {
    return { skipped: true, recovered: 0, failed: 0 };
  }

  let recovered = 0;
  let failed = 0;

  for (const purchase of pending) {
    const productId = purchase?.productIds?.[0] ?? null;
    if (!purchase?.purchaseToken || !productId) {
      failed += 1;
      continue;
    }
    try {
      const verification = await verifyPurchase({
        productId,
        purchaseToken: purchase.purchaseToken,
        orderId: purchase.orderId ?? null,
        offer: null,
        account,
      });
      if (!verification?.ok) {
        failed += 1;
        continue;
      }
      await settle(bridge, {
        consume: shouldConsume(verification, null, productId),
        purchaseToken: purchase.purchaseToken,
      });
      recovered += 1;
    } catch {
      failed += 1;
    }
  }

  return { skipped: false, recovered, failed };
}

// --- server verification -----------------------------------------------------
//
// Follows premiumCheckoutClient.js: a direct fetch to the platform path rather than
// a named method on the shared API client, so the whole Play flow stays inside the
// game's own platform layer.

export const PLATFORM_PLAY_PURCHASE_PATH = "/payments/tactical-arena/play-purchases";

function configuredPlatformBaseUrl() {
  const raw = globalThis.__JGF_PLATFORM_API_URL__;
  return typeof raw === "string" ? raw.replace(/\/+$/, "") : "";
}

export function playPurchaseEndpointUrl({ endpoint = "" } = {}) {
  if (typeof endpoint === "string" && endpoint.trim()) return endpoint.trim();
  const base = configuredPlatformBaseUrl();
  return base ? `${base}${PLATFORM_PLAY_PURCHASE_PATH}` : PLATFORM_PLAY_PURCHASE_PATH;
}

// Posts a purchase token for server-side verification. The server checks it against
// Google, resolves the product from its OWN catalog, grants the entitlement, and
// returns the fresh progress snapshot — the client never says what it bought.
export function createPlayPurchaseVerifier({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  endpoint = "",
  gameSlug = "tactical-arena",
} = {}) {
  return async function verifyPlayPurchase({ productId, purchaseToken, orderId, account }) {
    if (typeof fetchImpl !== "function") return { ok: false, error: "verification_failed" };

    const headers = { "content-type": "application/json; charset=utf-8" };
    const token = typeof account?.token === "string" ? account.token : "";
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetchImpl(playPurchaseEndpointUrl({ endpoint }), {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ gameSlug, productId, purchaseToken, orderId }),
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) return { ok: false, error: body?.error || "verification_failed" };
    return {
      ok: true,
      consume: body?.consume === true,
      entitlements: Array.isArray(body?.entitlements) ? body.entitlements : [],
      progress: body?.progress ?? null,
    };
  };
}
