import { UNIT_TYPE_KEYS, isUnitUnlocked } from "./squadModel.js";
import { normalizeSkinSlug } from "./skinModel.js";
import { sanitizeNickname, getNicknamePref } from "./nicknameModel.js";

export const DRAFT_SEATS = Object.freeze([1, 2]);
export const DRAFT_PICK_ORDER = Object.freeze([1, 2, 2, 1, 1, 2, 2, 1]);

export function createDraftState({ seats = DRAFT_SEATS } = {}) {
  const normalizedSeats = seats.map((seat) => Number(seat)).filter((seat) => Number.isInteger(seat) && seat > 0);
  return {
    seats: normalizedSeats.length ? normalizedSeats : [...DRAFT_SEATS],
    pickIndex: 0,
    picks: Object.fromEntries((normalizedSeats.length ? normalizedSeats : DRAFT_SEATS).map((seat) => [seat, []])),
    skins: Object.fromEntries((normalizedSeats.length ? normalizedSeats : DRAFT_SEATS).map((seat) => [seat, []])),
    nicknames: Object.fromEntries((normalizedSeats.length ? normalizedSeats : DRAFT_SEATS).map((seat) => [seat, []])),
  };
}

export function currentDraftSeat(draft) {
  if (!draft || isDraftComplete(draft)) return null;
  return DRAFT_PICK_ORDER[draft.pickIndex] ?? null;
}

export function draftedTypes(draft) {
  return new Set(Object.values(draft?.picks ?? {}).flat());
}

export function isDraftComplete(draft) {
  return !!draft && draft.pickIndex >= DRAFT_PICK_ORDER.length;
}

// `isUnlocked` is injectable so draft-engine tests (pick order, uniqueness) can
// exercise the full roster without being coupled to the campaign content gate;
// production callers rely on the default (only starter units are unlocked).
export function canDraftType(draft, seat, type, { isUnlocked = isUnitUnlocked } = {}) {
  if (!draft || isDraftComplete(draft)) return false;
  if (currentDraftSeat(draft) !== Number(seat)) return false;
  if (!UNIT_TYPE_KEYS.includes(type)) return false;
  if (!isUnlocked(type)) return false;
  if (draftedTypes(draft).has(type)) return false;
  const picks = draft.picks?.[seat] ?? [];
  return picks.length < DRAFT_PICK_ORDER.filter((draftSeat) => draftSeat === Number(seat)).length;
}

export function applyDraftPick(draft, { seat, type, skin = null, nickname = null, isUnlocked = isUnitUnlocked } = {}) {
  const numericSeat = Number(seat);
  if (!canDraftType(draft, numericSeat, type, { isUnlocked })) {
    return { accepted: false, errorCode: "INVALID_DRAFT_PICK", nextState: draft };
  }
  const next = {
    seats: [...draft.seats],
    pickIndex: draft.pickIndex + 1,
    picks: Object.fromEntries(Object.entries(draft.picks).map(([key, value]) => [key, [...value]])),
    skins: Object.fromEntries(Object.entries(draft.skins ?? {}).map(([key, value]) => [key, [...value]])),
    nicknames: Object.fromEntries(Object.entries(draft.nicknames ?? {}).map(([key, value]) => [key, [...value]])),
  };
  next.picks[numericSeat] = [...(next.picks[numericSeat] ?? []), type];
  next.skins[numericSeat] = [...(next.skins[numericSeat] ?? []), normalizeSkinSlug(type, skin)];
  next.nicknames[numericSeat] = [...(next.nicknames[numericSeat] ?? []), sanitizeNickname(nickname) ?? getNicknamePref(type)];
  return { accepted: true, nextState: next };
}

function normalizedFormationOrder(order, length) {
  const fallback = Array.from({ length }, (_, index) => index);
  if (!Array.isArray(order) || order.length !== length) return fallback;
  const normalized = order.map((index) => Number(index));
  if (normalized.some((index) => !Number.isInteger(index) || index < 0 || index >= length)) return fallback;
  if (new Set(normalized).size !== length) return fallback;
  return normalized;
}

export function arrangeDraftLoadout(draft, seat, order = null) {
  const picks = [...(draft?.picks?.[seat] ?? [])].slice(0, 4);
  const skins = [...(draft?.skins?.[seat] ?? [])].slice(0, picks.length);
  const nicknames = [...(draft?.nicknames?.[seat] ?? [])].slice(0, picks.length);
  const formationOrder = normalizedFormationOrder(order, picks.length);
  return {
    composition: formationOrder.map((index) => picks[index]),
    skins: formationOrder.map((index) => normalizeSkinSlug(picks[index], skins[index] ?? null)),
    nicknames: formationOrder.map((index) => nicknames[index] ?? null),
  };
}
