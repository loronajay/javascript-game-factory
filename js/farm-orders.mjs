// The Order Board, for display. PURE — no DOM, no THREE, no storage.
//
// The server writes the board (platform-api/src/services/farm-order-catalog.mts):
// one set of orders per UTC day for everyone in the square, each filled once
// per player. The page reads it from `GET /games/farm/market/orders`, and this
// module turns that answer plus the player's basket into what each notice
// shows: what is still missing, whether the level gate is met, and whether
// Fill should be pressable. The server re-checks every one of those.
import { findCrop } from "./farm-crops.mjs";
function whole(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}
function text(value, limit) {
    return typeof value === "string" ? value.slice(0, limit) : "";
}
function counts(value) {
    const source = value && typeof value === "object" ? value : {};
    const result = {};
    for (const [cropId, raw] of Object.entries(source))
        if (findCrop(cropId))
            result[cropId] = whole(raw);
    return result;
}
/** The API's board answer made safe to draw; null when it is not a board. */
export function normalizeOrderBoard(value) {
    const source = value && typeof value === "object" ? value : null;
    if (!source || !Array.isArray(source.orders))
        return null;
    const orders = source.orders
        .filter((order) => order && typeof order === "object" && typeof order.id === "string")
        .map((order) => Object.freeze({
        id: text(order.id, 40),
        tier: text(order.tier, 20),
        minLevel: Math.max(1, whole(order.minLevel)),
        customer: text(order.customer, 60),
        note: text(order.note, 160),
        lines: Object.freeze(counts(order.lines)),
        tickets: whole(order.tickets),
        xp: whole(order.xp),
        filled: order.filled === true,
    }));
    return Object.freeze({
        endsAt: whole(source.endsAt),
        orders: Object.freeze(orders),
        level: Math.max(1, whole(source.farming?.level)),
        produce: Object.freeze(counts(source.produce)),
    });
}
export function orderView(order, produce, level) {
    const lines = Object.entries(order.lines).map(([cropId, need]) => {
        const held = whole(produce[cropId]);
        return Object.freeze({ cropId, title: findCrop(cropId)?.title ?? cropId, need, held, short: Math.max(0, need - held) });
    });
    const state = order.filled ? "filled"
        : level < order.minLevel ? "locked"
            : lines.some((line) => line.short > 0) ? "short"
                : "ready";
    return Object.freeze({ order, state, lines: Object.freeze(lines) });
}
/** "New orders in 5h 12m" — the board turns over at `endsAt`. */
export function boardTurnoverLabel(endsAt, now) {
    const minutes = Math.max(0, Math.ceil((endsAt - now) / 60_000));
    if (minutes <= 1)
        return "New orders any moment now";
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `New orders in ${hours}h ${minutes % 60}m` : `New orders in ${minutes}m`;
}
const TIER_LABELS = Object.freeze({ small: "Small order", medium: "Standing order", large: "Large order" });
export function orderTierLabel(tier) {
    return TIER_LABELS[tier] ?? "Order";
}
