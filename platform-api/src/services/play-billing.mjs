// Google Play purchase verification for the packaged Tactical Arena Android app.
//
// The server half of src/platform/playBillingClient.js in the game. Same trust model as
// the Stripe path in payments.mts, and for the same reason: the client says only which
// Play PRODUCT it bought and hands over an opaque purchase token. This module re-resolves
// that product against the server's own catalog, asks Google whether the token is real and
// paid, and only then grants. Nothing the client sends decides what is granted.
//
// Ordering matters on the client side too — it does not acknowledge or consume the purchase
// until this endpoint returns ok. Google auto-refunds anything left unacknowledged for three
// days, so every failure below leaves the player made whole rather than charged for nothing.
import { createHash, createSign } from "node:crypto";
import { getConsumableOffers } from "./consumable-catalog.mjs";
import { SKIN_CATALOG, UNIT_CATALOG, resolveTacticalArenaPremiumOffer } from "./payments.mjs";
const TACTICAL_ARENA_GAME_SLUG = "tactical-arena";
const ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
export const DEFAULT_PLAY_PACKAGE_NAME = "com.jayarcade.tacticalarena";
// Google's purchases.products resource: 0 purchased, 1 cancelled, 2 pending.
const PURCHASE_STATE_PURCHASED = 0;
// Mirrors src/platform/playProducts.js in the game. Play product ids allow only
// [a-z0-9._], so the game's hyphenated SKUs are mapped hyphen -> underscore. The mapping
// is one-directional by design; this module inverts it by indexing the catalog, never by
// transforming a client-supplied string back into a SKU.
const PLAY_PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9._]*$/;
export function toPlayProductId(sku) {
    const raw = typeof sku === "string" ? sku.trim().toLowerCase() : "";
    if (!raw)
        return "";
    const mapped = raw.replace(/-/g, "_");
    return PLAY_PRODUCT_ID_PATTERN.test(mapped) ? mapped : "";
}
function cleanText(value, maxLength = 200) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function playError(statusCode, error) {
    return { ok: false, statusCode, error };
}
function skinPackIds() {
    return [...new Set(SKIN_CATALOG.map((skin) => cleanText(skin.packId, 120)).filter(Boolean))];
}
function catalogOfferInputs() {
    return [
        ...UNIT_CATALOG.map((unit) => ({ kind: "unit", sku: unit.sku, type: unit.type })),
        ...SKIN_CATALOG.map((skin) => ({ kind: "skin", sku: skin.sku, type: skin.type, slug: skin.slug })),
        ...skinPackIds().map((packId) => ({ kind: "skin-pack", sku: `ta.skinpack.${packId}`, packId })),
        ...getConsumableOffers().map((item) => ({ kind: "consumable", sku: item.sku, id: item.id })),
    ];
}
function buildPlayProductIndex() {
    const byProductId = new Map();
    const ambiguous = new Set();
    for (const offer of catalogOfferInputs()) {
        const productId = toPlayProductId(offer.sku);
        // A SKU with no legal Play id was never published, so it can never be purchased.
        if (!productId)
            continue;
        if (byProductId.has(productId)) {
            // Two catalog entries collapsing onto one Play id makes "what did they buy?"
            // unanswerable. Refuse to guess: mark it and let resolution decline the grant.
            ambiguous.add(productId);
            process.stderr.write(`[play-billing] ambiguous Play product id '${productId}' — purchases of it will be refused\n`);
            continue;
        }
        byProductId.set(productId, Object.freeze(offer));
    }
    return { byProductId, ambiguous };
}
let productIndex = null;
function index() {
    if (!productIndex)
        productIndex = buildPlayProductIndex();
    return productIndex;
}
// Every Play product id the catalog publishes. Used by tests and by the product-sync tooling
// to prove the store and the server agree on what exists.
export function listPlayProductIds() {
    return [...index().byProductId.keys()].sort();
}
export function listAmbiguousPlayProductIds() {
    return [...index().ambiguous].sort();
}
// Resolves a client-supplied Play product id to the offer input the server will price.
// Returns null for anything not in the catalog or ambiguous — the caller must not grant.
export function resolvePlayProductOffer(productId) {
    const id = cleanText(productId, 200).toLowerCase();
    if (!id || index().ambiguous.has(id))
        return null;
    return index().byProductId.get(id) || null;
}
// --- service-account auth ----------------------------------------------------
function parseServiceAccountKey(value) {
    if (value && typeof value === "object")
        return value;
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw)
        return null;
    // Railway env vars mangle embedded newlines, so a base64-encoded key is accepted too.
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : null;
    }
    catch {
        return null;
    }
}
const base64url = (value) => Buffer.from(value).toString("base64url");
// Exchanges a service-account key for an androidpublisher access token, caching it until
// shortly before expiry. Node signs RS256 natively, so this needs no Google SDK — the same
// technique the product-sync script uses.
export function createPlayAccessTokenProvider(options = {}) {
    const key = parseServiceAccountKey(options.serviceAccountKey);
    const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch;
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    if (!key?.client_email || !key?.private_key || typeof fetchImpl !== "function") {
        return async () => "";
    }
    let cachedToken = "";
    let cachedUntilMs = 0;
    let inFlight = null;
    async function requestToken() {
        const issuedAtSeconds = Math.floor(now() / 1000);
        const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
        const claims = base64url(JSON.stringify({
            iss: key.client_email,
            scope: ANDROID_PUBLISHER_SCOPE,
            aud: GOOGLE_TOKEN_URL,
            iat: issuedAtSeconds,
            exp: issuedAtSeconds + 3600,
        }));
        const signer = createSign("RSA-SHA256");
        signer.update(`${header}.${claims}`);
        const assertion = `${header}.${claims}.${base64url(signer.sign(key.private_key))}`;
        const response = await fetchImpl(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion,
            }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.access_token) {
            process.stderr.write(`[play-billing] token exchange failed: ${body?.error_description || body?.error || response.status}\n`);
            return "";
        }
        const lifetimeSeconds = Number(body.expires_in);
        const ttlMs = (Number.isFinite(lifetimeSeconds) && lifetimeSeconds > 0 ? lifetimeSeconds : 3600) * 1000;
        cachedToken = String(body.access_token);
        // Retire it a minute early so a token never expires mid-verification.
        cachedUntilMs = now() + Math.max(0, ttlMs - 60000);
        return cachedToken;
    }
    return async function getPlayAccessToken() {
        if (cachedToken && now() < cachedUntilMs)
            return cachedToken;
        if (!inFlight) {
            inFlight = requestToken()
                .catch((err) => {
                process.stderr.write(`[play-billing] token exchange error: ${err?.message || err}\n`);
                return "";
            })
                .finally(() => {
                inFlight = null;
            });
        }
        return inFlight;
    };
}
// --- Google verification -----------------------------------------------------
// Asks Google what it knows about a purchase token. Returns the raw purchases.products
// resource on success; the caller decides whether its state is good enough to grant.
export async function fetchPlayPurchase(params = {}) {
    const packageName = cleanText(params.packageName, 200) || DEFAULT_PLAY_PACKAGE_NAME;
    const productId = cleanText(params.productId, 200);
    const purchaseToken = cleanText(params.purchaseToken, 4000);
    const accessToken = cleanText(params.accessToken, 4000);
    const fetchImpl = typeof params.fetchImpl === "function" ? params.fetchImpl : globalThis.fetch;
    if (!productId || !purchaseToken)
        return playError(400, "invalid_purchase_request");
    if (!accessToken)
        return playError(503, "play_verification_not_configured");
    if (typeof fetchImpl !== "function")
        return playError(503, "fetch_not_configured");
    const url = `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}`
        + `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    let response;
    try {
        response = await fetchImpl(url, { method: "GET", headers: { authorization: `Bearer ${accessToken}` } });
    }
    catch (err) {
        process.stderr.write(`[play-billing] verification request failed: ${err?.message || err}\n`);
        return playError(502, "play_verification_failed");
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 404 || response.status === 400) {
        // Google does not recognise this product/token pair. Not retryable — the client should
        // stop rather than resubmit on every boot. Logged because a 400 can also mean we sent a
        // malformed request, which is our bug and would otherwise look like a bad token.
        process.stderr.write(`[play-billing] purchase not recognised (${response.status}): ${cleanText(body?.error?.message, 200)}\n`);
        return playError(404, "purchase_not_found");
    }
    if (!response.ok) {
        process.stderr.write(`[play-billing] verification returned ${response.status}: ${cleanText(body?.error?.message, 200)}\n`);
        return playError(502, "play_verification_failed");
    }
    return { ok: true, purchase: body || {} };
}
// --- fulfillment -------------------------------------------------------------
function premiumClaimKind(offerKind) {
    if (offerKind === "unit")
        return "premium-unit-purchase";
    if (offerKind === "consumable")
        return "premium-consumable-purchase";
    return "premium-skin-purchase";
}
function purchaseTokenHash(purchaseToken) {
    return createHash("sha256").update(purchaseToken).digest("hex");
}
// A stable, storage-safe id for one Play transaction. Google's orderId is the natural key;
// the token hash is the fallback for the rare purchase that arrives without one. Both are
// well under the 200-char claim_id limit, unlike the raw token.
function playClaimId(orderId, tokenHash) {
    return orderId ? `play-purchase:${orderId}` : `play-purchase:token:${tokenHash.slice(0, 32)}`;
}
/**
 * Verify a Google Play purchase and grant what it bought.
 *
 * Deliberately idempotent at three layers, because boot recovery resubmits tokens:
 *   - the claim row is unique on (player, game, claimId), so a replay grants nothing extra;
 *   - a token already redeemed by ANOTHER account is refused outright;
 *   - a token already on one of OUR claim rows still returns ok, so the client can finish
 *     acknowledging a purchase whose grant succeeded but whose settle call failed.
 *
 * A purchase of something the player already owns, on a token we have never seen, is the one
 * case that deliberately fails: see the comment at the already-owned branch.
 */
export async function fulfillPlayPurchase(params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const body = params.body && typeof params.body === "object" ? params.body : {};
    const gameSlug = cleanText(body.gameSlug || TACTICAL_ARENA_GAME_SLUG, 80);
    const productId = cleanText(body.productId, 200).toLowerCase();
    const purchaseToken = cleanText(body.purchaseToken, 4000);
    if (!playerId || gameSlug !== TACTICAL_ARENA_GAME_SLUG || !productId || !purchaseToken) {
        return playError(400, "invalid_purchase_request");
    }
    const offerInput = resolvePlayProductOffer(productId);
    if (!offerInput)
        return playError(400, "offer_not_found");
    const recordGameProgressClaim = typeof params.recordGameProgressClaim === "function" ? params.recordGameProgressClaim : null;
    if (!recordGameProgressClaim)
        return playError(503, "fulfillment_not_configured");
    const getGameProgress = typeof params.getGameProgress === "function" ? params.getGameProgress : async () => null;
    const getAccessToken = typeof params.getAccessToken === "function" ? params.getAccessToken : async () => "";
    const accessToken = await getAccessToken();
    if (!accessToken)
        return playError(503, "play_verification_not_configured");
    const verified = await fetchPlayPurchase({
        packageName: params.packageName,
        productId,
        purchaseToken,
        accessToken,
        fetchImpl: params.fetchImpl,
    });
    if (!verified.ok)
        return verified;
    const purchase = verified.purchase || {};
    const purchaseState = Number(purchase.purchaseState);
    if (purchaseState !== PURCHASE_STATE_PURCHASED) {
        // Pending (2) resolves later and the client retries on the next boot; cancelled (1) never will.
        return playError(409, purchaseState === 2 ? "purchase_pending" : "purchase_not_completed");
    }
    const tokenHash = purchaseTokenHash(purchaseToken);
    const findPlayPurchaseClaim = typeof params.findPlayPurchaseClaim === "function" ? params.findPlayPurchaseClaim : null;
    // Looked up once and reused: it answers both "has another account already redeemed this?"
    // and, further down, "is this our own grant coming back for a retry?"
    const existingClaim = findPlayPurchaseClaim ? await findPlayPurchaseClaim({ purchaseTokenHash: tokenHash }) : null;
    if (existingClaim?.playerId && existingClaim.playerId !== playerId) {
        process.stderr.write(`[play-billing] refused replay of a purchase already redeemed by another account (player=${playerId})\n`);
        return playError(409, "purchase_already_redeemed");
    }
    const consume = offerInput.kind === "consumable";
    const progress = await getGameProgress(playerId, gameSlug);
    const resolved = await resolveTacticalArenaPremiumOffer(offerInput, progress || {});
    if (!resolved.ok && resolved.error !== "offer_already_owned")
        return resolved;
    const entitlementIds = resolved.ok ? resolved.offer.entitlementIds : [];
    const inventoryItems = resolved.ok ? (resolved.offer.inventoryItems || []) : [];
    if (!entitlementIds.length && !inventoryItems.length) {
        // Nothing left to grant. Two very different situations look identical from here, and
        // they need opposite answers — the discriminator is whether THIS token is already on a
        // claim row of ours.
        //
        //   Our claim exists  -> the grant landed and only the acknowledge failed. Boot recovery
        //                        is retrying. Say ok so the client can finally settle it;
        //                        refusing would let Google auto-refund an item the player has.
        //
        //   No claim          -> they just paid for something they already owned (bought it on
        //                        the web via Stripe, or on another device while this client held
        //                        stale ownership). Play does not know about non-Play ownership,
        //                        so it sold it again. Refuse, and the client leaves the purchase
        //                        unacknowledged — Google auto-refunds it within three days. That
        //                        is the same safety net every other failure path here relies on,
        //                        so it needs no refund API access and cannot double-refund.
        if (existingClaim?.playerId === playerId || (!findPlayPurchaseClaim && resolved.error === "offer_already_owned")) {
            return { ok: true, alreadyProcessed: true, consume, entitlements: [], progress: progress || null };
        }
        process.stderr.write(`[play-billing] duplicate purchase of an owned offer; leaving it unsettled to auto-refund (player=${playerId}, product=${productId})\n`);
        return playError(409, "offer_already_owned");
    }
    const orderId = cleanText(purchase.orderId || body.orderId, 200);
    const recorded = await recordGameProgressClaim({
        playerId,
        gameSlug,
        claimId: playClaimId(orderId, tokenHash),
        kind: premiumClaimKind(resolved.offer.kind),
        sourceId: orderId || tokenHash.slice(0, 32),
        payload: {
            offerKind: resolved.offer.kind,
            sku: cleanText(resolved.offer.sku, 200),
            entitlementIds,
            inventoryItems,
            amountTotal: Number(resolved.offer.amountCents) || 0,
            currency: cleanText(resolved.offer.currency, 10).toLowerCase(),
            // Provenance for later refund/void handling. The raw purchase token is never stored:
            // the hash is enough to match a voided token back to this grant.
            playProductId: productId,
            playOrderId: orderId,
            playPurchaseTokenHash: tokenHash,
        },
    });
    if (!recorded?.ok)
        return playError(502, "fulfillment_failed");
    return {
        ok: true,
        alreadyProcessed: Boolean(recorded.alreadyProcessed),
        consume,
        entitlements: entitlementIds,
        progress: recorded.progress || null,
    };
}
