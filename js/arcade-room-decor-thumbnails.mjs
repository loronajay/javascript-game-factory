// Catalog thumbnails: a picture of the real model for every decor card.
//
// The catalog is procedural, so there is no artwork to show on a card — and a
// letter in a coloured box tells the player nothing about which neon shape
// they are about to hang. This renders each definition once through the same
// `createDecorModel` the room uses, into a small offscreen WebGL canvas, and
// hands back a data URL the panel drops into an `<img>`. Cached per item id,
// built on demand so only the open category pays, and the panel stays free of
// THREE: it is handed a `(definition) => url | null` and nothing else.
import { decorCardImage } from "./arcade-room-catalog/decor.mjs";
import { createDecorModel, disposeDecorModel } from "./arcade-room-decor-model.mjs";
export const THUMBNAIL_SIZE = Object.freeze({ width: 176, height: 128 });
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
export function createDecorThumbnails(THREE) {
    const cache = new Map();
    let renderer = null;
    let scene = null;
    let camera = null;
    function ensureRenderer() {
        if (renderer)
            return true;
        try {
            renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
        }
        catch {
            return false;
        }
        renderer.setPixelRatio(1);
        renderer.setSize(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x2a2430, 2.2));
        const key = new THREE.DirectionalLight(0xfff2d1, 2.4);
        key.position.set(2, 4, 3);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x70e8ff, 1.2);
        rim.position.set(-3, 2, -2);
        scene.add(rim);
        camera = new THREE.PerspectiveCamera(28, THUMBNAIL_SIZE.width / THUMBNAIL_SIZE.height, 0.01, 50);
        return true;
    }
    function render(definition) {
        // A poster or calendar is its own picture and its texture loads asynchronously; the card shows the image directly.
        if (decorCardImage(definition))
            return null;
        if (!ensureRenderer())
            return null;
        const model = createDecorModel(THREE, definition, thumbnailItem(definition), false);
        scene.add(model);
        const bounds = new THREE.Box3().setFromObject(model);
        const centre = bounds.getCenter(new THREE.Vector3());
        const extent = bounds.getSize(new THREE.Vector3());
        const radius = Math.max(extent.x, extent.y, extent.z, 0.05) / 2;
        const distance = radius / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.15;
        // Wall items are looked at nearly head-on so a sign reads as a sign; everything
        // else gets the three-quarter view a shop would photograph a chair from.
        const mount = definition.mounts[0];
        const flat = definition.model.kind === "rug";
        const azimuth = mount === "wall" ? 0.25 : 0.8;
        const elevation = flat ? 1.05 : mount === "wall" ? 0.12 : mount === "ceiling" ? -0.25 : 0.38;
        camera.position.set(centre.x + distance * Math.cos(elevation) * Math.sin(azimuth), centre.y + distance * Math.sin(elevation), centre.z + distance * Math.cos(elevation) * Math.cos(azimuth));
        camera.lookAt(centre);
        renderer.render(scene, camera);
        const url = renderer.domElement.toDataURL("image/png");
        disposeDecorModel(model);
        return url;
    }
    return Object.freeze({
        get: (definition) => {
            if (!cache.has(definition.id)) {
                let url = null;
                try {
                    url = render(definition);
                }
                catch {
                    url = null;
                }
                cache.set(definition.id, url);
            }
            return cache.get(definition.id) ?? null;
        },
        dispose: () => {
            cache.clear();
            renderer?.dispose?.();
            renderer = null;
            scene = null;
            camera = null;
        },
    });
}
