// Hollis's horses on the database (planning-docs/FARM_RIDING_PLAN.md).
//
// A horse is a PET — a row in the farm document's `pets`, with the pets' care,
// growth and memorial — but it is bought, not adopted: from the Livestock
// Dealer's paddock in the Market Square, where each UTC day brings three
// horses rolled from the day's seeds (`services/farm-horse-catalog.mts`). The
// server rolls the horse it sells from that same seed, so the horse that
// arrives is the horse the card showed; checks the Riding level its potential
// asks for; finds it a free Stable stall (one no livestock and no other horse
// is in); charges the price; and writes the pet with its `stall` in one
// transaction under the farm's row lock. The ticket-ledger key
// `farm:horse:<day>:<slot>` makes each of the day's horses one sale per player.
import { spendTicketsInTransaction } from "./tickets.mjs";
import { lockedFarm, nextPetId, saveFarm, transaction } from "./farm-economy.mjs";
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { createFarmPetProfile } from "../services/farm-economy-catalog.mjs";
import { farmHerdHomes } from "../services/farm-livestock-catalog.mjs";
import { farmingLevelForXp, normalizeFarmSkillRecords } from "../services/farm-skill-catalog.mjs";
import { farmSeedFor, farmSeededRandom } from "../services/farm-seeded-random.mjs";
import { FARM_HORSE_GRADE_RULES, FARM_HORSE_SPECIES_ID, FARM_HORSE_STOCK_SIZE, farmHorseStockDay, farmHorseStockSeed, farmHorseTransactionKey, } from "../services/farm-horse-catalog.mjs";
const MAX_PETS = 12;
const MAX_STACK = 99;
const STARTER_OATS = 5;
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
/** One of the day's horses, rolled from its seed: the same profile the Dealer's card shows. */
export function rollFarmStockHorse(day, slot) {
    return createFarmPetProfile(FARM_HORSE_SPECIES_ID, farmSeededRandom(farmSeedFor(farmHorseStockSeed(day, slot))));
}
/** The Stable stalls free for a horse: stalls the herd could use that no live animal names. */
export function freeFarmHorseStalls(layout, herdHomeIds) {
    const taken = new Set(herdHomeIds.filter((id) => typeof id === "string" && id.length > 0));
    return farmHerdHomes(layout).filter((home) => /#stall-\d+$/.test(home.id) && !taken.has(home.id)).map((home) => home.id);
}
export async function buyFarmHorse(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const day = Number(input?.day);
    const slot = Number(input?.slot);
    const today = farmHorseStockDay(now);
    if (!Number.isSafeInteger(slot) || slot < 0 || slot >= FARM_HORSE_STOCK_SIZE)
        return { ok: false, error: "unknown_horse" };
    if (day !== today)
        return { ok: false, error: "stock_changed", day: today };
    const profile = rollFarmStockHorse(day, slot);
    if (!profile?.growth)
        return { ok: false, error: "unknown_horse" };
    const rule = FARM_HORSE_GRADE_RULES[profile.growth.grade] ?? FARM_HORSE_GRADE_RULES.steady;
    const transactionKey = farmHorseTransactionKey(day, slot);
    return transaction(pool, async (client) => {
        const farm = await lockedFarm(client, playerId);
        if (!farm || farm.layout.onboarding?.status !== "complete")
            return { ok: false, error: "farm_not_initialized" };
        const bought = await client.query(`select 1 from ticket_transactions where player_id = $1 and transaction_key = $2`, [playerId, transactionKey]);
        if (bought.rows?.length)
            return { ok: false, error: "already_bought", layout: farm.layout };
        if ((farm.layout.pets?.length ?? 0) >= MAX_PETS)
            return { ok: false, error: "farm_full" };
        const skills = normalizeFarmSkillRecords(farm.layout.skills);
        const level = farmingLevelForXp(skills.riding.xp);
        if (level < rule.minRidingLevel)
            return { ok: false, error: "level_too_low", minLevel: rule.minRidingLevel, level };
        const herd = await client.query(`select home_id from farm_livestock where player_id = $1 and state = 'alive' for update`, [playerId]);
        const stall = freeFarmHorseStalls(farm.layout, (herd.rows ?? []).map((row) => row.home_id ?? null))[0];
        if (!stall)
            return { ok: false, error: "no_stall" };
        const spend = await spendTicketsInTransaction(client, {
            playerId, transactionKey, amount: rule.price, reason: "farm_horse_purchase",
            metadata: { day, slot, grade: profile.growth.grade },
        });
        if (!spend.ok)
            return { ok: false, error: spend.error, balance: spend.balance, price: rule.price };
        const pet = { instanceId: nextPetId(farm.layout, FARM_HORSE_SPECIES_ID), speciesId: FARM_HORSE_SPECIES_ID, name: cleanName(input?.name, "Horse"), profile, stall };
        const agriculture = farm.layout.agriculture ?? { inventory: { seeds: {}, produce: {}, supplies: {} }, crops: [] };
        const supplies = { ...(agriculture.inventory?.supplies ?? {}) };
        supplies["food.oats"] = Math.min(MAX_STACK, (Number(supplies["food.oats"]) || 0) + STARTER_OATS);
        const next = normalizeFarmGarage({
            ...farm.layout,
            pets: [...farm.layout.pets, pet],
            agriculture: { ...agriculture, inventory: { ...agriculture.inventory, supplies } },
            skills: { ...skills, riding: { ...skills.riding, horses: skills.riding.horses + 1 } },
        }, { ownedEntitlementIds: farm.owned });
        await saveFarm(client, playerId, next);
        const saved = next.pets.find((row) => row.instanceId === pet.instanceId) ?? pet;
        return { ok: true, price: rule.price, balance: spend.balance, pet: saved, layout: next };
    });
}
