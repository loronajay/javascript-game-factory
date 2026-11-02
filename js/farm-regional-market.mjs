import { MARKET_STALLS, marketSquareLayout } from "./farm-market-square.mjs";
import { normalizeFarmLayout } from "./farm-layout.mjs";
const keepers = [
    ["Saffron", "Warm days, bright peppers, fragrant lavender. What did your island farm grow?"],
    ["Lina", "Pepper and lavender thrive here. Their seeds are for Orchard Isle soil."],
    ["Clement", "Welcome to the island kitchen. Bring your harvest and stay for supper."],
    ["Rowan", "Island timber, island craft. Let's see what you've made."],
    ["", ""],
    ["Mira", "Every homestead needs company. Have you prepared a home for your animals?"],
    ["Silas", "Care makes all the difference. I pay fairly for a well-raised animal."],
];
export function regionalMarketStalls(island) {
    if (!island)
        return MARKET_STALLS;
    return MARKET_STALLS.map((stall, index) => ({ ...stall,
        colors: [index % 2 ? "#92749c" : "#8c9d55", "#fff0cf"],
        title: stall.id.includes("exchange") ? "Orchard Exchange" : stall.title,
        keeper: stall.keeper ? { ...stall.keeper, name: keepers[index]?.[0] || "Ada", greeting: keepers[index]?.[1] || "Welcome to Orchard Market." } : null, }));
}
export function regionalMarketLayout(island) {
    const layout = marketSquareLayout();
    if (!island)
        return layout;
    return normalizeFarmLayout({ ...layout, decor: layout.decor.map(row => ({ ...row,
            length: row.instanceId === "market-gate-downs" ? 2.4 : row.length,
            itemId: row.instanceId === "market-gate-downs" ? "decor.fence.stone-wall" : row.instanceId === "market-signpost-downs" ? "decor.plant.lavender" : row.itemId === "decor.plant.oak" || row.itemId === "decor.plant.birch" ? "decor.plant.apple" : row.itemId === "decor.plant.flower-bed" ? "decor.plant.lavender" : row.itemId,
        })) });
}
