// The farm's player-facing skill record, shaped for the Stats screen. PURE —
// no DOM and no persistence. The server-owned FarmSkills record remains the
// authority; this module only gives its XP and lifetime counters readable names.
import { CROP_CATALOG } from "./farm-crops.mjs";
import { FRUIT_TREES, TIMBER_TREES } from "./farm-catalog/trees.mjs";
import { RECIPE_CATALOG } from "./farm-catalog/recipes.mjs";
import { PATTERN_CATALOG } from "./farm-catalog/carpentry.mjs";
import { FISH_CATALOG } from "./farm-catalog/fish.mjs";
import { barteringBenefits } from "./farm-bartering.mjs";
import { farmingProgress } from "./farm-skills.mjs";
function sumCounts(values) {
    return Object.values(values).reduce((total, value) => total + value, 0);
}
function breakdown(catalog, counts) {
    return catalog
        .map((entry) => ({ label: entry.title, value: counts[entry.id] ?? 0 }))
        .filter((line) => line.value > 0);
}
function skill(id, title, description, xp, stats, breakdownTitle, detail) {
    const progress = farmingProgress(xp);
    return Object.freeze({
        id, title, description,
        level: progress.level,
        xp: progress.xp,
        nextLevelXp: progress.nextLevelXp,
        xpRemaining: progress.maxed ? 0 : Math.max(0, progress.nextLevelXp - progress.xp),
        fraction: progress.fraction,
        maxed: progress.maxed,
        stats: Object.freeze([...stats]),
        breakdownTitle,
        breakdown: Object.freeze([...detail]),
    });
}
export function buildFarmStats(skills, extras = {}) {
    const rows = [
        skill("farming", "Farming", "Grow crops, pick orchard fruit and fill produce orders.", skills.farming.xp, [
            { label: "Crop harvests", value: skills.farming.harvests },
            { label: "Fruit picks", value: sumCounts(skills.farming.fruit) },
            { label: "Orders filled", value: skills.farming.orders },
        ], "What you've grown", [
            ...breakdown(CROP_CATALOG, skills.farming.crops),
            ...breakdown(FRUIT_TREES, skills.farming.fruit),
        ]),
        skill("woodcutting", "Woodcutting", "Fell mature timber trees with well-timed swings.", skills.woodcutting.xp, [{ label: "Trees felled", value: skills.woodcutting.fellings }], "Trees felled", breakdown(TIMBER_TREES, skills.woodcutting.trees)),
        skill("cooking", "Cooking", "Turn farm produce into dishes and fill kitchen orders.", skills.cooking.xp, [
            { label: "Dishes cooked", value: skills.cooking.dishes },
            { label: "Three-star dishes", value: skills.cooking.perfect },
            { label: "Orders filled", value: skills.cooking.orders },
        ], "Recipes cooked", breakdown(RECIPE_CATALOG, skills.cooking.recipes)),
        skill("carpentry", "Carpentry", "Mill logs and craft furniture at the workbench.", skills.carpentry.xp, [
            { label: "Logs milled", value: skills.carpentry.milled },
            { label: "Pieces made", value: skills.carpentry.pieces },
            { label: "Masterworks", value: skills.carpentry.masterwork },
        ], "Patterns made", breakdown(PATTERN_CATALOG, skills.carpentry.patterns)),
    ];
    if (extras.fishing) {
        rows.push(skill("fishing", "Fishing", "Land rarer fish with a wider strike window and a more forgiving fight.", extras.fishing.xp, [
            { label: "Fish landed", value: extras.fishing.catches },
            { label: "Species caught", value: Object.values(extras.fishing.dex).filter((entry) => entry.caught > 0).length },
        ], "Fish landed", breakdown(FISH_CATALOG, Object.fromEntries(Object.entries(extras.fishing.dex).map(([id, entry]) => [id, entry.caught])))));
    }
    const benefits = barteringBenefits(farmingProgress(skills.bartering.xp).level);
    rows.push(skill("bartering", "Bartering", `Negotiate NPC prices: ${Math.round(benefits.purchaseDiscount * 1000) / 10}% off purchases and ${Math.round(benefits.saleBonus * 1000) / 10}% extra on sales.`, skills.bartering.xp, [
        { label: "Deals made", value: skills.bartering.deals },
        { label: "Tickets spent", value: skills.bartering.bought },
        { label: "Tickets earned", value: skills.bartering.sold },
        { label: "Tickets saved", value: skills.bartering.saved },
        { label: "Bonus earned", value: skills.bartering.bonus },
    ], "Trade record", []));
    return Object.freeze({
        totalLevel: rows.reduce((total, row) => total + row.level, 0),
        totalXp: rows.reduce((total, row) => total + row.xp, 0),
        skills: Object.freeze(rows),
    });
}
