import { UNIT_TYPES } from "../core/unitCatalog.js";

export const BASE_SKIN_SLUG = null;
export const SUMMER_VIBES_SKIN_SLUG = "summer-vibes";
export const SKIN_STATUS = Object.freeze({
  UNLOCKED: "unlocked",
  LOCKED: "locked"
});

export const SKIN_COLLECTIONS = Object.freeze([
  Object.freeze({
    slug: SUMMER_VIBES_SKIN_SLUG,
    name: "Summer Vibes",
    description: "Launch collection beach-day looks for the original roster."
  })
]);

function skin(type, collectionSlug, { status = SKIN_STATUS.UNLOCKED } = {}) {
  const collection = SKIN_COLLECTIONS.find((entry) => entry.slug === collectionSlug);
  const src = `assets/units/skins/${type}/${collectionSlug}-${type}.png`;
  return Object.freeze({
    slug: collectionSlug,
    name: collection?.name ?? collectionSlug,
    collection: collectionSlug,
    status,
    unlocked: status === SKIN_STATUS.UNLOCKED,
    portraitSrc: src,
    boardSrc: src,
    board: Object.freeze({ w: 600, h: 600, scale: 1 })
  });
}

export const SKINS_BY_UNIT = Object.freeze(Object.fromEntries(
  Object.keys(UNIT_TYPES).map((type) => [
    type,
    Object.freeze([
      skin(type, SUMMER_VIBES_SKIN_SLUG)
    ])
  ])
));

export function getUnitSkins(typeOrDef) {
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  return SKINS_BY_UNIT[type] ?? Object.freeze([]);
}

export function getSkin(typeOrDef, slug) {
  if (!slug) return null;
  return getUnitSkins(typeOrDef).find((entry) => entry.slug === slug) ?? null;
}

export function isSkinUnlocked(typeOrDef, slug) {
  const entry = getSkin(typeOrDef, slug);
  return Boolean(entry?.unlocked);
}

export function normalizeSkinSlug(typeOrDef, slug) {
  const entry = getSkin(typeOrDef, typeof slug === "string" ? slug.trim() : slug);
  return entry?.unlocked ? entry.slug : BASE_SKIN_SLUG;
}

export function skinAssetPath(typeOrDef, slug, kind = "portrait") {
  const entry = getSkin(typeOrDef, slug);
  if (!entry) return null;
  return kind === "board" ? entry.boardSrc : entry.portraitSrc;
}

export function normalizeSkinLoadout(composition, skins) {
  const raw = Array.isArray(skins) ? skins : [];
  return composition.map((type, index) => normalizeSkinSlug(type, raw[index]));
}

export function skinLabel(typeOrDef, slug) {
  const entry = getSkin(typeOrDef, slug);
  return entry?.name ?? "Classic";
}
