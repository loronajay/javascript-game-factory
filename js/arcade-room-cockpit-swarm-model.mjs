// Cockpit Swarm is an environmental sit-down machine. Its seats, canopy and
// paired flight stations live here rather than stretching the shared upright.
import { COCKPIT_SWARM_CABINET_ART } from "./arcade-room-scene.mjs";
export const COCKPIT_SWARM_LAYOUT = Object.freeze({
    width: 2.42,
    depth: 2.75,
    height: 2.48,
    screenWidth: 1.88,
    screenHeight: 1.0575,
});
function material(THREE, color, roughness = 0.52, metalness = 0.1) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function emissive(THREE, color, intensity = 2.6) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: intensity,
        roughness: 0.24,
        metalness: 0.18,
    });
}
function box(THREE, parent, name, size, position, surface) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), surface);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
function cylinder(THREE, parent, name, radius, height, position, surface) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14), surface);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
}
function imageMaterial(THREE, path, cropToWide = false) {
    const loader = new THREE.TextureLoader();
    if (typeof loader.load !== "function")
        return new THREE.MeshBasicMaterial({ color: "#090b24", side: THREE.DoubleSide });
    const texture = loader.load(path);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    if (cropToWide) {
        texture.repeat.set(1, 9 / 16);
        texture.offset.set(0, (1 - 9 / 16) / 2);
    }
    return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
}
function marqueeMaterial(THREE, fallback) {
    if (typeof document === "undefined" || typeof THREE.CanvasTexture !== "function")
        return fallback;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context)
        return fallback;
    const gradient = context.createLinearGradient(0, 0, 1024, 0);
    gradient.addColorStop(0, "#10105b");
    gradient.addColorStop(0.5, "#07081f");
    gradient.addColorStop(1, "#4a103d");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 256);
    context.strokeStyle = "#34f7ff";
    context.lineWidth = 18;
    context.strokeRect(9, 9, 1006, 238);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 112px Impact, Arial Black, sans-serif";
    context.lineWidth = 16;
    context.strokeStyle = "#130822";
    context.strokeText("COCKPIT SWARM", 512, 132);
    context.fillStyle = "#f8fbff";
    context.shadowColor = "#9c35ff";
    context.shadowBlur = 24;
    context.fillText("COCKPIT SWARM", 512, 132);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: texture });
}
function addSeat(THREE, root, side, x, shell, cushion, metal, warning) {
    const seat = new THREE.Group();
    seat.name = `seat-${side}`;
    seat.position.set(x, 0, 0.58);
    root.add(seat);
    box(THREE, seat, `seat-base-${side}`, [0.7, 0.32, 0.82], [0, 0.28, 0], shell);
    const pan = box(THREE, seat, `seat-cushion-${side}`, [0.58, 0.16, 0.62], [0, 0.51, 0.02], cushion);
    pan.rotation.x = -0.08;
    const back = box(THREE, seat, `seat-back-${side}`, [0.58, 0.86, 0.16], [0, 0.91, -0.29], cushion);
    back.rotation.x = -0.17;
    box(THREE, seat, `headrest-${side}`, [0.42, 0.25, 0.17], [0, 1.37, -0.39], shell);
    for (const harnessSide of [-1, 1]) {
        const harness = box(THREE, seat, `seat-harness-${side}-${harnessSide < 0 ? "left" : "right"}`, [0.075, 0.64, 0.035], [harnessSide * 0.17, 1.02, -0.185], warning);
        harness.rotation.z = harnessSide * 0.13;
    }
    box(THREE, seat, `harness-buckle-${side}`, [0.16, 0.12, 0.055], [0, 0.72, -0.13], metal);
    for (const railX of [-0.23, 0.23]) {
        box(THREE, seat, `seat-rail-${side}-${railX}`, [0.07, 0.08, 0.9], [railX, 0.09, 0.08], metal);
    }
}
function addControlStation(THREE, root, side, x, shell, metal, cyan, orange) {
    const station = new THREE.Group();
    station.name = `control-${side}`;
    station.position.set(x, 0, 0.02);
    root.add(station);
    const console = box(THREE, station, `console-${side}`, [0.72, 0.24, 0.62], [0, 0.78, -0.16], shell);
    console.rotation.x = -0.22;
    box(THREE, station, `console-display-${side}`, [0.3, 0.018, 0.18], [0, 0.925, -0.28], side === "left" ? cyan : orange).rotation.x = -0.22;
    const stick = cylinder(THREE, station, `flight-stick-${side}`, 0.035, 0.26, [0, 1.02, -0.04], metal);
    stick.rotation.z = 0.08;
    const grip = cylinder(THREE, station, `flight-grip-${side}`, 0.075, 0.16, [0.02, 1.16, -0.05], shell);
    grip.rotation.z = Math.PI / 2 + 0.08;
    for (let index = 0; index < 6; index += 1) {
        const button = cylinder(THREE, station, `control-button-${side}-${index + 1}`, 0.025, 0.02, [-0.23 + index * 0.09, 0.94, -0.08], index % 2 ? cyan : orange);
        button.rotation.x = Math.PI / 2;
    }
}
export function createCockpitSwarmCabinet(THREE, definition) {
    const root = new THREE.Group();
    root.name = definition.id;
    root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };
    const shell = material(THREE, definition.palette.shell, 0.3, 0.36);
    const dark = material(THREE, "#03040d", 0.42, 0.24);
    const metal = material(THREE, "#4b5270", 0.23, 0.8);
    const cushion = material(THREE, "#171a36", 0.78, 0.02);
    const cyan = emissive(THREE, definition.palette.trim, 3.1);
    const violet = emissive(THREE, definition.palette.grass, 2.8);
    const orange = emissive(THREE, definition.palette.warning, 2.9);
    // A deep platform and enclosing portal sell the sit-down scale from across the room.
    box(THREE, root, "rear-platform", [2.42, 0.16, 2.75], [0, 0.08, 0], dark);
    box(THREE, root, "shell", [2.42, 0.28, 2.7], [0, 0.23, -0.02], shell);
    box(THREE, root, "screen-wall", [2.32, 2.13, 0.16], [0, 1.28, -1.34], shell);
    box(THREE, root, "screen-bezel", [2.08, 1.26, 0.09], [0, 1.68, -1.29], dark);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(COCKPIT_SWARM_LAYOUT.screenWidth, COCKPIT_SWARM_LAYOUT.screenHeight), imageMaterial(THREE, COCKPIT_SWARM_CABINET_ART.keyArt, true));
    screen.name = "screen";
    screen.position.set(0, 1.68, -1.235);
    root.add(screen);
    const marquee = new THREE.Group();
    marquee.name = "marquee";
    root.add(marquee);
    box(THREE, marquee, "marquee-housing", [2.24, 0.37, 0.24], [0, 2.3, -1.26], shell);
    box(THREE, marquee, "marquee-face", [2.06, 0.25, 0.025], [0, 2.3, -1.125], marqueeMaterial(THREE, violet));
    const sideArtSurface = imageMaterial(THREE, COCKPIT_SWARM_CABINET_ART.sideArt);
    for (const side of [-1, 1]) {
        box(THREE, root, `side-pod-${side}`, [0.16, 2.06, 2.42], [side * 1.13, 1.18, -0.1], shell);
        const art = new THREE.Mesh(new THREE.PlaneGeometry(2.22, 1.82), sideArtSurface);
        art.name = side < 0 ? "side-art-left" : "side-art-right";
        art.rotation.y = side * Math.PI / 2;
        art.position.set(side * 1.216, 1.28, -0.12);
        root.add(art);
    }
    addSeat(THREE, root, "left", -0.5, shell, cushion, metal, cyan);
    addSeat(THREE, root, "right", 0.5, shell, cushion, metal, orange);
    addControlStation(THREE, root, "left", -0.5, shell, metal, cyan, orange);
    addControlStation(THREE, root, "right", 0.5, shell, metal, cyan, orange);
    // Ribbed canopy, center divider, and lit deck echo the shipped cockpit dashboard.
    for (const side of [-1, 1]) {
        for (let index = 0; index < 4; index += 1) {
            const rib = box(THREE, root, `canopy-rib-${side}-${index + 1}`, [0.075, 1.38, 0.075], [side * (0.75 + index * 0.12), 1.55, 0.25 - index * 0.28], metal);
            rib.rotation.x = -0.22;
        }
    }
    box(THREE, root, "cockpit-divider", [0.1, 1.16, 1.42], [0, 0.75, 0.1], shell);
    for (let index = 0; index < 10; index += 1) {
        const x = -0.94 + index * 0.209;
        box(THREE, root, `cockpit-light-${index + 1}`, [0.11, 0.025, 0.055], [x, 0.46, 1.18], index % 2 ? cyan : orange);
    }
    for (const side of [-1, 1]) {
        box(THREE, root, `entry-rail-${side}`, [0.08, 0.58, 1.2], [side * 1.04, 0.47, 0.82], metal);
        const glow = new THREE.PointLight(side < 0 ? definition.palette.trim : definition.palette.warning, 0.85, 2.8, 2);
        glow.position.set(side * 0.82, 1.15, -0.75);
        root.add(glow);
    }
    return root;
}
