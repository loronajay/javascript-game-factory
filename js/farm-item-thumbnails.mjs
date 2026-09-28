// Card portraits for every farm item: the shared offscreen model renderer
// pointed at `createFarmItemModel`, so a list of produce, logs, saplings,
// feed or dishes is a shelf of the real things. Panels stay THREE-free: they
// are handed `(key, onReady) => url | null` and drop the URL into an <img>.
//
// Dishes are shot from higher up, so the eye looks into the bowl.
import { createFarmItemModel, parseItemKey } from "./farm-item-models.mjs";
import { createModelThumbnails } from "./space-editor/model-thumbnails.mjs";
export function itemThumbnailView(key) {
    const kind = parseItemKey(key)?.kind;
    if (kind === "dish")
        return { azimuth: 0.6, elevation: 0.62 };
    if (kind === "log" || kind === "plank")
        return { azimuth: 0.5, elevation: 0.42 };
    if (kind === "piece")
        return { azimuth: 0.55, elevation: 0.3 };
    return { azimuth: 0.7, elevation: 0.38 };
}
export function createFarmItemThumbnails(THREE) {
    const renderer = createModelThumbnails(THREE, {
        build: (key) => createFarmItemModel(THREE, key),
        view: itemThumbnailView,
        size: { width: 160, height: 136 },
    });
    return Object.freeze({
        get: (key) => renderer.get(key),
        dispose: renderer.dispose,
    });
}
