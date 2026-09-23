// Persistent crop rules. This is deliberately independent of THREE and the DOM:
// the page, server normalizer and headless tests all use the same farming contract.
import { PET_CARE } from "./farm-pet-care.mjs";
export const FARM_DAY_MINUTES = 24 * 60;
export const MOISTURE_CAPACITY_MINUTES = 18 * 60;
export const CARE_GATE = 0.5;
const MAX_STACK = 99;
const crop = (id, title, days, yieldCount, models) => Object.freeze({ id, title, growMinutes: days * FARM_DAY_MINUTES, yield: yieldCount, models: Object.freeze([...models]) });
export const CROP_CATALOG = Object.freeze([
    crop("bean", "Bean", 3, 4, ["Crop_Bean_STAGE_1_01.glb", "Crop_Bean_STAGE_2_01.glb", "Crop_Bean_STAGE_3_01.glb", "Crop_Bean_STAGE_4_01.glb"]),
    crop("beetroot", "Beetroot", 2, 3, ["Crop_Beetroot_STAGE_1_01.glb", "Crop_Beetroot_STAGE_2_01.glb", "Crop_Beetroot_STAGE_3_01.glb", "Crop_Beetroot_01.glb"]),
    crop("cabbage", "Cabbage", 3, 2, ["Crop_Cabbage_STAGE_1_01.glb", "Crop_Cabbage_STAGE_1_02.glb", "Crop_Cabbage_STAGE_1_03.glb", "Crop_Cabbage_01.glb"]),
    crop("carrot", "Carrot", 2, 3, ["Crop_Carrot_STAGE_1_01.glb", "Crop_Carrot_STAGE_2_01.glb", "Crop_Carrot_STAGE_3_01.glb", "Crop_Carrot_01.glb"]),
    crop("cauliflower", "Cauliflower", 4, 2, ["Crop_Cauliflower_STAGE_1_01.glb", "Crop_Cauliflower_STAGE_2_01.glb", "Crop_Cauliflower_STAGE_3_01.glb", "Crop_Cauliflower_01.glb"]),
    crop("garlic", "Garlic", 2.5, 4, ["Crop_Garlic_STAGE_1_01.glb", "Crop_Garlic_STAGE_2_01.glb", "Crop_Garlic_STAGE_3_01.glb", "Crop_Garlic_01.glb"]),
    crop("potato", "Potato", 3.5, 5, ["Crop_Potato_STAGE_1_01.glb", "Crop_Potato_STAGE_2_01.glb", "Crop_Potato_STAGE_3_01.glb", "Crop_Potato_01.glb"]),
    crop("radish", "Radish", 2, 3, ["Crop_Radish_STAGE_1_01.glb", "Crop_Radish_STAGE_2_01.glb", "Crop_Radish_STAGE_3_01.glb", "Crop_Radish_01.glb"]),
]);
export function findCrop(id) {
    return typeof id === "string" ? CROP_CATALOG.find((entry) => entry.id === id) : undefined;
}
export const SOIL_CELL_LAYOUT = Object.freeze([
    Object.freeze({ id: "cell-0", x: -1, z: -0.5 }),
    Object.freeze({ id: "cell-1", x: 0, z: -0.5 }),
    Object.freeze({ id: "cell-2", x: 1, z: -0.5 }),
    Object.freeze({ id: "cell-3", x: -1, z: 0.5 }),
    Object.freeze({ id: "cell-4", x: 0, z: 0.5 }),
    Object.freeze({ id: "cell-5", x: 1, z: 0.5 }),
]);
const SOIL_CELL_IDS = new Set(SOIL_CELL_LAYOUT.map((cell) => cell.id));
/** The nearest actual planting cell close enough and in front of the walking player. */
export function findSoilCellInReach(decor, player, reach = 2.65) {
    let best = null;
    let bestDistance = Infinity;
    for (const row of decor) {
        if (row.itemId !== "decor.plant.soil-patch")
            continue;
        const cosine = Math.cos(row.rotationY);
        const sine = Math.sin(row.rotationY);
        for (const cell of SOIL_CELL_LAYOUT) {
            const x = Number((row.x + cell.x * cosine + cell.z * sine).toFixed(4));
            const z = Number((row.z - cell.x * sine + cell.z * cosine).toFixed(4));
            const dx = x - player.x;
            const dz = z - player.z;
            const distance = Math.hypot(dx, dz);
            const forwardLength = Math.hypot(player.forward.x, player.forward.z) || 1;
            const facing = distance < 0.001 ? 1 : (player.forward.x * dx + player.forward.z * dz) / (forwardLength * distance);
            if (distance <= reach && facing >= 0.2 && distance < bestDistance) {
                best = { plot: row, cellId: cell.id, x, z };
                bestDistance = distance;
            }
        }
    }
    return best;
}
const count = (value) => typeof value === "number" && Number.isFinite(value) ? Math.min(MAX_STACK, Math.max(0, Math.floor(value))) : 0;
const finite = (value, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
function inventoryWith(defaultSeeds, source) {
    const input = source && typeof source === "object" ? source : {};
    const seeds = input.seeds && typeof input.seeds === "object" ? input.seeds : {};
    const produce = input.produce && typeof input.produce === "object" ? input.produce : {};
    const supplies = input.supplies && typeof input.supplies === "object" ? input.supplies : {};
    return Object.freeze({
        seeds: Object.freeze(Object.fromEntries(CROP_CATALOG.map((entry) => [entry.id, entry.id in seeds ? count(seeds[entry.id]) : typeof defaultSeeds === "number" ? defaultSeeds : count(defaultSeeds[entry.id])]))),
        produce: Object.freeze(Object.fromEntries(CROP_CATALOG.map((entry) => [entry.id, count(produce[entry.id])]))),
        supplies: Object.freeze(Object.fromEntries(PET_CARE.map((care) => [
            care.food.itemId,
            care.food.itemId in supplies ? count(supplies[care.food.itemId]) : care.food.starterQuantity,
        ]))),
    });
}
function freezeAgriculture(value) {
    return Object.freeze({ inventory: value.inventory, crops: Object.freeze(value.crops.map((entry) => Object.freeze({ ...entry }))) });
}
export function createStarterAgriculture(random = Math.random) {
    const available = CROP_CATALOG.map((entry) => entry.id);
    const selected = new Set();
    const targetCount = Math.min(6, available.length);
    while (selected.size < targetCount) {
        const sampled = random();
        const roll = Number.isFinite(sampled) ? Math.max(0, Math.min(0.999999999, sampled)) : 0;
        selected.add(available.splice(Math.floor(roll * available.length), 1)[0]);
    }
    const seeds = Object.fromEntries(CROP_CATALOG.map((entry) => [entry.id, selected.has(entry.id) ? 1 : 0]));
    return freezeAgriculture({ inventory: inventoryWith(seeds), crops: [] });
}
export function normalizeAgriculture(value, validPlotIds) {
    const source = value && typeof value === "object" ? value : {};
    const seen = new Set();
    const crops = [];
    for (const raw of Array.isArray(source.crops) ? source.crops : []) {
        if (!raw || typeof raw !== "object")
            continue;
        const row = raw;
        const definition = findCrop(row.cropId);
        if (!definition || typeof row.plotId !== "string" || !validPlotIds.has(row.plotId))
            continue;
        const cellId = typeof row.cellId === "string" && SOIL_CELL_IDS.has(row.cellId)
            ? row.cellId
            : SOIL_CELL_LAYOUT.find((cell) => !seen.has(`${row.plotId}:${cell.id}`))?.id;
        if (!cellId || seen.has(`${row.plotId}:${cellId}`))
            continue;
        seen.add(`${row.plotId}:${cellId}`);
        crops.push({
            plotId: row.plotId,
            cellId,
            cropId: definition.id,
            growthMinutes: Math.min(definition.growMinutes, Math.max(0, finite(row.growthMinutes))),
            moistureMinutes: Math.min(MOISTURE_CAPACITY_MINUTES, Math.max(0, finite(row.moistureMinutes))),
            tended: row.tended === true,
            lastFarmMinute: Math.max(0, finite(row.lastFarmMinute)),
        });
    }
    return freezeAgriculture({ inventory: inventoryWith(5, source.inventory), crops });
}
function advanceCrop(row, now) {
    const definition = findCrop(row.cropId);
    const elapsed = Math.max(0, finite(now) - row.lastFarmMinute);
    const hydrated = Math.min(elapsed, row.moistureMinutes);
    const gate = definition.growMinutes * CARE_GATE;
    const growthLimit = row.tended ? definition.growMinutes : gate;
    return {
        ...row,
        growthMinutes: Math.min(growthLimit, row.growthMinutes + hydrated),
        moistureMinutes: Math.max(0, row.moistureMinutes - elapsed),
        lastFarmMinute: Math.max(row.lastFarmMinute, finite(now, row.lastFarmMinute)),
    };
}
export function advanceAgriculture(value, now) {
    return freezeAgriculture({ inventory: value.inventory, crops: value.crops.map((row) => advanceCrop(row, now)) });
}
export function cropStatus(row, now) {
    const current = advanceCrop(row, now);
    const definition = findCrop(current.cropId);
    const progress = Math.min(1, current.growthMinutes / definition.growMinutes);
    const mature = progress >= 1;
    return Object.freeze({
        stage: Math.min(3, Math.floor(progress * 4)),
        mature,
        thirsty: !mature && current.moistureMinutes <= 0,
        needsCare: !mature && !current.tended && progress >= CARE_GATE,
        progress,
    });
}
function result(agriculture, ok, reason = "") {
    return Object.freeze({ ok, reason, agriculture });
}
export function plantFarmCrop(value, plotId, cellId, cropId, now) {
    const agriculture = advanceAgriculture(value, now);
    const definition = findCrop(cropId);
    if (!definition)
        return result(agriculture, false, "unknown_crop");
    if (!SOIL_CELL_IDS.has(cellId))
        return result(agriculture, false, "unknown_cell");
    if (agriculture.crops.some((row) => row.plotId === plotId && row.cellId === cellId))
        return result(agriculture, false, "occupied");
    if ((agriculture.inventory.seeds[cropId] ?? 0) <= 0)
        return result(agriculture, false, "no_seeds");
    const seeds = { ...agriculture.inventory.seeds, [cropId]: agriculture.inventory.seeds[cropId] - 1 };
    const cropRow = { plotId, cellId, cropId, growthMinutes: 0, moistureMinutes: 0, tended: false, lastFarmMinute: now };
    return result(freezeAgriculture({ inventory: Object.freeze({ ...agriculture.inventory, seeds: Object.freeze(seeds) }), crops: [...agriculture.crops, cropRow] }), true);
}
export function waterFarmCrop(value, plotId, cellId, now) {
    const agriculture = advanceAgriculture(value, now);
    if (!agriculture.crops.some((row) => row.plotId === plotId && row.cellId === cellId))
        return result(agriculture, false, "empty");
    return result(freezeAgriculture({ inventory: agriculture.inventory, crops: agriculture.crops.map((row) => row.plotId === plotId && row.cellId === cellId ? { ...row, moistureMinutes: MOISTURE_CAPACITY_MINUTES } : row) }), true);
}
export function tendFarmCrop(value, plotId, cellId, now) {
    const agriculture = advanceAgriculture(value, now);
    const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
    if (!row)
        return result(agriculture, false, "empty");
    if (!cropStatus(row, now).needsCare)
        return result(agriculture, false, "not_ready");
    return result(freezeAgriculture({ inventory: agriculture.inventory, crops: agriculture.crops.map((entry) => entry.plotId === plotId && entry.cellId === cellId ? { ...entry, tended: true } : entry) }), true);
}
export function harvestFarmCrop(value, plotId, cellId, now) {
    const agriculture = advanceAgriculture(value, now);
    const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
    if (!row)
        return result(agriculture, false, "empty");
    if (!cropStatus(row, now).mature)
        return result(agriculture, false, "not_ready");
    const definition = findCrop(row.cropId);
    const produce = { ...agriculture.inventory.produce, [row.cropId]: Math.min(MAX_STACK, agriculture.inventory.produce[row.cropId] + definition.yield) };
    return result(freezeAgriculture({ inventory: Object.freeze({ ...agriculture.inventory, produce: Object.freeze(produce) }), crops: agriculture.crops.filter((entry) => entry.plotId !== plotId || entry.cellId !== cellId) }), true);
}
