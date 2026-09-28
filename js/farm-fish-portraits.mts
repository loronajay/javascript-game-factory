// Portraits for every card that can list a fish: a fish recipe's ingredients,
// a fish order's lines, a fish on a trading table. Wraps the farm's item
// thumbnails (produce, dishes, logs...), which are drawn at once, and adds
// `fish:<speciesId>[:<variant>]` keys, which are the Cove's GLBs and arrive a
// moment later: the card is handed a callback, called when the picture lands.

import { createFishThumbnails } from "./farm-fish-models.mjs";
import type { FishVariant } from "./farm-fish.mjs";

type ThreeNamespace = Record<string, any>;

export type Portrait = (itemKey: string, onReady: (url: string) => void) => string | null;

export function createFishPortraits(THREE: ThreeNamespace, items: Portrait): Portrait {
  const waiting = new Map<string, ((url: string) => void)[]>();
  const fish = createFishThumbnails(THREE, () => {
    for (const [key, callbacks] of [...waiting]) {
      const url = lookup(key);
      if (!url) continue;
      waiting.delete(key);
      for (const callback of callbacks) callback(url);
    }
  });

  function lookup(key: string): string | null {
    const [, speciesId = "", variant = "normal"] = key.split(":");
    return fish.get(speciesId, (variant === "shiny" || variant === "golden" ? variant : "normal") as FishVariant);
  }

  return (itemKey, onReady) => {
    if (!itemKey.startsWith("fish:")) return items(itemKey, onReady);
    const url = lookup(itemKey);
    if (!url) waiting.set(itemKey, [...(waiting.get(itemKey) ?? []), onReady]);
    return url;
  };
}
