// Maps shop offers onto Google Play in-app product ids.
//
// Play is stricter than the rest of the stack: a product id must start with a
// lowercase letter or digit and contain only lowercase letters, digits, underscores
// and periods. The game's SKUs are full of hyphens (`ta.skin.swordsman.summer-vibes`,
// `ta.skinpack.blood-moon`, `ta.consumable.valor-boost-1`), so every premium offer
// would be rejected by the Play Console without this translation.
//
// The mapping is intentionally boring and one-directional: hyphen to underscore.
// The SERVER resolves a product id back to an entitlement from its own catalog —
// exactly like the Stripe path re-prices offers server-side rather than trusting the
// client — so this file never has to be reversible.
//
// Whatever product ids this produces are the ids that must be created in the Play
// Console. `npm test` guards the whole live catalog: legal, stable, collision-free.

export const PLAY_PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9._]*$/;

export function isValidPlayProductId(id) {
  return typeof id === "string" && id.length > 0 && PLAY_PRODUCT_ID_PATTERN.test(id);
}

// Translates a marketplace SKU into a legal Play product id, or returns "" when the
// SKU cannot be rescued (so callers fail loudly instead of shipping a broken offer).
export function toPlayProductId(sku) {
  const raw = typeof sku === "string" ? sku.trim().toLowerCase() : "";
  if (!raw) return "";
  // Hyphens are the only character the game actually uses that Play rejects; map
  // them rather than dropping them, so `valor-boost-1` and `valorboost1` stay distinct.
  const mapped = raw.replace(/-/g, "_");
  return isValidPlayProductId(mapped) ? mapped : "";
}

export function playProductIdForOffer(offer) {
  const id = toPlayProductId(offer?.sku);
  return id || null;
}
