// Player-badge display: the one place that knows how a badge becomes pixels.
//
// The server says WHAT a player has earned (id, label, description, which art) and the
// generated manifest says where that art lives on disk. Every badge surface — the profile
// badge row, the badge picker, the ranked nameplate, the in-match nameplate — goes through
// here, so a badge looks and reads the same everywhere and there is a single place to fix
// when it doesn't.
//
// Pure except for the DOM builders, and those only touch nodes they create.

import { el } from "./domHelpers.js";
import { BADGE_ART_MANIFEST } from "./badgeManifest.generated.js";

const ART_ROOT = "../../assets/player-badges";
const ART_BY_ID = new Map(BADGE_ART_MANIFEST.map((entry) => [entry.id, entry.file]));

function cleanText(value, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * Normalize a badge as the server sends it. Returns null for anything without an id —
 * a badge with no id can't be equipped, compared, or drawn, so it is not a badge.
 */
export function normalizeBadge(raw) {
  const badgeId = cleanText(raw?.badgeId || raw?.id, 120);
  if (!badgeId) return null;
  return Object.freeze({
    badgeId,
    label: cleanText(raw?.label, 60) || badgeId,
    description: cleanText(raw?.description, 300),
    art: cleanText(raw?.art, 120),
    icon: cleanText(raw?.icon, 300),
    earn: cleanText(raw?.earn, 40),
    earnedAt: raw?.earnedAt || null,
  });
}

export function normalizeBadges(values) {
  return (Array.isArray(values) ? values : []).map(normalizeBadge).filter(Boolean);
}

export function findBadgeById(badges, badgeId) {
  const wanted = cleanText(badgeId, 120);
  if (!wanted) return null;
  return normalizeBadges(badges).find((badge) => badge.badgeId === wanted) || null;
}

/**
 * The image URL for a badge, or "" when there is no art for it.
 *
 * The local manifest wins: it is generated from the files that actually shipped with this
 * build, so it can't point at a missing image. The server's own `icon` path is the
 * fallback for a badge whose art hasn't been added to this game yet — better a broken
 * image than a silently missing badge, because one of them gets noticed and fixed.
 */
export function badgeArtSrc(badge) {
  const normalized = badge?.badgeId ? badge : normalizeBadge(badge);
  if (!normalized) return "";
  const file = ART_BY_ID.get(normalized.art) || ART_BY_ID.get(normalized.badgeId);
  if (file) return new URL(`${ART_ROOT}/${file}`, import.meta.url).href;
  return normalized.icon ? new URL(`../../${normalized.icon}`, import.meta.url).href : "";
}

export function badgeTooltip(badge) {
  const normalized = badge?.badgeId ? badge : normalizeBadge(badge);
  if (!normalized) return "";
  return normalized.description ? `${normalized.label} — ${normalized.description}` : normalized.label;
}

/**
 * Just the badge image, sized by CSS. `variant` places it: "is-chip" in a profile row,
 * "is-plate" on a nameplate, "is-menu" in the picker.
 *
 * Decorative by default — the label sits next to it in a chip, and on a nameplate the
 * tooltip carries the meaning, so announcing the art twice would be noise. Callers that
 * show the icon ALONE pass `decorative: false` to get the label as alt text.
 */
export function createBadgeIcon(badge, { variant = "", decorative = true } = {}) {
  const normalized = badge?.badgeId ? badge : normalizeBadge(badge);
  const src = badgeArtSrc(normalized);
  if (!src) return null;
  const img = document.createElement("img");
  img.className = `player-badge-icon${variant ? ` ${variant}` : ""}`;
  img.src = src;
  img.loading = "lazy";
  img.decoding = "async";
  if (decorative) {
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
  } else {
    img.alt = normalized.label;
  }
  return img;
}

/**
 * Icon + label, the shape used wherever badges are listed rather than worn.
 * `equipped` marks the one currently on the player's nameplate.
 */
export function createBadgeChip(badge, { equipped = false } = {}) {
  const normalized = badge?.badgeId ? badge : normalizeBadge(badge);
  if (!normalized) return null;
  const chip = el("div", `player-badge-chip${equipped ? " is-equipped" : ""}`);
  chip.title = badgeTooltip(normalized);
  chip.dataset.badge = normalized.badgeId;
  const icon = createBadgeIcon(normalized, { variant: "is-chip" });
  if (icon) chip.appendChild(icon);
  chip.appendChild(el("span", "player-badge-chip-label", normalized.label));
  if (equipped) chip.appendChild(el("span", "player-badge-chip-flag", "Displayed"));
  return chip;
}
