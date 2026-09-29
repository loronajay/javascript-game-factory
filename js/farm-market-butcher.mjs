// The Market Square's Butcher stall, on the page: Otto takes a grown animal
// from the player's herd and cuts it into meat for the harvest basket
// (planning-docs/FARM_LIVESTOCK_PLAN.md Phase 4). Kept out of the market's
// composition root (farm-market.mts) so the square only asks it to open, and
// whether its panel is up.
//
// Nothing is decided here. The panel names an animal and the server settles
// the herd at the farm's STORED clock (the farm saved itself before the gate
// let the player out), cuts it, fills the basket and pays the Husbandry XP
// (`POST /games/farm/livestock/butcher`); the page adopts the farm and the herd
// it answers with, and says what came of it.
import { createButcherPanel } from "./farm-livestock-butcher-panel.mjs";
import { normalizeLivestockHerd } from "./farm-livestock.mjs";
import { gradedTitle } from "./farm-quality.mjs";
import { findLivestockMeat } from "./farm-catalog/livestock.mjs";
import { SKILL_TITLES } from "./farm-orders.mjs";
const MESSAGES = Object.freeze({
    not_grown: "Otto shakes his head: that one is still growing. Nothing was sent.",
    basket_full: "Your harvest basket has no room for every cut of that grade (99 a stack). Sell or cook some first — nothing was sent.",
    died: "That animal died of neglect before it reached the Butcher. Its memorial is on your farm.",
    not_found: "That animal is no longer in your herd.",
    farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
});
function required(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Market Square is missing ${selector}`);
    return element;
}
export function createMarketButcher(deps) {
    async function butcher(animalId) {
        const result = await deps.api.butcherFarmLivestock({ animalId }).catch(() => null);
        deps.takeStock(result?.layout);
        if (Array.isArray(result?.herd))
            deps.takeHerd(normalizeLivestockHerd(result.herd));
        if (!result?.ok)
            return { ok: false, message: MESSAGES[result?.error] ?? "Otto could not take it just now. Nothing was sent — try again in a moment." };
        if (Array.isArray(result.achievements) && result.achievements.length)
            deps.onAchievements(result.achievements);
        const meat = findLivestockMeat(result.itemId);
        const cut = gradedTitle(meat?.title ?? "meat", (result.quality ?? "normal"));
        deps.keeperSays(result.quality === "perfect" ? "Now that is a beautiful animal. Prime cuts, every one." : "Clean cuts, wrapped and ready. It had a good life.");
        const summary = result.husbandry;
        const levelUp = Number(summary?.level) > Number(summary?.levelBefore) ? ` ${SKILL_TITLES.husbandry} level ${summary.level}!` : "";
        return {
            ok: true,
            message: `${result.name} went to the Butcher: ${Number(result.quantity)} × ${cut} in your harvest basket · +${Number(result.xp).toLocaleString()} ${SKILL_TITLES.husbandry} XP.${levelUp}`,
        };
    }
    return createButcherPanel({
        root: required("#butcherPanel"),
        closeButton: required("#closeButcher"),
        room: required("#butcherRoom"),
        list: required("#butcherList"),
        status: required("#butcherStatus"),
    }, {
        butcher,
        herd: deps.herd,
        clock: () => deps.farm().clock.farmMinutes,
        thumbnail: deps.thumbnail,
        onClose: deps.onClose,
    });
}
