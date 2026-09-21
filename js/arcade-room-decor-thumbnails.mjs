// Catalog thumbnails for the room's decor cards: the shared offscreen model
// renderer (`space-editor/model-thumbnails.mts`) pointed at `createDecorModel`.
//
// This file only says which row a card is rendered from (catalog defaults,
// first mount, size 1), which items are their own picture (a poster's texture
// loads asynchronously, so the card shows the image directly), how each kind
// is photographed, and that a glow wash is not part of the framing.
import { decorCardImage } from "./arcade-room-catalog/decor.mjs";
import { createDecorModel, decorModelBounds, disposeDecorModel } from "./arcade-room-decor-model.mjs";
import { createModelThumbnails, THUMBNAIL_SIZE } from "./space-editor/model-thumbnails.mjs";
export { THUMBNAIL_SIZE };
/** The layout row a thumbnail is rendered from: catalog defaults, first mount, size 1. */
export function thumbnailItem(definition) {
    const mount = definition.mounts[0];
    return {
        instanceId: "thumbnail",
        itemId: definition.id,
        x: 0,
        y: 0,
        z: 0,
        rotationY: 0,
        mount,
        wall: mount === "wall" ? "north" : "",
        color: definition.tint.enabled ? definition.tint.default : "",
        length: definition.length.enabled ? definition.length.default : 0,
        scale: 1,
        spin: 0,
        text: "",
        image: "",
        aspect: 1,
    };
}
/**
 * Wall items are looked at nearly head-on so a sign reads as a sign; everything
 * else gets the three-quarter view a shop would photograph a chair from.
 */
export function thumbnailView(definition) {
    const mount = definition.mounts[0];
    const flat = definition.model.kind === "rug";
    return {
        azimuth: mount === "wall" ? 0.25 : 0.8,
        elevation: flat ? 1.05 : mount === "wall" ? 0.12 : mount === "ceiling" ? -0.25 : 0.38,
    };
}
export function createDecorThumbnails(THREE) {
    return createModelThumbnails(THREE, {
        // A poster or calendar is its own picture; the card shows the image directly.
        build: (definition) => (decorCardImage(definition) ? null : createDecorModel(THREE, definition, thumbnailItem(definition), false)),
        view: thumbnailView,
        cacheKey: (definition) => definition.id,
        dispose: disposeDecorModel,
        bounds: (model, target) => decorModelBounds(THREE, model, target),
    });
}
