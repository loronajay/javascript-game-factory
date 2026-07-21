import { createHmac, timingSafeEqual } from "node:crypto";
const STRIPE_API_VERSION = "2026-06-24.dahlia";
const STRIPE_CHECKOUT_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";
const TACTICAL_ARENA_GAME_SLUG = "tactical-arena";
const MARKETPLACE_MODULE_URL = new URL("../../../games/tactical-arena/src/progression/marketplace.js", import.meta.url).href;
let marketplaceModulePromise = null;
const EMPTY_STORAGE = Object.freeze({
    length: 0,
    clear() { },
    getItem() {
        return null;
    },
    key() {
        return null;
    },
    setItem() { },
    removeItem() { },
});
async function tacticalArenaMarketplace() {
    if (!marketplaceModulePromise) {
        const importModule = Function("specifier", "return import(specifier)");
        marketplaceModulePromise = importModule(MARKETPLACE_MODULE_URL);
    }
    return marketplaceModulePromise;
}
function cleanText(value, maxLength = 500) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function cleanUrl(value) {
    const text = cleanText(value, 1000);
    if (!text)
        return "";
    try {
        const url = new URL(text);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    }
    catch {
        return "";
    }
}
function fallbackCheckoutUrl(appBaseUrl, status) {
    const base = cleanText(appBaseUrl, 1000).replace(/\/+$/, "") || "https://loronajay.github.io/javascript-game-factory";
    const url = new URL(`${base}/games/tactical-arena/index.html`);
    url.searchParams.set("checkout", status);
    if (status === "success")
        url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    return url.href;
}
function ownedEntitlements(progress) {
    const rows = Array.isArray(progress?.entitlements) ? progress.entitlements : [];
    return new Set(rows.map((row) => cleanText(row?.entitlementId, 200)).filter(Boolean));
}
function moneyCents(value) {
    const cents = Math.floor(Number(value));
    return Number.isFinite(cents) && cents > 0 ? cents : 0;
}
function stripeError(statusCode, error) {
    return { ok: false, statusCode, error };
}
function appendMetadata(form, metadata) {
    for (const [key, value] of Object.entries(metadata)) {
        if (!value)
            continue;
        form.append(`metadata[${key}]`, value.slice(0, 500));
    }
}
export async function resolveTacticalArenaPremiumOffer(offerInput, progress = {}) {
    const offer = offerInput && typeof offerInput === "object" ? offerInput : {};
    const kind = cleanText(offer.kind, 40);
    const owned = ownedEntitlements(progress);
    if (kind === "skin") {
        const { getSkinOffer } = await tacticalArenaMarketplace();
        const type = cleanText(offer.type, 80);
        const slug = cleanText(offer.slug, 120);
        const skinOffer = getSkinOffer(type, slug, EMPTY_STORAGE);
        if (!skinOffer || skinOffer.kind !== "skin") {
            return stripeError(400, "offer_not_found");
        }
        const requestedSku = cleanText(offer.sku, 200);
        if (requestedSku && requestedSku !== skinOffer.sku) {
            return stripeError(400, "offer_mismatch");
        }
        if (owned.has(skinOffer.entitlementId)) {
            return stripeError(409, "offer_already_owned");
        }
        return {
            ok: true,
            offer: {
                kind: "skin",
                sku: skinOffer.sku,
                name: `${skinOffer.name} ${skinOffer.unitName} Skin`,
                amountCents: moneyCents(skinOffer.price?.cents),
                currency: cleanText(skinOffer.price?.currency, 10).toLowerCase() || "usd",
                entitlementIds: [skinOffer.entitlementId],
                metadata: {
                    offerKind: "skin",
                    type: skinOffer.type,
                    slug: skinOffer.slug,
                },
            },
        };
    }
    if (kind === "skin-pack") {
        const { getSkinPackOffer } = await tacticalArenaMarketplace();
        const packId = cleanText(offer.packId, 120);
        const skinPack = getSkinPackOffer(packId, EMPTY_STORAGE);
        if (!skinPack || skinPack.kind !== "skin-pack") {
            return stripeError(400, "offer_not_found");
        }
        const requestedSku = cleanText(offer.sku, 200);
        if (requestedSku && requestedSku !== skinPack.sku) {
            return stripeError(400, "offer_mismatch");
        }
        const unownedSkins = skinPack.skins.filter((skin) => !owned.has(skin.entitlementId));
        if (!unownedSkins.length) {
            return stripeError(409, "offer_already_owned");
        }
        const individualPriceCents = skinPack.skins.reduce((sum, skin) => sum + moneyCents(skin.price?.cents), 0);
        const unownedPriceCents = unownedSkins.reduce((sum, skin) => sum + moneyCents(skin.price?.cents), 0);
        const amountCents = individualPriceCents > 0
            ? Math.max(1, Math.round(moneyCents(skinPack.price?.cents) * (unownedPriceCents / individualPriceCents)))
            : moneyCents(skinPack.price?.cents);
        return {
            ok: true,
            offer: {
                kind: "skin-pack",
                sku: skinPack.sku,
                name: skinPack.name,
                amountCents,
                currency: cleanText(skinPack.price?.currency, 10).toLowerCase() || "usd",
                entitlementIds: unownedSkins.map((skin) => skin.entitlementId),
                metadata: {
                    offerKind: "skin-pack",
                    packId: skinPack.packId,
                },
            },
        };
    }
    return stripeError(400, "unsupported_offer_kind");
}
export async function createTacticalArenaCheckoutSession(params = {}) {
    const stripeApiKey = cleanText(params.stripeApiKey, 500);
    if (!stripeApiKey)
        return stripeError(503, "checkout_not_configured");
    const playerId = cleanText(params.playerId, 120);
    const body = params.body && typeof params.body === "object" ? params.body : {};
    const gameSlug = cleanText(body.gameSlug || TACTICAL_ARENA_GAME_SLUG, 80);
    if (!playerId || gameSlug !== TACTICAL_ARENA_GAME_SLUG) {
        return stripeError(400, "invalid_checkout_request");
    }
    const getGameProgress = typeof params.getGameProgress === "function" ? params.getGameProgress : async () => null;
    const progress = await getGameProgress(playerId, gameSlug);
    const resolved = await resolveTacticalArenaPremiumOffer(body.offer, progress || {});
    if (!resolved.ok)
        return resolved;
    const fetchImpl = typeof params.fetchImpl === "function" ? params.fetchImpl : globalThis.fetch;
    if (typeof fetchImpl !== "function")
        return stripeError(503, "fetch_not_configured");
    const premiumOffer = resolved.offer;
    const successUrl = cleanUrl(body.successUrl) || fallbackCheckoutUrl(params.appBaseUrl, "success");
    const cancelUrl = cleanUrl(body.cancelUrl) || fallbackCheckoutUrl(params.appBaseUrl, "cancel");
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", successUrl);
    form.set("cancel_url", cancelUrl);
    form.set("client_reference_id", playerId);
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", premiumOffer.currency);
    form.set("line_items[0][price_data][unit_amount]", String(premiumOffer.amountCents));
    form.set("line_items[0][price_data][product_data][name]", premiumOffer.name);
    form.set("line_items[0][price_data][product_data][metadata][sku]", premiumOffer.sku);
    form.set("line_items[0][price_data][product_data][metadata][gameSlug]", gameSlug);
    appendMetadata(form, {
        gameSlug,
        playerId,
        sku: premiumOffer.sku,
        ...premiumOffer.metadata,
    });
    const response = await fetchImpl(STRIPE_CHECKOUT_SESSIONS_URL, {
        method: "POST",
        headers: {
            authorization: `Bearer ${stripeApiKey}`,
            "content-type": "application/x-www-form-urlencoded",
            "stripe-version": STRIPE_API_VERSION,
        },
        body: form,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok)
        return stripeError(502, json?.error?.code || "stripe_checkout_failed");
    const url = cleanUrl(json?.url);
    return url ? { ok: true, url, sessionId: cleanText(json?.id, 200) } : stripeError(502, "stripe_checkout_failed");
}
async function readRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
function parseStripeSignature(signature) {
    const parsed = {};
    for (const part of signature.split(",")) {
        const index = part.indexOf("=");
        if (index <= 0)
            continue;
        const key = part.slice(0, index);
        const value = part.slice(index + 1);
        parsed[key] = [...(parsed[key] || []), value];
    }
    return parsed;
}
export function verifyStripeSignature(params = {}) {
    const payload = Buffer.isBuffer(params.payload) ? params.payload : Buffer.from(String(params.payload || ""));
    const signature = cleanText(params.signature, 2000);
    const secret = cleanText(params.secret, 500);
    if (!payload.length || !signature || !secret)
        return false;
    const parsed = parseStripeSignature(signature);
    const timestamp = Number.parseInt(parsed.t?.[0] || "", 10);
    const toleranceSeconds = Number.isFinite(Number(params.toleranceSeconds)) ? Number(params.toleranceSeconds) : 300;
    const nowSeconds = Number.isFinite(Number(params.nowSeconds)) ? Number(params.nowSeconds) : Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds)
        return false;
    const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), payload]);
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return (parsed.v1 || []).some((candidate) => {
        const candidateBuffer = Buffer.from(candidate, "hex");
        return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
    });
}
export async function fulfillTacticalArenaCheckoutSession(params = {}) {
    const session = params.session && typeof params.session === "object" ? params.session : {};
    const metadata = session.metadata && typeof session.metadata === "object" ? session.metadata : {};
    const gameSlug = cleanText(metadata.gameSlug, 80);
    const playerId = cleanText(metadata.playerId || session.client_reference_id, 120);
    const sessionId = cleanText(session.id, 200);
    if (gameSlug !== TACTICAL_ARENA_GAME_SLUG || !playerId || !sessionId) {
        return stripeError(400, "invalid_checkout_session");
    }
    const getGameProgress = typeof params.getGameProgress === "function" ? params.getGameProgress : async () => null;
    const recordGameProgressClaim = typeof params.recordGameProgressClaim === "function" ? params.recordGameProgressClaim : null;
    if (!recordGameProgressClaim)
        return stripeError(503, "fulfillment_not_configured");
    const offerKind = cleanText(metadata.offerKind, 40);
    const offerInput = offerKind === "skin-pack"
        ? { kind: "skin-pack", sku: metadata.sku, packId: metadata.packId }
        : { kind: "skin", sku: metadata.sku, type: metadata.type, slug: metadata.slug };
    const progress = await getGameProgress(playerId, gameSlug);
    const resolved = await resolveTacticalArenaPremiumOffer(offerInput, progress || {});
    if (!resolved.ok && resolved.error !== "offer_already_owned")
        return resolved;
    const entitlementIds = resolved.ok ? resolved.offer.entitlementIds : [];
    if (!entitlementIds.length && resolved.error === "offer_already_owned") {
        return { ok: true, alreadyProcessed: true };
    }
    return recordGameProgressClaim({
        playerId,
        gameSlug,
        claimId: `stripe-checkout:${sessionId}`,
        kind: "premium-skin-purchase",
        sourceId: sessionId,
        payload: {
            sessionId,
            offerKind,
            sku: cleanText(metadata.sku, 200),
            entitlementIds,
            amountTotal: moneyCents(session.amount_total),
            currency: cleanText(session.currency, 10).toLowerCase(),
        },
    });
}
export async function fulfillStripeWebhook(params = {}) {
    const stripeWebhookSecret = cleanText(params.stripeWebhookSecret, 500);
    if (!stripeWebhookSecret)
        return stripeError(503, "stripe_webhook_not_configured");
    const payload = await readRawBody(params.req);
    const verified = verifyStripeSignature({
        payload,
        signature: params.signature,
        secret: stripeWebhookSecret,
        nowSeconds: params.nowSeconds,
    });
    if (!verified)
        return stripeError(400, "invalid_stripe_signature");
    let event;
    try {
        event = JSON.parse(payload.toString("utf8"));
    }
    catch {
        return stripeError(400, "invalid_json");
    }
    if (event?.type !== "checkout.session.completed" && event?.type !== "checkout.session.async_payment_succeeded") {
        return { ok: true, ignored: true };
    }
    const session = event?.data?.object || {};
    if (session.payment_status && session.payment_status !== "paid") {
        return { ok: true, ignored: true };
    }
    return fulfillTacticalArenaCheckoutSession({
        session,
        getGameProgress: params.getGameProgress,
        recordGameProgressClaim: params.recordGameProgressClaim,
    });
}
