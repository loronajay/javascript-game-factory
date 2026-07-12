import { UNIT_TYPES } from "../core/unitCatalog.js";
import { STARTER_UNIT_TYPES, readUnlockProgress } from "./unlocks.js";

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
  if (!def) return null;
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

export function normalizeProgressionAnnouncement(value) {
  if (!value || typeof value !== "object") return null;
  if (value.kind === "unit-unlock") return buildUnitUnlockAnnouncement(value.unitType);
  if (value.kind === "skin-unlock") return buildSkinUnlockAnnouncement({
    type: value.unitType ?? value.type,
    slug: value.skinSlug ?? value.slug,
  });
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

export function enqueueProgressionAnnouncements(storage = defaultStorage(), announcements = []) {
  const seenIds = new Set(readSeenProgressionAnnouncementIds(storage));
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

export function enqueueUnitUnlockAnnouncements(storage = defaultStorage(), unitTypes = []) {
  return enqueueProgressionAnnouncements(
    storage,
    uniqueStrings(unitTypes).map((type) => buildUnitUnlockAnnouncement(type)),
  );
}

export function enqueueSkinUnlockAnnouncements(storage = defaultStorage(), skins = []) {
  return enqueueProgressionAnnouncements(
    storage,
    (Array.isArray(skins) ? skins : []).map((skin) => {
      const announcement = buildSkinUnlockAnnouncement(skin);
      return announcement ? { kind: "skin-unlock", unitType: skin.type, skinSlug: skin.slug } : null;
    }).filter(Boolean),
  );
}

export function syncMissingUnitUnlockAnnouncements(storage = defaultStorage()) {
  const starterUnits = new Set(STARTER_UNIT_TYPES);
  const unlockedUnits = readUnlockProgress(storage).unlockedUnits.filter((type) => !starterUnits.has(type));
  return enqueueUnitUnlockAnnouncements(storage, unlockedUnits);
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
