import { UNIT_TYPES } from "../core/unitCatalog.js";
import { isProgressSkinUnlocked } from "../progression/unlocks.js";
import { SKIN_MANIFEST } from "./skinManifest.generated.js";

export const BASE_SKIN_SLUG = null;
export const SUMMER_VIBES_SKIN_SLUG = "summer-vibes";
export const SKIN_STATUS = Object.freeze({
  UNLOCKED: "unlocked",
  LOCKED: "locked"
});

function skinName(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function collectionDescription(slug) {
  return slug === SUMMER_VIBES_SKIN_SLUG
    ? "Launch collection beach-day looks for the original roster."
    : "";
}

function sortSkinEntries(left, right) {
  if (left.slug === SUMMER_VIBES_SKIN_SLUG && right.slug !== SUMMER_VIBES_SKIN_SLUG) return -1;
  if (right.slug === SUMMER_VIBES_SKIN_SLUG && left.slug !== SUMMER_VIBES_SKIN_SLUG) return 1;
  return left.slug.localeCompare(right.slug) || left.file.localeCompare(right.file);
}

const collectionSlugs = [...new Set(SKIN_MANIFEST.map((entry) => entry.slug))].sort((left, right) => {
  if (left === SUMMER_VIBES_SKIN_SLUG && right !== SUMMER_VIBES_SKIN_SLUG) return -1;
  if (right === SUMMER_VIBES_SKIN_SLUG && left !== SUMMER_VIBES_SKIN_SLUG) return 1;
  return left.localeCompare(right);
});

export const SKIN_COLLECTIONS = Object.freeze(collectionSlugs.map((slug) => Object.freeze({
  slug,
  name: skinName(slug),
  description: collectionDescription(slug)
})));

function skin(entry, { status = SKIN_STATUS.UNLOCKED } = {}) {
  const collection = SKIN_COLLECTIONS.find((item) => item.slug === entry.slug);
  const src = `assets/units/skins/${entry.type}/${entry.file}`;
  return Object.freeze({
    slug: entry.slug,
    name: collection?.name ?? skinName(entry.slug),
    collection: entry.slug,
    status,
    unlocked: status === SKIN_STATUS.UNLOCKED,
    portraitSrc: src,
    boardSrc: src,
    board: Object.freeze({ w: 600, h: 600 })
  });
}

// The manifest enumerates every painted skin so galleries can show a visible but
// locked collection. getUnitSkins overlays account progress onto these base
// entries at read time.
export const SKINS_BY_UNIT = Object.freeze(Object.fromEntries(
  Object.keys(UNIT_TYPES).map((type) => {
    const entries = SKIN_MANIFEST
      .filter((entry) => entry.type === type)
      .sort(sortSkinEntries);
    return [type, Object.freeze(entries.map((entry) => skin(entry, { status: SKIN_STATUS.LOCKED })))];
  })
));

export function getUnitSkins(typeOrDef, storage = globalThis.localStorage) {
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  const skins = SKINS_BY_UNIT[type] ?? Object.freeze([]);
  return Object.freeze(skins.map((entry) => {
    const unlocked = isProgressSkinUnlocked(type, entry.slug, storage);
    if (entry.unlocked === unlocked) return entry;
    return Object.freeze({
      ...entry,
      status: unlocked ? SKIN_STATUS.UNLOCKED : SKIN_STATUS.LOCKED,
      unlocked,
    });
  }));
}

export function getSkin(typeOrDef, slug, storage = globalThis.localStorage) {
  if (!slug) return null;
  return getUnitSkins(typeOrDef, storage).find((entry) => entry.slug === slug) ?? null;
}

export function isSkinUnlocked(typeOrDef, slug, storage = globalThis.localStorage) {
  const entry = getSkin(typeOrDef, slug, storage);
  return Boolean(entry?.unlocked);
}

export function normalizeSkinSlug(typeOrDef, slug, storage = globalThis.localStorage) {
  const entry = getSkin(typeOrDef, typeof slug === "string" ? slug.trim() : slug, storage);
  return entry?.unlocked ? entry.slug : BASE_SKIN_SLUG;
}

export function skinAssetPath(typeOrDef, slug, kind = "portrait", storage = globalThis.localStorage) {
  const entry = getSkin(typeOrDef, slug, storage);
  if (!entry) return null;
  return kind === "board" ? entry.boardSrc : entry.portraitSrc;
}

export function normalizeSkinLoadout(composition, skins, storage = globalThis.localStorage) {
  const raw = Array.isArray(skins) ? skins : [];
  return composition.map((type, index) => normalizeSkinSlug(type, raw[index], storage));
}

export function skinLabel(typeOrDef, slug, storage = globalThis.localStorage) {
  const entry = getSkin(typeOrDef, slug, storage);
  return entry?.name ?? "Classic";
}
