import { UNIT_TYPE_KEYS } from "./squadModel.js";
import { normalizeSkinSlug } from "./skinModel.js";

export const DRAFT_SEATS = Object.freeze([1, 2]);
export const DRAFT_PICK_ORDER = Object.freeze([1, 2, 2, 1, 1, 2, 2, 1]);

export function createDraftState({ seats = DRAFT_SEATS } = {}) {
  const normalizedSeats = seats.map((seat) => Number(seat)).filter((seat) => Number.isInteger(seat) && seat > 0);
  return {
    seats: normalizedSeats.length ? normalizedSeats : [...DRAFT_SEATS],
    pickIndex: 0,
    picks: Object.fromEntries((normalizedSeats.length ? normalizedSeats : DRAFT_SEATS).map((seat) => [seat, []])),
    skins: Object.fromEntries((normalizedSeats.length ? normalizedSeats : DRAFT_SEATS).map((seat) => [seat, []])),
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

export function canDraftType(draft, seat, type) {
  if (!draft || isDraftComplete(draft)) return false;
  if (currentDraftSeat(draft) !== Number(seat)) return false;
  if (!UNIT_TYPE_KEYS.includes(type)) return false;
  if (draftedTypes(draft).has(type)) return false;
  const picks = draft.picks?.[seat] ?? [];
  return picks.length < DRAFT_PICK_ORDER.filter((draftSeat) => draftSeat === Number(seat)).length;
}

export function applyDraftPick(draft, { seat, type, skin = null } = {}) {
  const numericSeat = Number(seat);
  if (!canDraftType(draft, numericSeat, type)) {
    return { accepted: false, errorCode: "INVALID_DRAFT_PICK", nextState: draft };
  }
  const next = {
    seats: [...draft.seats],
    pickIndex: draft.pickIndex + 1,
    picks: Object.fromEntries(Object.entries(draft.picks).map(([key, value]) => [key, [...value]])),
    skins: Object.fromEntries(Object.entries(draft.skins ?? {}).map(([key, value]) => [key, [...value]])),
  };
  next.picks[numericSeat] = [...(next.picks[numericSeat] ?? []), type];
  next.skins[numericSeat] = [...(next.skins[numericSeat] ?? []), normalizeSkinSlug(type, skin)];
  return { accepted: true, nextState: next };
}
