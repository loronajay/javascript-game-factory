// Yam Bowling is a room-scale attraction, not an upright cabinet. Keeping its
// construction here prevents the shared upright model module from becoming a
// catalogue of unrelated physical forms.
function material(THREE, color, roughness = 0.6, metalness = 0.08) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function glow(THREE, color, intensity = 1.2) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: intensity,
        roughness: 0.5,
        metalness: 0,
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
function addPin(THREE, parent, name, x, z) {
    const pin = new THREE.Group();
    pin.name = name;
    const white = material(THREE, "#fff7df", 0.34);
    const red = material(THREE, "#e03622", 0.38);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 10), white);
    body.position.y = 0.24;
    body.castShadow = true;
    pin.add(body);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.009, 6, 16), red);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.3;
    pin.add(stripe);
    pin.position.set(x, 0.12, z);
    parent.add(pin);
}
function addBall(THREE, parent, x, y, z, color) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 12), material(THREE, color, 0.22, 0.18));
    ball.position.set(x, y, z);
    ball.castShadow = true;
    parent.add(ball);
}
// Lane geometry, in attraction units (before the room scale is applied). The lane runs
// down -z: pins at the far end under the masking hood, the foul line at FOUL_Z, and the
// wider approach in front of it where the player stands.
const FOUL_Z = 0.78;
const LANE_FAR_Z = -1.78;
const APPROACH_NEAR_Z = 1.86;
export function createYamBowlingLane(THREE, definition) {
    const root = new THREE.Group();
    root.name = definition.id;
    root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };
    const attraction = new THREE.Group();
    attraction.scale.set(1.55, 1.15, 1.58);
    root.add(attraction);
    const shell = material(THREE, definition.palette.shell, 0.48, 0.2);
    const trim = glow(THREE, definition.palette.trim, 0.9);
    const wood = material(THREE, definition.palette.grass, 0.42, 0.04);
    const darkWood = material(THREE, "#8d542c", 0.52, 0.03);
    const metal = material(THREE, "#33404f", 0.28, 0.72);
    const gutterMetal = material(THREE, "#1c232c", 0.32, 0.7);
    const pinDeck = material(THREE, "#e8d8b5", 0.4, 0.03);
    const laneLight = material(THREE, "#f1c98a", 0.4, 0.04);
    const curtain = material(THREE, definition.palette.sky, 0.7, 0);
    const deckGlow = glow(THREE, definition.palette.warning, 0.7);
    // Bed: lane boards from the foul line to the pin deck, sitting in a shallow plinth so the
    // whole attraction reads as one built piece rather than planks floating on the floor.
    const laneLength = FOUL_Z - LANE_FAR_Z;
    const laneCenterZ = (FOUL_Z + LANE_FAR_Z) / 2;
    const backZ = LANE_FAR_Z - 0.22;
    box(THREE, attraction, "plinth", [1.6, 0.06, APPROACH_NEAR_Z - backZ], [0, 0.03, (APPROACH_NEAR_Z + backZ) / 2], shell);
    box(THREE, attraction, "lane", [1.12, 0.07, laneLength], [0, 0.095, laneCenterZ], wood);
    box(THREE, attraction, "pin-deck", [1.12, 0.075, 0.6], [0, 0.0975, -1.5], pinDeck);
    for (const side of [-1, 1]) {
        const gutterName = side < 0 ? "gutter-left" : "gutter-right";
        box(THREE, attraction, gutterName, [0.18, 0.09, laneLength + 0.02], [side * 0.65, 0.085, laneCenterZ], gutterMetal);
        // Capping rails keep the balls off the floor and give the lane a finished edge.
        box(THREE, attraction, "cap-rail", [0.06, 0.13, laneLength + 0.02], [side * 0.77, 0.125, laneCenterZ], shell);
    }
    // Lane markings: the seven target arrows and the foul line, laid flat on the boards.
    for (let index = 0; index < 7; index += 1) {
        const x = (index - 3) * 0.13;
        const z = 0.12 - Math.abs(index - 3) * 0.06;
        box(THREE, attraction, "lane-arrow", [0.05, 0.006, 0.09], [x, 0.133, z], laneLight);
    }
    box(THREE, attraction, "foul-line", [1.12, 0.006, 0.025], [0, 0.133, FOUL_Z], shell);
    // Approach: a wider darker deck in front of the foul line where the player stands.
    box(THREE, attraction, "approach", [1.46, 0.07, APPROACH_NEAR_Z - FOUL_Z], [0, 0.095, (APPROACH_NEAR_Z + FOUL_Z) / 2], darkWood);
    for (const x of [-0.45, 0.45]) {
        box(THREE, attraction, "foul-light", [0.26, 0.02, 0.03], [x, 0.14, FOUL_Z + 0.05], trim);
    }
    const pinRows = [
        [[0, -1.32]],
        [[-0.09, -1.4], [0.09, -1.4]],
        [[-0.18, -1.48], [0, -1.48], [0.18, -1.48]],
        [[-0.27, -1.56], [-0.09, -1.56], [0.09, -1.56], [0.27, -1.56]],
    ];
    let pinNumber = 1;
    for (const row of pinRows) {
        for (const [x, z] of row)
            addPin(THREE, attraction, `pin-${pinNumber++}`, x, z);
    }
    // Masking hood over the pin deck: the pins sit in a lit alcove under a hood whose front
    // carries the lane's neon marquee, the way a real house masks the pinsetter. This is the
    // whole lit signage — nothing hangs over the approach, so the view down the lane is open.
    const hood = new THREE.Group();
    hood.name = "pinsetter-hood";
    attraction.add(hood);
    box(THREE, hood, "backstop", [1.6, 0.92, 0.2], [0, 0.49, LANE_FAR_Z - 0.12], shell);
    box(THREE, hood, "backstop-curtain", [1.12, 0.62, 0.02], [0, 0.4, LANE_FAR_Z - 0.01], curtain);
    for (const side of [-1, 1]) {
        box(THREE, hood, side < 0 ? "hood-side-left" : "hood-side-right", [0.06, 0.92, 0.5], [side * 0.77, 0.49, LANE_FAR_Z + 0.15], shell);
    }
    box(THREE, hood, "hood-top", [1.6, 0.34, 0.82], [0, 0.78, LANE_FAR_Z + 0.31], shell);
    box(THREE, hood, "marquee-frame", [1.46, 0.28, 0.015], [0, 0.78, LANE_FAR_Z + 0.72], metal);
    const marquee = box(THREE, hood, "marquee", [1.38, 0.2, 0.02], [0, 0.78, LANE_FAR_Z + 0.73], trim);
    marquee.castShadow = false;
    // A warm strip under the hood lights the pins from above.
    const deckLight = box(THREE, hood, "deck-light", [1.0, 0.02, 0.06], [0, 0.6, LANE_FAR_Z + 0.42], deckGlow);
    deckLight.castShadow = false;
    // Ball return: a low rack tucked against the left cap rail at the approach, well below
    // eye level and off the boards, so it never blocks the view down the lane.
    const ballReturn = new THREE.Group();
    ballReturn.name = "ball-return";
    attraction.add(ballReturn);
    const rackX = -0.56;
    const rackZ = FOUL_Z + 0.5;
    box(THREE, ballReturn, "return-base", [0.3, 0.16, 0.82], [rackX, 0.21, rackZ], shell);
    box(THREE, ballReturn, "return-hood", [0.3, 0.14, 0.22], [rackX, 0.36, rackZ - 0.3], shell);
    box(THREE, ballReturn, "return-hood-glow", [0.26, 0.02, 0.02], [rackX, 0.43, rackZ - 0.19], trim);
    for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.58, 8), metal);
        rail.name = side < 0 ? "return-rail-left" : "return-rail-right";
        rail.rotation.x = Math.PI / 2;
        rail.position.set(rackX + side * 0.075, 0.3, rackZ + 0.1);
        rail.castShadow = true;
        ballReturn.add(rail);
    }
    addBall(THREE, ballReturn, rackX, 0.385, rackZ - 0.05, definition.palette.trim);
    addBall(THREE, ballReturn, rackX, 0.385, rackZ + 0.16, definition.palette.sky);
    addBall(THREE, ballReturn, rackX, 0.385, rackZ + 0.37, "#2d8ad9");
    return root;
}
