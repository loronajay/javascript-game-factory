const RANKED_TIER_EMBLE_FILENAMES = Object.freeze({
  bronze: "bronze.webp",
  silver: "silver.webp",
  gold: "gold.webp",
  platinum: "platinum.webp",
  diamond: "diamond.webp",
  master: "master.webp",
  grandmaster: "grandmaster.webp",
});

const RANKED_TIER_ALIASES = Object.freeze({
  "grand-master": "grandmaster",
  grand_master: "grandmaster",
  gm: "grandmaster",
});

const DEFAULT_TIER_ID = "bronze";
const EMBLEM_ROOT = "./assets/ranked-emblems";

export function normalizeRankedTierId(tierOrId) {
  const raw = typeof tierOrId === "string" ? tierOrId : tierOrId?.id;
  const id = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  const normalized = RANKED_TIER_ALIASES[id] || id;
  return RANKED_TIER_EMBLE_FILENAMES[normalized] ? normalized : DEFAULT_TIER_ID;
}

export function getRankedTierEmblemSrc(tierOrId) {
  const tierId = normalizeRankedTierId(tierOrId);
  return `${EMBLEM_ROOT}/${RANKED_TIER_EMBLE_FILENAMES[tierId]}`;
}

export function createRankedTierEmblem(tierOrId, { className = "" } = {}) {
  const tierId = normalizeRankedTierId(tierOrId);
  const img = document.createElement("img");
  img.className = `ranked-tier-emblem ranked-tier-emblem-${tierId}${className ? ` ${className}` : ""}`;
  img.src = getRankedTierEmblemSrc(tierId);
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.dataset.tier = tierId;
  img.setAttribute("aria-hidden", "true");
  return img;
}
