import { UNIT_TYPES } from "../core/unitCatalog.js";
import { isProgressSkinUnlocked } from "../progression/unlocks.js";
import { SKIN_MANIFEST } from "./skinManifest.generated.js";

export const BASE_SKIN_SLUG = null;
export const SKIN_PREF_STORAGE_KEY = "tactical-arena.skinPrefs";
export const SUMMER_VIBES_SKIN_SLUG = "summer-vibes";
export const SKIN_STATUS = Object.freeze({
  UNLOCKED: "unlocked",
  LOCKED: "locked"
});

export const SKIN_RARITIES = Object.freeze({
  COMMON: "common",
  RARE: "rare",
  EPIC: "epic",
  LEGENDARY: "legendary"
});

const SKIN_PRICE_BY_RARITY = Object.freeze({
  [SKIN_RARITIES.COMMON]: 199,
  [SKIN_RARITIES.RARE]: 299,
  [SKIN_RARITIES.EPIC]: 499,
  [SKIN_RARITIES.LEGENDARY]: 799,
});

const LEGENDARY_SKINS = new Set([
  "ascended",
  "gaia-elemental",
  "galactic-guardian",
  "judicator",
  "lunar-goddess",
  "star-princess",
  "sun-goddess",
  "voidroot",
]);

const EPIC_SKIN_KEYWORDS = [
  "arcane",
  "blood-moon",
  "dragon",
  "hell",
  "infernal",
  "void",
];

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

function skuPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function skinRarity(slug) {
  if (LEGENDARY_SKINS.has(slug)) return SKIN_RARITIES.LEGENDARY;
  if (EPIC_SKIN_KEYWORDS.some((keyword) => slug.includes(keyword))) return SKIN_RARITIES.EPIC;
  return slug === SUMMER_VIBES_SKIN_SLUG ? SKIN_RARITIES.COMMON : SKIN_RARITIES.RARE;
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
  const rarity = skinRarity(entry.slug);
  const id = `skin:${entry.type}:${entry.slug}`;
  const sku = `ta.skin.${skuPart(entry.type)}.${skuPart(entry.slug)}`;
  return Object.freeze({
    id,
    unitType: entry.type,
    slug: entry.slug,
    name: collection?.name ?? skinName(entry.slug),
    collection: entry.slug,
    collectionName: collection?.name ?? skinName(entry.slug),
    rarity,
    sku,
    entitlementId: id,
    price: Object.freeze({
      kind: "premium",
      sku,
      currency: "USD",
      cents: SKIN_PRICE_BY_RARITY[rarity],
    }),
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
  const raw = Array.isArray(skins) ? skins : null;
  return composition.map((type, index) => {
    if (raw && index in raw) return normalizeSkinSlug(type, raw[index], storage);
    return getSkinPref(type, storage);
  });
}

export function skinLabel(typeOrDef, slug, storage = globalThis.localStorage) {
  const entry = getSkin(typeOrDef, slug, storage);
  return entry?.name ?? "Classic";
}

export function loadSkinPrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SKIN_PREF_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const prefs = {};
    for (const [type, slug] of Object.entries(parsed)) {
      const clean = normalizeSkinSlug(type, slug, storage);
      if (clean) prefs[type] = clean;
    }
    return prefs;
  } catch {
    return {};
  }
}

export function saveSkinPref(type, slug, storage = globalThis.localStorage) {
  if (!type) return;
  try {
    const prefs = loadSkinPrefs(storage);
    const clean = normalizeSkinSlug(type, slug, storage);
    if (clean) prefs[type] = clean;
    else delete prefs[type];
    storage?.setItem(SKIN_PREF_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable means the cosmetic default simply will not persist.
  }
}

export function getSkinPref(type, storage = globalThis.localStorage) {
  if (!type) return BASE_SKIN_SLUG;
  return loadSkinPrefs(storage)[type] ?? BASE_SKIN_SLUG;
}
