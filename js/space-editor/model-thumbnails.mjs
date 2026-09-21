// Catalog thumbnails: a picture of the real model for every card.
//
// A procedural catalog has no artwork to show on a card, and a letter in a
// coloured box tells the player nothing about which shape they are about to
// place. This renders a model once into a small offscreen WebGL canvas and
// hands back a data URL the panel drops into an `<img>`. Cached per key, built
// on demand so only the open category pays, and the panel stays free of
// THREE: it is handed a `(key) => url | null` and nothing else.
//
// Shared by every space: the room's decor and the farm's props each supply a
// `build` that returns a THREE group for a key (or null when the item is its
// own picture) and a `view` that says which way to photograph it.
export const THUMBNAIL_SIZE = Object.freeze({ width: 176, height: 128 });
export const DEFAULT_THUMBNAIL_VIEW = Object.freeze({ azimuth: 0.8, elevation: 0.38 });
export function disposeModelTree(model) {
    model.traverse?.((object) => {
        object.geometry?.dispose?.();
        const material = object.material;
        if (Array.isArray(material))
            material.forEach((entry) => entry?.dispose?.());
        else
            material?.dispose?.();
    });
}
export function createModelThumbnails(THREE, options) {
    const size = options.size ?? THUMBNAIL_SIZE;
    const view = options.view ?? (() => DEFAULT_THUMBNAIL_VIEW);
    const cacheKey = options.cacheKey ?? ((key) => String(key));
    const dispose = options.dispose ?? disposeModelTree;
    const bounds = options.bounds ?? ((model, target) => target.setFromObject(model));
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
        renderer.setSize(size.width, size.height, false);
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
        camera = new THREE.PerspectiveCamera(28, size.width / size.height, 0.01, 80);
        return true;
    }
    function render(key) {
        const model = options.build(key);
        if (!model)
            return null;
        if (!ensureRenderer())
            return null;
        scene.add(model);
        const box = bounds(model, new THREE.Box3());
        const centre = box.getCenter(new THREE.Vector3());
        const extent = box.getSize(new THREE.Vector3());
        const radius = Math.max(extent.x, extent.y, extent.z, 0.05) / 2;
        const distance = radius / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.15;
        const { azimuth, elevation } = view(key);
        camera.position.set(centre.x + distance * Math.cos(elevation) * Math.sin(azimuth), centre.y + distance * Math.sin(elevation), centre.z + distance * Math.cos(elevation) * Math.cos(azimuth));
        camera.lookAt(centre);
        renderer.render(scene, camera);
        const url = renderer.domElement.toDataURL("image/png");
        scene.remove(model);
        dispose(model);
        return url;
    }
    return Object.freeze({
        get: (key) => {
            const id = cacheKey(key);
            if (!cache.has(id)) {
                let url = null;
                try {
                    url = render(key);
                }
                catch {
                    url = null;
                }
                cache.set(id, url);
            }
            return cache.get(id) ?? null;
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
