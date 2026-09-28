// The Market Square's Order Board: rotating NPC contracts. Server-owned — the
// client reads the board from `GET /games/farm/market/orders` and names an
// order to fill; what it asks for and what it pays are decided here.
//
// ONE BOARD FOR EVERYONE. The board is a pure function of the UTC day, so
// every farmer in the shared square is reading the same three notices (and can
// talk about them), while each fills their own copy once. Nothing is stored
// to rotate it: day N's board is regenerated from N whenever it is asked for,
// and the ticket ledger's `farm:order:<id>` key is what makes a fill once-only.
//
// WHY ORDERS PAY BETTER. A raw sale returns the seed plus a flat margin per
// cell-day (farm-market-catalog). An order pays that same raw value times a
// premium that rises with its size, plus Farming XP — so growing what the town
// asks for, several crops at once, beats growing one crop and dumping it. That
// is the plan's main defence against a single optimal crop.
//
// Tiers gate on Farming level: the large order is a capability a level buys.
//
// THE KITCHEN'S ORDERS (Phase 6). Two more notices go up every day asking for
// cooked dishes rather than produce: a kitchen order at Cooking 1 and a
// banquet at Cooking 10. They only ask for recipes their gate teaches, pay a
// premium on the dishes' two-star Market price, and pay Cooking XP. They are
// drawn from their own seeded stream after the produce notices, so adding
// them left every produce order that was ever posted exactly as it was.
import { FARM_CROP_RULES } from "./farm-crop-catalog.mjs";
import { farmDishPrice, farmProducePrice } from "./farm-market-catalog.mjs";
import { farmHarvestXp } from "./farm-skill-catalog.mjs";
import { FARM_RECIPE_RULES } from "./farm-recipe-catalog.mjs";
import { farmSeedFor as seedFor, farmSeededRandom as mulberry32 } from "./farm-seeded-random.mjs";
import { farmFishNeedValue, farmFishNeedXp, parseFishNeed } from "./farm-fish-catalog.mjs";
export const FARM_ORDER_DAY_MS = 24 * 60 * 60 * 1000;
/** An order's XP is this share of what growing its produce earned. */
export const ORDER_XP_SHARE = 0.5;
const MAX_LINE = 99;
export const FARM_ORDER_TIERS = Object.freeze([
    Object.freeze({ tier: "small", minLevel: 1, crops: 1, harvests: Object.freeze([1, 2]), premium: 1.5 }),
    Object.freeze({ tier: "medium", minLevel: 5, crops: 2, harvests: Object.freeze([1, 2]), premium: 1.6 }),
    Object.freeze({ tier: "large", minLevel: 10, crops: 3, harvests: Object.freeze([2, 3]), premium: 1.75 }),
]);
/** Who pins orders up. `note` is what their notice says. */
export const FARM_ORDER_CUSTOMERS = Object.freeze([
    { name: "Martha's Bakery", note: "Baking for the weekend rush. Fresh only, please!" },
    { name: "The Crooked Kettle Inn", note: "The stew pot is empty and the regulars are restless." },
    { name: "Pickle & Preserve Co.", note: "Jarring season. We'll take it by the crate." },
    { name: "Schoolhouse Kitchen", note: "Lunch for forty hungry kids. No pressure." },
    { name: "Harvest Festival Committee", note: "The judges' table needs filling before the parade." },
    { name: "Old Man Hollis", note: "Can't work my own field anymore. I pay fair." },
    { name: "Riverside Soup Kitchen", note: "Anything helps, but this list helps most." },
    { name: "Juniper's Juice Cart", note: "Blending all week. Bring it ripe." },
    { name: "The Mayor's Garden Party", note: "Everything must look perfect. EVERYTHING." },
    { name: "Copperpot Catering", note: "Wedding on Saturday. The bride is very particular." },
].map((entry) => Object.freeze(entry)));
export const FARM_KITCHEN_ORDER_TIERS = Object.freeze([
    Object.freeze({ tier: "kitchen", minLevel: 1, recipes: 1, dishes: Object.freeze([1, 2]), premium: 1.3 }),
    Object.freeze({ tier: "banquet", minLevel: 10, recipes: 2, dishes: Object.freeze([2, 3]), premium: 1.4 }),
]);
/** A dish order's Cooking XP is this share of what cooking its dishes earned. */
export const DISH_ORDER_XP_SHARE = 0.5;
export const FARM_FISH_ORDER_TIERS = Object.freeze([
    Object.freeze({
        tier: "catch", minLevel: 1, lines: 1, count: Object.freeze([2, 4]), premium: 1.6,
        needs: Object.freeze(["zone=lagoon", "rarity=common", "species=fish.goldfish", "species=fish.tetra", "species=fish.armored-catfish", "zone=lagoon,size=average"]),
    }),
    Object.freeze({
        tier: "special", minLevel: 10, lines: 2, count: Object.freeze([1, 2]), premium: 1.75,
        needs: Object.freeze([
            "zone=reef", "rarity=uncommon", "species=fish.red-snapper", "species=fish.puffer", "species=fish.clownfish",
            "zone=reef,size=large", "species=fish.piranha,size=large", "rarity=rare", "species=fish.koi", "zone=deep",
        ]),
    }),
]);
/** A fish order's Fishing XP is this share of what landing its fish earned. */
export const FISH_ORDER_XP_SHARE = 0.5;
export function farmOrderDay(now) {
    return Math.floor(now / FARM_ORDER_DAY_MS);
}
function pick(list, random, taken) {
    const open = list.filter((entry) => !taken.has(entry));
    const choice = open[Math.floor(random() * open.length)];
    taken.add(choice);
    return choice;
}
/** What the lines would fetch sold raw at the Produce Merchant. */
export function farmOrderRawValue(lines) {
    return Object.entries(lines).reduce((sum, [cropId, quantity]) => sum + farmProducePrice(cropId) * quantity, 0);
}
/** The XP an order pays: a share of what harvesting its produce earned. */
export function farmOrderXp(lines) {
    let xp = 0;
    for (const [cropId, quantity] of Object.entries(lines)) {
        xp += (quantity / FARM_CROP_RULES[cropId].yield) * farmHarvestXp(cropId);
    }
    return Math.max(1, Math.round(xp * ORDER_XP_SHARE));
}
/** Day `day`'s board: one order per tier, customers and crops all different. */
export function farmOrderBoard(day) {
    const random = mulberry32(seedFor(`farm-orders:v1:${day}`));
    const cropIds = Object.keys(FARM_CROP_RULES);
    const customers = new Set();
    return Object.freeze(FARM_ORDER_TIERS.map((tier, slot) => {
        const customer = pick(FARM_ORDER_CUSTOMERS, random, customers);
        const cropsTaken = new Set();
        const lines = {};
        for (let index = 0; index < tier.crops; index += 1) {
            const cropId = pick(cropIds, random, cropsTaken);
            // Half-harvest steps between the tier's low and high.
            const steps = Math.round((tier.harvests[1] - tier.harvests[0]) * 2);
            const harvests = tier.harvests[0] + Math.floor(random() * (steps + 1)) / 2;
            lines[cropId] = Math.min(MAX_LINE, Math.max(1, Math.round(FARM_CROP_RULES[cropId].yield * harvests)));
        }
        const tickets = Math.ceil((farmOrderRawValue(lines) * tier.premium) / 5) * 5;
        return Object.freeze({
            id: `d${day}-${slot}`,
            day,
            slot,
            tier: tier.tier,
            kind: "produce",
            skill: "farming",
            minLevel: tier.minLevel,
            customer: customer.name,
            note: customer.note,
            lines: Object.freeze(lines),
            tickets,
            xp: farmOrderXp(lines),
            endsAt: (day + 1) * FARM_ORDER_DAY_MS,
        });
    }));
}
/** What the dishes would fetch at two stars at the Market's Kitchen. */
export function farmDishOrderValue(lines) {
    return Object.entries(lines).reduce((sum, [recipeId, count]) => sum + farmDishPrice(recipeId, 2) * count, 0);
}
export function farmDishOrderXp(lines) {
    const xp = Object.entries(lines).reduce((sum, [recipeId, count]) => sum + (FARM_RECIPE_RULES[recipeId]?.xp ?? 0) * count, 0);
    return Math.max(1, Math.round(xp * DISH_ORDER_XP_SHARE));
}
/** Day `day`'s dish notices, in the slots after the produce notices; customers not already on the board. */
function farmKitchenOrders(day, firstSlot, taken) {
    const random = mulberry32(seedFor(`farm-orders:kitchen:v1:${day}`));
    const customers = new Set(FARM_ORDER_CUSTOMERS.filter((entry) => taken.has(entry.name)));
    return FARM_KITCHEN_ORDER_TIERS.map((tier, index) => {
        const customer = pick(FARM_ORDER_CUSTOMERS, random, customers);
        const taught = Object.keys(FARM_RECIPE_RULES).filter((recipeId) => FARM_RECIPE_RULES[recipeId].vendorPrice === 0 && FARM_RECIPE_RULES[recipeId].minLevel <= tier.minLevel);
        const recipesTaken = new Set();
        const lines = {};
        for (let line = 0; line < Math.min(tier.recipes, taught.length); line += 1) {
            const recipeId = pick(taught, random, recipesTaken);
            lines[recipeId] = tier.dishes[0] + Math.floor(random() * (tier.dishes[1] - tier.dishes[0] + 1));
        }
        const slot = firstSlot + index;
        return Object.freeze({
            id: `d${day}-${slot}`,
            day,
            slot,
            tier: tier.tier,
            kind: "dish",
            skill: "cooking",
            minLevel: tier.minLevel,
            customer: customer.name,
            note: customer.note,
            lines: Object.freeze(lines),
            tickets: Math.ceil((farmDishOrderValue(lines) * tier.premium) / 5) * 5,
            xp: farmDishOrderXp(lines),
            endsAt: (day + 1) * FARM_ORDER_DAY_MS,
        });
    });
}
/** What a fish order's lines would fetch at the Fishmonger, at their cheapest. */
export function farmFishOrderValue(lines) {
    return Object.entries(lines).reduce((sum, [key, count]) => {
        const need = parseFishNeed(key);
        return sum + (need ? farmFishNeedValue(need) * count : 0);
    }, 0);
}
export function farmFishOrderXp(lines) {
    const xp = Object.entries(lines).reduce((sum, [key, count]) => {
        const need = parseFishNeed(key);
        return sum + (need ? farmFishNeedXp(need) * count : 0);
    }, 0);
    return Math.max(1, Math.round(xp * FISH_ORDER_XP_SHARE));
}
/** Day `day`'s fish notices, in the slots after the kitchen's; customers not already on the board. */
function farmFishOrders(day, firstSlot, taken) {
    const random = mulberry32(seedFor(`farm-orders:cove:v1:${day}`));
    const customers = new Set(FARM_ORDER_CUSTOMERS.filter((entry) => taken.has(entry.name)));
    return FARM_FISH_ORDER_TIERS.map((tier, index) => {
        // Every customer may already be up: then the board's regulars take a second notice.
        const customer = customers.size >= FARM_ORDER_CUSTOMERS.length ? FARM_ORDER_CUSTOMERS[(day + index) % FARM_ORDER_CUSTOMERS.length] : pick(FARM_ORDER_CUSTOMERS, random, customers);
        const needsTaken = new Set();
        const lines = {};
        for (let line = 0; line < Math.min(tier.lines, tier.needs.length); line += 1) {
            const key = pick(tier.needs, random, needsTaken);
            lines[key] = tier.count[0] + Math.floor(random() * (tier.count[1] - tier.count[0] + 1));
        }
        const slot = firstSlot + index;
        return Object.freeze({
            id: `d${day}-${slot}`,
            day,
            slot,
            tier: tier.tier,
            kind: "fish",
            skill: "fishing",
            minLevel: tier.minLevel,
            customer: customer.name,
            note: customer.note,
            lines: Object.freeze(lines),
            tickets: Math.ceil((farmFishOrderValue(lines) * tier.premium) / 5) * 5,
            xp: farmFishOrderXp(lines),
            endsAt: (day + 1) * FARM_ORDER_DAY_MS,
        });
    });
}
/** Day `day`'s whole board: the produce notices, then the kitchen's, then the Cove's. */
export function farmFullOrderBoard(day) {
    const produce = farmOrderBoard(day);
    const kitchen = farmKitchenOrders(day, produce.length, new Set(produce.map((order) => order.customer)));
    const upSoFar = [...produce, ...kitchen];
    return Object.freeze([...upSoFar, ...farmFishOrders(day, upSoFar.length, new Set(upSoFar.map((order) => order.customer)))]);
}
const ORDER_ID = /^d(\d{1,7})-(\d)$/;
/** The order an id names, if it is on day `day`'s board. An id from any other day is not. */
export function findFarmOrder(orderId, day) {
    const match = typeof orderId === "string" ? ORDER_ID.exec(orderId) : null;
    if (!match || Number(match[1]) !== day)
        return null;
    return farmFullOrderBoard(day)[Number(match[2])] ?? null;
}
/** An id that is well formed but for another day: the board has turned over. */
export function isStaleFarmOrderId(orderId, day) {
    const match = typeof orderId === "string" ? ORDER_ID.exec(orderId) : null;
    return Boolean(match) && Number(match[1]) !== day;
}
export function farmOrderTransactionKey(orderId) {
    return `farm:order:${orderId}`;
}
