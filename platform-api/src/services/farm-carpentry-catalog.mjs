// The server's copy of the farm's carpentry: what a log saws into, what each
// piece of furniture takes and which Carpentry level teaches it, how many
// steps its making has, the XP it pays, and what the Sawmill pays for it. It
// mirrors js/farm-catalog/carpentry.mts (tests/farm-workshop.test.mjs holds
// the two together), because planks and furniture are made HERE: the client
// names a mill or a pattern and reports how its steps went; the server checks
// the level and the STORED stock, takes the materials, decides the stars and
// pays the XP.
//
// A PIECE IS COUNTED, NOT UNLOCKED. Crafting a chair makes one chair: the
// pantry-like `inventory.furniture` holds how many of each "item@stars" the
// farm OWNS, placed or not, and a save may place no more of a key than are
// owned (services/farm-loadout-catalog). Stock on the shelf is always owned
// minus placed, so nothing has to be moved between two counts when a piece is
// put down or picked up, and a sale may only take what is not standing on the
// field.
//
// TRUST. The step scores are the client's report of a game played in the
// browser, the same standing as a cook's: they choose between one and three
// stars and nothing else — never the materials, the XP or how many pieces a
// craft makes.
import { FARM_TREE_RULES, TIMBER_TREE_IDS } from "./farm-tree-catalog.mjs";
import { farmDishStars } from "./farm-recipe-catalog.mjs";
const DAY = 24 * 60;
/** The market's per-slot margin (farm-market-catalog MARKET_MARGIN_PER_CELL_DAY; a test holds them equal — importing it would be a cycle, the market prices furniture from here). */
export const WOOD_MARGIN_PER_SLOT_DAY = 12;
// ---------------------------------------------------------------- the sawmill
/** Planks one log saws into, whichever the species. */
export const PLANKS_PER_LOG = 3;
/** The most logs one mill request may saw (a log stack caps at 99). */
export const MAX_MILL_LOGS = 30;
/** What the Market Square's Sawmill charges per log. A farm's own Sawmill charges nothing. */
export const MARKET_MILL_FEE_PER_LOG = 1;
/** The buyable farm Sawmill: mill at home, for free, whenever you like. */
export const FARM_SAWMILL_ITEM_ID = "decor.prop.sawmill";
/** The Carpenter's Workbench: where pieces are made. Free, like the Kitchen Range. */
export const FARM_WORKBENCH_ITEM_ID = "decor.prop.workbench";
/** Carpentry XP for sawing one log, by species: harder wood, more to learn from. */
export const MILL_XP_PER_LOG = Object.freeze({ oak: 8, pine: 12, birch: 18, willow: 26 });
const piece = (minLevel, planks, steps, xp, tickets = 0) => Object.freeze({ minLevel, planks: Object.freeze(planks), tickets, steps, xp });
/** Keyed by the decor item a craft makes: a piece IS a placeable row. */
export const FARM_PIECE_RULES = Object.freeze({
    "decor.furniture.crate": piece(1, { oak: 3 }, 2, 30),
    "decor.furniture.planter-box": piece(1, { oak: 4 }, 2, 40),
    "decor.furniture.stool": piece(3, { oak: 4 }, 3, 55),
    "decor.furniture.chair": piece(6, { oak: 6 }, 3, 75),
    "decor.furniture.table": piece(9, { oak: 8 }, 3, 95),
    "decor.furniture.birdhouse": piece(12, { pine: 4 }, 3, 110),
    "decor.furniture.bookshelf": piece(15, { pine: 10 }, 3, 145),
    "decor.furniture.picnic-table": piece(20, { pine: 12 }, 3, 185),
    "decor.furniture.storage-chest": piece(25, { birch: 8 }, 3, 225),
    "decor.furniture.rocking-chair": piece(30, { birch: 10 }, 3, 265),
    "decor.furniture.garden-arch": piece(38, { birch: 12 }, 3, 325),
    "decor.furniture.porch-swing": piece(45, { willow: 10, oak: 6 }, 3, 410),
    "decor.furniture.grandfather-clock": piece(55, { willow: 14 }, 3, 540, 300),
});
export const FARM_PIECE_IDS = Object.freeze(Object.keys(FARM_PIECE_RULES));
export function farmPieceRule(itemId) {
    return typeof itemId === "string" && Object.prototype.hasOwnProperty.call(FARM_PIECE_RULES, itemId) ? FARM_PIECE_RULES[itemId] : null;
}
/** A piece's stars from its step scores: the kitchen's rule exactly (≥ 0.5 two, ≥ 0.8 three). */
export function farmPieceStars(scores) {
    return farmDishStars(scores);
}
/** "decor.furniture.chair@2" — the furniture key for a piece. */
export function farmPieceKey(itemId, stars) {
    return `${itemId}@${stars}`;
}
const PIECE_KEY = /^(decor\.furniture\.[a-z0-9-]+)@([123])$/;
export function parseFarmPieceKey(key) {
    const match = typeof key === "string" ? PIECE_KEY.exec(key) : null;
    return match && farmPieceRule(match[1]) ? Object.freeze({ itemId: match[1], stars: Number(match[2]) }) : null;
}
/** Every furniture key there can be. */
export const FARM_PIECE_KEYS = Object.freeze(FARM_PIECE_IDS.flatMap((itemId) => [1, 2, 3].map((stars) => farmPieceKey(itemId, stars))));
/** How many pieces of each key stand on the field: crafted rows carry their stars. */
export function placedFarmPieces(decor) {
    const placed = {};
    for (const row of decor ?? []) {
        if (!farmPieceRule(row?.itemId))
            continue;
        const key = farmPieceKey(row.itemId, row.stars);
        placed[key] = (placed[key] ?? 0) + 1;
    }
    return placed;
}
/** What is on the shelf: owned minus placed, never below zero. */
export function unplacedFarmPieces(furniture, decor) {
    const placed = placedFarmPieces(decor);
    const shelf = {};
    for (const [key, owned] of Object.entries(furniture ?? {}))
        shelf[key] = Math.max(0, (Number(owned) || 0) - (placed[key] ?? 0));
    return shelf;
}
// ---------------------------------------------------------------- what the Sawmill pays
/**
 * A log's worth is derived the market's way: a timber tree's regrowth days at
 * the same per-slot margin, over the logs a felling yields. A plank is a third
 * of that. (The sapling is not in it — a stump regrows for as long as it stands.)
 */
export function farmLogValue(speciesId) {
    const rule = FARM_TREE_RULES[speciesId];
    if (!rule || rule.kind !== "timber")
        return 0;
    return (WOOD_MARGIN_PER_SLOT_DAY * (rule.regrowMinutes / DAY)) / rule.yield;
}
export function farmPlankValue(speciesId) {
    return farmLogValue(speciesId) / PLANKS_PER_LOG;
}
/**
 * The Sawmill's premium on a piece's planks, by stars. Larger than the
 * kitchen's: a piece is three hands of work — the felling, the saw and the
 * bench — on wood whose raw worth is small.
 */
export const PIECE_PREMIUM = Object.freeze({ 1: 2, 2: 2.5, 3: 3.2 });
/** A fine piece's tickets come half back when it is sold, so buying one to sell never mints. */
export const PIECE_TICKET_RESALE = 0.5;
export function farmPieceRawValue(itemId) {
    const rule = farmPieceRule(itemId);
    if (!rule)
        return 0;
    return Object.entries(rule.planks).reduce((sum, [speciesId, count]) => sum + farmPlankValue(speciesId) * count, 0);
}
export function farmPiecePrice(itemId, stars) {
    const rule = farmPieceRule(itemId);
    if (!rule)
        return 0;
    return Math.ceil(farmPieceRawValue(itemId) * PIECE_PREMIUM[stars] + rule.tickets * PIECE_TICKET_RESALE);
}
export const FARM_PIECE_PRICES = Object.freeze(Object.fromEntries(FARM_PIECE_IDS.flatMap((itemId) => [1, 2, 3].map((stars) => [farmPieceKey(itemId, stars), farmPiecePrice(itemId, stars)]))));
// ---------------------------------------------------------------- requests
/** A craft's reported scores made safe: exactly `steps` finite numbers in 0..1, or null. */
export function normalizeCraftScores(value, steps) {
    if (!Array.isArray(value) || value.length !== steps)
        return null;
    const scores = value.map((entry) => Number(entry));
    return scores.every((score) => Number.isFinite(score) && score >= 0 && score <= 1) ? scores : null;
}
/** A mill request made safe: a known timber species and a whole count, 1..MAX_MILL_LOGS. */
export function normalizeMillRequest(speciesId, logs) {
    const species = typeof speciesId === "string" && TIMBER_TREE_IDS.includes(speciesId) ? speciesId : "";
    const count = Number(logs);
    if (!species || !Number.isSafeInteger(count) || count < 1 || count > MAX_MILL_LOGS)
        return null;
    return Object.freeze({ speciesId: species, logs: count });
}
/** The id a client gives a craft or a mill so a retried request lands once. */
export const WORKSHOP_ID = /^[A-Za-z0-9_-]{1,80}$/;
/** How many of the latest craft and mill ids the Carpentry record remembers, for retries. */
export const RECENT_WORKSHOP_IDS = 24;
