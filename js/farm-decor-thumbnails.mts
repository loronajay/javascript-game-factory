// Catalog thumbnails for the farm's cards: the shared offscreen model renderer
// pointed at `createFarmDecorModel`, so every card shows the real prop.
//
// A fence is rendered at its default length; a pond from a little above so
// the water reads; everything else from the three-quarter view.

import type { FarmDecorDefinition } from "./farm-catalog/decor.mjs";
import type { FarmDecorRow } from "./farm-layout.mjs";
import { createFarmDecorModel } from "./farm-props.mjs";
import { createModelThumbnails, type ModelThumbnails, type ThumbnailView } from "./space-editor/model-thumbnails.mjs";

type ThreeNamespace = Record<string, any>;

export type FarmDecorThumbnails = ModelThumbnails<FarmDecorDefinition>;

/** The row a thumbnail is rendered from: the origin, unturned, default length. */
export function thumbnailRow(definition: FarmDecorDefinition): FarmDecorRow {
  return { instanceId: "thumbnail", itemId: definition.id, x: 0, z: 0, rotationY: 0, length: definition.length.enabled ? definition.length.default : 0 };
}

export function thumbnailView(definition: FarmDecorDefinition): ThumbnailView {
  if (definition.habitat === "water") return { azimuth: 0.6, elevation: 0.9 };
  if (definition.length.enabled) return { azimuth: 0.5, elevation: 0.3 };
  return { azimuth: 0.8, elevation: 0.38 };
}

export function createFarmDecorThumbnails(THREE: ThreeNamespace): FarmDecorThumbnails {
  return createModelThumbnails<FarmDecorDefinition>(THREE, {
    build: (definition) => createFarmDecorModel(THREE, definition, thumbnailRow(definition), 1).group,
    view: thumbnailView,
    cacheKey: (definition) => definition.id,
  });
}
