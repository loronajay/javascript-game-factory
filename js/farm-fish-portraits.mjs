// Portraits for every card that can list a fish: a fish recipe's ingredients,
// a fish order's lines, a fish on a trading table. Wraps the farm's item
// thumbnails (produce, dishes, logs...), which are drawn at once, and adds
// `fish:<speciesId>[:<variant>]` keys, which are the Cove's GLBs and arrive a
// moment later: the card is handed a callback, called when the picture lands.
import { createFishThumbnails } from "./farm-fish-models.mjs";
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
        const [, speciesId = "", variant = "normal"] = key.split(":");
        return fish.get(speciesId, (variant === "shiny" || variant === "golden" ? variant : "normal"));
    }
    return (itemKey, onReady) => {
        if (!itemKey.startsWith("fish:"))
            return items(itemKey, onReady);
        const url = lookup(itemKey);
        if (!url)
            waiting.set(itemKey, [...(waiting.get(itemKey) ?? []), onReady]);
        return url;
    };
}
