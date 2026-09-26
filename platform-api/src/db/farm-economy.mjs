import { spendTicketsInTransaction } from "./tickets.mjs";
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { FARM_ADOPTION_PRICE, createFarmPetProfile, findFarmSpecies, findFarmSupply } from "../services/farm-economy-catalog.mjs";
import { farmHarvestYield } from "../services/farm-crop-catalog.mjs";
const MAX_PETS = 12;
const MAX_STACK = 99;
const PURCHASE_ID = /^[A-Za-z0-9_-]{1,80}$/;
function required(value, field) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text)
        throw new TypeError(`${field} is required`);
    return text;
}
function cleanName(value, fallback) {
    if (typeof value !== "string")
        return fallback;
    // eslint-disable-next-line no-control-regex
    return value.replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 20) || fallback;
}
async function transaction(pool, work) {
    const client = await pool.connect();
    try {
        await client.query("begin");
        const result = await work(client);
        await client.query("commit");
        return result;
    }
    catch (error) {
        await client.query("rollback");
        throw error;
    }
    finally {
        client.release();
    }
}
async function lockedFarm(client, playerId) {
    const result = await client.query(`select garage from game_loadouts where player_id = $1 and game_slug = 'farm' for update`, [playerId]);
    if (!result.rows?.[0])
        return null;
    const entitlements = await client.query(`select entitlement_id from game_entitlements where player_id = $1 and game_slug = 'farm'`, [playerId]);
    const owned = new Set(entitlements.rows.map((row) => String(row.entitlement_id)));
    return { layout: normalizeFarmGarage(result.rows[0].garage, { ownedEntitlementIds: owned }), owned };
}
async function duplicatePurchase(client, playerId, transactionKey) {
    const result = await client.query(`select 1 from ticket_transactions where player_id = $1 and transaction_key = $2`, [playerId, transactionKey]);
    return Boolean(result.rows?.length);
}
async function saveFarm(client, playerId, layout) {
    await client.query(`update game_loadouts set garage = $3::jsonb, updated_at = now()
     where player_id = $1 and game_slug = $2`, [playerId, "farm", JSON.stringify(layout)]);
}
function nextPetId(layout, speciesId) {
    const stem = speciesId.replace(/^pet\./, "");
    let highest = 0;
    for (const row of [...(layout.pets ?? []), ...(layout.petHistory ?? [])]) {
        const match = new RegExp(`^${stem}-(\\d+)$`).exec(String(row.instanceId ?? ""));
        if (match)
            highest = Math.max(highest, Number(match[1]));
    }
    return `${stem}-${highest + 1}`;
}
export async function adoptFarmPet(pool, input, random = Math.random) {
    const playerId = required(input?.playerId, "playerId");
    const purchaseId = required(input?.purchaseId, "purchaseId");
    if (!PURCHASE_ID.test(purchaseId))
        throw new TypeError("invalid purchaseId");
    const species = findFarmSpecies(input?.speciesId);
    if (!species)
        return { ok: false, error: "unknown_species" };
    const transactionKey = `farm:adoption:${purchaseId}`;
    return transaction(pool, async (client) => {
        const farm = await lockedFarm(client, playerId);
        if (!farm || farm.layout.onboarding?.status !== "complete")
            return { ok: false, error: "farm_not_initialized" };
        if (await duplicatePurchase(client, playerId, transactionKey)) {
            const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
            return { ok: true, duplicate: true, price: 0, balance: Number(wallet.rows[0]?.balance) || 0, layout: farm.layout };
        }
        if ((farm.layout.pets?.length ?? 0) >= MAX_PETS)
            return { ok: false, error: "farm_full" };
        if (species.habitat === "water" && !(farm.layout.decor ?? []).some((row) => String(row.itemId).startsWith("decor.water."))) {
            return { ok: false, error: "needs_water" };
        }
        const spend = await spendTicketsInTransaction(client, {
            playerId, transactionKey, amount: FARM_ADOPTION_PRICE, reason: "farm_pet_adoption",
            metadata: { speciesId: species.id },
        });
        if (!spend.ok)
            return { ok: false, error: spend.error, balance: spend.balance, price: FARM_ADOPTION_PRICE };
        const instanceId = nextPetId(farm.layout, species.id);
        const pet = { instanceId, speciesId: species.id, name: cleanName(input?.name, species.title), profile: createFarmPetProfile(species.id, random) };
        const agriculture = farm.layout.agriculture ?? { inventory: { seeds: {}, produce: {}, supplies: {} }, crops: [] };
        const supplies = { ...(agriculture.inventory?.supplies ?? {}) };
        supplies[species.foodItemId] = Math.min(MAX_STACK, (Number(supplies[species.foodItemId]) || 0) + 5);
        const next = normalizeFarmGarage({
            ...farm.layout,
            pets: [...farm.layout.pets, pet],
            agriculture: { ...agriculture, inventory: { ...agriculture.inventory, supplies } },
        }, { ownedEntitlementIds: farm.owned });
        await saveFarm(client, playerId, next);
        return { ok: true, duplicate: false, price: FARM_ADOPTION_PRICE, balance: spend.balance, pet, layout: next };
    });
}
export async function purchaseFarmSupply(pool, input) {
    const playerId = required(input?.playerId, "playerId");
    const purchaseId = required(input?.purchaseId, "purchaseId");
    if (!PURCHASE_ID.test(purchaseId))
        throw new TypeError("invalid purchaseId");
    const supply = findFarmSupply(input?.itemId);
    if (!supply)
        return { ok: false, error: "unknown_supply" };
    const quantity = Number(input?.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20)
        return { ok: false, error: "invalid_quantity" };
    const transactionKey = `farm:supply:${purchaseId}`;
    return transaction(pool, async (client) => {
        const farm = await lockedFarm(client, playerId);
        if (!farm || farm.layout.onboarding?.status !== "complete")
            return { ok: false, error: "farm_not_initialized" };
        if (await duplicatePurchase(client, playerId, transactionKey)) {
            const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
            return { ok: true, duplicate: true, price: 0, quantity, balance: Number(wallet.rows[0]?.balance) || 0, layout: farm.layout };
        }
        const agriculture = farm.layout.agriculture;
        const stack = supply.kind === "seed" ? agriculture?.inventory?.seeds : agriculture?.inventory?.supplies;
        const stackId = supply.cropId ?? supply.id;
        const current = Number(stack?.[stackId]) || 0;
        if (current + quantity > MAX_STACK)
            return { ok: false, error: "inventory_full" };
        const total = supply.price * quantity;
        const spend = await spendTicketsInTransaction(client, {
            playerId, transactionKey, amount: total, reason: "farm_supply_purchase",
            metadata: { itemId: supply.id, quantity, kind: supply.kind },
        });
        if (!spend.ok)
            return { ok: false, error: spend.error, balance: spend.balance, price: total, quantity };
        const inventory = supply.kind === "seed"
            ? { ...agriculture.inventory, seeds: { ...agriculture.inventory.seeds, [stackId]: current + quantity } }
            : { ...agriculture.inventory, supplies: { ...agriculture.inventory.supplies, [stackId]: current + quantity } };
        const next = normalizeFarmGarage({
            ...farm.layout,
            agriculture: { ...agriculture, inventory },
        }, { ownedEntitlementIds: farm.owned });
        await saveFarm(client, playerId, next);
        return { ok: true, duplicate: false, price: total, quantity, balance: spend.balance, layout: next };
    });
}
const CELL_ID = /^cell-[0-5]$/;
const PLOT_ID = /^[A-Za-z0-9_-]{1,40}$/;
/**
 * A harvest is the only way produce enters a farm. The client sends its farm as
 * it stands (the same document a save would) and names one cell; inside one
 * locked transaction the server holds that document to everything it already
 * knows — exactly the save guard: clock bounded by real time and the nap bank,
 * each crop's growth bounded by its own stamp, produce unable to rise — then
 * decides for itself whether that crop is ripe, what it yields, removes it and
 * credits the produce. The canonical farm comes back either way, so a client
 * whose view ran ahead of what the server accepts is corrected in place.
 *
 * Retrying a harvest that already landed is harmless: the crop is no longer
 * stored, so the resubmitted row counts as newly planted and is nowhere near ripe.
 */
export async function harvestFarmCrop(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const plotId = required(input?.plotId, "plotId");
    const cellId = required(input?.cellId, "cellId");
    if (!PLOT_ID.test(plotId) || !CELL_ID.test(cellId))
        throw new TypeError("invalid cell");
    if (!input?.layout || typeof input.layout !== "object")
        throw new TypeError("layout is required");
    return transaction(pool, async (client) => {
        const stored = await client.query(`select garage, updated_at from game_loadouts where player_id = $1 and game_slug = 'farm' for update`, [playerId]);
        const row = stored.rows?.[0];
        if (!row)
            return { ok: false, error: "farm_not_initialized" };
        const entitlements = await client.query(`select entitlement_id from game_entitlements where player_id = $1 and game_slug = 'farm'`, [playerId]);
        const owned = new Set(entitlements.rows.map((entry) => String(entry.entitlement_id)));
        const verified = normalizeFarmGarage(input.layout, {
            ownedEntitlementIds: owned,
            currentGarage: row.garage,
            currentSavedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
            now,
        });
        if (verified.onboarding?.status !== "complete")
            return { ok: false, error: "farm_not_initialized" };
        const crops = verified.agriculture?.crops ?? [];
        const crop = crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
        // Whatever happens to the harvest, the verified farm is what is now true.
        const answer = async (result) => {
            await saveFarm(client, playerId, result.layout);
            return result;
        };
        if (!crop)
            return answer({ ok: false, error: "empty", layout: verified });
        if (crop.diedOf)
            return answer({ ok: false, error: "dead", layout: verified });
        const amount = farmHarvestYield(crop);
        if (amount <= 0)
            return answer({ ok: false, error: "not_ready", layout: verified });
        const produce = { ...verified.agriculture.inventory.produce };
        produce[crop.cropId] = Math.min(MAX_STACK, (Number(produce[crop.cropId]) || 0) + amount);
        const layout = normalizeFarmGarage({
            ...verified,
            agriculture: {
                ...verified.agriculture,
                inventory: { ...verified.agriculture.inventory, produce },
                crops: crops.filter((entry) => entry !== crop),
            },
        }, { ownedEntitlementIds: owned });
        return answer({ ok: true, cropId: crop.cropId, quantity: amount, layout });
    });
}
