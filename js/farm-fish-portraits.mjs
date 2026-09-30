// Portraits for every card that can list a fish or a piece of tackle: a fish
// recipe's ingredients, a fish order's lines, a fish on a trading table, the
// creel and tackle box in the inventory. Wraps the farm's item thumbnails
// (produce, dishes, logs...), which are drawn at once, and adds
// `fish:<speciesId>[:<variant>]` and `tackle:<rod|lure|bait id>` keys, which
// are the Cove's GLBs and arrive a moment later: the card is handed a
// callback, called when the picture lands.
import { createFishThumbnails } from "./farm-fish-models.mjs";
import { WORM_ID, findFishingLure, findFishingRod } from "./farm-catalog/fish.mjs";
/** The pack's model file for a tackle id (a rod, a lure, the worm), or null for an id no tackle answers to. */
export function tackleFile(id) {
    if (id === WORM_ID)
        return "worm.glb";
    return findFishingRod(id)?.file ?? findFishingLure(id)?.file ?? null;
}
export function createFishPortraits(THREE, items) {
    const waiting = new Map();
    const fish = createFishThumbnails(THREE, () => {
        for (const [key, callbacks] of [...waiting]) {
            const url = lookup(key);
            if (!url)
                continue;
            waiting.delete(key);
            for (const callback of callbacks)
                callback(url);
        }
    });
    function lookup(key) {
        if (key.startsWith("tackle:")) {
            const file = tackleFile(key.slice("tackle:".length));
            return file ? fish.prop(file) : null;
        }
        const [, speciesId = "", variant = "normal"] = key.split(":");
        return fish.get(speciesId, (variant === "shiny" || variant === "golden" ? variant : "normal"));
    }
    return (itemKey, onReady) => {
        if (!itemKey.startsWith("fish:") && !itemKey.startsWith("tackle:"))
            return items(itemKey, onReady);
        const url = lookup(itemKey);
        if (!url)
            waiting.set(itemKey, [...(waiting.get(itemKey) ?? []), onReady]);
        return url;
    };
}
