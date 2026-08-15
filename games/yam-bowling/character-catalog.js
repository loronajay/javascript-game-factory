(function initCharacterCatalog(root, factory) {
  "use strict";
  const isCommonJs = typeof module === "object" && module.exports;
  const catalogData = isCommonJs ? require("./character-catalog-data.js") : root.YamCharacterCatalogData;
  const animation = isCommonJs ? require("./animation-core.js") : root.YamBowlingCore;
  const exported = factory(catalogData, animation);
  if (isCommonJs) module.exports = exported;
  root.YamCharacterCatalog = exported;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCharacterCatalogModule(catalogData, animation) {
  "use strict";

  const REQUIRED_FIELDS = Object.freeze([
    "slug", "name", "age", "hometown", "occupation", "bowlingStyle",
    "favoriteBall", "personality", "bio",
  ]);

  function validateAndFreezeCatalog(entries = catalogData, roster = animation?.CANON_BOWLERS) {
    if (!Array.isArray(entries) || !Array.isArray(roster) || entries.length !== roster.length) {
      throw new Error("Character catalog must contain exactly one entry per canon bowler.");
    }
    const seen = new Set();
    const normalized = roster.map((bowler, index) => {
      const entry = entries[index];
      if (!entry || entry.slug !== bowler.slug || entry.name !== bowler.name || seen.has(entry.slug)) {
        throw new Error(`Character catalog order mismatch at ${bowler.slug}.`);
      }
      for (const field of REQUIRED_FIELDS) {
        if (typeof entry[field] !== "string" || !entry[field].trim()) {
          throw new Error(`${bowler.slug} is missing ${field}.`);
        }
      }
      seen.add(entry.slug);
      return Object.freeze({ ...entry });
    });
    return Object.freeze(normalized);
  }

  const CHARACTERS = validateAndFreezeCatalog();
  const characterBySlug = new Map(CHARACTERS.map((character) => [character.slug, character]));

  function getCharacter(slug) {
    return characterBySlug.get(slug) || CHARACTERS[0];
  }

  function getAdjacentCharacterSlug(slug, direction) {
    const current = CHARACTERS.findIndex((character) => character.slug === slug);
    const start = current >= 0 ? current : 0;
    const offset = Number(direction) < 0 ? -1 : 1;
    return CHARACTERS[(start + offset + CHARACTERS.length) % CHARACTERS.length].slug;
  }

  function getSkinPreviewLabel(skinId, previewSkinId, equippedSkinId) {
    const previewing = skinId === previewSkinId;
    const equipped = skinId === equippedSkinId;
    if (previewing && equipped) return "Equipped · Previewing";
    if (previewing) return "Previewing";
    if (equipped) return "Equipped";
    return "Preview";
  }

  return Object.freeze({
    CHARACTERS,
    REQUIRED_FIELDS,
    getAdjacentCharacterSlug,
    getCharacter,
    getSkinPreviewLabel,
    validateAndFreezeCatalog,
  });
});
