// Server-authoritative Valor pricing for Tactical Arena.
//
// Valor is the soft currency players spend on units/skins. The client (marketplace.js)
// historically computed these prices locally, which meant a tampered client could name
// any price. This module recomputes the same prices server-side from the SAME catalog the
// Stripe path uses (services/payments.mjs), so the spend endpoint never trusts a
// client-supplied amount. The formulas here MUST stay in lockstep with
// games/tactical-arena/src/progression/marketplace.js so displayed prices match charges.
import { SKIN_CATALOG, UNIT_CATALOG } from "./payments.mjs";
// Unit Valor cost is a flat price per "star" tier (marketplace UNIT_VALOR_COST_BY_STAR).
const UNIT_VALOR_COST_BY_STAR = Object.freeze({
    1: 450,
    2: 650,
    3: 850,
    4: 1150,
});
// Star tier per unit type (marketplace UNIT_VALOR_STAR_BY_TYPE). Types absent here are
// not purchasable with Valor (summons, starters).
const UNIT_VALOR_STAR_BY_TYPE = Object.freeze({
    juggernaut: 1,
    "big-brother": 1,
    "witch-doctor": 1,
    monk: 1,
    paladin: 2,
    sniper: 2,
    miner: 2,
    necromancer: 2,
    virus: 2,
    clod: 2,
    gargoyle: 2,
    "father-time": 2,
    "fat-knight": 3,
    ronin: 3,
    angel: 3,
    "fat-bowman": 3,
    "little-brother": 3,
    king: 3,
    "fat-cleric": 3,
    "fat-wizard": 3,
    treant: 3,
    "riot-cop": 3,
    blacksword: 4,
    "mother-nature": 4,
    nemesis: 4,
    summoner: 4,
});
// Skin Valor cost is a curve over the USD price (marketplace SKIN_VALOR_PER_USD / exponent).
const SKIN_VALOR_PER_USD = 850;
const SKIN_VALOR_CURVE_EXPONENT = 0.88;
// Base Valor price per skin pack (marketplace SKIN_PACK_PRICES[*].valor).
const SKIN_PACK_VALOR = Object.freeze({
    "summer-vibes": 12500,
    halloween: 19500,
    arcane: 16000,
    "blood-moon": 40000,
    "void-dweller": 19500,
    "desert-warriors": 4750,
    geisha: 8750,
    "riot-cop": 6750,
    "southern-kingdom": 20250,
    "grim-reaper": 3750,
    infernal: 3750,
    medieval: 2500,
    "fuck-cancer": 42500,
});
function cleanText(value, maxLength = 200) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
// round to nearest 50, floor at 0 (marketplace roundValorAmount).
function roundValorAmount(amount) {
    return Math.max(0, Math.round((Number(amount) || 0) / 50) * 50);
}
// marketplace prorateAmount (roundTo 50): base * (part / total), floored at one step.
function prorateValor(baseAmount, totalAmount, partAmount) {
    if (![baseAmount, totalAmount, partAmount].every((value) => Number.isFinite(value)))
        return 0;
    if (totalAmount <= 0 || partAmount <= 0)
        return 0;
    const raw = baseAmount * (partAmount / totalAmount);
    return Math.max(50, Math.round(raw / 50) * 50);
}
export function skinValorCost(amountCents) {
    const cents = Math.max(0, Math.floor(Number(amountCents) || 0));
    if (!cents)
        return 0;
    const dollars = cents / 100;
    return roundValorAmount(SKIN_VALOR_PER_USD * (dollars ** SKIN_VALOR_CURVE_EXPONENT));
}
export function unitValorCost(type) {
    const star = UNIT_VALOR_STAR_BY_TYPE[cleanText(type, 80)];
    return UNIT_VALOR_COST_BY_STAR[star] ?? 0;
}
function findSkin(type, slug) {
    return SKIN_CATALOG.find((skin) => skin.type === type && skin.slug === slug) || null;
}
function findUnit(type) {
    return UNIT_CATALOG.find((unit) => unit.type === type) || null;
}
function packSkins(packId) {
    return SKIN_CATALOG.filter((skin) => skin.packId === packId);
}
// Resolve a client-requested Valor offer into the authoritative entitlement id(s) plus the
// per-id Valor cost. Owned filtering / final charge are applied in the DB transaction so
// pricing stays consistent with the live balance. Returns { ok:false, error, statusCode }
// on any unknown/invalid offer.
export function getValorOffer(offerInput) {
    const offer = offerInput && typeof offerInput === "object" ? offerInput : {};
    const kind = cleanText(offer.kind, 40);
    if (kind === "unit") {
        const type = cleanText(offer.type, 80);
        const unit = findUnit(type);
        if (!unit)
            return { ok: false, statusCode: 400, error: "offer_not_found" };
        const cost = unitValorCost(type);
        if (!cost)
            return { ok: false, statusCode: 400, error: "offer_not_purchasable" };
        return {
            ok: true,
            kind: "unit",
            packBaseValor: 0,
            entitlements: [{ entitlementId: unit.entitlementId, kind: "unit", valorCost: cost }],
        };
    }
    if (kind === "skin") {
        const type = cleanText(offer.type, 80);
        const slug = cleanText(offer.slug, 120);
        const skin = findSkin(type, slug);
        if (!skin)
            return { ok: false, statusCode: 400, error: "offer_not_found" };
        const cost = skinValorCost(skin.amountCents);
        if (!cost)
            return { ok: false, statusCode: 400, error: "offer_not_purchasable" };
        return {
            ok: true,
            kind: "skin",
            packBaseValor: 0,
            entitlements: [{ entitlementId: skin.entitlementId, kind: "skin", valorCost: cost }],
        };
    }
    if (kind === "skin-pack") {
        const packId = cleanText(offer.packId, 120);
        const skins = packSkins(packId);
        const packBaseValor = roundValorAmount(SKIN_PACK_VALOR[packId]);
        if (!skins.length || !packBaseValor)
            return { ok: false, statusCode: 400, error: "offer_not_found" };
        return {
            ok: true,
            kind: "skin-pack",
            packId,
            packBaseValor,
            entitlements: skins.map((skin) => ({
                entitlementId: skin.entitlementId,
                kind: "skin",
                valorCost: skinValorCost(skin.amountCents),
            })),
        };
    }
    return { ok: false, statusCode: 400, error: "unsupported_offer_kind" };
}
// Given the resolved offer and the set of entitlement ids the player already owns, compute
// the authoritative charge and the entitlements to grant. For packs the base price is
// prorated across only the unowned skins (matching the client's shop display).
export function priceValorOffer(resolvedOffer, ownedEntitlementIds) {
    const entitlements = Array.isArray(resolvedOffer?.entitlements) ? resolvedOffer.entitlements : [];
    const unowned = entitlements.filter((entry) => !ownedEntitlementIds.has(entry.entitlementId));
    if (!unowned.length) {
        return { alreadyOwned: true, valorCost: 0, grants: [] };
    }
    if (resolvedOffer.kind === "skin-pack") {
        const totalIndividual = entitlements.reduce((sum, entry) => sum + (entry.valorCost || 0), 0);
        const unownedIndividual = unowned.reduce((sum, entry) => sum + (entry.valorCost || 0), 0);
        const valorCost = prorateValor(resolvedOffer.packBaseValor, totalIndividual, unownedIndividual);
        return { alreadyOwned: false, valorCost, grants: unowned };
    }
    const valorCost = unowned.reduce((sum, entry) => sum + (entry.valorCost || 0), 0);
    return { alreadyOwned: false, valorCost, grants: unowned };
}
