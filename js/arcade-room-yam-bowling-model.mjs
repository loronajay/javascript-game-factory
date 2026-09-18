// Yam Bowling is a room-scale attraction, not an upright cabinet. Keeping its
// construction here prevents the shared upright model module from becoming a
// catalogue of unrelated physical forms.
function material(THREE, color, roughness = 0.6, metalness = 0.08) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
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
function addBall(THREE, parent, x, z, color) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 12), material(THREE, color, 0.22, 0.18));
    ball.position.set(x, 0.52, z);
    ball.castShadow = true;
    parent.add(ball);
}
export function createYamBowlingLane(THREE, definition) {
    const root = new THREE.Group();
    root.name = definition.id;
    root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };
    const attraction = new THREE.Group();
    attraction.scale.set(1.55, 1.15, 1.58);
    root.add(attraction);
    const shell = material(THREE, definition.palette.shell, 0.48, 0.2);
    const trim = material(THREE, definition.palette.trim, 0.34, 0.22);
    const wood = material(THREE, definition.palette.grass, 0.42, 0.04);
    const darkWood = material(THREE, "#8d542c", 0.52, 0.03);
    const metal = material(THREE, "#33404f", 0.28, 0.72);
    const pinDeck = material(THREE, "#e8d8b5", 0.4, 0.03);
    box(THREE, attraction, "lane", [1.12, 0.1, 3.45], [0, 0.09, -0.12], wood);
    box(THREE, attraction, "pin-deck", [1.12, 0.08, 0.58], [0, 0.15, -1.56], pinDeck);
    box(THREE, attraction, "gutter-left", [0.17, 0.12, 3.52], [-0.65, 0.08, -0.12], metal);
    box(THREE, attraction, "gutter-right", [0.17, 0.12, 3.52], [0.65, 0.08, -0.12], metal);
    box(THREE, attraction, "backstop", [1.5, 0.88, 0.18], [0, 0.54, -1.81], shell);
    box(THREE, attraction, "backstop-glow", [1.28, 0.08, 0.035], [0, 0.86, -1.705], trim);
    const pinRows = [
        [[0, -1.37]],
        [[-0.09, -1.45], [0.09, -1.45]],
        [[-0.18, -1.53], [0, -1.53], [0.18, -1.53]],
        [[-0.27, -1.61], [-0.09, -1.61], [0.09, -1.61], [0.27, -1.61]],
    ];
    let pinNumber = 1;
    for (const row of pinRows) {
        for (const [x, z] of row)
            addPin(THREE, attraction, `pin-${pinNumber++}`, x, z);
    }
    const ballReturn = new THREE.Group();
    ballReturn.name = "ball-return";
    attraction.add(ballReturn);
    box(THREE, ballReturn, "return-base", [0.48, 0.5, 0.9], [0, 0.25, 1.22], shell);
    box(THREE, ballReturn, "return-rail-left", [0.08, 0.08, 0.72], [-0.2, 0.48, 1.16], metal);
    box(THREE, ballReturn, "return-rail-right", [0.08, 0.08, 0.72], [0.2, 0.48, 1.16], metal);
    addBall(THREE, ballReturn, -0.11, 1.12, definition.palette.trim);
    addBall(THREE, ballReturn, 0.12, 1.3, definition.palette.sky);
    // No overhead scoring screen: like the pool table, the lane is a screenless attraction
    // and stepping up to it boots straight into the fullscreen game. The marquee hangs on
    // its own posts over the foul line so the lane still reads as a lit attraction.
    for (const x of [-0.5, 0.5]) {
        box(THREE, attraction, "marquee-post", [0.08, 2.1, 0.08], [x, 1.05, 1.25], metal);
    }
    box(THREE, attraction, "marquee", [1.14, 0.1, 0.16], [0, 2.22, 1.25], trim);
    for (const x of [-0.45, 0.45]) {
        box(THREE, attraction, "foul-light", [0.3, 0.025, 0.035], [x, 0.18, 0.85], trim);
    }
    box(THREE, attraction, "approach", [1.46, 0.045, 0.62], [0, 0.035, 1.57], darkWood);
    return root;
}
