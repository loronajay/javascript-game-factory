import {
  FRIEND_RAIL_SLOT_COUNT,
  PROFILE_LINK_ROW_COUNT,
} from "./constants.mjs";

export function normalizeUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function collectLinkRows(doc) {
  return Array.from({ length: PROFILE_LINK_ROW_COUNT }, (_, index) => ({
    id: doc?.getElementById?.(`playerProfileLinkId${index + 1}`)?.value || "",
    label: doc?.getElementById?.(`playerProfileLinkLabel${index + 1}`)?.value || "",
    url: normalizeUrl(doc?.getElementById?.(`playerProfileLinkUrl${index + 1}`)?.value || ""),
    kind: doc?.getElementById?.(`playerProfileLinkKind${index + 1}`)?.value || "external",
  }));
}

export function collectFriendSlotPlayerIds(doc) {
  return Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => (
    doc?.getElementById?.(`playerProfileFriendSlot${index + 1}`)?.value || ""
  ));
}
