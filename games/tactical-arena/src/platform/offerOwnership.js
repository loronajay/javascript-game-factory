// Does the player already own everything a shop offer would grant?
//
// This exists to answer that question against a SERVER snapshot, before a purchase is
// allowed to start. Local unlock progress cannot answer it safely: it goes stale the
// moment the same account buys something on the web or on another device, and a stale
// "not owned" is what lets a player pay twice for one skin.
//
// These rules deliberately mirror resolveTacticalArenaPremiumOffer in the platform-api
// (services/payments.mts). If the two ever disagree, the client either blocks a purchase
// the server would have honoured, or lets one through that the server will refuse — so
// keep them in step. A cross-checked case: a skin pack the player owns only PART of is
// still purchasable, because the server prorates it down to the skins they are missing.

function cleanText(value, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function ownedSet(owned) {
  if (owned instanceof Set) return owned;
  const rows = Array.isArray(owned) ? owned : Array.isArray(owned?.entitlements) ? owned.entitlements : [];
  return new Set(
    rows
      .map((row) => (typeof row === "string" ? row : cleanText(row?.entitlementId, 200)))
      .filter(Boolean),
  );
}

function skinEntitlementId(skin) {
  const explicit = cleanText(skin?.entitlementId, 200);
  if (explicit) return explicit;
  const type = cleanText(skin?.type, 80);
  const slug = cleanText(skin?.slug, 120);
  return type && slug ? `skin:${type}:${slug}` : "";
}

/**
 * Every entitlement that must ALREADY be owned for this offer to grant the player nothing.
 *
 * Returns [] for anything that can always be bought again — consumables stack rather than
 * being owned, so they have no entitlement and must never be blocked.
 */
export function offerRedundantEntitlementIds(offer) {
  const kind = cleanText(offer?.kind, 40);
  if (kind === "consumable") return [];

  if (kind === "skin-pack") {
    // A pack is only redundant once every skin in it is owned. The pack marker itself is
    // not enough to go on: it records that the bundle was bought, and a pack that has
    // since gained new skins is legitimately worth buying again.
    const skins = Array.isArray(offer?.skins) ? offer.skins : [];
    return skins.map(skinEntitlementId).filter(Boolean);
  }

  const entitlementId = cleanText(offer?.entitlementId, 200);
  return entitlementId ? [entitlementId] : [];
}

/**
 * True when buying this offer would grant the player nothing they do not already have.
 *
 * `owned` accepts a Set of ids, an array of ids, an array of entitlement rows, or a whole
 * server progress snapshot. An offer with nothing to check is never "fully owned" — a
 * consumable, or an offer we failed to understand, must stay purchasable rather than being
 * blocked by an empty match.
 */
export function isOfferFullyOwned(offer, owned) {
  const required = offerRedundantEntitlementIds(offer);
  if (!required.length) return false;
  const set = ownedSet(owned);
  return required.every((entitlementId) => set.has(entitlementId));
}
