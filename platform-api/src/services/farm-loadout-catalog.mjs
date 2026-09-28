// The farm's server-owned layout catalog: the trust boundary for what lives on
// a player's farm.
//
// The farm (`/farm/`) is the arcade room's sibling — a second personal 3D
// space — and its document rides the same way: one JSON row per account on
// `game_loadouts` under the `farm` slug, self-only writes, public reads.
// `GET`/`PUT /games/farm/garage` for the owner, `GET /games/farm/loadout/:id`
// for a visitor. No new table, no new route.
//
// THE PUBLIC READ IS THE WHOLE DOCUMENT, like the room: a farm exists to be
// walked through, and nothing in it is private.
//
// WHAT IS VALIDATED, AND WHAT IS NOT — the room's policy exactly. Ids are
// checked for NAMESPACE (`ground.<name>`, `pet.<species>`,
// `decor.<category>.<variant>`), counts and numbers are bounded, text is made
// printable, and the client's catalogs decide what an id means. A species this
// server has never heard of but that fits the pattern is stored; the client's
// normalizer drops it. That keeps a new animal a client-only change.
//
// PETS ARE NOT PLACED. A pet row has identity plus an optional bounded care
// profile — no coordinates — because the client's sim gives every pet a spot
// when the farm loads and it wanders from there. If a later slice pins pets (a
// doghouse), the position joins the row here with the same bounded-number
// treatment `decor` already gets.
//
// `decor` IS THE FIELD. Version 2 (build mode) places fences, buildings,
// plants, ponds and props as rows bounded like the room's, and the key is
// emitted only when the client sent one — the same absent-vs-empty rule the
// room follows: an absent list means the client's starter field, an empty one
// a deliberately cleared field. A version-1 document (before build mode) is
// stored as sent and migrated by the client's normalizer, which seeds the
// starter field for it.
import { FARM_CATALOG_IDS, FARM_STARTER_IDS } from "./farm-ticket-catalog.mjs";
import { findFarmSpecies } from "./farm-economy-catalog.mjs";
import { normalizeFarmPetGrowthShape, pinFarmPetGrowth } from "./farm-pet-growth-policy.mjs";
import { farmCropRule } from "./farm-crop-catalog.mjs";
import { NAP_BANK_CAPACITY_MINUTES, boundCropGrowth, verifyFarmClock } from "./farm-time-policy.mjs";
import { emptyFarmSkillRecords, farmCropCapacity, farmingLevelForXp, normalizeFarmSkillRecords } from "./farm-skill-catalog.mjs";
import { parseFarmDishKey } from "./farm-recipe-catalog.mjs";
import { farmPieceKey, farmPieceRule, parseFarmPieceKey } from "./farm-carpentry-catalog.mjs";
import { TREE_PLOT_ITEM_ID, admitNewTrees, boundTreeGrowth, normalizeFarmTreeRows } from "./farm-tree-catalog.mjs";
export const FARM_GAME_SLUG = "farm";
const LAYOUT_VERSIONS = new Set([1, 2, 3]);
const LAYOUT_VERSION = 3;
/** The client caps adoption at 12; the server allows a little headroom so a later raise is a client change. */
export const FARM_MAX_PETS = 24;
/** Fences, ponds and plants to come; a bound, not a plan. */
const MAX_DECOR = 160;
/** The field is 28 m; ±16 leaves margin for a wider farm without accepting nonsense. */
const COORDINATE_LIMIT = 16;
const LENGTH_LIMIT = 30;
const SCALE_LIMIT = 5;
const NAME_LIMIT = 20;
const INSTANCE_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
const GROUND_ID_PATTERN = /^ground\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SPECIES_ID_PATTERN = /^pet\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECOR_ID_PATTERN = /^decor\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;
const CROP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ITEM_ID_PATTERN = /^(?:food|toy)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRAIT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const OUTCOMES = new Set(["runaway", "starvation", "old_age", "neglect"]);
function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
/** Printable single-line text with markup characters removed: a pet's name is shown over its head to every visitor. */
function cleanName(value, maxLength) {
    if (typeof value !== "string")
        return "";
    // eslint-disable-next-line no-control-regex
    return value.replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function boundedNumber(value, limit) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return null;
    return Number(Math.min(limit, Math.max(-limit, value)).toFixed(4));
}
function normalizeRotation(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return null;
    const turn = Math.PI * 2;
    const wrapped = ((value % turn) + turn) % turn;
    return Number(wrapped.toFixed(4));
}
export function defaultFarmGarage() {
    // "" for the ground means "the client's starter meadow"; no `decor` key means its starter field.
    return { version: LAYOUT_VERSION, onboarding: { status: "needs_name", introSeen: false }, ground: "", pets: [], agriculture: { inventory: { seeds: {}, produce: {}, supplies: {}, saplings: {}, logs: {}, dishes: {}, planks: {}, furniture: {} }, crops: [] }, trees: [], clock: { farmMinutes: 480, updatedAt: 0, checkpointAt: 0, napBank: 1440 }, skills: emptyFarmSkillRecords() };
}
function normalizeCropCounts(value) {
    const input = value && typeof value === "object" ? value : {};
    const output = {};
    for (const [id, raw] of Object.entries(input).slice(0, 64)) {
        if (!CROP_ID_PATTERN.test(id) || typeof raw !== "number" || !Number.isFinite(raw))
            continue;
        output[id] = Math.min(99, Math.max(0, Math.floor(raw)));
    }
    return output;
}
function normalizeSupplyCounts(value) {
    const input = value && typeof value === "object" ? value : {};
    const output = {};
    for (const [id, raw] of Object.entries(input).slice(0, 64)) {
        if (!ITEM_ID_PATTERN.test(id) || typeof raw !== "number" || !Number.isFinite(raw))
            continue;
        output[id] = Math.min(99, Math.max(0, Math.floor(raw)));
    }
    return output;
}
/** The pantry: cooked dishes by "recipe@stars" (services/farm-recipe-catalog), known recipes only. */
function normalizeDishCounts(value) {
    const input = value && typeof value === "object" ? value : {};
    const output = {};
    for (const [key, raw] of Object.entries(input).slice(0, 96)) {
        if (!parseFarmDishKey(key) || typeof raw !== "number" || !Number.isFinite(raw))
            continue;
        output[key] = Math.min(99, Math.max(0, Math.floor(raw)));
    }
    return output;
}
/** Furniture the farm owns, placed or not, by "decor.furniture.<piece>@stars" (services/farm-carpentry-catalog). */
function normalizePieceCounts(value) {
    const input = value && typeof value === "object" ? value : {};
    const output = {};
    for (const [key, raw] of Object.entries(input).slice(0, 96)) {
        if (!parseFarmPieceKey(key) || typeof raw !== "number" || !Number.isFinite(raw))
            continue;
        output[key] = Math.min(99, Math.max(0, Math.floor(raw)));
    }
    return output;
}
/**
 * A crafted piece stands on the field only while the farm owns one more of
 * its "item@stars" than already stand: rows past what is owned are dropped,
 * first placed first kept. Crafted pieces are counted, never unlocked.
 */
function boundCraftedRows(decor, furniture) {
    const standing = {};
    return decor.filter((row) => {
        if (!farmPieceRule(row.itemId))
            return true;
        const key = farmPieceKey(row.itemId, row.stars);
        standing[key] = (standing[key] ?? 0) + 1;
        return standing[key] <= (Number(furniture?.[key]) || 0);
    });
}
function normalizeAgriculture(value, decorIds) {
    const input = value && typeof value === "object" ? value : {};
    const inventory = input.inventory && typeof input.inventory === "object" ? input.inventory : {};
    const crops = [];
    const seen = new Set();
    for (const raw of Array.isArray(input.crops) ? input.crops.slice(0, MAX_DECOR) : []) {
        const row = raw && typeof raw === "object" ? raw : {};
        const plotId = cleanText(row.plotId, 40);
        const cropId = cleanText(row.cropId, 40);
        const cellId = /^cell-[0-5]$/.test(row.cellId) ? row.cellId : "cell-0";
        const plantingId = `${plotId}:${cellId}`;
        if (!INSTANCE_ID_PATTERN.test(plotId) || !decorIds.has(plotId) || seen.has(plantingId) || !CROP_ID_PATTERN.test(cropId))
            continue;
        seen.add(plantingId);
        crops.push({
            plotId,
            cellId,
            cropId,
            growthMinutes: Math.max(0, boundedNumber(row.growthMinutes, 100000) ?? 0),
            moistureMinutes: Math.max(0, boundedNumber(row.moistureMinutes, 100000) ?? 0),
            tended: row.tended === true,
            lastFarmMinute: Math.max(0, boundedNumber(row.lastFarmMinute, 1000000000) ?? 0),
            // Crop condition (js/farm-crops.mts): stress clocks, permanent care penalty, and death.
            dryMinutes: Math.max(0, boundedNumber(row.dryMinutes, 100000) ?? 0),
            untendedMinutes: Math.max(0, boundedNumber(row.untendedMinutes, 100000) ?? 0),
            carePenalty: Math.max(0, boundedNumber(row.carePenalty, 1) ?? 0),
            diedOf: row.diedOf === "thirst" || row.diedOf === "neglect" ? row.diedOf : "",
        });
    }
    return {
        inventory: {
            seeds: normalizeCropCounts(inventory.seeds), produce: normalizeCropCounts(inventory.produce), supplies: normalizeSupplyCounts(inventory.supplies),
            // Productive-tree saplings (bought) and felled logs (server-minted), by species (services/farm-tree-catalog).
            saplings: normalizeCropCounts(inventory.saplings), logs: normalizeCropCounts(inventory.logs),
            // Cooked dishes (server-minted at the Kitchen Range, services/farm-recipe-catalog).
            dishes: normalizeDishCounts(inventory.dishes),
            // Sawn planks by species, and furniture owned by "item@stars" (server-minted at the Sawmill and the Workbench).
            planks: normalizeCropCounts(inventory.planks), furniture: normalizePieceCounts(inventory.furniture),
        },
        crops,
    };
}
// Productive capacity (services/farm-skill-catalog, mirrors js/farm-capacity.mts).
// Growing plots are free, repeatable decor, so the number of crops in the
// ground is what is capped: by the STORED Farming level, plus one greenhouse
// bonus however many greenhouses stand. Enforced on client SAVES only — crops
// already stored always survive (a farm over the cap is grandfathered), and a
// new row is accepted only while the farm is under capacity. Reads never trim.
function capNewCrops(crops, storedCrops, capacity) {
    const key = (row) => `${row.plotId}:${row.cellId}:${row.cropId}`;
    const stored = new Set(storedCrops.map(key));
    const kept = crops.filter((row) => stored.has(key(row)));
    for (const row of crops) {
        if (stored.has(key(row)))
            continue;
        if (kept.length >= capacity)
            break;
        kept.push(row);
    }
    // Preserve the client's order: it is the order the farm draws and walks them in.
    const accepted = new Set(kept);
    return crops.filter((row) => accepted.has(row));
}
/**
 * The trust boundary for a client save. The document is the client's, but the
 * things that are worth something are held to what the server already knows:
 *   - seeds and supplies can only fall (they rise through purchases and
 *     adoptions); PRODUCE is the server's alone — a save cannot change it at
 *     all, so a stale tab or a retried request can never undo a harvest;
 *   - the clock may only advance by real time plus the nap bank;
 *   - each crop may only grow as far as its own stamp moved inside that clock;
 *   - the Farming and Woodcutting records are the stored ones, untouched;
 *   - no more crops than productive capacity, stored ones grandfathered;
 *   - LOGS are the server's like produce; SAPLINGS can only fall like seeds,
 *     and a new tree stands only where a sapling was spent for it, within
 *     its skill's level and capacity (services/farm-tree-catalog);
 *   - each tree grows no further than its own stamp moved, like a crop;
 *   - DISHES are the server's like produce: only a cook makes one, only a
 *     sale or a dish order takes one, and the Cooking record is pinned with
 *     the others;
 *   - PLANKS and FURNITURE are the server's too: only the Sawmill makes a
 *     plank and only the Workbench a piece (the Carpentry record is pinned),
 *     and a save may place no more of a piece than the stored count owns.
 */
function guardFarmSave(garage, current, context) {
    const inventory = garage.agriculture.inventory;
    const storedInventory = current?.agriculture?.inventory ?? { seeds: {}, produce: {}, supplies: {}, saplings: {}, logs: {}, dishes: {}, planks: {}, furniture: {} };
    const atMost = (submitted, stored) => Object.fromEntries(Object.entries(stored ?? {})
        .map(([id, count]) => [id, Math.min(Number(count) || 0, Number(submitted?.[id]) || 0)]));
    if (current) {
        inventory.supplies = atMost(inventory.supplies, storedInventory.supplies);
        inventory.seeds = atMost(inventory.seeds, storedInventory.seeds);
        inventory.saplings = atMost(inventory.saplings, storedInventory.saplings);
    }
    // Produce and logs are only ever changed by server operations (harvests,
    // picks, fellings, sales, orders). A first save starts with none.
    inventory.produce = { ...(storedInventory.produce ?? {}) };
    inventory.logs = { ...(storedInventory.logs ?? {}) };
    inventory.dishes = { ...(storedInventory.dishes ?? {}) };
    inventory.planks = { ...(storedInventory.planks ?? {}) };
    inventory.furniture = { ...(storedInventory.furniture ?? {}) };
    // So are the skill records: XP is minted by harvests, fellings, cooks and orders, never a save.
    garage.skills = current?.skills ? normalizeFarmSkillRecords(current.skills) : emptyFarmSkillRecords();
    const now = typeof context.now === "number" && Number.isFinite(context.now) ? context.now : Date.now();
    const storedAt = current?.clock ? (current.clock.verifiedAt ?? (typeof context.currentSavedAt === "number" ? context.currentSavedAt : null)) : null;
    const verified = verifyFarmClock(current?.clock ?? null, storedAt, garage.clock.farmMinutes, now);
    garage.clock.farmMinutes = Number(verified.farmMinutes.toFixed(4));
    garage.clock.napBank = Number(verified.napBank.toFixed(4));
    garage.clock.verifiedAt = verified.verifiedAt;
    const storedCrops = Array.isArray(current?.agriculture?.crops) ? current.agriculture.crops : [];
    const storedClockMinutes = current?.clock ? Number(current.clock.farmMinutes) || 0 : verified.farmMinutes;
    const bounded = boundCropGrowth(garage.agriculture.crops, storedCrops, storedClockMinutes, verified, (cropId) => farmCropRule(cropId)?.growMinutes ?? 0);
    const level = farmingLevelForXp(garage.skills.farming.xp);
    garage.agriculture.crops = capNewCrops(bounded, storedCrops, farmCropCapacity(garage.decor ?? [], level));
    const storedTrees = Array.isArray(current?.trees) ? current.trees : [];
    garage.trees = admitNewTrees(boundTreeGrowth(garage.trees, storedTrees, storedClockMinutes, verified), storedTrees, {
        storedSaplings: current ? storedInventory.saplings ?? {} : {},
        submittedSaplings: inventory.saplings ?? {},
        farmingLevel: level,
        woodcuttingLevel: farmingLevelForXp(garage.skills.woodcutting.xp),
    });
}
function normalizePetProfile(value) {
    if (!value || typeof value !== "object")
        return null;
    const size = value.size && typeof value.size === "object" ? value.size : {};
    const stats = value.stats && typeof value.stats === "object" ? value.stats : {};
    const profile = {
        gender: value.gender === "male" ? "male" : "female",
        // Species tuning currently reaches 150 days; this is a trust bound, not a shared lifespan rule.
        ageDays: Math.max(0, boundedNumber(value.ageDays, 200) ?? 0),
        affection: Math.max(0, boundedNumber(value.affection, 100) ?? 50),
        hunger: Math.max(0, boundedNumber(value.hunger, 100) ?? 100),
        starvingMinutes: Math.floor(Math.max(0, boundedNumber(value.starvingMinutes, 52560000) ?? 0)),
        happiness: Math.max(0, boundedNumber(value.happiness, 100) ?? 100),
        size: {
            current: Math.max(0, boundedNumber(size.current, 5) ?? 1),
            max: Math.max(0, boundedNumber(size.max, 5) ?? 1),
            growthPerDay: Math.max(0, boundedNumber(size.growthPerDay, 1) ?? 0),
        },
        stats: {
            speed: Math.max(0, boundedNumber(stats.speed, 100) ?? 50),
            strength: Math.max(0, boundedNumber(stats.strength, 100) ?? 50),
        },
        traits: Array.from(new Set((Array.isArray(value.traits) ? value.traits : []).filter((id) => typeof id === "string" && TRAIT_ID_PATTERN.test(id)).slice(0, 5))),
        milestones: Array.from(new Set((Array.isArray(value.milestones) ? value.milestones : [])
            .filter((id) => typeof id === "string" && /^dwelling:decor\.[a-z0-9.-]+$/.test(id)).slice(0, 16))),
        paletteId: cleanText(value.paletteId, 40) || "standard",
        paletteBonus: Math.max(0, boundedNumber(value.paletteBonus, 0.5) ?? 0),
    };
    // Stat progression: shape-bounded here, species-bounded and pinned against the stored row below.
    const growth = normalizeFarmPetGrowthShape(value.growth);
    return growth ? { ...profile, growth } : profile;
}
function normalizePetRow(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const instanceId = cleanText(source.instanceId, 40);
    const speciesId = cleanText(source.speciesId, 80);
    if (!INSTANCE_ID_PATTERN.test(instanceId) || !SPECIES_ID_PATTERN.test(speciesId))
        return null;
    const row = { instanceId, speciesId, name: cleanName(source.name, NAME_LIMIT) };
    const profile = normalizePetProfile(source.profile);
    if (profile)
        row.profile = profile;
    return row;
}
function normalizePetHistoryRow(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const stats = source.finalStats && typeof source.finalStats === "object" ? source.finalStats : {};
    const id = cleanText(source.id, 40);
    const instanceId = cleanText(source.instanceId, 40);
    const speciesId = cleanText(source.speciesId, 80);
    if (!INSTANCE_ID_PATTERN.test(id) || !INSTANCE_ID_PATTERN.test(instanceId) || !SPECIES_ID_PATTERN.test(speciesId) || !OUTCOMES.has(source.outcome))
        return null;
    return {
        id, instanceId, speciesId, name: cleanName(source.name, NAME_LIMIT), outcome: source.outcome,
        departedAtFarmMinute: Math.max(0, boundedNumber(source.departedAtFarmMinute, 1000000000) ?? 0),
        lifespanDays: Math.max(0, boundedNumber(source.lifespanDays, 200) ?? 0),
        finalStats: {
            gender: stats.gender === "male" ? "male" : "female",
            ageDays: Math.max(0, boundedNumber(stats.ageDays, 200) ?? 0), size: Math.max(0, boundedNumber(stats.size, 5) ?? 1),
            hunger: Math.max(0, boundedNumber(stats.hunger, 100) ?? 0), happiness: Math.max(0, boundedNumber(stats.happiness, 100) ?? 0),
            speed: Math.max(0, boundedNumber(stats.speed, 100) ?? 0), strength: Math.max(0, boundedNumber(stats.strength, 100) ?? 0),
        },
        traits: Array.from(new Set((Array.isArray(source.traits) ? source.traits : []).filter((value) => typeof value === "string" && TRAIT_ID_PATTERN.test(value)).slice(0, 5))),
        accomplishments: (Array.isArray(source.accomplishments) ? source.accomplishments : []).filter((value) => typeof value === "string").map((value) => value.slice(0, 80)).slice(0, 32),
    };
}
function ownership(context) {
    return {
        enforce: context?.ownedEntitlementIds instanceof Set,
        owned: context?.ownedEntitlementIds instanceof Set ? context.ownedEntitlementIds : new Set(),
    };
}
function mayUseCatalogId(id, context) {
    if (!FARM_CATALOG_IDS.has(id))
        return false;
    if (id === "decor.prop.pet-tombstone")
        return true;
    // A crafted piece is not an unlock: it is admitted by count against the furniture the farm owns (boundCraftedRows).
    if (farmPieceRule(id))
        return true;
    const state = ownership(context);
    return !state.enforce || FARM_STARTER_IDS.has(id) || state.owned.has(id);
}
/** A placed item: the room's decor row shape, bounded the same way. Optional finish fields pass through when well-formed. */
function normalizeDecorRow(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const instanceId = cleanText(source.instanceId, 40);
    const itemId = cleanText(source.itemId, 80);
    const x = boundedNumber(source.x, COORDINATE_LIMIT);
    const z = boundedNumber(source.z, COORDINATE_LIMIT);
    const rotationY = normalizeRotation(source.rotationY);
    if (!INSTANCE_ID_PATTERN.test(instanceId) || !DECOR_ID_PATTERN.test(itemId))
        return null;
    if (x === null || z === null || rotationY === null)
        return null;
    const row = { instanceId, itemId, x, z, rotationY };
    const length = boundedNumber(source.length, LENGTH_LIMIT);
    if (length !== null && length > 0)
        row.length = length;
    const scale = boundedNumber(source.scale, SCALE_LIMIT);
    if (scale !== null && scale > 0)
        row.scale = scale;
    const color = cleanText(source.color, 7).toLowerCase();
    if (HEX_COLOR.test(color))
        row.color = color;
    const memorialId = cleanText(source.memorialId, 40);
    if (itemId === "decor.prop.pet-tombstone" && INSTANCE_ID_PATTERN.test(memorialId))
        row.memorialId = memorialId;
    // A crafted piece carries the stars it was made with; a piece without them is not a piece.
    if (farmPieceRule(itemId)) {
        const stars = Number(source.stars);
        if (stars !== 1 && stars !== 2 && stars !== 3)
            return null;
        row.stars = stars;
    }
    return row;
}
export function normalizeFarmGarage(value, context = {}) {
    const missingDocument = !value || typeof value !== "object";
    const input = value && typeof value === "object" ? value : {};
    const current = context?.currentGarage && typeof context.currentGarage === "object"
        ? normalizeFarmGarage(context.currentGarage)
        : null;
    const seen = new Set();
    const pets = [];
    for (const raw of Array.isArray(input.pets) ? input.pets.slice(0, FARM_MAX_PETS + 10) : []) {
        const row = normalizePetRow(raw);
        if (!row || seen.has(row.instanceId))
            continue;
        seen.add(row.instanceId);
        pets.push(row);
        if (pets.length >= FARM_MAX_PETS)
            break;
    }
    const submittedGround = cleanText(input.ground, 80);
    const garage = {
        version: LAYOUT_VERSIONS.has(input.version) ? input.version : LAYOUT_VERSION,
        ground: GROUND_ID_PATTERN.test(submittedGround) && mayUseCatalogId(submittedGround, context) ? submittedGround : "",
        pets,
    };
    if (Array.isArray(input.petHistory)) {
        const historySeen = new Set();
        garage.petHistory = [];
        for (const raw of input.petHistory.slice(0, 100)) {
            const entry = normalizePetHistoryRow(raw);
            if (!entry || historySeen.has(entry.id))
                continue;
            historySeen.add(entry.id);
            garage.petHistory.push(entry);
        }
    }
    const onboarding = input.onboarding && typeof input.onboarding === "object" ? input.onboarding : null;
    if (onboarding?.status === "needs_name") {
        garage.onboarding = { status: "needs_name", introSeen: onboarding.introSeen === true };
    }
    else if (onboarding?.status === "complete") {
        garage.onboarding = { status: "complete", introSeen: true };
    }
    else if (missingDocument) {
        garage.onboarding = { status: "needs_name", introSeen: false };
    }
    if (current) {
        const currentPets = new Map((Array.isArray(current.pets) ? current.pets : []).map((row) => [row.instanceId, row]));
        const starterTransition = current.onboarding?.status === "needs_name" && garage.onboarding?.status === "complete";
        garage.pets = garage.pets.filter((row) => {
            const stored = currentPets.get(row.instanceId);
            if (stored)
                return stored.speciesId === row.speciesId;
            return starterTransition && row.speciesId === "pet.corgi" && row.instanceId === "corgi-1";
        }).map((row) => {
            const stored = currentPets.get(row.instanceId);
            if (!stored?.profile || !row.profile)
                return row;
            // Stats grow now: the roll (grade/base/rates) is pinned from the stored row, the
            // earned part is bounded by age, and `stats` is recomputed — never taken from the client.
            const grown = pinFarmPetGrowth(findFarmSpecies(row.speciesId), row.profile, stored.profile);
            const { growth: _submittedGrowth, ...submitted } = row.profile;
            return {
                ...row,
                profile: {
                    ...submitted,
                    gender: stored.profile.gender,
                    size: { ...row.profile.size, max: stored.profile.size.max, growthPerDay: stored.profile.size.growthPerDay },
                    stats: grown ? grown.stats : stored.profile.stats,
                    traits: stored.profile.traits,
                    paletteId: stored.profile.paletteId,
                    paletteBonus: stored.profile.paletteBonus,
                    ...(grown ? { growth: grown.growth } : stored.profile.growth ? { growth: stored.profile.growth } : {}),
                },
            };
        });
        if (starterTransition) {
            const starter = garage.pets.find((row) => row.instanceId === "corgi-1" && row.speciesId === "pet.corgi");
            garage.pets = starter ? [starter] : [];
        }
    }
    if (Array.isArray(input.decor)) {
        const decor = [];
        for (const raw of input.decor.slice(0, MAX_DECOR)) {
            const row = normalizeDecorRow(raw);
            if (!row || seen.has(row.instanceId))
                continue;
            if (!mayUseCatalogId(row.itemId, context))
                continue;
            seen.add(row.instanceId);
            decor.push(row);
        }
        garage.decor = decor;
    }
    if (garage.version === 3) {
        const decorIds = new Set((garage.decor ?? []).filter((row) => row.itemId === "decor.plant.soil-patch" || row.itemId === "decor.building.greenhouse").map((row) => String(row.instanceId)));
        garage.agriculture = normalizeAgriculture(input.agriculture, decorIds);
        // The productive trees, one per Tree Plot (services/farm-tree-catalog). A save bounds them below.
        const treePlotIds = new Set((garage.decor ?? []).filter((row) => row.itemId === TREE_PLOT_ITEM_ID).map((row) => String(row.instanceId)));
        garage.trees = normalizeFarmTreeRows(input.trees, treePlotIds);
        // The Farming, Woodcutting and Cooking records (services/farm-skill-catalog). Server-owned: a save pins them below.
        garage.skills = normalizeFarmSkillRecords(input.skills);
        const clock = input.clock && typeof input.clock === "object" ? input.clock : {};
        garage.clock = {
            farmMinutes: Math.max(0, boundedNumber(clock.farmMinutes, 1000000000) ?? 480),
            updatedAt: Math.max(0, boundedNumber(clock.updatedAt, 1000000000000000) ?? 0),
            // Real time the owner was last on the farm; 0 = never entered, so no offline production.
            checkpointAt: Math.max(0, boundedNumber(clock.checkpointAt, 1000000000000000) ?? 0),
            // Farm minutes of naps available (js/farm-nap-bank.mts); absent = a full bank.
            napBank: Math.min(NAP_BANK_CAPACITY_MINUTES, Math.max(0, boundedNumber(clock.napBank, 100000) ?? NAP_BANK_CAPACITY_MINUTES)),
        };
        // Server time the clock was last verified. Only the server writes it; on a read it passes through.
        const verifiedAt = boundedNumber(clock.verifiedAt, 1000000000000000);
        if (verifiedAt !== null && verifiedAt > 0)
            garage.clock.verifiedAt = verifiedAt;
        // A client SAVE (the store passes `currentGarage`, even when null) is where the
        // farm's economic inventory is guarded. Reads and the server's own economy
        // writes normalize stored documents and are not re-checked.
        const saving = Boolean(context) && Object.prototype.hasOwnProperty.call(context, "currentGarage");
        if (saving)
            guardFarmSave(garage, current, context);
        // After the guard, so on a save the count is the stored one.
        if (garage.decor)
            garage.decor = boundCraftedRows(garage.decor, garage.agriculture.inventory.furniture);
    }
    else if (garage.decor) {
        // Before version 3 a farm had no furniture to place.
        garage.decor = garage.decor.filter((row) => !farmPieceRule(row.itemId));
    }
    return garage;
}
/** What a visitor draws: the layout itself. */
export function farmLoadoutFromGarage(garage, context = {}) {
    return { layout: normalizeFarmGarage(garage, context) };
}
export const FARM_LOADOUT_CATALOG = Object.freeze({
    requiresEntitlements: true,
    normalizeGarage: normalizeFarmGarage,
    loadoutFromGarage: farmLoadoutFromGarage,
});
