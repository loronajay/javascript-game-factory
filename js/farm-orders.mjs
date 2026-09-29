// The Order Board, for display. PURE — no DOM, no THREE, no storage.
//
// The server writes the board (platform-api/src/services/farm-order-catalog.mts):
// one set of orders per UTC day for everyone in the square, each filled once
// per player. The page reads it from `GET /games/farm/market/orders`, and this
// module turns that answer plus the player's basket into what each notice
// shows: what is still missing, whether the level gate is met, and whether
// Fill should be pressable. The server re-checks every one of those.
//
// Two kinds of notice share the board: produce orders (the basket, gated on
// Farming) and, since the kitchen opened, dish orders (the pantry, any stars,
// gated on Cooking). Each line names the item model that portrays it.
import { findCrop } from "./farm-crops.mjs";
import { findFruit } from "./farm-catalog/trees.mjs";
import { DISH_KEYS, findRecipe } from "./farm-catalog/recipes.mjs";
import { basketItemTitle, pantryCount } from "./farm-kitchen.mjs";
import { parseProduceKey, produceHeld } from "./farm-quality.mjs";
import { fishHeldForNeed, fishNeedPortraitSpecies, fishNeedTitle, parseFishNeed, pickFishForNeed } from "./farm-fish.mjs";
import { normalizeAnglerFish } from "./farm-angler.mjs";
import { findLivestockBasketItem, findLivestockGood } from "./farm-catalog/livestock.mjs";
function whole(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}
function text(value, limit) {
    return typeof value === "string" ? value.slice(0, limit) : "";
}
/** A basket key: a crop, a livestock good or a meat at any grade, or fruit (which has none). */
function isBasketKey(key) {
    const parsed = parseProduceKey(key);
    return Boolean(parsed && (findCrop(parsed.itemId) || findLivestockBasketItem(parsed.itemId) || (parsed.quality === "normal" && findFruit(parsed.itemId))));
}
function counts(value, known = isBasketKey) {
    const source = value && typeof value === "object" ? value : {};
    const result = {};
    for (const [id, raw] of Object.entries(source))
        if (known(id))
            result[id] = whole(raw);
    return result;
}
const isDishKey = (id) => DISH_KEYS.includes(id);
const isRecipe = (id) => Boolean(findRecipe(id));
const isFishNeed = (id) => Boolean(parseFishNeed(id));
const isGood = (id) => Boolean(findLivestockGood(id));
const KINDS = Object.freeze(["produce", "dish", "fish", "goods"]);
const SKILLS = Object.freeze(["farming", "cooking", "fishing", "husbandry"]);
const LINE_KEYS = Object.freeze({ produce: isBasketKey, dish: isRecipe, fish: isFishNeed, goods: isGood });
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
        kind: KINDS.includes(order.kind) ? order.kind : "produce",
        skill: SKILLS.includes(order.skill) ? order.skill : "farming",
        minLevel: Math.max(1, whole(order.minLevel)),
        customer: text(order.customer, 60),
        note: text(order.note, 160),
        lines: Object.freeze(counts(order.lines, LINE_KEYS[KINDS.includes(order.kind) ? order.kind : "produce"])),
        tickets: whole(order.tickets),
        xp: whole(order.xp),
        filled: order.filled === true,
    }));
    const farming = Math.max(1, whole(source.farming?.level));
    return Object.freeze({
        endsAt: whole(source.endsAt),
        orders: Object.freeze(orders),
        level: farming,
        levels: Object.freeze({
            farming, cooking: Math.max(1, whole(source.cooking?.level)), fishing: Math.max(1, whole(source.fishing?.level)),
            husbandry: Math.max(1, whole(source.husbandry?.level)),
        }),
        produce: Object.freeze(counts(source.produce)),
        dishes: Object.freeze(counts(source.dishes, isDishKey)),
        fish: Object.freeze((Array.isArray(source.creel) ? source.creel : []).map(normalizeAnglerFish).filter((fish) => Boolean(fish))),
    });
}
export function orderView(order, stock) {
    const dish = order.kind === "dish";
    if (order.kind === "fish") {
        // Each line takes its own fish: a fish counted toward one line is not there for the next.
        const taken = new Set();
        const lines = Object.entries(order.lines).map(([key, need]) => {
            const fishNeed = parseFishNeed(key);
            const held = fishHeldForNeed(stock.fish ?? [], fishNeed, taken);
            for (const fish of pickFishForNeed(stock.fish ?? [], fishNeed, Math.min(held, need), taken) ?? [])
                taken.add(fish.id);
            return Object.freeze({ cropId: key, title: fishNeedTitle(fishNeed), need, held, short: Math.max(0, need - held), itemKey: `fish:${fishNeedPortraitSpecies(fishNeed)}` });
        });
        const state = order.filled ? "filled" : (stock.levels[order.skill] ?? 1) < order.minLevel ? "locked" : lines.some((line) => line.short > 0) ? "short" : "ready";
        return Object.freeze({ order, state, lines: Object.freeze(lines) });
    }
    const lines = Object.entries(order.lines).map(([id, need]) => {
        // An order asks for the crop, not its grade; the server takes the plainest first.
        const held = dish ? pantryCount(stock.dishes, id) : whole(produceHeld(stock.produce, id));
        const title = dish ? findRecipe(id)?.title ?? id : basketItemTitle(id);
        return Object.freeze({ cropId: id, title, need, held, short: Math.max(0, need - held), itemKey: dish ? `dish:${id}@2` : `produce:${id}` });
    });
    const state = order.filled ? "filled"
        : stock.levels[order.skill] < order.minLevel ? "locked"
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
const TIER_LABELS = Object.freeze({ small: "Small order", medium: "Standing order", large: "Large order", kitchen: "Kitchen order", banquet: "Banquet", catch: "Fresh catch", special: "Fishmonger's special", herd: "Herd order", "herd-contract": "Herd contract" });
export const SKILL_TITLES = Object.freeze({ farming: "Farming", cooking: "Cooking", fishing: "Fishing", husbandry: "Husbandry" });
export function orderTierLabel(tier) {
    return TIER_LABELS[tier] ?? "Order";
}
