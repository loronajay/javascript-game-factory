import { UNIT_TYPE_KEYS, isUnitUnlocked } from "./squadModel.js";
import { normalizeSkinSlug } from "./skinModel.js";
import { sanitizeNickname, getNicknamePref } from "./nicknameModel.js";

export const DRAFT_SEATS = Object.freeze([1, 2]);
export const DRAFT_PICK_ORDER = Object.freeze([1, 2, 2, 1, 1, 2, 2, 1]);
export const RANKED_BANS_PER_SEAT = 1;

// Snake pick order for a 1v1 draft (8 picks, 4 per seat: A B B A A B B A),
// starting from `firstSeat`. The default (starts seat 1) equals DRAFT_PICK_ORDER.
function snakeOrder(firstSeat, otherSeat) {
  return Object.freeze([firstSeat, otherSeat, otherSeat, firstSeat, firstSeat, otherSeat, otherSeat, firstSeat]);
}

// A draft with a ban phase (ranked). `banFirstSeat` bans first, and — per the ranked
// rule "banning first gives up the first pick" — the OTHER seat picks first. Passing
// no banFirstSeat yields a plain draft identical to the previous behavior.
export function createDraftState({ seats = DRAFT_SEATS, banFirstSeat = null } = {}) {
  const normalizedSeats = seats.map((seat) => Number(seat)).filter((seat) => Number.isInteger(seat) && seat > 0);
  const activeSeats = normalizedSeats.length ? normalizedSeats : [...DRAFT_SEATS];
  const first = Number(banFirstSeat);
  const banned = first === 1 || first === 2;
  const other = first === 1 ? 2 : 1;
  const pickOrder = banned ? snakeOrder(other, first) : [...DRAFT_PICK_ORDER];
  const banOrder = banned ? [first, other] : [];
  return {
    seats: activeSeats,
    pickOrder,
    banOrder,
    banIndex: 0,
    bans: [],
    pickIndex: 0,
    picks: Object.fromEntries(activeSeats.map((seat) => [seat, []])),
    skins: Object.fromEntries(activeSeats.map((seat) => [seat, []])),
    nicknames: Object.fromEntries(activeSeats.map((seat) => [seat, []])),
  };
}

export function draftPickOrder(draft) {
  return Array.isArray(draft?.pickOrder) && draft.pickOrder.length ? draft.pickOrder : DRAFT_PICK_ORDER;
}

export function bannedTypes(draft) {
  return new Set(Array.isArray(draft?.bans) ? draft.bans : []);
}

export function isBanPhaseComplete(draft) {
  const order = Array.isArray(draft?.banOrder) ? draft.banOrder : [];
  return (draft?.banIndex ?? 0) >= order.length;
}

// The seat whose ban is up, or null when there is no pending ban.
export function currentBanSeat(draft) {
  if (!draft || isBanPhaseComplete(draft)) return null;
  return draft.banOrder[draft.banIndex] ?? null;
}

// 'ban' while bans are pending, then 'pick', then 'complete'.
export function draftPhase(draft) {
  if (!isBanPhaseComplete(draft)) return "ban";
  return isDraftComplete(draft) ? "complete" : "pick";
}

// Bans target the ENTIRE draftable pool — you ban what your opponent could field,
// not only units you personally own — so ownership is intentionally NOT checked here
// (unlike canDraftType, where you may only pick from your own unlocked roster).
export function canBanType(draft, seat, type) {
  if (!draft || isBanPhaseComplete(draft)) return false;
  if (currentBanSeat(draft) !== Number(seat)) return false;
  if (!UNIT_TYPE_KEYS.includes(type)) return false;
  if (bannedTypes(draft).has(type)) return false;
  return true;
}

export function applyBan(draft, { seat, type } = {}) {
  const numericSeat = Number(seat);
  if (!canBanType(draft, numericSeat, type)) {
    return { accepted: false, errorCode: "INVALID_BAN", nextState: draft };
  }
  const next = cloneDraft(draft);
  next.bans = [...next.bans, type];
  next.banIndex = draft.banIndex + 1;
  return { accepted: true, nextState: next };
}

export function currentDraftSeat(draft) {
  if (!draft || !isBanPhaseComplete(draft) || isDraftComplete(draft)) return null;
  return draftPickOrder(draft)[draft.pickIndex] ?? null;
}

export function draftedTypes(draft) {
  return new Set(Object.values(draft?.picks ?? {}).flat());
}

export function isDraftComplete(draft) {
  return !!draft && draft.pickIndex >= draftPickOrder(draft).length;
}

// `isUnlocked` is injectable so draft-engine tests (pick order, uniqueness) can
// exercise the full roster without being coupled to the campaign content gate;
// production callers rely on the default (only starter units are unlocked).
export function canDraftType(draft, seat, type, { isUnlocked = isUnitUnlocked } = {}) {
  if (!draft || !isBanPhaseComplete(draft) || isDraftComplete(draft)) return false;
  if (currentDraftSeat(draft) !== Number(seat)) return false;
  if (!UNIT_TYPE_KEYS.includes(type)) return false;
  if (!isUnlocked(type)) return false;
  if (bannedTypes(draft).has(type)) return false;
  if (draftedTypes(draft).has(type)) return false;
  const picks = draft.picks?.[seat] ?? [];
  return picks.length < draftPickOrder(draft).filter((draftSeat) => draftSeat === Number(seat)).length;
}

function cloneDraft(draft) {
  return {
    seats: [...draft.seats],
    pickOrder: draftPickOrder(draft),
    banOrder: Array.isArray(draft.banOrder) ? [...draft.banOrder] : [],
    banIndex: draft.banIndex ?? 0,
    bans: Array.isArray(draft.bans) ? [...draft.bans] : [],
    pickIndex: draft.pickIndex,
    picks: Object.fromEntries(Object.entries(draft.picks).map(([key, value]) => [key, [...value]])),
    skins: Object.fromEntries(Object.entries(draft.skins ?? {}).map(([key, value]) => [key, [...value]])),
    nicknames: Object.fromEntries(Object.entries(draft.nicknames ?? {}).map(([key, value]) => [key, [...value]])),
  };
}

export function applyDraftPick(draft, { seat, type, skin = null, nickname = null, isUnlocked = isUnitUnlocked } = {}) {
  const numericSeat = Number(seat);
  if (!canDraftType(draft, numericSeat, type, { isUnlocked })) {
    return { accepted: false, errorCode: "INVALID_DRAFT_PICK", nextState: draft };
  }
  const next = cloneDraft(draft);
  next.pickIndex = draft.pickIndex + 1;
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
