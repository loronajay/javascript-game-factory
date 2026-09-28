// The farm's carpentry, as DATA: what a log saws into, and every piece of
// furniture the Carpenter's Workbench can make — what it takes, how it is
// made, which Carpentry level teaches it. Pure — no THREE, no DOM — so the
// workshop rules, the carpentry games, the views and (mirrored) the API read
// one list. platform-api/src/services/farm-carpentry-catalog.mts is the
// server's copy; a test holds the two equal.
//
// THE CHAIN. Fell a timber tree (Woodcutting) → logs → saw them at a Sawmill
// → planks of that wood → make a piece at the Workbench → furniture. Two
// sawmills: the Market Square's stall charges a small fee per log; a farm's
// own Sawmill (bought once) saws for nothing.
//
// A PIECE IS A PLACEABLE THING. Every pattern's id IS a decor item id
// (`decor.furniture.<piece>`, farm-catalog/decor.mts), so the finished piece is
// exactly what the build mode's Furniture tab places. Pieces are COUNTED: a
// craft makes one, placing one uses one, picking one up puts it back.
//
// CARPENTRY IS PLAYED. `steps` is the order of short games at the bench
// (`farm-carpentry.mts`): mark the measure, saw on the stroke, drive the
// nails. How well they go decides the stars — which show on the placed piece
// as its finish and set what the Sawmill pays for it — and nothing else.
import { TIMBER_TREES } from "./trees.mjs";
export const CRAFT_STEP_TITLES = Object.freeze({
    measure: "Measure",
    saw: "Saw",
    nail: "Nail",
});
// ---------------------------------------------------------------- the sawmill
/** Planks one log saws into, whichever the species. */
export const PLANKS_PER_LOG = 3;
/** The most logs one mill may saw at once. */
export const MAX_MILL_LOGS = 30;
/** What the Market Square's Sawmill charges per log; a farm's own Sawmill charges nothing. */
export const MARKET_MILL_FEE_PER_LOG = 1;
/** Carpentry XP for sawing one log, by species. */
export const MILL_XP_PER_LOG = Object.freeze({ oak: 8, pine: 12, birch: 18, willow: 26 });
/** The Carpenter's Workbench: where pieces are made. Free and starter-owned, like the Kitchen Range. */
export const WORKBENCH_ITEM_ID = "decor.prop.workbench";
/** A farm's own Sawmill: bought with tickets, mills for free. */
export const SAWMILL_ITEM_ID = "decor.prop.sawmill";
const WOOD = Object.freeze({
    oak: Object.freeze({ color: "#b98a55", grain: "#8a6238" }),
    pine: Object.freeze({ color: "#dcb97c", grain: "#b48a4e" }),
    birch: Object.freeze({ color: "#ead9b2", grain: "#c7b287" }),
    willow: Object.freeze({ color: "#9d6c45", grain: "#6f4a2d" }),
});
/** Every plank there is, in the order the timber trees are (oak, pine, birch, willow). */
export const PLANK_SPECIES = Object.freeze(TIMBER_TREES.map((species) => Object.freeze({
    id: species.id,
    title: `${species.title} Planks`,
    color: WOOD[species.id]?.color ?? "#b98a55",
    grain: WOOD[species.id]?.grain ?? "#8a6238",
})));
export function findPlankSpecies(id) {
    return PLANK_SPECIES.find((entry) => entry.id === id);
}
function pattern(variant, title, spec) {
    return Object.freeze({
        id: `decor.furniture.${variant}`,
        title,
        blurb: spec.blurb,
        minLevel: spec.minLevel,
        planks: Object.freeze({ ...spec.planks }),
        tickets: spec.tickets ?? 0,
        steps: Object.freeze([...spec.steps]),
        xp: spec.xp,
    });
}
const FULL = ["measure", "saw", "nail"];
/** Level order. Oak is the first wood, pine at Woodcutting 10, birch at 20, willow at 35 — the patterns follow. */
export const PATTERN_CATALOG = Object.freeze([
    pattern("crate", "Wooden Crate", { blurb: "A slatted crate for the shed, the stall or the pantry.", minLevel: 1, planks: { oak: 3 }, steps: ["saw", "nail"], xp: 30 }),
    pattern("planter-box", "Planter Box", { blurb: "A raised box of flowers for a doorstep or a path.", minLevel: 1, planks: { oak: 4 }, steps: ["saw", "nail"], xp: 40 }),
    pattern("stool", "Stool", { blurb: "Three legs and a round top. Somewhere to sit by the fire.", minLevel: 3, planks: { oak: 4 }, steps: FULL, xp: 55 }),
    pattern("chair", "Farmhouse Chair", { blurb: "A ladder-back chair, square and solid.", minLevel: 6, planks: { oak: 6 }, steps: FULL, xp: 75 }),
    pattern("table", "Kitchen Table", { blurb: "A plank-top table for four, with turned legs.", minLevel: 9, planks: { oak: 8 }, steps: FULL, xp: 95 }),
    pattern("birdhouse", "Birdhouse", { blurb: "A little house on a post, with a round door for the wrens.", minLevel: 12, planks: { pine: 4 }, steps: FULL, xp: 110 }),
    pattern("bookshelf", "Bookshelf", { blurb: "Four shelves of pine, already filling with almanacs.", minLevel: 15, planks: { pine: 10 }, steps: FULL, xp: 145 }),
    pattern("picnic-table", "Picnic Table", { blurb: "A table with its benches built on, for lunch in the yard.", minLevel: 20, planks: { pine: 12 }, steps: FULL, xp: 185 }),
    pattern("storage-chest", "Storage Chest", { blurb: "A pale birch chest with iron bands and a hasp.", minLevel: 25, planks: { birch: 8 }, steps: FULL, xp: 225 }),
    pattern("rocking-chair", "Rocking Chair", { blurb: "Birch runners and a spindle back, for the porch at dusk.", minLevel: 30, planks: { birch: 10 }, steps: FULL, xp: 265 }),
    pattern("garden-arch", "Garden Arch", { blurb: "A lattice arch to walk under, climbing roses and all.", minLevel: 38, planks: { birch: 12 }, steps: FULL, xp: 325 }),
    pattern("porch-swing", "Porch Swing", { blurb: "A willow swing hung from an oak frame. It creaks just right.", minLevel: 45, planks: { willow: 10, oak: 6 }, steps: FULL, xp: 410 }),
    pattern("grandfather-clock", "Grandfather Clock", { blurb: "A tall willow case around a brass movement from the city.", minLevel: 55, planks: { willow: 14 }, tickets: 300, steps: FULL, xp: 540 }),
]);
export function findPattern(id) {
    return typeof id === "string" ? PATTERN_CATALOG.find((entry) => entry.id === id) : undefined;
}
export const PIECE_STARS = Object.freeze([1, 2, 3]);
/** What the stars mean on the piece itself: its finish. */
export const PIECE_FINISH_TITLES = Object.freeze({ 1: "Rough-hewn", 2: "Stained", 3: "Varnished" });
/** Furniture is keyed by item and stars: "decor.furniture.chair@2". */
export function pieceKey(itemId, stars) {
    return `${itemId}@${stars}`;
}
export function parsePieceKey(key) {
    if (typeof key !== "string")
        return null;
    const match = /^(decor\.furniture\.[a-z0-9-]+)@([123])$/.exec(key);
    const found = match ? findPattern(match[1]) : undefined;
    return found ? Object.freeze({ pattern: found, stars: Number(match[2]) }) : null;
}
/** Every furniture key there can be, pattern by pattern, one star to three. */
export const PIECE_KEYS = Object.freeze(PATTERN_CATALOG.flatMap((entry) => PIECE_STARS.map((stars) => pieceKey(entry.id, stars))));
