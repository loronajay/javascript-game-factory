import { createHmac, timingSafeEqual } from "node:crypto";
const STRIPE_API_VERSION = "2026-06-24.dahlia";
const STRIPE_CHECKOUT_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";
const TACTICAL_ARENA_GAME_SLUG = "tactical-arena";
const SKIN_PACK_PRICES = Object.freeze({
    "summer-vibes": 1499,
    halloween: 2499,
    arcane: 1999,
    "blood-moon": 4999,
    "void-dweller": 2499,
    "desert-warriors": 599,
    geisha: 1199,
    "riot-cop": 899,
    "southern-kingdom": 2699,
    "grim-reaper": 499,
    infernal: 499,
    medieval: 299,
    "fuck-cancer": 4999,
});
const RAW_SKIN_CATALOG = `
angel|blood-moon|299|blood-moon
angel|devilish|199|halloween
angel|dragonslayer|299|
angel|fallen|299|
angel|fuck-cancer|399|fuck-cancer
angel|raging-storm|299|
angel|sol|399|
angel|southern-kingdom|299|southern-kingdom
angel|summer-vibes|99|summer-vibes
angel|void-dweller|399|void-dweller
archer|arcane|199|arcane
archer|black-widow|299|
archer|blood-moon|299|blood-moon
archer|blood-rose|399|
archer|desert-warrior|199|desert-warriors
archer|floral|299|
archer|fuck-cancer|399|fuck-cancer
archer|geisha|399|geisha
archer|kitty-kat|199|halloween
archer|masquerade|199|
archer|nature-guardian|199|
archer|scarlet-rose|399|
archer|southern-kingdom|299|southern-kingdom
archer|summer-vibes|99|summer-vibes
archer|vampire-slayer|299|
archer|vampire|299|
archer|velvet|499|
archer|wandering|99|
big-brother|blood-moon|299|blood-moon
big-brother|fire-rescue|299|
big-brother|fuck-cancer|399|fuck-cancer
big-brother|hell-mech|299|
big-brother|junkyard-king|199|
big-brother|ruin-scavenger|299|
big-brother|summer-vibes|99|summer-vibes
blacksword|apprentice|499|
blacksword|blood-knight|299|
blacksword|blood-moon|299|blood-moon
blacksword|fuck-cancer|399|fuck-cancer
blacksword|judicator|199|
blacksword|southern-kingdom|299|southern-kingdom
blacksword|summer-vibes|99|summer-vibes
blacksword|void-dweller|399|void-dweller
clod|arcane|199|arcane
clod|blood-moon|299|blood-moon
clod|fuck-cancer|399|fuck-cancer
clod|infernal|299|infernal
clod|scarecrow|199|halloween
clod|summer-vibes|99|summer-vibes
fat-bowman|arcane|199|arcane
fat-bowman|blood-moon|299|blood-moon
fat-bowman|enchanted|299|
fat-bowman|fuck-cancer|399|fuck-cancer
fat-bowman|geisha|399|geisha
fat-bowman|gothic-warrior|299|
fat-bowman|kitty-kat|199|halloween
fat-bowman|scarlet-rose|499|
fat-bowman|southern-kingdom|299|southern-kingdom
fat-bowman|summer-vibes|99|summer-vibes
fat-bowman|tattered|99|
fat-bowman|violet|399|
fat-bowman|wandering|99|
fat-cleric|arcane|199|arcane
fat-cleric|blood-moon|299|blood-moon
fat-cleric|fuck-cancer|399|fuck-cancer
fat-cleric|gothic-warrior|299|
fat-cleric|mystic-cosplay|499|
fat-cleric|nirvana|399|
fat-cleric|southern-kingdom|299|southern-kingdom
fat-cleric|summer-vibes|99|summer-vibes
fat-cleric|sun-goddess|299|
fat-cleric|sweet-bliss-angel|199|halloween
fat-cleric|tattered|99|
fat-cleric|wandering|99|
fat-knight|arcane|199|arcane
fat-knight|blood-moon|299|blood-moon
fat-knight|franken-fatigue|199|halloween
fat-knight|fuck-cancer|399|fuck-cancer
fat-knight|gothic-warrior|299|
fat-knight|southern-kingdom|299|southern-kingdom
fat-knight|summer-vibes|99|summer-vibes
fat-knight|tattered|99|
fat-knight|wandering|99|
fat-wizard|arcane|199|arcane
fat-wizard|black-mage|199|halloween
fat-wizard|blood-moon|299|blood-moon
fat-wizard|fire-mage|299|
fat-wizard|fuck-cancer|399|fuck-cancer
fat-wizard|gothic-warrior|299|
fat-wizard|ice-mage|299|
fat-wizard|lightning-mage|299|
fat-wizard|poison-mage|299|
fat-wizard|southern-kingdom|299|southern-kingdom
fat-wizard|summer-vibes|99|summer-vibes
fat-wizard|tattered|99|
fat-wizard|void-magic|399|
fat-wizard|wandering|99|
father-time|arcane|199|arcane
father-time|blood-moon|299|blood-moon
father-time|fuck-cancer|399|fuck-cancer
father-time|steampunk-wizard|199|halloween
father-time|summer-vibes|99|summer-vibes
father-time|void-dweller|399|void-dweller
gargoyle|arcane|199|arcane
gargoyle|blood-moon|299|blood-moon
gargoyle|dragon|199|halloween
gargoyle|fuck-cancer|399|fuck-cancer
gargoyle|holy-guardian|399|
gargoyle|runic-flame|299|
gargoyle|southern-kingdom|299|southern-kingdom
gargoyle|summer-vibes|99|summer-vibes
gargoyle|void-dweller|399|void-dweller
juggernaut|arcane|199|arcane
juggernaut|bio-mech|99|
juggernaut|blood-moon|299|blood-moon
juggernaut|fuck-cancer|399|fuck-cancer
juggernaut|holy-mech|399|
juggernaut|pumpkin-mech|199|halloween
juggernaut|summer-vibes|99|summer-vibes
king|arcane|199|arcane
king|blood-moon|299|blood-moon
king|fuck-cancer|399|fuck-cancer
king|pumpkin|199|halloween
king|summer-vibes|99|summer-vibes
king|void-dweller|399|void-dweller
little-brother|arcane|199|arcane
little-brother|arctic-ops|299|
little-brother|blood-moon|299|blood-moon
little-brother|crusader-mech|399|
little-brother|fuck-cancer|399|fuck-cancer
little-brother|galaxy-defender|399|
little-brother|summer-vibes|99|summer-vibes
magician|arcane|199|arcane
magician|blood-moon|299|blood-moon
magician|fuck-cancer|399|fuck-cancer
magician|ghostly|199|halloween
magician|southern-kingdom|299|southern-kingdom
magician|summer-vibes|99|summer-vibes
magician|wandering|99|
miner|blood-moon|299|blood-moon
miner|firefighter|299|
miner|fuck-cancer|399|fuck-cancer
miner|gold-rush|99|
miner|jade prospector|199|
miner|ruin-digger|299|
miner|shipwreck-scavenger|199|halloween
miner|steampunk-engineer|199|
miner|summer-vibes|99|summer-vibes
monk|artist|299|
monk|blood-moon|299|blood-moon
monk|blue-lightning|299|
monk|desert-temple|199|desert-warriors
monk|fuck-cancer|399|fuck-cancer
monk|jade-dragon|199|
monk|mummy|199|halloween
monk|summer-vibes|99|summer-vibes
monk|void-dweller|399|void-dweller
mother-nature|autumn-spirit|299|
mother-nature|autumn-witch|199|halloween
mother-nature|black-widow|399|
mother-nature|blood-moon|299|blood-moon
mother-nature|blood-rose|399|
mother-nature|bronze-witch|499|
mother-nature|desert-oasis|199|desert-warriors
mother-nature|discord-kitten-(alt.)|499|
mother-nature|discord-kitten|499|
mother-nature|everfrost|299|
mother-nature|fuck-cancer|399|fuck-cancer
mother-nature|gaia-elemental|299|
mother-nature|geisha|399|geisha
mother-nature|summer-vibes|99|summer-vibes
mystic|arcane|199|arcane
mystic|blood-moon|299|blood-moon
mystic|candy-witch|199|halloween
mystic|discord-kitten|499|
mystic|enlightened|299|
mystic|floral|299|
mystic|fuck-cancer|399|fuck-cancer
mystic|geisha|399|geisha
mystic|heartbreaker|499|
mystic|lunar-goddess|199|
mystic|moon-guardian|299|
mystic|nirvana|399|
mystic|ruby|399|
mystic|southern-kingdom|299|southern-kingdom
mystic|star-princess|299|
mystic|summer-vibes|99|summer-vibes
mystic|sun-goddess|199|
mystic|wandering|99|
necromancer|arcane|199|arcane
necromancer|blood-moon|299|blood-moon
necromancer|fuck-cancer|399|fuck-cancer
necromancer|summer-vibes|99|summer-vibes
necromancer|trick-or-treat|199|halloween
necromancer|void-dweller|399|void-dweller
nemesis|arcane|199|arcane
nemesis|blood-moon|299|blood-moon
nemesis|fuck-cancer|399|fuck-cancer
nemesis|infernal|299|infernal
nemesis|spooky|199|halloween
nemesis|summer-vibes|99|summer-vibes
paladin|blood-moon|299|blood-moon
paladin|count|199|halloween
paladin|crusader|399|
paladin|fuck-cancer|399|fuck-cancer
paladin|gaia's-protector|199|
paladin|galactic-guardian|399|
paladin|reef-guardian|199|
paladin|southern-kingdom|299|southern-kingdom
paladin|summer-vibes|99|summer-vibes
riot-cop|blood-moon|299|blood-moon
riot-cop|firefighter|299|riot-cop
riot-cop|fuck-cancer|399|fuck-cancer
riot-cop|neon-squad|399|
riot-cop|snow-patrol|299|riot-cop
riot-cop|street-patrol|299|riot-cop
riot-cop|summer-vibes|99|summer-vibes
riot-cop|swat-team|299|riot-cop
riot-cop|transylvanian-guard|199|halloween
ronin|arcane|199|arcane
ronin|armored|99|
ronin|blood-moon|299|blood-moon
ronin|eastern-vampire|199|halloween
ronin|fuck-cancer|399|fuck-cancer
ronin|summer-vibes|99|summer-vibes
ronin|void-dweller|399|void-dweller
sniper|arcane|199|arcane
sniper|blood-moon|299|blood-moon
sniper|desert-ops|199|desert-warriors
sniper|fuck-cancer|399|fuck-cancer
sniper|grim-reaper|299|grim-reaper
sniper|medieval|199|medieval
sniper|spooky-ops|199|halloween
sniper|summer-vibes|99|summer-vibes
sniper|swamp-combat|99|
summoner|ascended|299|
summoner|blood-moon|299|blood-moon
summoner|frostbitten|299|
summoner|fuck-cancer|399|fuck-cancer
summoner|hellfire|399|
summoner|void-dweller|399|
swordsman|arcane|199|arcane
swordsman|blood-moon|299|blood-moon
swordsman|enchanted|199|
swordsman|fuck-cancer|399|fuck-cancer
swordsman|grim-reaper|299|grim-reaper
swordsman|medieval|199|medieval
swordsman|pumpkin-knight|199|halloween
swordsman|southern-kingdom|299|southern-kingdom
swordsman|summer-vibes|99|summer-vibes
swordsman|wandering|99|
treant|arcane|199|arcane
treant|blood-moon|299|blood-moon
treant|fuck-cancer|399|fuck-cancer
treant|rotting|299|
treant|sapling|199|
treant|summer-vibes|99|summer-vibes
treant|voidroot|399|void-dweller
virus|arcane|199|arcane
virus|blood-moon|299|blood-moon
virus|fuck-cancer|399|fuck-cancer
virus|jack-o-lantern|199|halloween
virus|summer-vibes|99|summer-vibes
witch-doctor|arcane|199|arcane
witch-doctor|black-mage|199|halloween
witch-doctor|blood-moon|299|blood-moon
witch-doctor|fuck-cancer|399|fuck-cancer
witch-doctor|summer-vibes|99|summer-vibes
witch-doctor|void-dweller|399|void-dweller
`;
const RAW_UNIT_CATALOG = `
angel|ta.unit.angel|299|Angel
big-brother|ta.unit.big-brother|99|Big Brother
blacksword|ta.unit.blacksword|399|Blacksword
clod|ta.unit.clod|199|Clod
fat-bowman|ta.unit.fat-bowman|299|Fat Bowman
fat-cleric|ta.unit.fat-cleric|299|Fat Cleric
fat-knight|ta.unit.fat-knight|299|Fat Knight
fat-wizard|ta.unit.fat-wizard|299|Fat Wizard
father-time|ta.unit.father-time|199|Father Time
gargoyle|ta.unit.gargoyle|199|Gargoyle
juggernaut|ta.unit.juggernaut|99|Juggernaut
king|ta.unit.king|299|King
little-brother|ta.unit.little-brother|299|Little Brother
miner|ta.unit.miner|199|Miner
monk|ta.unit.monk|99|Monk
mother-nature|ta.unit.mother-nature|399|Mother Nature
necromancer|ta.unit.necromancer|199|Necromancer
nemesis|ta.unit.nemesis|399|Nemesis
paladin|ta.unit.paladin|199|Paladin
riot-cop|ta.unit.riot-cop|299|Riot Cop
ronin|ta.unit.ronin|299|Ronin
sniper|ta.unit.sniper|199|Sniper
summoner|ta.unit.summoner|399|Summoner
treant|ta.unit.treant|299|Treant
virus|ta.unit.virus|199|Virus
witch-doctor|ta.unit.witch-doctor|99|Witch Doctor
`;
function skuPart(value) {
    return cleanText(value, 200)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function titleCase(value) {
    return cleanText(value, 200)
        .split(/[-\s]+/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
function skinSku(type, slug) {
    return `ta.skin.${skuPart(type)}.${skuPart(slug)}`;
}
function unitSku(type) {
    return `ta.unit.${skuPart(type)}`;
}
const SKIN_CATALOG = Object.freeze(RAW_SKIN_CATALOG
    .trim()
    .split(/\n+/)
    .map((line) => {
    const [type, slug, cents, packId] = line.split("|");
    return Object.freeze({
        type,
        slug,
        sku: skinSku(type, slug),
        name: titleCase(slug),
        unitName: titleCase(type),
        amountCents: moneyCents(cents),
        currency: "usd",
        packId: cleanText(packId, 120),
        entitlementId: `skin:${type}:${slug}`,
    });
}));
const UNIT_CATALOG = Object.freeze(RAW_UNIT_CATALOG
    .trim()
    .split(/\n+/)
    .map((line) => {
    const [type, sku, cents, name] = line.split("|");
    return Object.freeze({
        type,
        sku: cleanText(sku, 200) || unitSku(type),
        name: cleanText(name, 200) || titleCase(type),
        amountCents: moneyCents(cents),
        currency: "usd",
        entitlementId: `unit:${type}`,
    });
}));
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
function stripeErrorMessage(value) {
    return cleanText(value, 1000);
}
function logStripeCheckoutError(json) {
    const error = json?.error && typeof json.error === "object" ? json.error : {};
    const code = stripeErrorMessage(error.code) || "stripe_checkout_failed";
    const message = stripeErrorMessage(error.message);
    const param = stripeErrorMessage(error.param);
    const requestLogUrl = stripeErrorMessage(error.request_log_url);
    process.stderr.write(`[stripe-checkout] ${code}${param ? ` param=${param}` : ""}${message ? ` message=${message}` : ""}${requestLogUrl ? ` log=${requestLogUrl}` : ""}\n`);
}
function stripeCheckoutError(json) {
    const error = json?.error && typeof json.error === "object" ? json.error : {};
    const code = stripeErrorMessage(error.code) || "stripe_checkout_failed";
    const message = stripeErrorMessage(error.message);
    const param = stripeErrorMessage(error.param);
    return {
        ok: false,
        statusCode: 502,
        error: code,
        message,
        param,
    };
}
function appendMetadata(form, metadata) {
    for (const [key, value] of Object.entries(metadata)) {
        if (!value)
            continue;
        form.append(`metadata[${key}]`, value.slice(0, 500));
    }
}
function findSkinOffer(type, slug) {
    return SKIN_CATALOG.find((skin) => skin.type === type && skin.slug === slug) || null;
}
function skinPackName(packId) {
    if (packId === "fuck-cancer")
        return "Fuck Cancer Charity Pack";
    return `${titleCase(packId)} Pack`;
}
function findSkinPackOffer(packId) {
    const skins = SKIN_CATALOG.filter((skin) => skin.packId === packId);
    const amountCents = moneyCents(SKIN_PACK_PRICES[packId]);
    if (!skins.length || !amountCents)
        return null;
    return {
        kind: "skin-pack",
        packId,
        sku: `ta.skinpack.${packId}`,
        name: skinPackName(packId),
        amountCents,
        currency: "usd",
        skins,
    };
}
function findUnitOffer(type) {
    return UNIT_CATALOG.find((unit) => unit.type === type) || null;
}
export async function resolveTacticalArenaPremiumOffer(offerInput, progress = {}) {
    const offer = offerInput && typeof offerInput === "object" ? offerInput : {};
    const kind = cleanText(offer.kind, 40);
    const owned = ownedEntitlements(progress);
    if (kind === "skin") {
        const type = cleanText(offer.type, 80);
        const slug = cleanText(offer.slug, 120);
        const skinOffer = findSkinOffer(type, slug);
        if (!skinOffer) {
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
                amountCents: skinOffer.amountCents,
                currency: skinOffer.currency,
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
        const packId = cleanText(offer.packId, 120);
        const skinPack = findSkinPackOffer(packId);
        if (!skinPack) {
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
        const individualPriceCents = skinPack.skins.reduce((sum, skin) => sum + moneyCents(skin.amountCents), 0);
        const unownedPriceCents = unownedSkins.reduce((sum, skin) => sum + moneyCents(skin.amountCents), 0);
        const amountCents = individualPriceCents > 0
            ? Math.max(1, Math.round(moneyCents(skinPack.amountCents) * (unownedPriceCents / individualPriceCents)))
            : moneyCents(skinPack.amountCents);
        return {
            ok: true,
            offer: {
                kind: "skin-pack",
                sku: skinPack.sku,
                name: skinPack.name,
                amountCents,
                currency: skinPack.currency,
                entitlementIds: unownedSkins.map((skin) => skin.entitlementId),
                metadata: {
                    offerKind: "skin-pack",
                    packId: skinPack.packId,
                },
            },
        };
    }
    if (kind === "unit") {
        const type = cleanText(offer.type, 80);
        const unitOffer = findUnitOffer(type);
        if (!unitOffer) {
            return stripeError(400, "offer_not_found");
        }
        const requestedSku = cleanText(offer.sku, 200);
        if (requestedSku && requestedSku !== unitOffer.sku) {
            return stripeError(400, "offer_mismatch");
        }
        if (owned.has(unitOffer.entitlementId)) {
            return stripeError(409, "offer_already_owned");
        }
        return {
            ok: true,
            offer: {
                kind: "unit",
                sku: unitOffer.sku,
                name: `${unitOffer.name} Unit`,
                amountCents: unitOffer.amountCents,
                currency: unitOffer.currency,
                entitlementIds: [unitOffer.entitlementId],
                metadata: {
                    offerKind: "unit",
                    type: unitOffer.type,
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
    const successUrl = (cleanUrl(body.successUrl) || fallbackCheckoutUrl(params.appBaseUrl, "success"))
        .replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
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
            "Stripe-Version": STRIPE_API_VERSION,
        },
        body: form,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        logStripeCheckoutError(json);
        return stripeCheckoutError(json);
    }
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
        : offerKind === "unit"
            ? { kind: "unit", sku: metadata.sku, type: metadata.type }
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
        kind: resolved.offer?.kind === "unit" ? "premium-unit-purchase" : "premium-skin-purchase",
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
