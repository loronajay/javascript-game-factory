// The small vocabulary every carried item is built from: produce, fruit, logs,
// saplings, feed sacks and cooked dishes. These are HELD things — a tomato is
// eight centimetres, a stew bowl eighteen — so they are built at true size in
// metres, base on y = 0 and centred on x/z, which lets the same model sit on
// the Kitchen Range's chopping board, stand on the Market's counter, and fill
// a card portrait (the thumbnail renderer frames whatever it is handed).
//
// Organic shapes are low-poly and flat-shaded, the same hand as the crop GLBs
// in the field, so a harvested carrot and a growing one read as one world.
// Every mesh gets its own material: a thumbnail disposes the model it shot.
/** A lit surface in one colour. Flat shading by default: the farm's low-poly hand. */
export function surface(THREE, color, options = {}) {
    const material = new THREE.MeshStandardMaterial({
        color,
        roughness: options.roughness ?? 0.62,
        metalness: options.metalness ?? 0,
        flatShading: options.flat ?? true,
        side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (options.opacity !== undefined && options.opacity < 1) {
        material.transparent = true;
        material.opacity = options.opacity;
        material.depthWrite = false;
    }
    if (options.emissive) {
        material.emissive = new THREE.Color(options.emissive);
        material.emissiveIntensity = options.emissiveIntensity ?? 1;
    }
    return material;
}
/** Add a mesh at a position, optionally turned and scaled. */
export function place(THREE, group, geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}
/** A turned profile: [radius, height] pairs from the bottom up. */
export function lathe(THREE, profile, segments = 16) {
    return new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(Math.max(0, radius), height)), segments);
}
/** A seeded random stream, so a dish's bits land in the same places every time it is drawn. */
export function seededRandom(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    let state = hash >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** A leaf: a flattened, pointed ellipsoid lying in its local x/z plane, tip along +x. */
export function leaf(THREE, group, color, length, position, rotation = [0, 0, 0]) {
    const geometry = new THREE.SphereGeometry(0.5, 8, 4);
    const mesh = place(THREE, group, geometry, surface(THREE, color, { roughness: 0.7 }), position, rotation, [length, length * 0.08, length * 0.42]);
    return mesh;
}
/** A short stem: a thin cylinder from `base`, leaning by `lean` radians about z. */
export function stem(THREE, group, color, radius, length, base, lean = 0) {
    const geometry = new THREE.CylinderGeometry(radius * 0.8, radius, length, 6);
    geometry.translate(0, length / 2, 0);
    return place(THREE, group, geometry, surface(THREE, color, { roughness: 0.8 }), base, [0, 0, lean]);
}
/** A star of pointed sepals round a stalk: a tomato's or a strawberry's crown. */
export function calyx(THREE, group, color, radius, y, points = 5, droop = 0.35) {
    for (let index = 0; index < points; index += 1) {
        const angle = (index / points) * Math.PI * 2;
        const x = Math.cos(angle) * radius * 0.45;
        const z = Math.sin(angle) * radius * 0.45;
        leaf(THREE, group, color, radius, [x, y, z], [0, -angle, -droop]);
    }
}
/**
 * A canvas texture, or null where there is no canvas (under node the models
 * are still built — every mesh is there — only the painted detail is left off).
 */
export function paintedTexture(THREE, width, height, draw) {
    if (typeof document === "undefined")
        return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
        return null;
    draw(context, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
/** A surface that wears a painted texture when one can be drawn, and its base colour otherwise. */
export function paintedSurface(THREE, color, texture, options = {}) {
    const material = surface(THREE, texture ? "#ffffff" : color, { flat: false, ...options });
    if (texture)
        material.map = texture;
    return material;
}
/** A darker or lighter shade of a hex colour; `amount` in -1..1. */
export function tint(hex, amount) {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    const channel = (shift) => {
        const c = (value >> shift) & 255;
        const next = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
        return Math.round(Math.min(255, Math.max(0, next)));
    };
    return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}
