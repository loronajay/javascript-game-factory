// Server-authoritative permanent Farm unlocks. Placement/model metadata stays
// in the browser catalog; this explicit roster owns prices and save admission.
export const FARM_GAME_SLUG = "farm";
export const FARM_STARTER_IDS = new Set([
    "ground.meadow",
    "decor.fence.post-rail", "decor.fence.gate", "decor.building.barn",
    "decor.plant.oak", "decor.plant.soil-patch", "decor.prop.hay-bale",
    "decor.prop.trough", "decor.prop.doghouse", "decor.prop.tennis-ball",
    "decor.prop.rope-toy", "decor.prop.bone",
]);
const prices = Object.freeze({
    "ground.clover": 150, "ground.dry": 150, "ground.mud": 200, "ground.gravel": 250,
    "decor.fence.split-rail": 100, "decor.fence.wire": 125, "decor.fence.picket": 150,
    "decor.fence.hedge": 200, "decor.fence.stone-wall": 250,
    "decor.building.shed": 650, "decor.building.coop": 800, "decor.building.gazebo": 900,
    "decor.building.greenhouse": 1400, "decor.building.stable": 1700, "decor.building.silo": 1800,
    "decor.building.cottage": 2200, "decor.building.windmill": 2400,
    "decor.plant.stump": 25, "decor.plant.bush": 50, "decor.plant.flower-bed": 75,
    "decor.plant.sunflowers": 75, "decor.plant.lavender": 75, "decor.plant.pine": 100,
    "decor.plant.birch": 125, "decor.plant.apple": 175, "decor.plant.willow": 200,
    "decor.water.pond-round": 800, "decor.water.pond-long": 1000, "decor.water.pond-lily": 1200,
    "decor.prop.barrel": 25, "decor.prop.crates": 50, "decor.prop.log-pile": 50,
    "decor.prop.signpost": 50, "decor.prop.wheelbarrow": 75, "decor.prop.mailbox": 75,
    "decor.prop.bench": 100, "decor.prop.scarecrow": 100, "decor.prop.birdbath": 125,
    "decor.prop.lamp-post": 125, "decor.prop.water-pump": 150, "decor.prop.well": 200,
    "decor.prop.campfire": 200, "decor.prop.bed": 250, "decor.prop.wagon": 250,
    "decor.prop.beehive": 250,
    "decor.prop.duck-coop": 200, "decor.prop.roosting-box": 250,
    "decor.prop.burrow-lodge": 300, "decor.prop.treetop-den": 350,
    "decor.prop.darkwater-cave": 400, "decor.prop.jellyfish-lagoon": 450,
    "decor.prop.reef-grotto": 500, "decor.prop.mud-wallow-shelter": 550,
    "decor.prop.rhino-shade": 600,
});
export const FARM_TICKET_ITEMS = Object.freeze(Object.entries(prices).map(([id, price]) => Object.freeze({ id, price })));
export const FARM_CATALOG_IDS = new Set([...FARM_STARTER_IDS, ...Object.keys(prices), "decor.prop.pet-tombstone"]);
export function findFarmTicketItem(itemId) {
    const id = typeof itemId === "string" ? itemId.trim() : "";
    const price = prices[id];
    return price ? Object.freeze({ id, price }) : null;
}
