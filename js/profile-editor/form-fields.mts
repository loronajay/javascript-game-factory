import {
  FRIEND_RAIL_SLOT_COUNT,
  PROFILE_LINK_ROW_COUNT,
} from "./constants.mjs";

type DocLike = Document | null | undefined;

function inputValue(doc: DocLike, id: string): string {
  return (doc?.getElementById?.(id) as HTMLInputElement | HTMLSelectElement | null)?.value || "";
}

export function normalizeUrl(raw: unknown): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export interface CollectedLinkRow {
  id: string;
  label: string;
  url: string;
  kind: string;
}

export function collectLinkRows(doc: DocLike): CollectedLinkRow[] {
  return Array.from({ length: PROFILE_LINK_ROW_COUNT }, (_, index) => ({
    id: inputValue(doc, `playerProfileLinkId${index + 1}`),
    label: inputValue(doc, `playerProfileLinkLabel${index + 1}`),
    url: normalizeUrl(inputValue(doc, `playerProfileLinkUrl${index + 1}`)),
    kind: inputValue(doc, `playerProfileLinkKind${index + 1}`) || "external",
  }));
}

export function collectFriendSlotPlayerIds(doc: DocLike): string[] {
  return Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => (
    inputValue(doc, `playerProfileFriendSlot${index + 1}`)
  ));
}
