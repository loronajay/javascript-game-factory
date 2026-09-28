// Player trading, the rules: what a farm may put on the table, how a trade
// moves from an invitation to a settled exchange, and what the exchange does
// to two inventories. PURE — no SQL, no clock of its own, no random. The
// database layer (db/farm-trades.mts) loads a trade row, hands it here with the
// time, and writes back whatever comes out.
//
// The shape follows the plan's rule for the first player economy: goods for
// goods, never tickets. A trade may be one-sided — a gift — but never empty. Only what the SERVER mints can be
// traded — produce (crops and fruit), dishes, logs, planks and furniture off
// the shelf — because those are the stacks a farm save can never raise, so a
// trade that lands cannot be undone or inflated by the client's next save.
// Seeds, saplings and supplies are ticket purchases the save guard lets fall
// freely; a traded seed would be lost to the first save from a stale page.
//
// A trade is two sides, `a` (who invited) and `b`. The table moves through:
//   invited → open        (b accepts)
//   invited → declined    (b declines)
//   invited|open → cancelled (either walks away)
//   invited|open → expired (nobody answered / nobody touched it)
//   open → completed      (both locked the same revision, then both confirmed,
//                          and the server's exchange found both offers still whole)
// Any change to an offer bumps the revision and clears BOTH locks and BOTH
// confirmations, so nobody can be held to a deal they did not see. A lock and a
// confirm name the revision the player was looking at; a stale one is refused.

import { FARM_CROP_RULES } from "./farm-crop-catalog.mjs";
import { FRUIT_TREE_IDS, TIMBER_TREE_IDS } from "./farm-tree-catalog.mjs";
import { parseFarmDishKey } from "./farm-recipe-catalog.mjs";
import { parseFarmPieceKey, unplacedFarmPieces } from "./farm-carpentry-catalog.mjs";

export const TRADE_STACKS = Object.freeze(["produce", "dishes", "logs", "planks", "furniture"] as const);
export type TradeStack = (typeof TRADE_STACKS)[number];
export type TradeOffer = Readonly<Record<TradeStack, Readonly<Record<string, number>>>>;

/** Distinct lines one side may put on the table. */
export const MAX_TRADE_LINES = 12;
/** A stack caps at 99, so no line can move more. */
export const MAX_TRADE_QUANTITY = 99;
/** An invitation nobody answers comes down after a minute. */
export const TRADE_INVITE_TTL_MS = 60_000;
/** An open table nobody touches for five minutes is cleared. */
export const TRADE_IDLE_TTL_MS = 5 * 60_000;
/** Offer changes one trade may take before it is refused as noise. */
export const MAX_TRADE_REVISIONS = 200;
/** Completed trades one player may take part in per UTC day. */
export const DAILY_TRADE_LIMIT = 20;
/** Invitations one player may send per window. */
export const TRADE_INVITES_PER_WINDOW = 10;
export const TRADE_INVITE_WINDOW_MS = 10 * 60_000;
/** The audit trail a trade keeps of who did what, newest last. */
export const MAX_TRADE_EVENTS = 80;

export const TRADE_ID = /^trade-[A-Za-z0-9-]{8,64}$/;
export const TRADE_PLAYER_ID = /^[A-Za-z0-9_-]{1,80}$/;

const CROP_IDS = new Set<string>([...Object.keys(FARM_CROP_RULES), ...FRUIT_TREE_IDS]);
const TIMBER_IDS = new Set<string>(TIMBER_TREE_IDS);

/** Whether `id` names something of `stack` a farm can hold. */
export function tradeableItem(stack: TradeStack, id: string): boolean {
  switch (stack) {
    case "produce": return CROP_IDS.has(id);
    case "dishes": return Boolean(parseFarmDishKey(id));
    case "logs":
    case "planks": return TIMBER_IDS.has(id);
    case "furniture": return Boolean(parseFarmPieceKey(id));
  }
}

export function emptyTradeOffer(): TradeOffer {
  return Object.freeze({ produce: {}, dishes: {}, logs: {}, planks: {}, furniture: {} });
}

/**
 * An offer made safe: known items only, whole counts 1..99 (a 0 drops the
 * line), at most MAX_TRADE_LINES lines in all. `null` for anything malformed —
 * an unknown item is refused, not silently dropped, so a player never locks a
 * table showing less than they meant to give.
 */
export function normalizeTradeOffer(value: unknown): TradeOffer | null {
  if (value === undefined || value === null) return emptyTradeOffer();
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!(TRADE_STACKS as readonly string[]).includes(key)) return null;
  const offer: Record<string, Record<string, number>> = {};
  let lines = 0;
  for (const stack of TRADE_STACKS) {
    const raw = input[stack];
    offer[stack] = {};
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "object" || Array.isArray(raw)) return null;
    for (const [id, count] of Object.entries(raw as Record<string, unknown>)) {
      if (!tradeableItem(stack, id)) return null;
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > MAX_TRADE_QUANTITY) return null;
      if (count === 0) continue;
      offer[stack]![id] = count;
      lines += 1;
    }
  }
  if (lines > MAX_TRADE_LINES) return null;
  return Object.freeze(Object.fromEntries(TRADE_STACKS.map((stack) => [stack, Object.freeze(offer[stack]!)]))) as TradeOffer;
}

export function tradeOfferLines(offer: TradeOffer): number {
  return TRADE_STACKS.reduce((sum, stack) => sum + Object.keys(offer[stack] ?? {}).length, 0);
}

export function tradeOfferIsEmpty(offer: TradeOffer): boolean {
  return tradeOfferLines(offer) === 0;
}

/** What a farm can put on the table right now: its server-minted stacks, furniture as the SHELF (owned minus placed). */
export function tradeableStock(layout: any): TradeOffer {
  const inventory = layout?.agriculture?.inventory ?? {};
  const counts = (value: any) => Object.fromEntries(Object.entries(value ?? {}).filter(([, count]) => Number(count) > 0).map(([id, count]) => [id, Number(count)]));
  return Object.freeze({
    produce: counts(inventory.produce),
    dishes: counts(inventory.dishes),
    logs: counts(inventory.logs),
    planks: counts(inventory.planks),
    furniture: counts(unplacedFarmPieces(inventory.furniture ?? {}, layout?.decor ?? [])),
  });
}

export type TradeShortfall = Readonly<{ stack: TradeStack; id: string; held: number; need: number }>;

/** The first line of `offer` the stock cannot cover, or null when it covers all of it. */
export function tradeShortfall(offer: TradeOffer, stock: TradeOffer): TradeShortfall | null {
  for (const stack of TRADE_STACKS) {
    for (const [id, need] of Object.entries(offer[stack] ?? {})) {
      const held = Number(stock[stack]?.[id]) || 0;
      if (held < need) return Object.freeze({ stack, id, held, need });
    }
  }
  return null;
}

export type TradeSettlement =
  | Readonly<{ ok: true; a: any; b: any }>
  | Readonly<{ ok: false; error: "offer_gone" | "inventory_full"; side: "a" | "b"; stack: TradeStack; id: string }>;

/**
 * The exchange itself, on two STORED farm documents: each side's offer must
 * still be wholly in its stock (furniture on its shelf), each side's goods come
 * off its inventory and go onto the other's, and no stack may pass 99 on
 * either farm. Returns both inventories as they now stand, or why nothing moved.
 * Nothing is minted: the sum of every stack across the two farms is unchanged.
 */
export function settleFarmTrade(layoutA: any, layoutB: any, offerA: TradeOffer, offerB: TradeOffer): TradeSettlement {
  const stockA = tradeableStock(layoutA);
  const stockB = tradeableStock(layoutB);
  const shortA = tradeShortfall(offerA, stockA);
  if (shortA) return { ok: false, error: "offer_gone", side: "a", stack: shortA.stack, id: shortA.id };
  const shortB = tradeShortfall(offerB, stockB);
  if (shortB) return { ok: false, error: "offer_gone", side: "b", stack: shortB.stack, id: shortB.id };
  const inventoryA = copyInventory(layoutA);
  const inventoryB = copyInventory(layoutB);
  for (const stack of TRADE_STACKS) {
    for (const [id, count] of Object.entries(offerA[stack])) {
      inventoryA[stack][id] = (Number(inventoryA[stack][id]) || 0) - count;
      inventoryB[stack][id] = (Number(inventoryB[stack][id]) || 0) + count;
    }
    for (const [id, count] of Object.entries(offerB[stack])) {
      inventoryB[stack][id] = (Number(inventoryB[stack][id]) || 0) - count;
      inventoryA[stack][id] = (Number(inventoryA[stack][id]) || 0) + count;
    }
  }
  for (const [side, inventory] of [["a", inventoryA], ["b", inventoryB]] as const) {
    for (const stack of TRADE_STACKS) {
      for (const [id, count] of Object.entries(inventory[stack])) {
        if (Number(count) > MAX_TRADE_QUANTITY) return { ok: false, error: "inventory_full", side, stack, id };
      }
    }
  }
  return { ok: true, a: inventoryA, b: inventoryB };
}

function copyInventory(layout: any): Record<string, any> & Record<TradeStack, Record<string, number>> {
  const inventory = layout?.agriculture?.inventory ?? {};
  const copy: any = { ...inventory };
  for (const stack of TRADE_STACKS) copy[stack] = { ...(inventory[stack] ?? {}) };
  return copy;
}

// ---------------------------------------------------------------- the table

export type TradeStatus = "invited" | "open" | "completed" | "declined" | "cancelled" | "expired";
export const ACTIVE_TRADE_STATUSES: readonly TradeStatus[] = Object.freeze(["invited", "open"]);

export type TradeSide = Readonly<{ playerId: string; name: string; offer: TradeOffer; locked: boolean; confirmed: boolean }>;
export type TradeEvent = Readonly<{ at: number; by: "a" | "b" | "server"; action: string; revision: number }>;

export type TradeState = Readonly<{
  id: string;
  status: TradeStatus;
  revision: number;
  a: TradeSide;
  b: TradeSide;
  createdAt: number;
  updatedAt: number;
  completedAt: number;
  /** Why the table last went back to open, or why it ended: a code the client words. */
  notice: string;
  endedBy: "a" | "b" | "server" | "";
  events: readonly TradeEvent[];
}>;

export type TradeAction =
  | Readonly<{ type: "accept" }>
  | Readonly<{ type: "decline" }>
  | Readonly<{ type: "cancel" }>
  | Readonly<{ type: "offer"; offer: TradeOffer }>
  | Readonly<{ type: "lock"; revision: number }>
  | Readonly<{ type: "unlock" }>
  | Readonly<{ type: "confirm"; revision: number }>;

/** A client's action made safe, or null. */
export function normalizeTradeAction(value: unknown): TradeAction | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const revision = Number(input.revision);
  switch (input.type) {
    case "accept":
    case "decline":
    case "cancel":
    case "unlock":
      return Object.freeze({ type: input.type });
    case "offer": {
      const offer = normalizeTradeOffer(input.offer);
      return offer ? Object.freeze({ type: "offer", offer }) : null;
    }
    case "lock":
    case "confirm":
      return Number.isSafeInteger(revision) && revision >= 0 ? Object.freeze({ type: input.type, revision }) : null;
    default:
      return null;
  }
}

function side(playerId: string, name: string): TradeSide {
  return Object.freeze({ playerId, name, offer: emptyTradeOffer(), locked: false, confirmed: false });
}

export function newFarmTrade(input: Readonly<{ id: string; a: { playerId: string; name: string }; b: { playerId: string; name: string }; now: number }>): TradeState {
  return Object.freeze({
    id: input.id,
    status: "invited",
    revision: 0,
    a: side(input.a.playerId, input.a.name),
    b: side(input.b.playerId, input.b.name),
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: 0,
    notice: "",
    endedBy: "",
    events: Object.freeze([Object.freeze({ at: input.now, by: "a" as const, action: "invite", revision: 0 })]),
  });
}

export function sideOf(state: TradeState, playerId: string): "a" | "b" | null {
  if (state.a.playerId === playerId) return "a";
  if (state.b.playerId === playerId) return "b";
  return null;
}

export function isActiveTrade(state: TradeState): boolean {
  return (ACTIVE_TRADE_STATUSES as readonly string[]).includes(state.status);
}

function withEvent(state: TradeState, patch: Partial<TradeState>, by: TradeEvent["by"], action: string, now: number): TradeState {
  const next = { ...state, ...patch, updatedAt: now };
  const events = [...state.events, Object.freeze({ at: now, by, action, revision: next.revision })].slice(-MAX_TRADE_EVENTS);
  return Object.freeze({ ...next, events: Object.freeze(events) });
}

function unlockedSide(entry: TradeSide): TradeSide {
  return Object.freeze({ ...entry, locked: false, confirmed: false });
}

/** An invitation nobody answered, or a table nobody touched, is over. Unchanged otherwise. */
export function expireFarmTrade(state: TradeState, now: number): TradeState {
  const stale = (state.status === "invited" && now - state.createdAt >= TRADE_INVITE_TTL_MS)
    || (state.status === "open" && now - state.updatedAt >= TRADE_IDLE_TTL_MS);
  return stale ? withEvent(state, { status: "expired", endedBy: "server", notice: "expired" }, "server", "expire", now) : state;
}

/** When an active trade would expire if nothing happened to it. */
export function tradeExpiresAt(state: TradeState): number {
  if (state.status === "invited") return state.createdAt + TRADE_INVITE_TTL_MS;
  if (state.status === "open") return state.updatedAt + TRADE_IDLE_TTL_MS;
  return 0;
}

export type TradeStep =
  | Readonly<{ ok: true; state: TradeState; settle: boolean; duplicate: boolean }>
  | Readonly<{ ok: false; error: string }>;

/**
 * One player's move on the table. `settle` is true when this move was the
 * second confirmation: the caller must now run the exchange and finish with
 * `completeFarmTrade` or `reopenFarmTrade`. A move that changes nothing a
 * retry would change (a second confirm, a lock already held) is `duplicate`.
 */
export function applyTradeAction(state: TradeState, playerId: string, action: TradeAction, now: number): TradeStep {
  const me = sideOf(state, playerId);
  if (!me) return { ok: false, error: "not_found" };
  const them = me === "a" ? "b" : "a";
  if (state.status === "completed" && action.type === "confirm") return { ok: true, state, settle: false, duplicate: true };
  if (!isActiveTrade(state)) return { ok: false, error: `trade_${state.status}` };
  switch (action.type) {
    case "accept":
      if (state.status !== "invited" || me !== "b") return state.status === "open" ? { ok: true, state, settle: false, duplicate: true } : { ok: false, error: "not_invited" };
      return step(withEvent(state, { status: "open" }, me, "accept", now));
    case "decline":
      if (state.status !== "invited" || me !== "b") return { ok: false, error: "not_invited" };
      return step(withEvent(state, { status: "declined", endedBy: me, notice: "declined" }, me, "decline", now));
    case "cancel":
      return step(withEvent(state, { status: "cancelled", endedBy: me, notice: "cancelled" }, me, "cancel", now));
    case "offer": {
      if (state.status !== "open") return { ok: false, error: "not_open" };
      if (state.revision >= MAX_TRADE_REVISIONS) return { ok: false, error: "too_many_changes" };
      const mine = Object.freeze({ ...state[me], offer: action.offer, locked: false, confirmed: false });
      return step(withEvent(state, { [me]: mine, [them]: unlockedSide(state[them]), revision: state.revision + 1, notice: "" } as Partial<TradeState>, me, "offer", now));
    }
    case "lock":
      if (state.status !== "open") return { ok: false, error: "not_open" };
      if (action.revision !== state.revision) return { ok: false, error: "stale_revision" };
      if (state[me].locked) return { ok: true, state, settle: false, duplicate: true };
      return step(withEvent(state, { [me]: Object.freeze({ ...state[me], locked: true }) } as Partial<TradeState>, me, "lock", now));
    case "unlock":
      if (state.status !== "open") return { ok: false, error: "not_open" };
      // Stepping back from a lock takes every confirmation with it: nobody stays agreed to a table that is moving.
      return step(withEvent(state, { a: unlockedSide(state.a), b: unlockedSide(state.b) }, me, "unlock", now));
    case "confirm": {
      if (state.status !== "open") return { ok: false, error: "not_open" };
      if (action.revision !== state.revision) return { ok: false, error: "stale_revision" };
      if (!state.a.locked || !state.b.locked) return { ok: false, error: "not_locked" };
      // A gift is fine (one side empty); a table with nothing on it is not a trade.
      if (tradeOfferIsEmpty(state.a.offer) && tradeOfferIsEmpty(state.b.offer)) return { ok: false, error: "empty_offer" };
      if (state[me].confirmed) return { ok: true, state, settle: false, duplicate: true };
      const next = withEvent(state, { [me]: Object.freeze({ ...state[me], confirmed: true }) } as Partial<TradeState>, me, "confirm", now);
      return { ok: true, state: next, settle: next[them].confirmed, duplicate: false };
    }
  }
}

function step(state: TradeState): TradeStep {
  return { ok: true, state, settle: false, duplicate: false };
}

export function completeFarmTrade(state: TradeState, now: number): TradeState {
  return withEvent(state, { status: "completed", completedAt: now, notice: "" }, "server", "settle", now);
}

/**
 * The exchange could not run (an offer was no longer whole, a stack would
 * overflow, a daily limit was reached): the table goes back to open, unlocked,
 * on a new revision, with the reason for both players to read.
 */
export function reopenFarmTrade(state: TradeState, notice: string, now: number): TradeState {
  return withEvent(state, { a: unlockedSide(state.a), b: unlockedSide(state.b), revision: state.revision + 1, notice }, "server", `reopen:${notice}`, now);
}

/** A stored trade row made safe to reason about. */
export function normalizeTradeState(value: any): TradeState | null {
  if (!value || typeof value !== "object" || !TRADE_ID.test(String(value.id))) return null;
  const sideFrom = (raw: any): TradeSide | null => {
    if (!raw || !TRADE_PLAYER_ID.test(String(raw.playerId))) return null;
    const offer = normalizeTradeOffer(raw.offer) ?? emptyTradeOffer();
    return Object.freeze({ playerId: String(raw.playerId), name: typeof raw.name === "string" ? raw.name : "", offer, locked: raw.locked === true, confirmed: raw.confirmed === true });
  };
  const a = sideFrom(value.a);
  const b = sideFrom(value.b);
  const statuses: readonly string[] = ["invited", "open", "completed", "declined", "cancelled", "expired"];
  if (!a || !b || !statuses.includes(value.status)) return null;
  const number = (raw: unknown) => (Number.isFinite(Number(raw)) ? Number(raw) : 0);
  return Object.freeze({
    id: String(value.id),
    status: value.status as TradeStatus,
    revision: Math.max(0, Math.floor(number(value.revision))),
    a, b,
    createdAt: number(value.createdAt),
    updatedAt: number(value.updatedAt),
    completedAt: number(value.completedAt),
    notice: typeof value.notice === "string" ? value.notice : "",
    endedBy: (["a", "b", "server"] as const).find((entry) => entry === value.endedBy) ?? "",
    events: Object.freeze(Array.isArray(value.events) ? value.events.slice(-MAX_TRADE_EVENTS) : []),
  });
}

/** The table as one player sees it: their side as `you`, the other as `them`. */
export function farmTradeView(state: TradeState, playerId: string) {
  const me = sideOf(state, playerId);
  if (!me) return null;
  const them = me === "a" ? "b" : "a";
  const present = (entry: TradeSide) => ({ playerId: entry.playerId, name: entry.name, offer: entry.offer, locked: entry.locked, confirmed: entry.confirmed });
  return {
    id: state.id,
    status: state.status,
    revision: state.revision,
    invitedByYou: me === "a",
    you: present(state[me]),
    them: present(state[them]),
    // A notice about one side ("offer_gone_b") is worded from where this player stands.
    notice: state.notice.replace(/_(a|b)$/, (_, which) => (which === me ? "_you" : "_them")),
    endedByYou: state.endedBy === me,
    expiresAt: tradeExpiresAt(state),
    completedAt: state.completedAt,
  };
}

/** The start of the UTC day `now` falls in: the daily limit's window. */
export function tradeDayStart(now: number): number {
  return Math.floor(now / 86_400_000) * 86_400_000;
}
