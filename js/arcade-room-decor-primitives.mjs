// The mesh primitives every decor builder is made of: a box, a cylinder, a
// sphere, a canvas-drawn plane, and the two materials (a lit standard and a
// self-lit glow). Builders live in `arcade-room-decor-model.mts` and
// `arcade-room-decor-props.mts`; both draw with exactly these, so a prop is
// always the same handful of shapes and never an asset.
export function standard(THREE, color, roughness = 0.6, metalness = 0.1) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
export function glow(THREE, color, intensity = 2.4) {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
}
export function box(THREE, group, size, position, material, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    group.add(mesh);
    return mesh;
}
export function cylinder(THREE, group, radiusTop, radiusBottom, height, position, material, segments = 16) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
}
export function sphere(THREE, group, radius, position, material) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 14), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
}
export function canvasPlane(THREE, group, width, height, pixels, draw, position, transparent = true) {
    const canvas = document.createElement("canvas");
    canvas.width = pixels[0];
    canvas.height = pixels[1];
    const context = canvas.getContext("2d");
    if (!context)
        throw new Error("Canvas 2D is required to draw decor");
    draw(context, pixels[0], pixels[1]);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent, side: THREE.DoubleSide }));
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
}
export function withAlpha(hex, alpha) {
    const value = Number.parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
/** `hex` moved `amount` of the way to white: the white-hot core of a lit tube. */
export function lighten(hex, amount) {
    const value = Number.parseInt(hex.slice(1), 16);
    const channel = (shift) => Math.round(((value >> shift) & 255) + (255 - ((value >> shift) & 255)) * amount).toString(16).padStart(2, "0");
    return `#${channel(16)}${channel(8)}${channel(0)}`;
}
