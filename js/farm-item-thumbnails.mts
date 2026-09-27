// Card portraits for every farm item: the shared offscreen model renderer
// pointed at `createFarmItemModel`, so a list of produce, logs, saplings,
// feed or dishes is a shelf of the real things. Panels stay THREE-free: they
// are handed `(key, onReady) => url | null` and drop the URL into an <img>.
//
// Dishes are shot from higher up, so the eye looks into the bowl.

import { createFarmItemModel, parseItemKey } from "./farm-item-models.mjs";
import { createModelThumbnails, type ThumbnailView } from "./space-editor/model-thumbnails.mjs";

type ThreeNamespace = Record<string, any>;

export type ItemThumbnail = (key: string, onReady: (url: string) => void) => string | null;

export type FarmItemThumbnails = Readonly<{ get: ItemThumbnail; dispose: () => void }>;

export function itemThumbnailView(key: string): ThumbnailView {
  const kind = parseItemKey(key)?.kind;
  if (kind === "dish") return { azimuth: 0.6, elevation: 0.62 };
  if (kind === "log") return { azimuth: 0.5, elevation: 0.42 };
  return { azimuth: 0.7, elevation: 0.38 };
}

export function createFarmItemThumbnails(THREE: ThreeNamespace): FarmItemThumbnails {
  const renderer = createModelThumbnails<string>(THREE, {
    build: (key) => createFarmItemModel(THREE, key),
    view: itemThumbnailView,
    size: { width: 160, height: 136 },
  });
  return Object.freeze({
    get: (key: string) => renderer.get(key),
    dispose: renderer.dispose,
  });
}
