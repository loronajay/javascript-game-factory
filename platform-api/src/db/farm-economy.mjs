import { awardTicketsInTransaction, spendTicketsInTransaction } from "./tickets.mjs";
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { FARM_ADOPTION_PRICE, createFarmPetProfile, findFarmSpecies, findFarmSupply } from "../services/farm-economy-catalog.mjs";
import { farmHarvestYield } from "../services/farm-crop-catalog.mjs";
import { farmSalePrice, normalizeSaleLines } from "../services/farm-market-catalog.mjs";
import { parseFarmDishKey } from "../services/farm-recipe-catalog.mjs";
import { parseFarmPieceKey, unplacedFarmPieces } from "../services/farm-carpentry-catalog.mjs";
import { farmHarvestXp, farmingLevelForXp, farmingSummary, normalizeFarmSkillRecords, normalizeFarmingRecord, recordFarmFelling, recordFarmFruit, recordFarmHarvest, recordFarmOrder } from "../services/farm-skill-catalog.mjs";
import { farmTreeReady, farmTreeRule } from "../services/farm-tree-catalog.mjs";
import { normalizeCookingRecord, recordFarmDishOrder } from "../services/farm-skill-catalog.mjs";
import { takeFarmDishes } from "../services/farm-recipe-catalog.mjs";
import { FARM_ORDER_DAY_MS, farmFullOrderBoard, farmOrderDay, farmOrderTransactionKey, findFarmOrder, isStaleFarmOrderId, } from "../services/farm-order-catalog.mjs";
import { awardServerAchievementsInTransaction } from "./achievements.mjs";
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
export async function transaction(pool, work) {
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
export async function lockedFarm(client, playerId) {
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
export async function saveFarm(client, playerId, layout) {
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
        // A sapling is sold only to a farmer whose skill has reached its species (Farming for fruit, Woodcutting for timber).
        if (supply.kind === "sapling") {
            const rule = farmTreeRule(supply.speciesId);
            const skills = normalizeFarmSkillRecords(farm.layout.skills);
            const level = farmingLevelForXp(rule.kind === "fruit" ? skills.farming.xp : skills.woodcutting.xp);
            if (level < rule.minLevel)
                return { ok: false, error: "level_too_low", minLevel: rule.minLevel, level };
        }
        const stackKey = supply.kind === "seed" ? "seeds" : supply.kind === "sapling" ? "saplings" : "supplies";
        const stack = agriculture?.inventory?.[stackKey];
        const stackId = supply.cropId ?? supply.speciesId ?? supply.id;
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
        const inventory = { ...agriculture.inventory, [stackKey]: { ...(agriculture.inventory?.[stackKey] ?? {}), [stackId]: current + quantity } };
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
/**
 * The farm a harvest-shaped request brings, held to everything the server
 * already knows — the same guard a save runs, inside the locked transaction —
 * or null when there is no initialised farm. Crop harvests, picks and fellings share it.
 */
export async function verifiedSubmittedFarm(client, playerId, submitted, now) {
    const stored = await client.query(`select garage, updated_at from game_loadouts where player_id = $1 and game_slug = 'farm' for update`, [playerId]);
    const row = stored.rows?.[0];
    if (!row)
        return null;
    const entitlements = await client.query(`select entitlement_id from game_entitlements where player_id = $1 and game_slug = 'farm'`, [playerId]);
    const owned = new Set(entitlements.rows.map((entry) => String(entry.entitlement_id)));
    const verified = normalizeFarmGarage(submitted, {
        ownedEntitlementIds: owned,
        currentGarage: row.garage,
        currentSavedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        now,
    });
    return verified.onboarding?.status === "complete" ? { verified, owned } : null;
}
export async function harvestFarmCrop(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const plotId = required(input?.plotId, "plotId");
    const cellId = required(input?.cellId, "cellId");
    if (!PLOT_ID.test(plotId) || !CELL_ID.test(cellId))
        throw new TypeError("invalid cell");
    if (!input?.layout || typeof input.layout !== "object")
        throw new TypeError("layout is required");
    return transaction(pool, async (client) => {
        const farm = await verifiedSubmittedFarm(client, playerId, input.layout, now);
        if (!farm)
            return { ok: false, error: "farm_not_initialized" };
        const { verified, owned } = farm;
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
        // The Farming XP is the verified row's: the stored care penalty, not the client's.
        const before = normalizeFarmingRecord(verified.skills?.farming);
        const xp = farmHarvestXp(crop.cropId, crop.carePenalty);
        const farming = recordFarmHarvest(before, crop.cropId, xp);
        const layout = normalizeFarmGarage({
            ...verified,
            agriculture: {
                ...verified.agriculture,
                inventory: { ...verified.agriculture.inventory, produce },
                crops: crops.filter((entry) => entry !== crop),
            },
            skills: { ...verified.skills, farming },
        }, { ownedEntitlementIds: owned });
        const achievements = await awardServerAchievementsInTransaction(client, {
            playerId, gameSlug: "farm", facts: { farming, woodcutting: verified.skills?.woodcutting }, sourceId: `harvest:${plotId}:${cellId}:${farming.harvests}`,
        });
        return answer({ ok: true, cropId: crop.cropId, quantity: amount, xp, farming: farmingSummary(farming, before.xp), achievements, layout });
    });
}
/**
 * Pick a fruit tree or fell a timber tree — the only ways fruit and logs
 * enter a farm. Shaped exactly like a crop harvest: the client sends its farm
 * and names a Tree Plot; the server verifies the farm, decides from its own
 * tree table whether the tree there is ready (its growth bounded by real time
 * like a crop's), and credits what the species yields and the XP it earns.
 * Picking starts the tree's next fruit; felling leaves a stump that grows
 * back. How well the axe was swung is the client's affair and changes
 * nothing here: the felling game decides how long a felling takes, never what
 * it pays. A retried request finds the fruit gone or the stump standing, and
 * pays nothing twice.
 */
export async function harvestFarmTree(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const plotId = required(input?.plotId, "plotId");
    if (!PLOT_ID.test(plotId))
        throw new TypeError("invalid plot");
    if (!input?.layout || typeof input.layout !== "object")
        throw new TypeError("layout is required");
    return transaction(pool, async (client) => {
        const farm = await verifiedSubmittedFarm(client, playerId, input.layout, now);
        if (!farm)
            return { ok: false, error: "farm_not_initialized" };
        const { verified, owned } = farm;
        const answer = async (result) => {
            await saveFarm(client, playerId, result.layout);
            return result;
        };
        const trees = verified.trees ?? [];
        const tree = trees.find((entry) => entry.plotId === plotId);
        if (!tree)
            return answer({ ok: false, error: "empty", layout: verified });
        if (!farmTreeReady(tree))
            return answer({ ok: false, error: "not_ready", layout: verified });
        const rule = farmTreeRule(tree.speciesId);
        const skills = normalizeFarmSkillRecords(verified.skills);
        const inventory = { ...verified.agriculture.inventory };
        const fruit = rule.kind === "fruit";
        if (fruit)
            inventory.produce = { ...inventory.produce, [tree.speciesId]: Math.min(MAX_STACK, (Number(inventory.produce?.[tree.speciesId]) || 0) + rule.yield) };
        else
            inventory.logs = { ...inventory.logs, [tree.speciesId]: Math.min(MAX_STACK, (Number(inventory.logs?.[tree.speciesId]) || 0) + rule.yield) };
        const nextTree = fruit ? { ...tree, fruitMinutes: 0 } : { ...tree, stump: true, growthMinutes: 0, fruitMinutes: 0 };
        const nextSkills = fruit
            ? { ...skills, farming: recordFarmFruit(skills.farming, tree.speciesId, rule.xp) }
            : { ...skills, woodcutting: recordFarmFelling(skills.woodcutting, tree.speciesId, rule.xp) };
        const layout = normalizeFarmGarage({
            ...verified,
            agriculture: { ...verified.agriculture, inventory },
            trees: trees.map((entry) => entry === tree ? nextTree : entry),
            skills: nextSkills,
        }, { ownedEntitlementIds: owned });
        const skill = fruit ? "farming" : "woodcutting";
        const picks = Object.values(nextSkills.farming.fruit).reduce((sum, count) => sum + count, 0);
        const achievements = await awardServerAchievementsInTransaction(client, {
            playerId, gameSlug: "farm", facts: { farming: nextSkills.farming, woodcutting: nextSkills.woodcutting },
            sourceId: `tree:${plotId}:${fruit ? `pick-${picks}` : `fell-${nextSkills.woodcutting.fellings}`}`,
        });
        return answer({
            ok: true, kind: rule.kind, speciesId: tree.speciesId, quantity: rule.yield, xp: rule.xp, skill,
            level: farmingSummary(nextSkills[skill], skills[skill].xp), achievements, layout,
        });
    });
}
const SALE_ID = PURCHASE_ID;
/**
 * The Market Square buys what a farm makes: the Produce Merchant raw produce,
 * the Kitchen cooked dishes (a line keyed "recipe@stars"). Everything about the
 * sale is decided here, in one locked transaction: the farm row is held, the
 * counts are checked against the STORED basket and pantry (which only a
 * harvest or a cook can raise), the price is this server's, the goods come off
 * and the tickets go on together, and the ledger row is keyed by the client's
 * sale id so a retry of a sale that already landed changes nothing and says so.
 */
export async function sellFarmProduce(pool, input) {
    const playerId = required(input?.playerId, "playerId");
    const saleId = required(input?.saleId, "saleId");
    if (!SALE_ID.test(saleId))
        throw new TypeError("invalid saleId");
    const lines = normalizeSaleLines(input?.items);
    if (!lines)
        return { ok: false, error: "invalid_sale" };
    const transactionKey = `farm:sale:${saleId}`;
    return transaction(pool, async (client) => {
        const farm = await lockedFarm(client, playerId);
        if (!farm || farm.layout.onboarding?.status !== "complete")
            return { ok: false, error: "farm_not_initialized" };
        if (await duplicatePurchase(client, playerId, transactionKey)) {
            const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
            return { ok: true, duplicate: true, earned: 0, sold: {}, balance: Number(wallet.rows[0]?.balance) || 0, layout: farm.layout };
        }
        const agriculture = farm.layout.agriculture;
        const produce = { ...(agriculture?.inventory?.produce ?? {}) };
        const dishes = { ...(agriculture?.inventory?.dishes ?? {}) };
        const furniture = { ...(agriculture?.inventory?.furniture ?? {}) };
        // Only what is on the shelf can be sold: a piece standing on the field stays there.
        const shelf = unplacedFarmPieces(furniture, farm.layout.decor ?? []);
        let earned = 0;
        for (const [itemId, quantity] of Object.entries(lines)) {
            const dish = Boolean(parseFarmDishKey(itemId));
            const piece = Boolean(parseFarmPieceKey(itemId));
            const stack = dish ? dishes : piece ? furniture : produce;
            const held = piece ? shelf[itemId] ?? 0 : Number(stack[itemId]) || 0;
            if (held < quantity)
                return { ok: false, error: dish ? "not_enough_dishes" : piece ? "not_enough_furniture" : "not_enough_produce", cropId: itemId, held, layout: farm.layout };
            stack[itemId] = (Number(stack[itemId]) || 0) - quantity;
            earned += farmSalePrice(itemId) * quantity;
        }
        const cooked = Object.keys(lines).some((itemId) => parseFarmDishKey(itemId));
        const crafted = Object.keys(lines).some((itemId) => parseFarmPieceKey(itemId));
        const award = await awardTicketsInTransaction(client, {
            playerId, transactionKey, amount: earned, reason: crafted ? "farm_furniture_sale" : cooked ? "farm_dish_sale" : "farm_produce_sale",
            metadata: { items: lines, prices: Object.fromEntries(Object.keys(lines).map((id) => [id, farmSalePrice(id)])) },
        });
        const next = normalizeFarmGarage({
            ...farm.layout,
            agriculture: { ...agriculture, inventory: { ...agriculture.inventory, produce, dishes, furniture } },
        }, { ownedEntitlementIds: farm.owned });
        await saveFarm(client, playerId, next);
        return { ok: true, duplicate: false, earned, sold: lines, balance: award.balance, layout: next };
    });
}
// ---------------------------------------------------------------- the Order Board
function farmingOf(layout) {
    return normalizeFarmingRecord(layout?.skills?.farming);
}
/** The ids on day `day`'s board this player has already filled: the ledger is the record. */
async function filledOrderIds(client, playerId, day) {
    const result = await client.query(`select transaction_key from ticket_transactions where player_id = $1 and transaction_key like $2`, [playerId, `farm:order:d${day}-%`]);
    return new Set((result.rows ?? []).map((row) => String(row.transaction_key).replace(/^farm:order:/, "")));
}
function presentOrder(order, filled) {
    return { ...order, lines: { ...order.lines }, filled };
}
/**
 * The board as this player sees it: today's orders, which they have filled,
 * their Farming and Cooking levels (the client greys out what they gate), their
 * basket and their pantry. A player with no farm yet reads the board at level
 * 1 with nothing to deliver.
 */
export async function getFarmOrderBoard(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const day = farmOrderDay(now);
    const stored = await pool.query(`select garage from game_loadouts where player_id = $1 and game_slug = 'farm'`, [playerId]);
    const layout = stored.rows?.[0] ? normalizeFarmGarage(stored.rows[0].garage) : null;
    const farming = farmingOf(layout);
    const cooking = normalizeCookingRecord(layout?.skills?.cooking);
    const filled = await filledOrderIds(pool, playerId, day);
    return {
        day,
        endsAt: (day + 1) * FARM_ORDER_DAY_MS,
        orders: farmFullOrderBoard(day).map((order) => presentOrder(order, filled.has(order.id))),
        farming: farmingSummary(farming, farming.xp),
        cooking: farmingSummary(cooking, cooking.xp),
        produce: layout?.agriculture?.inventory?.produce ?? {},
        dishes: layout?.agriculture?.inventory?.dishes ?? {},
    };
}
/**
 * Fill one order from today's board. One locked transaction, like a sale: the
 * order must be on TODAY's board, the level must reach its gate, the stored
 * produce must cover every line; then the produce comes off, the order's
 * tickets go on under the ledger key `farm:order:<id>` (which is what makes a
 * fill once-only, per player, forever), the Farming XP lands, and any farm
 * achievement it completes is awarded. A retry of a fill that already landed
 * changes nothing and says so. A dish order is the same against the pantry
 * and the Cooking level (`fillDishOrder`).
 */
export async function fillFarmOrder(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const orderId = required(input?.orderId, "orderId");
    const day = farmOrderDay(now);
    const order = findFarmOrder(orderId, day);
    if (!order)
        return { ok: false, error: isStaleFarmOrderId(orderId, day) ? "order_expired" : "unknown_order" };
    const transactionKey = farmOrderTransactionKey(order.id);
    return transaction(pool, async (client) => {
        const farm = await lockedFarm(client, playerId);
        if (!farm || farm.layout.onboarding?.status !== "complete")
            return { ok: false, error: "farm_not_initialized" };
        const before = farmingOf(farm.layout);
        const summary = farmingSummary(before, before.xp);
        if (await duplicatePurchase(client, playerId, transactionKey)) {
            const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
            return { ok: true, duplicate: true, order: presentOrder(order, true), earned: 0, xp: 0, farming: summary, achievements: [], balance: Number(wallet.rows[0]?.balance) || 0, layout: farm.layout };
        }
        if (order.kind === "dish")
            return fillDishOrder(client, playerId, order, farm, transactionKey);
        if (summary.level < order.minLevel)
            return { ok: false, error: "level_too_low", minLevel: order.minLevel, level: summary.level, layout: farm.layout };
        const agriculture = farm.layout.agriculture;
        const produce = { ...(agriculture?.inventory?.produce ?? {}) };
        for (const [cropId, quantity] of Object.entries(order.lines)) {
            const held = Number(produce[cropId]) || 0;
            if (held < quantity)
                return { ok: false, error: "not_enough_produce", cropId, held, layout: farm.layout };
            produce[cropId] = held - quantity;
        }
        const award = await awardTicketsInTransaction(client, {
            playerId, transactionKey, amount: order.tickets, reason: "farm_order",
            metadata: { orderId: order.id, customer: order.customer, lines: order.lines, xp: order.xp },
        });
        const farming = recordFarmOrder(before, order.xp);
        const next = normalizeFarmGarage({
            ...farm.layout,
            agriculture: { ...agriculture, inventory: { ...agriculture.inventory, produce } },
            skills: { ...farm.layout.skills, farming },
        }, { ownedEntitlementIds: farm.owned });
        await saveFarm(client, playerId, next);
        const achievements = await awardServerAchievementsInTransaction(client, {
            playerId, gameSlug: "farm", facts: { farming, woodcutting: farm.layout.skills?.woodcutting, order: { minLevel: order.minLevel } }, sourceId: `order:${order.id}`,
        });
        return {
            ok: true, duplicate: false, order: presentOrder(order, true), earned: order.tickets, xp: order.xp,
            farming: farmingSummary(farming, before.xp), achievements, balance: award.balance, layout: next,
        };
    });
}
/** A dish order, inside `fillFarmOrder`'s transaction: the Cooking level, the pantry (plainest dishes first), Cooking XP. */
async function fillDishOrder(client, playerId, order, farm, transactionKey) {
    const before = normalizeCookingRecord(farm.layout.skills?.cooking);
    const level = farmingLevelForXp(before.xp);
    const farming = farmingOf(farm.layout);
    if (level < order.minLevel)
        return { ok: false, error: "level_too_low", skill: "cooking", minLevel: order.minLevel, level, layout: farm.layout };
    const agriculture = farm.layout.agriculture;
    let dishes = { ...(agriculture?.inventory?.dishes ?? {}) };
    for (const [recipeId, count] of Object.entries(order.lines)) {
        const taken = takeFarmDishes(dishes, recipeId, count);
        if (!taken)
            return { ok: false, error: "not_enough_dishes", recipeId, layout: farm.layout };
        dishes = taken;
    }
    const award = await awardTicketsInTransaction(client, {
        playerId, transactionKey, amount: order.tickets, reason: "farm_order",
        metadata: { orderId: order.id, customer: order.customer, lines: order.lines, xp: order.xp, skill: "cooking" },
    });
    const cooking = recordFarmDishOrder(before, order.xp);
    const next = normalizeFarmGarage({
        ...farm.layout,
        agriculture: { ...agriculture, inventory: { ...agriculture.inventory, dishes } },
        skills: { ...farm.layout.skills, cooking },
    }, { ownedEntitlementIds: farm.owned });
    await saveFarm(client, playerId, next);
    const achievements = await awardServerAchievementsInTransaction(client, {
        playerId, gameSlug: "farm", facts: { farming, woodcutting: farm.layout.skills?.woodcutting, cooking }, sourceId: `order:${order.id}`,
    });
    return {
        ok: true, duplicate: false, order: presentOrder(order, true), earned: order.tickets, xp: order.xp, skill: "cooking",
        farming: farmingSummary(farming, farming.xp), cooking: farmingSummary(cooking, before.xp), achievements, balance: award.balance, layout: next,
    };
}
