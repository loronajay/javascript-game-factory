// Seed-card portraits use the real fully-grown crop GLBs. The shared lazy
// portrait renderer keeps the inventory panel free of THREE and only loads a
// model when its card asks for one.
import { createAvatarThumbnails } from "./arcade-room-avatar-thumbnails.mjs";
import { findCrop } from "./farm-crops.mjs";
import { cropAssetUrl } from "./farm-crops-view.mjs";
export function createCropThumbnails(THREE) {
    return createAvatarThumbnails(THREE, {
        resolve: (cropId) => {
            const crop = findCrop(cropId);
            return crop ? { assetUrl: cropAssetUrl(crop.models[3]), height: 1.35, lookAtY: 0.6, poseClip: () => null } : undefined;
        },
    });
}
