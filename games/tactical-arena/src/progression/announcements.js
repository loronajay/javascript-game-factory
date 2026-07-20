import { UNIT_TYPES } from "../core/unitCatalog.js";
import { DRAFT_BATTLE_REQUIRED_UNITS, isDraftBattleAvailable, isDraftableProgressionUnit } from "./draftAvailability.js";
import { STARTER_UNIT_TYPES, VALOR_RESOURCE, readUnlockProgress } from "./unlocks.js";

export const PROGRESSION_ANNOUNCEMENTS_KEY = "tacticalArenaProgressionAnnouncementsV1";
export const PROGRESSION_ANNOUNCEMENTS_SEEN_KEY = "tacticalArenaProgressionAnnouncementsSeenV1";

function defaultStorage() {
  return globalThis.localStorage;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value))];
}

function readJsonArray(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeJsonArray(storage, key, values) {
  try {
    if (values.length) storage?.setItem?.(key, JSON.stringify(values));
    else storage?.removeItem?.(key);
  } catch {
    // Announcements are presentation-only; storage failures should not block rewards.
  }
}

export function buildUnitUnlockAnnouncement(type) {
  const def = UNIT_TYPES[type];
  if (!def || !isDraftableProgressionUnit(type)) return null;
  const classLabel = def.classType ? `${def.classType} unit` : "unit";
  return {
    id: `unit-unlock:${type}`,
    kind: "unit-unlock",
    unitType: type,
    eyebrow: "New Unit",
    title: `${def.name} Unlocked`,
    body: `${def.name} has joined your roster as a ${classLabel}. You can now draft them into eligible squads.`,
    primaryLabel: "Continue",
  };
}

function skinName(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildSkinUnlockAnnouncement(skin) {
  const def = UNIT_TYPES[skin?.type];
  if (!def || typeof skin?.slug !== "string" || !skin.slug) return null;
  const skinLabel = skinName(skin.slug);
  return {
    id: `skin-unlock:${skin.type}:${skin.slug}`,
    kind: "skin-unlock",
    unitType: skin.type,
    skinSlug: skin.slug,
    eyebrow: "New Skin",
    title: `${skinLabel} ${def.name} Unlocked`,
    body: `${skinLabel} ${def.name} has been added to your skin collection.`,
    primaryLabel: "Continue",
  };
}

export function buildDraftBattleUnlockAnnouncement() {
  return {
    id: "mode-unlock:draft-battles",
    kind: "mode-unlock",
    mode: "draft-battles",
    eyebrow: "Achievement",
    title: "Draft Battles Available",
    body: `You own ${DRAFT_BATTLE_REQUIRED_UNITS} unique units, enough for the full snake draft. Draft 1v1 is now available in Online Versus.`,
    primaryLabel: "Continue",
  };
}

export function buildValorGainAnnouncement({ id, amount, title, body, eyebrow = "Achievement" } = {}) {
  const rawId = typeof id === "string" && id.trim() ? id.trim() : null;
  const normalizedId = rawId?.startsWith("valor-gain:") ? rawId.slice("valor-gain:".length) : rawId;
  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!normalizedId || normalizedAmount <= 0) return null;
  const amountLabel = `${normalizedAmount.toLocaleString("en-US")} ${VALOR_RESOURCE.name}`;
  return {
    id: `valor-gain:${normalizedId}`,
    kind: "valor-gain",
    amount: normalizedAmount,
    eyebrow,
    title: title || `${amountLabel} Earned`,
    body: body || `${amountLabel} has been added to your account.`,
    primaryLabel: "Continue",
  };
}

export function normalizeProgressionAnnouncement(value) {
  if (!value || typeof value !== "object") return null;
  if (value.kind === "unit-unlock") return buildUnitUnlockAnnouncement(value.unitType);
  if (value.kind === "skin-unlock") return buildSkinUnlockAnnouncement({
    type: value.unitType ?? value.type,
    slug: value.skinSlug ?? value.slug,
  });
  if (value.kind === "mode-unlock" && value.mode === "draft-battles") return buildDraftBattleUnlockAnnouncement();
  if (value.kind === "valor-gain") return buildValorGainAnnouncement(value);
  return null;
}

export function readProgressionAnnouncements(storage = defaultStorage()) {
  const out = [];
  const seen = new Set();
  for (const value of readJsonArray(storage, PROGRESSION_ANNOUNCEMENTS_KEY)) {
    const announcement = normalizeProgressionAnnouncement(value);
    if (!announcement || seen.has(announcement.id)) continue;
    seen.add(announcement.id);
    out.push(announcement);
  }
  return out;
}

export function readSeenProgressionAnnouncementIds(storage = defaultStorage()) {
  return uniqueStrings(readJsonArray(storage, PROGRESSION_ANNOUNCEMENTS_SEEN_KEY));
}

export function markProgressionAnnouncementsSeen(storage = defaultStorage(), announcements = []) {
  const ids = uniqueStrings(announcements.map((announcement) => announcement?.id));
  if (!ids.length) return readSeenProgressionAnnouncementIds(storage);
  const seen = new Set(readSeenProgressionAnnouncementIds(storage));
  for (const id of ids) seen.add(id);
  const next = [...seen];
  writeJsonArray(storage, PROGRESSION_ANNOUNCEMENTS_SEEN_KEY, next);
  return next;
}

export function enqueueProgressionAnnouncements(storage = defaultStorage(), announcements = [], options = {}) {
  const seenIds = options.ignoreSeen ? new Set() : new Set(readSeenProgressionAnnouncementIds(storage));
  const pending = readProgressionAnnouncements(storage);
  const byId = new Map(pending.map((announcement) => [announcement.id, announcement]));
  for (const value of announcements) {
    const announcement = normalizeProgressionAnnouncement(value);
    if (!announcement || seenIds.has(announcement.id) || byId.has(announcement.id)) continue;
    byId.set(announcement.id, announcement);
  }
  const next = [...byId.values()];
  writeJsonArray(storage, PROGRESSION_ANNOUNCEMENTS_KEY, next);
  return next;
}

export function enqueueUnitUnlockAnnouncements(storage = defaultStorage(), unitTypes = [], options = {}) {
  return enqueueProgressionAnnouncements(
    storage,
    uniqueStrings(unitTypes).map((type) => buildUnitUnlockAnnouncement(type)),
    options,
  );
}

export function enqueueSkinUnlockAnnouncements(storage = defaultStorage(), skins = [], options = {}) {
  return enqueueProgressionAnnouncements(
    storage,
    (Array.isArray(skins) ? skins : []).map((skin) => {
      const announcement = buildSkinUnlockAnnouncement(skin);
      return announcement ? { kind: "skin-unlock", unitType: skin.type, skinSlug: skin.slug } : null;
    }).filter(Boolean),
    options,
  );
}

export function enqueueValorGainAnnouncement(storage = defaultStorage(), value = {}, options = {}) {
  return enqueueProgressionAnnouncements(storage, [{ ...value, kind: "valor-gain" }], options);
}

export function enqueueDraftBattleUnlockAnnouncement(storage = defaultStorage()) {
  if (!isDraftBattleAvailable(storage)) return readProgressionAnnouncements(storage);
  return enqueueProgressionAnnouncements(storage, [buildDraftBattleUnlockAnnouncement()]);
}

export function syncMissingUnitUnlockAnnouncements(storage = defaultStorage()) {
  const starterUnits = new Set(STARTER_UNIT_TYPES);
  const unlockedUnits = readUnlockProgress(storage).unlockedUnits.filter((type) => !starterUnits.has(type));
  enqueueUnitUnlockAnnouncements(storage, unlockedUnits);
  return enqueueDraftBattleUnlockAnnouncement(storage);
}

export function consumeProgressionAnnouncements(storage = defaultStorage()) {
  const pending = readProgressionAnnouncements(storage);
  writeJsonArray(storage, PROGRESSION_ANNOUNCEMENTS_KEY, []);
  markProgressionAnnouncementsSeen(storage, pending);
  return pending;
}

export function resetProgressionAnnouncements(storage = defaultStorage()) {
  writeJsonArray(storage, PROGRESSION_ANNOUNCEMENTS_KEY, []);
  writeJsonArray(storage, PROGRESSION_ANNOUNCEMENTS_SEEN_KEY, []);
}
