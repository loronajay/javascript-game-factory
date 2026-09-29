// The farm's layout document: what a player's farm IS, and the pure rules for
// changing it.
//
// Version 2 is a ground finish, the pets that live here, and the DECOR — every
// placed thing on the field: the fences, the barn, the trees, the ponds. Each
// slice adds a key and a validator to this file and nothing else has to learn
// a new shape. `normalizeFarmLayout` is the one place a stored document is made
// valid; the store, the page and the server-side mirror all lean on it.
//
// PETS ARE NOT PLACED. A pet row has no position: the sim gives it one when
// the farm loads and it wanders from there. What the document keeps is who
// lives here and what they are called. Decor IS placed, and the rules for
// placing it live in `farm-decor-layout.mts`.
//
// A VERSION-1 DOCUMENT HAD NO DECOR (the field was fixed). Migrating one seeds
// the starter field, so a farm saved before build mode keeps looking the way
// it did. In version 2 an ABSENT `decor` also means the starter field (the
// server only sends the key when the client did), and an EMPTY list is a
// deliberately cleared field.
import { findLivestockSpecies } from "./farm-catalog/livestock.mjs";
import { DEFAULT_GROUND_ID, findGround, normalizeGroundId } from "./farm-catalog/ground.mjs";
import { findAnimal } from "./farm-catalog/animals.mjs";
import { clampFarmDecorLength, findFarmDecor } from "./farm-catalog/decor.mjs";
import { createStarterAgriculture, normalizeAgriculture } from "./farm-crops.mjs";
import { NAP_BANK_CAPACITY_MINUTES, napBankAt } from "./farm-nap-bank.mjs";
import { EMPTY_FARM_SKILLS, normalizeFarmSkills } from "./farm-skills.mjs";
import { normalizeFarmTrees } from "./farm-trees.mjs";
import { OFFLINE_PRODUCTION_RATE, clampOfflineRate } from "./farm-offline.mjs";
import { TREE_PLOT_ITEM_ID } from "./farm-catalog/trees.mjs";
import { createPetProfile, normalizePetProfile } from "./farm-pet-care.mjs";
export const FARM_LAYOUT_STORAGE_KEY = "jgf.player-farm.layout.v1";
export const FARM_LAYOUT_VERSION = 3;
/** The walkable field. The inset is how far in from the field's edge anything may stand. */
export const FARM_BOUNDS = Object.freeze({ width: 28, depth: 28, wallInset: 0.3 });
export const MAX_PETS = 12;
export const MAX_DECOR = 120;
const MAX_PERSISTED_DECOR = MAX_DECOR + MAX_PETS; // terminal outcomes may add one unique memorial per resident to a full field
export const PET_NAME_MAX_LENGTH = 20;
export const DEFAULT_FARM_SETTINGS = Object.freeze({ awayGrowth: OFFLINE_PRODUCTION_RATE });
export function normalizeFarmSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.freeze({ awayGrowth: clampOfflineRate(source.awayGrowth) });
}
/** One line, printable, trimmed and capped — what a pet may be called. */
export function cleanPetName(value, maxLength = PET_NAME_MAX_LENGTH) {
    if (typeof value !== "string")
        return "";
    // eslint-disable-next-line no-control-regex
    return value.replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
export function farmCacheKey(playerId) {
    const cleaned = typeof playerId === "string" ? playerId.trim() : "";
    return `${FARM_LAYOUT_STORAGE_KEY}:${cleaned || "guest"}`;
}
const row = (instanceId, itemId, x, z, rotationY = 0, length = 0) => Object.freeze({ instanceId, itemId, x, z, rotationY, length });
// The perimeter fence stands on the inset line; its posts are 0.14 deep, so its centre is half that further in.
const EDGE = FARM_BOUNDS.width / 2 - FARM_BOUNDS.wallInset - 0.07;
const GATE_WIDTH = 2.4;
const SOUTH_RUN = EDGE - GATE_WIDTH / 2 + 0.07;
/**
 * The starter field: the perimeter fence (four runs and the south gate), the
 * barn, farmhouse, four trees, two hay bales and the trough — the starter dressing as
 * rows the player may now move. `normalizeFarmLayout` seeds it for a document
 * that has never had decor.
 */
export const STARTER_FARM_DECOR = Object.freeze([
    row("post-rail-1", "decor.fence.post-rail", 0, -EDGE, 0, EDGE * 2 + 0.14),
    row("post-rail-2", "decor.fence.post-rail", -EDGE, 0, Math.PI / 2, EDGE * 2 + 0.14),
    row("post-rail-3", "decor.fence.post-rail", EDGE, 0, Math.PI / 2, EDGE * 2 + 0.14),
    row("post-rail-4", "decor.fence.post-rail", -(GATE_WIDTH / 2 + SOUTH_RUN / 2), EDGE, 0, SOUTH_RUN),
    row("post-rail-5", "decor.fence.post-rail", GATE_WIDTH / 2 + SOUTH_RUN / 2, EDGE, 0, SOUTH_RUN),
    row("gate-1", "decor.fence.gate", 0, EDGE, 0),
    row("barn-1", "decor.building.barn", -7.5, -8.5, Math.PI / 12),
    // Mature crowns need more visual room than their trunk-sized collision boxes imply.
    // Keep them on the perimeter so they frame the yard instead of swallowing the buildings.
    row("oak-1", "decor.plant.oak", 11.5, -10.5),
    row("oak-2", "decor.plant.oak", 11, 5.5),
    row("oak-3", "decor.plant.oak", -11, 4),
    row("oak-4", "decor.plant.oak", 9.5, 10.5),
    row("hay-bale-1", "decor.prop.hay-bale", -8, -2.5, 0.4),
    row("hay-bale-2", "decor.prop.hay-bale", -6.5, -2, -0.2),
    row("trough-1", "decor.prop.trough", -4, -4, Math.PI / 2),
    row("soil-1", "decor.plant.soil-patch", 4.5, 6.5),
    // The farmhouse backs onto the rear fence, leaving the field open in front of it. The range's
    // local pose remains against the back wall so it travels with the house as interior furniture.
    row("cottage-1", "decor.building.cottage", 4.2, -9.3, 0),
    row("kitchen-range-1", "decor.prop.kitchen-range", 3, -12, 0),
    // Two Tree Plots for the new farm's first sapling of each kind.
    row("tree-plot-1", "decor.plant.tree-plot", -9.5, 10.5),
    row("tree-plot-2", "decor.plant.tree-plot", -6.2, 11.2),
]);
const STARTER_HOMESITE_IDS = Object.freeze(["cottage-1", "kitchen-range-1", "hay-bale-1", "hay-bale-2", "trough-1", "oak-1", "oak-2", "oak-3", "oak-4"]);
const pose = (itemId, x, z, rotationY = 0) => {
    const turn = Math.PI * 2;
    return Object.freeze({ itemId, x, z, rotationY: Number((((rotationY % turn) + turn) % turn).toFixed(4)) });
};
const SHARED_OLD_STARTER_YARD = Object.freeze({
    "trough-1": pose("decor.prop.trough", 5.5, -1.5, Math.PI / 2),
    "oak-1": pose("decor.plant.oak", 9.5, -9),
    "oak-2": pose("decor.plant.oak", 11.2, -4.5),
    "oak-3": pose("decor.plant.oak", -11.5, 4),
    "oak-4": pose("decor.plant.oak", 7.8, 9.5),
});
const LEGACY_STARTER_HOMESITE = Object.freeze({
    "cottage-1": pose("decor.building.cottage", -7.5, 1.5, Math.PI / 2),
    "kitchen-range-1": pose("decor.prop.kitchen-range", -10.28, 2.7, Math.PI / 2),
    "hay-bale-1": pose("decor.prop.hay-bale", -1.2, -8.6, 0.4),
    "hay-bale-2": pose("decor.prop.hay-bale", 0.9, -8.9, -0.2),
    ...SHARED_OLD_STARTER_YARD,
});
const CROWDED_STARTER_HOMESITE = Object.freeze({
    "cottage-1": pose("decor.building.cottage", 0.25, -8.6, Math.PI / 2),
    "kitchen-range-1": pose("decor.prop.kitchen-range", -2.53, -7.4, Math.PI / 2),
    "hay-bale-1": pose("decor.prop.hay-bale", -8, -2.5, 0.4),
    "hay-bale-2": pose("decor.prop.hay-bale", -6.5, -2, -0.2),
    ...SHARED_OLD_STARTER_YARD,
});
const FORWARD_STARTER_HOMESITE = Object.freeze({
    "cottage-1": pose("decor.building.cottage", 4.2, -2, Math.PI * 2 - Math.PI / 12),
    "kitchen-range-1": pose("decor.prop.kitchen-range", 3.7604, -4.9959, Math.PI * 2 - Math.PI / 12),
    "hay-bale-1": pose("decor.prop.hay-bale", -8, -2.5, 0.4),
    "hay-bale-2": pose("decor.prop.hay-bale", -6.5, -2, -0.2),
    "trough-1": pose("decor.prop.trough", -4, -4, Math.PI / 2),
    "oak-1": pose("decor.plant.oak", 11.5, -10.5),
    "oak-2": pose("decor.plant.oak", 11, 5.5),
    "oak-3": pose("decor.plant.oak", -11, 4),
    "oak-4": pose("decor.plant.oak", 9.5, 10.5),
});
const LOPSIDED_REAR_STARTER_HOMESITE = Object.freeze({
    "cottage-1": pose("decor.building.cottage", 4.2, -9.3, 6.1021),
    "kitchen-range-1": pose("decor.prop.kitchen-range", 3.5203, -12.2507, 6.1021),
    "hay-bale-1": pose("decor.prop.hay-bale", -8, -2.5, 0.4),
    "hay-bale-2": pose("decor.prop.hay-bale", -6.5, -2, -0.2),
    "trough-1": pose("decor.prop.trough", -4, -4, Math.PI / 2),
    "oak-1": pose("decor.plant.oak", 11.5, -10.5),
    "oak-2": pose("decor.plant.oak", 11, 5.5),
    "oak-3": pose("decor.plant.oak", -11, 4),
    "oak-4": pose("decor.plant.oak", 9.5, 10.5),
});
function matchesStarterHomesite(decor, signature) {
    return STARTER_HOMESITE_IDS.every((instanceId) => {
        const row = decor.find((candidate) => candidate.instanceId === instanceId);
        const expected = signature[instanceId];
        return row?.itemId === expected.itemId && row.x === expected.x && row.z === expected.z && row.rotationY === expected.rotationY;
    });
}
/** Repair only an exact shipped homesite; moving any participating piece makes the saved arrangement authoritative. */
function migrateStarterHomesite(decor) {
    if (!matchesStarterHomesite(decor, LEGACY_STARTER_HOMESITE)
        && !matchesStarterHomesite(decor, CROWDED_STARTER_HOMESITE)
        && !matchesStarterHomesite(decor, FORWARD_STARTER_HOMESITE)
        && !matchesStarterHomesite(decor, LOPSIDED_REAR_STARTER_HOMESITE))
        return [...decor];
    const replacements = new Map(STARTER_FARM_DECOR.filter((row) => STARTER_HOMESITE_IDS.includes(row.instanceId)).map((row) => [row.instanceId, row]));
    return decor.map((row) => replacements.get(row.instanceId) ?? row);
}
/** The decor rows crops may grow in, and the ones a tree may. */
const cropPlotIds = (decor) => new Set(decor.filter((row) => row.itemId === "decor.plant.soil-patch" || row.itemId === "decor.building.greenhouse").map((row) => row.instanceId));
const treePlotIds = (decor) => new Set(decor.filter((row) => row.itemId === TREE_PLOT_ITEM_ID).map((row) => row.instanceId));
export function createDefaultFarmLayout(random = Math.random) {
    return Object.freeze({
        version: 3,
        onboarding: Object.freeze({ status: "needs_name", introSeen: false }),
        ground: DEFAULT_GROUND_ID,
        pets: Object.freeze([]),
        petHistory: Object.freeze([]),
        decor: STARTER_FARM_DECOR,
        agriculture: createStarterAgriculture(random),
        trees: Object.freeze([]),
        clock: Object.freeze({ farmMinutes: 8 * 60, updatedAt: 0, checkpointAt: 0, napBank: NAP_BANK_CAPACITY_MINUTES }),
        skills: EMPTY_FARM_SKILLS,
        settings: DEFAULT_FARM_SETTINGS,
    });
}
function freezeLayout(layout) {
    return Object.freeze({
        ...layout,
        pets: Object.freeze(layout.pets.map((pet) => Object.freeze({ ...pet }))),
        petHistory: Object.freeze(layout.petHistory.map((entry) => Object.freeze({ ...entry, finalStats: Object.freeze({ ...entry.finalStats }), traits: Object.freeze([...entry.traits]), accomplishments: Object.freeze([...entry.accomplishments]) }))),
        decor: Object.freeze(layout.decor.map((item) => Object.freeze({ ...item }))),
        onboarding: Object.freeze({ ...layout.onboarding }),
        agriculture: layout.agriculture,
        trees: Object.freeze(layout.trees.map((tree) => Object.freeze({ ...tree }))),
        clock: Object.freeze({ ...layout.clock }),
        settings: Object.freeze({ ...layout.settings }),
    });
}
/** Stable per-row entropy for pre-profile pets: migration must individualize once without rerolling on every load. */
function legacyPetRandom(identity) {
    let state = 2166136261;
    for (let index = 0; index < identity.length; index += 1) {
        state ^= identity.charCodeAt(index);
        state = Math.imul(state, 16777619) >>> 0;
    }
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}
function normalizePet(value) {
    if (!value || typeof value !== "object")
        return null;
    const source = value;
    const species = findAnimal(source.speciesId);
    if (!species)
        return null;
    if (typeof source.instanceId !== "string" || !/^[a-z0-9-]{1,40}$/.test(source.instanceId))
        return null;
    const storedProfile = source.profile;
    const migratedProfile = createPetProfile(species.id, legacyPetRandom(`${species.id}:${source.instanceId}`));
    let profile = storedProfile && typeof storedProfile === "object"
        ? normalizePetProfile(species.id, storedProfile)
        : migratedProfile;
    // Profiles saved during the identity rollout can have every stat but no traits.
    // An empty trait set is not a supported individual, so repair only that field from
    // stable row identity and preserve the pet's already-persisted stats and needs.
    if (profile && profile.traits.length === 0 && migratedProfile) {
        profile = normalizePetProfile(species.id, { ...profile, traits: migratedProfile.traits });
    }
    const stall = typeof source.stall === "string" && /^[a-z0-9-]{1,40}#stall-\d{1,2}$/.test(source.stall) ? source.stall : "";
    return { instanceId: source.instanceId, speciesId: species.id, name: cleanPetName(source.name) || species.title, profile, ...(stall ? { stall } : {}) };
}
function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function wrapRotation(value) {
    const turn = Math.PI * 2;
    return Number((((value % turn) + turn) % turn).toFixed(4));
}
export function normalizeFarmDecorRow(value) {
    if (!value || typeof value !== "object")
        return null;
    const source = value;
    const definition = findFarmDecor(source.itemId);
    if (!definition)
        return null;
    if (typeof source.instanceId !== "string" || !/^[a-z0-9-]{1,40}$/.test(source.instanceId))
        return null;
    if (!finiteNumber(source.x) || !finiteNumber(source.z))
        return null;
    const limitX = FARM_BOUNDS.width / 2;
    const limitZ = FARM_BOUNDS.depth / 2;
    const memorialId = definition.id === "decor.prop.pet-tombstone" && typeof source.memorialId === "string" && /^[a-z0-9-]{1,40}$/.test(source.memorialId) ? source.memorialId : undefined;
    // A crafted piece is the piece it was made as: without its stars it is not one.
    const crafted = definition.unlock.type === "crafted";
    const stars = source.stars === 1 || source.stars === 2 || source.stars === 3 ? source.stars : undefined;
    if (crafted && !stars)
        return null;
    // A trophy mount without a fish is no mount.
    const fishId = definition.unlock.type === "trophy" && typeof source.fishId === "string" && /^fish-[A-Za-z0-9-]{8,64}$/.test(source.fishId) ? source.fishId : undefined;
    if (definition.unlock.type === "trophy" && !fishId)
        return null;
    return {
        instanceId: source.instanceId,
        itemId: definition.id,
        x: Number(Math.min(limitX, Math.max(-limitX, source.x)).toFixed(4)),
        z: Number(Math.min(limitZ, Math.max(-limitZ, source.z)).toFixed(4)),
        rotationY: finiteNumber(source.rotationY) ? wrapRotation(source.rotationY) : 0,
        length: definition.length.enabled ? clampFarmDecorLength(definition, finiteNumber(source.length) && source.length > 0 ? source.length : definition.length.default) : 0,
        ...(memorialId ? { memorialId } : {}),
        ...(crafted ? { stars } : {}),
        ...(fishId ? { fishId } : {}),
    };
}
function normalizePetMemorial(value) {
    if (!value || typeof value !== "object")
        return null;
    const source = value;
    const stats = source.finalStats && typeof source.finalStats === "object" ? source.finalStats : {};
    if (typeof source.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(source.id))
        return null;
    // A memorial remembers a pet or a head of livestock (the server settles a livestock death into this history).
    const remembered = findAnimal(source.speciesId) ?? findLivestockSpecies(source.speciesId);
    if (typeof source.instanceId !== "string" || !/^[a-z0-9-]{1,40}$/.test(source.instanceId) || !remembered)
        return null;
    if (!["runaway", "starvation", "old_age", "neglect"].includes(String(source.outcome)))
        return null;
    const number = (value, min, max, fallback = 0) => finiteNumber(value) ? Math.min(max, Math.max(min, value)) : fallback;
    return Object.freeze({
        id: source.id,
        instanceId: source.instanceId,
        speciesId: source.speciesId,
        name: cleanPetName(source.name) || remembered.title || "Pet",
        outcome: source.outcome,
        departedAtFarmMinute: number(source.departedAtFarmMinute, 0, 1_000_000_000),
        lifespanDays: number(source.lifespanDays, 0, 200),
        finalStats: Object.freeze({
            gender: stats.gender === "male" ? "male" : "female",
            ageDays: number(stats.ageDays, 0, 200), size: number(stats.size, 0, 5, 1), hunger: number(stats.hunger, 0, 100), happiness: number(stats.happiness, 0, 100), speed: number(stats.speed, 0, 100), strength: number(stats.strength, 0, 100),
        }),
        traits: Object.freeze((Array.isArray(source.traits) ? source.traits : []).filter((id) => typeof id === "string").slice(0, 5)),
        accomplishments: Object.freeze((Array.isArray(source.accomplishments) ? source.accomplishments : []).filter((id) => typeof id === "string").map((id) => id.slice(0, 80)).slice(0, 32)),
    });
}
/** What the farm can house: water once a pond row stands on it. */
export function farmHabitats(layout) {
    return { water: layout.decor.some((item) => findFarmDecor(item.itemId)?.habitat === "water") };
}
export function normalizeFarmLayout(value) {
    if (!value || typeof value !== "object")
        return createDefaultFarmLayout();
    const source = value;
    if (source.version !== 1 && source.version !== 2 && source.version !== FARM_LAYOUT_VERSION)
        return createDefaultFarmLayout();
    const seen = new Set();
    // A v1 document never had decor; a v2 one without the key was stored before the field was editable.
    let decor;
    if (source.version === 1 || !Array.isArray(source.decor)) {
        decor = [...STARTER_FARM_DECOR];
        for (const item of decor)
            seen.add(item.instanceId);
    }
    else {
        decor = [];
        for (const raw of source.decor) {
            const item = normalizeFarmDecorRow(raw);
            if (!item || seen.has(item.instanceId))
                continue;
            seen.add(item.instanceId);
            decor.push(item);
            if (decor.length >= MAX_PERSISTED_DECOR)
                break;
        }
        decor = migrateStarterHomesite(decor);
    }
    const habitats = farmHabitats({ decor });
    const pets = [];
    const petIds = new Set();
    for (const raw of Array.isArray(source.pets) ? source.pets : []) {
        const pet = normalizePet(raw);
        if (!pet || petIds.has(pet.instanceId))
            continue;
        // A swimmer with no pond to live in is dropped rather than drawn on the grass.
        if (findAnimal(pet.speciesId)?.habitat === "water" && !habitats.water)
            continue;
        petIds.add(pet.instanceId);
        pets.push(pet);
        if (pets.length >= MAX_PETS)
            break;
    }
    const petHistory = [];
    const historyIds = new Set();
    for (const raw of Array.isArray(source.petHistory) ? source.petHistory : []) {
        const entry = normalizePetMemorial(raw);
        if (!entry || historyIds.has(entry.id))
            continue;
        historyIds.add(entry.id);
        petHistory.push(entry);
        if (petHistory.length >= 100)
            break;
    }
    const plotIds = cropPlotIds(decor);
    // Old documents are established farms. Only a document created with the explicit
    // marker may enter onboarding; absence must never re-grant or force-name a dog.
    const rawOnboarding = source.onboarding && typeof source.onboarding === "object"
        ? source.onboarding
        : null;
    const onboarding = rawOnboarding?.status === "needs_name"
        ? { status: "needs_name", introSeen: rawOnboarding.introSeen === true }
        : { status: "complete", introSeen: true };
    if (onboarding.status === "needs_name")
        pets.length = 0;
    const rawAgriculture = source.agriculture && typeof source.agriculture === "object"
        ? source.agriculture
        : null;
    const rawInventory = rawAgriculture?.inventory && typeof rawAgriculture.inventory === "object"
        ? rawAgriculture.inventory
        : null;
    const seedRows = rawInventory?.seeds && typeof rawInventory.seeds === "object" ? Object.keys(rawInventory.seeds) : [];
    // The API's no-row document deliberately carries an empty inventory. Turn it
    // into the randomized starter pool once; the immediate onboarding save then
    // makes every later normalization use the explicit persisted counts.
    const agriculture = onboarding.status === "needs_name" && seedRows.length === 0
        ? createStarterAgriculture()
        : source.version === 3 ? normalizeAgriculture(source.agriculture, plotIds) : normalizeAgriculture(undefined, plotIds);
    const rawClock = source.clock && typeof source.clock === "object" ? source.clock : {};
    const clock = {
        farmMinutes: finiteNumber(rawClock.farmMinutes) ? Math.max(0, rawClock.farmMinutes) : 8 * 60,
        updatedAt: finiteNumber(rawClock.updatedAt) ? Math.max(0, rawClock.updatedAt) : 0,
        checkpointAt: finiteNumber(rawClock.checkpointAt) ? Math.max(0, rawClock.checkpointAt) : 0,
        // Nap minutes available as of `updatedAt` (farm-nap-bank.mts). Absent = full.
        napBank: finiteNumber(rawClock.napBank) ? Math.min(NAP_BANK_CAPACITY_MINUTES, Math.max(0, rawClock.napBank)) : NAP_BANK_CAPACITY_MINUTES,
    };
    const trees = normalizeFarmTrees(source.trees, treePlotIds(decor));
    return freezeLayout({ version: 3, onboarding, ground: normalizeGroundId(source.ground), pets, petHistory, decor, agriculture, trees, clock, skills: normalizeFarmSkills(source.skills), settings: normalizeFarmSettings(source.settings) });
}
export function parseFarmLayout(serialized) {
    if (!serialized)
        return createDefaultFarmLayout();
    try {
        return normalizeFarmLayout(JSON.parse(serialized));
    }
    catch {
        return createDefaultFarmLayout();
    }
}
/** `<species>-<n>`, n one past the highest that species has ever had here, so ids stay stable after a release. */
export function nextPetInstanceId(layout, speciesId) {
    const stem = speciesId.replace(/^pet\./, "");
    let highest = 0;
    for (const pet of layout.pets) {
        const match = new RegExp(`^${stem}-(\\d+)$`).exec(pet.instanceId);
        if (match)
            highest = Math.max(highest, Number(match[1]));
    }
    for (const pet of layout.petHistory) {
        const match = new RegExp(`^${stem}-(\\d+)$`).exec(pet.instanceId);
        if (match)
            highest = Math.max(highest, Number(match[1]));
    }
    return `${stem}-${highest + 1}`;
}
export function addPet(layout, speciesId, name, random = Math.random) {
    const species = findAnimal(speciesId);
    if (!species)
        return { valid: false, layout, instanceId: "", reason: "unknown_species" };
    if (species.habitat === "water" && !farmHabitats(layout).water)
        return { valid: false, layout, instanceId: "", reason: "needs_water" };
    if (layout.pets.length >= MAX_PETS)
        return { valid: false, layout, instanceId: "", reason: "full" };
    const instanceId = nextPetInstanceId(layout, species.id);
    const pet = { instanceId, speciesId: species.id, name: cleanPetName(name) || species.title, profile: createPetProfile(species.id, random) };
    return { valid: true, layout: freezeLayout({ ...layout, pets: [...layout.pets, pet] }), instanceId, reason: "" };
}
export function renamePet(layout, instanceId, name) {
    const index = layout.pets.findIndex((pet) => pet.instanceId === instanceId);
    if (index < 0)
        return layout;
    const species = findAnimal(layout.pets[index].speciesId);
    const pets = layout.pets.map((pet, at) => (at === index ? { ...pet, name: cleanPetName(name) || species?.title || pet.name } : pet));
    return freezeLayout({ ...layout, pets });
}
export function removePet(layout, instanceId) {
    if (!layout.pets.some((pet) => pet.instanceId === instanceId))
        return layout;
    return freezeLayout({ ...layout, pets: layout.pets.filter((pet) => pet.instanceId !== instanceId) });
}
/** The pets that need water: what a pond removal has to answer for. */
export function waterPets(layout) {
    return layout.pets.filter((pet) => findAnimal(pet.speciesId)?.habitat === "water");
}
export function setFarmGround(layout, id) {
    const ground = findGround(id);
    if (!ground)
        return { valid: false, layout };
    return { valid: true, layout: freezeLayout({ ...layout, ground: ground.id }) };
}
/** Replace the decor list wholesale; the placement rules call this after they have decided. */
export function withFarmDecor(layout, decor) {
    return freezeLayout({
        ...layout,
        decor: [...decor],
        agriculture: normalizeAgriculture(layout.agriculture, cropPlotIds(decor)),
        trees: normalizeFarmTrees(layout.trees, treePlotIds(decor)),
    });
}
export function withFarmAgriculture(layout, agriculture) {
    return freezeLayout({ ...layout, agriculture });
}
export function withFarmTrees(layout, trees) {
    return freezeLayout({ ...layout, trees: [...trees] });
}
/** Replace pet rows after a pure care/lifecycle pass while preserving the layout's immutable document contract. */
export function withFarmPets(layout, pets) {
    return freezeLayout({ ...layout, pets: [...pets] });
}
export function withPetHistory(layout, petHistory) {
    return freezeLayout({ ...layout, petHistory: [...petHistory] });
}
/**
 * Stamp the clock at real time `updatedAt`. The nap bank is held "as of
 * updatedAt", so restamping refills it for the real time in between.
 */
export function withFarmClock(layout, farmMinutes, updatedAt) {
    const stamp = Math.max(0, updatedAt);
    const napBank = napBankAt(layout.clock.napBank, layout.clock.updatedAt, Math.max(stamp, layout.clock.updatedAt));
    return freezeLayout({ ...layout, clock: { ...layout.clock, farmMinutes: Math.max(0, farmMinutes), updatedAt: stamp, napBank } });
}
/** The nap bank right now, without changing the layout. */
export function farmNapBank(layout, now) {
    return napBankAt(layout.clock.napBank, layout.clock.updatedAt, now);
}
/** Draw a nap from the bank at real time `now`. The caller has checked it fits. */
export function withNapTaken(layout, minutes, farmMinutes, now) {
    const stamped = withFarmClock(layout, farmMinutes, now);
    return freezeLayout({ ...stamped, clock: { ...stamped.clock, napBank: Math.max(0, stamped.clock.napBank - Math.max(0, minutes)) } });
}
/** The owner's away-growth rate (0 = the farm waits for them), clamped to what the farm allows. */
export function withAwayGrowth(layout, rate) {
    return freezeLayout({ ...layout, settings: { ...layout.settings, awayGrowth: clampOfflineRate(rate) } });
}
/** Record that the owner is on the farm at real time `at`: offline production counts from here. */
export function withProductionCheckpoint(layout, at) {
    return freezeLayout({ ...layout, clock: { ...layout.clock, checkpointAt: Number.isFinite(at) ? Math.max(0, at) : 0 } });
}
export function farmDecorRowsEqual(first, second) {
    return first.instanceId === second.instanceId && first.itemId === second.itemId
        && first.x === second.x && first.z === second.z && first.rotationY === second.rotationY && first.length === second.length
        && first.memorialId === second.memorialId && first.stars === second.stars && first.fishId === second.fishId;
}
export function farmLayoutsEqual(first, second) {
    return first.onboarding.status === second.onboarding.status
        && first.onboarding.introSeen === second.onboarding.introSeen
        && first.ground === second.ground
        && JSON.stringify(first.agriculture) === JSON.stringify(second.agriculture)
        && JSON.stringify(first.trees) === JSON.stringify(second.trees)
        && first.clock.farmMinutes === second.clock.farmMinutes
        && first.clock.updatedAt === second.clock.updatedAt
        && first.clock.checkpointAt === second.clock.checkpointAt
        && first.clock.napBank === second.clock.napBank
        && first.settings.awayGrowth === second.settings.awayGrowth
        && JSON.stringify(first.skills) === JSON.stringify(second.skills)
        && first.pets.length === second.pets.length
        && first.pets.every((pet, index) => {
            const other = second.pets[index];
            return pet.instanceId === other.instanceId && pet.speciesId === other.speciesId && pet.name === other.name
                && JSON.stringify(pet.profile) === JSON.stringify(other.profile);
        })
        && JSON.stringify(first.petHistory) === JSON.stringify(second.petHistory)
        && first.decor.length === second.decor.length
        && first.decor.every((item, index) => farmDecorRowsEqual(item, second.decor[index]));
}
/** The farm's document, on the shared store: slug `farm`, its own cache bucket, its own normalizer. */
export const FARM_LAYOUT_SPEC = Object.freeze({
    slug: "farm",
    cacheKey: farmCacheKey,
    normalize: normalizeFarmLayout,
    createDefault: createDefaultFarmLayout,
});
