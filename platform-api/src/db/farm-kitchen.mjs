// The Kitchen Range, server side: the only way a dish enters a farm.
//
// Shaped like a harvest (db/farm-economy.mts): the client sends its farm as it
// stands, names a recipe, and reports how each cooking step went; inside one
// locked transaction the server holds the farm to everything it already knows
// (the save guard), then decides for itself — the recipe is known and taught
// at the STORED Cooking level, the STORED basket holds the ingredients, the
// pantry has room — takes the ingredients, puts one dish in the pantry with
// the stars its own rule gives those scores, and pays the recipe's Cooking XP.
// The canonical farm comes back either way.
//
// A cook id makes it retry-safe: the Cooking record remembers the latest ids,
// and a request whose id is among them cooks nothing and says so.
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { farmingLevelForXp, farmingSummary, normalizeFarmSkillRecords, recordFarmCook } from "../services/farm-skill-catalog.mjs";
import { COOK_ID, farmDishKey, farmDishStars, farmRecipeRule, normalizeCookScores } from "../services/farm-recipe-catalog.mjs";
import { awardServerAchievementsInTransaction } from "./achievements.mjs";
import { saveFarm, transaction, verifiedSubmittedFarm } from "./farm-economy.mjs";
const MAX_STACK = 99;
function required(value, field) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text)
        throw new TypeError(`${field} is required`);
    return text;
}
export async function cookFarmDish(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const cookId = required(input?.cookId, "cookId");
    if (!COOK_ID.test(cookId))
        throw new TypeError("invalid cookId");
    if (!input?.layout || typeof input.layout !== "object")
        throw new TypeError("layout is required");
    const recipeId = typeof input?.recipeId === "string" ? input.recipeId : "";
    const rule = farmRecipeRule(recipeId);
    if (!rule)
        return { ok: false, error: "unknown_recipe" };
    const scores = normalizeCookScores(input?.scores, rule.steps);
    if (!scores)
        return { ok: false, error: "invalid_cook" };
    return transaction(pool, async (client) => {
        const farm = await verifiedSubmittedFarm(client, playerId, input.layout, now);
        if (!farm)
            return { ok: false, error: "farm_not_initialized" };
        const { verified, owned } = farm;
        // Whatever happens to the cook, the verified farm is what is now true.
        const answer = async (result) => {
            await saveFarm(client, playerId, result.layout);
            return result;
        };
        const skills = normalizeFarmSkillRecords(verified.skills);
        const before = skills.cooking;
        if (before.recent.includes(cookId)) {
            return answer({ ok: true, duplicate: true, recipeId, stars: 0, xp: 0, cooking: farmingSummary(before, before.xp), achievements: [], layout: verified });
        }
        const level = farmingLevelForXp(before.xp);
        if (level < rule.minLevel)
            return answer({ ok: false, error: "level_too_low", minLevel: rule.minLevel, level, layout: verified });
        const inventory = verified.agriculture.inventory;
        const produce = { ...(inventory.produce ?? {}) };
        for (const [itemId, need] of Object.entries(rule.ingredients)) {
            const held = Number(produce[itemId]) || 0;
            if (held < need)
                return answer({ ok: false, error: "not_enough_produce", itemId, held, layout: verified });
            produce[itemId] = held - need;
        }
        const stars = farmDishStars(scores);
        const key = farmDishKey(recipeId, stars);
        const dishes = { ...(inventory.dishes ?? {}) };
        if ((Number(dishes[key]) || 0) >= MAX_STACK)
            return answer({ ok: false, error: "pantry_full", layout: verified });
        dishes[key] = (Number(dishes[key]) || 0) + 1;
        const cooking = recordFarmCook(before, recipeId, rule.xp, stars, cookId);
        const layout = normalizeFarmGarage({
            ...verified,
            agriculture: { ...verified.agriculture, inventory: { ...inventory, produce, dishes } },
            skills: { ...skills, cooking },
        }, { ownedEntitlementIds: owned });
        const achievements = await awardServerAchievementsInTransaction(client, {
            playerId, gameSlug: "farm", facts: { farming: skills.farming, woodcutting: skills.woodcutting, cooking }, sourceId: `cook:${cookId}`,
        });
        return answer({ ok: true, duplicate: false, recipeId, stars, xp: rule.xp, cooking: farmingSummary(cooking, before.xp), achievements, layout });
    });
}
