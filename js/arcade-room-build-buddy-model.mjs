import { BUILD_BUDDY_CABINET_ART, CABINET_CONTROL_SURFACE, CABINET_MARQUEE_GEOMETRY } from "./arcade-room-scene.mjs";
function material(THREE, color, roughness = 0.58, metalness = 0.14) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function imageMaterial(THREE, src) {
    const texture = new THREE.TextureLoader().load(src);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    return new THREE.MeshBasicMaterial({ map: texture });
}
function addBox(THREE, parent, name, size, position, surface) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), surface);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
function addCylinder(THREE, parent, name, radius, height, position, surface) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 18), surface);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
}
function addHardHatTopper(THREE, root, warning, dark) {
    const topper = new THREE.Group();
    topper.name = "hard-hat-topper";
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), warning);
    dome.name = "hard-hat-dome";
    dome.position.set(0, 2.135, 0.01);
    dome.scale.set(1.15, 0.88, 0.85);
    dome.castShadow = true;
    topper.add(dome);
    addCylinder(THREE, topper, "hard-hat-brim", 0.22, 0.035, [0, 2.115, 0.01], warning);
    addBox(THREE, topper, "hard-hat-band", [0.31, 0.035, 0.025], [0, 2.15, 0.16], dark);
    const glow = new THREE.PointLight("#22d8ff", 0.8, 1.6, 2);
    glow.name = "topper-work-light";
    glow.position.set(0, 2.14, 0.2);
    topper.add(glow);
    root.add(topper);
}
/** A classic upright whose asymmetric controls express Build Buddy's runner/builder roles. */
export function createBuildBuddyCabinet(THREE, definition) {
    const root = new THREE.Group();
    root.name = definition.id;
    root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };
    const shell = material(THREE, definition.palette.shell, 0.48, 0.24);
    const cyan = material(THREE, definition.palette.trim, 0.34, 0.18);
    const steel = material(THREE, "#43566b", 0.28, 0.68);
    const dark = material(THREE, "#030a14", 0.45, 0.35);
    const yellow = material(THREE, definition.palette.grass, 0.38, 0.12);
    const orange = material(THREE, definition.palette.warning, 0.34, 0.12);
    addBox(THREE, root, "shell", [0.92, 1.14, 0.79], [0, 0.57, 0], shell);
    addBox(THREE, root, "upper-shell", [0.92, 0.75, 0.61], [0, 1.49, -0.09], shell);
    const marqueeGeometry = CABINET_MARQUEE_GEOMETRY.buildBuddy;
    addBox(THREE, root, "marquee-housing", [0.97, 0.3, marqueeGeometry.depth], [0, 1.9, marqueeGeometry.centerZ], yellow);
    addBox(THREE, root, "base-trim", [0.97, 0.085, 0.84], [0, 0.043, 0], cyan);
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.235), imageMaterial(THREE, BUILD_BUDDY_CABINET_ART.crewArt));
    marquee.name = "marquee";
    marquee.position.set(0, 1.9, marqueeGeometry.artZ);
    root.add(marquee);
    addBox(THREE, root, "screen-bezel", [0.8, 0.51, 0.06], [0, 1.5, 0.25], dark);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.3825), imageMaterial(THREE, BUILD_BUDDY_CABINET_ART.keyArt));
    screen.name = "screen";
    screen.position.set(0, 1.5, 0.285);
    root.add(screen);
    const deckGeometry = CABINET_CONTROL_SURFACE.dualDeck;
    const deck = addBox(THREE, root, "control-deck", [deckGeometry.width, 0.11, deckGeometry.depth], [0, 1.105, deckGeometry.centerZ], steel);
    deck.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
    addBox(THREE, root, "deck-face", [0.86, 0.18, 0.055], [0, 1.005, deckGeometry.faceZ], shell);
    addBox(THREE, root, "runner-control-zone", [0.39, 0.012, 0.31], [-0.215, 1.164, 0.34], yellow);
    addBox(THREE, root, "builder-control-zone", [0.39, 0.012, 0.31], [0.215, 1.164, 0.34], cyan);
    const stick = addCylinder(THREE, root, "runner-joystick", 0.023, 0.09, [-0.28, 1.205, 0.31], steel);
    stick.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
    const stickBall = new THREE.Mesh(new THREE.SphereGeometry(0.047, 18, 12), orange);
    stickBall.name = "runner-joystick-ball";
    stickBall.position.set(-0.28, 1.255, 0.31);
    root.add(stickBall);
    for (const [index, x] of [-0.19, -0.11].entries()) {
        const button = addCylinder(THREE, root, `runner-action-button-${index + 1}`, 0.032, 0.024, [x, 1.185, 0.42], orange);
        button.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
    }
    const trackball = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 14), cyan);
    trackball.name = "builder-trackball";
    trackball.position.set(0.22, 1.205, 0.32);
    trackball.castShadow = true;
    root.add(trackball);
    for (const [index, x] of [0.14, 0.3].entries()) {
        const button = addCylinder(THREE, root, `builder-tool-button-${index + 1}`, 0.032, 0.024, [x, 1.185, 0.43], index === 0 ? yellow : orange);
        button.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
    }
    addBox(THREE, root, "coin-door", [0.42, 0.5, 0.038], [0, 0.52, 0.417], steel);
    addBox(THREE, root, "coin-slot-left", [0.075, 0.14, 0.025], [-0.11, 0.64, 0.447], dark);
    addBox(THREE, root, "coin-slot-right", [0.075, 0.14, 0.025], [0.11, 0.64, 0.447], dark);
    addBox(THREE, root, "coin-return", [0.19, 0.075, 0.025], [0, 0.39, 0.447], dark);
    const sideSurface = imageMaterial(THREE, BUILD_BUDDY_CABINET_ART.sideArt);
    for (const side of [-1, 1]) {
        const sideArt = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.62), sideSurface);
        sideArt.name = side < 0 ? "side-art-left" : "side-art-right";
        sideArt.rotation.y = side * Math.PI / 2;
        sideArt.position.set(side * 0.463, 1.05, -0.025);
        root.add(sideArt);
        for (let index = 0; index < 4; index += 1) {
            const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), steel);
            rivet.name = `side-rivet-${side < 0 ? "left" : "right"}-${index + 1}`;
            rivet.position.set(side * 0.473, 0.35 + index * 0.38, index % 2 === 0 ? 0.22 : -0.25);
            root.add(rivet);
        }
    }
    addHardHatTopper(THREE, root, yellow, dark);
    return root;
}
