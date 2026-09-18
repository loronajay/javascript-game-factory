// Mini Hoops is a room-scale carnival machine. Its cage, return ramp, hoop and
// scoring hardware live here so the shared upright builder stays screen-focused.
export const MINI_HOOPS_LAYOUT = Object.freeze({
    width: 2.1,
    depth: 3.2,
    height: 2.55,
    rimHeight: 1.82,
});
function material(THREE, color, roughness = 0.52, metalness = 0.08) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function emissive(THREE, color, intensity = 2.8) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: intensity,
        roughness: 0.24,
        metalness: 0.12,
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
function cylinder(THREE, parent, name, radius, height, position, surface, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), surface);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
function addHorizontalBar(THREE, parent, name, length, position, surface, axis) {
    const bar = cylinder(THREE, parent, name, 0.018, length, position, surface, 10);
    if (axis === "x")
        bar.rotation.z = Math.PI / 2;
    else
        bar.rotation.x = Math.PI / 2;
    return bar;
}
function createSignTexture(THREE) {
    if (typeof document === "undefined" || typeof THREE.CanvasTexture !== "function")
        return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context)
        return null;
    const gradient = context.createLinearGradient(0, 0, 1024, 256);
    gradient.addColorStop(0, "#201244");
    gradient.addColorStop(0.5, "#71315f");
    gradient.addColorStop(1, "#15183c");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 256);
    context.strokeStyle = "#f3c24f";
    context.lineWidth = 24;
    context.strokeRect(12, 12, 1000, 232);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 126px Impact, Arial Black, sans-serif";
    context.lineWidth = 18;
    context.strokeStyle = "#17142d";
    context.strokeText("MINI HOOPS", 512, 130);
    context.fillStyle = "#fff4cf";
    context.shadowColor = "#f08a34";
    context.shadowBlur = 22;
    context.fillText("MINI HOOPS", 512, 130);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
function addBasketball(THREE, parent, index, x, y, z, orange, seam) {
    const group = new THREE.Group();
    group.name = `basketball-${index}`;
    group.position.set(x, y, z);
    group.rotation.y = index * 0.47;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.125, 22, 16), orange);
    ball.name = `basketball-${index}-body`;
    ball.castShadow = true;
    group.add(ball);
    for (let line = 0; line < 3; line += 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.126, 0.007, 6, 28), seam);
        ring.name = `basketball-${index}-seam-${line + 1}`;
        if (line === 0)
            ring.rotation.x = Math.PI / 2;
        if (line === 1)
            ring.rotation.y = Math.PI / 2;
        if (line === 2)
            ring.rotation.z = Math.PI / 2;
        group.add(ring);
    }
    parent.add(group);
}
function addSevenSegmentDigit(THREE, parent, prefix, x, y, z, lit) {
    const segments = [
        [0, 0.095, 0.13, 0.022], [0, 0, 0.13, 0.022], [0, -0.095, 0.13, 0.022],
        [-0.066, 0.048, 0.022, 0.09], [0.066, 0.048, 0.022, 0.09],
        [-0.066, -0.048, 0.022, 0.09], [0.066, -0.048, 0.022, 0.09],
    ];
    segments.forEach(([dx, dy, width, height], index) => {
        box(THREE, parent, `${prefix}-segment-${index + 1}`, [width, height, 0.012], [x + dx, y + dy, z], lit);
    });
}
function addCage(THREE, root, metal, dark) {
    for (const side of [-1, 1]) {
        const sideGroup = new THREE.Group();
        sideGroup.name = side < 0 ? "cage-left" : "cage-right";
        root.add(sideGroup);
        for (let index = 0; index < 6; index += 1) {
            const z = 1.35 - index * 0.52;
            cylinder(THREE, sideGroup, `cage-post-${side < 0 ? "left" : "right"}-${index + 1}`, 0.025, 2.28, [side * 0.95, 1.25, z], metal, 10);
        }
        for (let row = 0; row < 5; row += 1) {
            addHorizontalBar(THREE, sideGroup, `cage-side-rail-${side}-${row}`, 2.72, [side * 0.95, 0.72 + row * 0.4, 0], row % 2 ? metal : dark, "z");
        }
    }
    const roof = new THREE.Group();
    roof.name = "cage-roof";
    root.add(roof);
    for (let index = 0; index < 7; index += 1) {
        addHorizontalBar(THREE, roof, `roof-rib-${index + 1}`, 1.9, [0, 2.4, 1.35 - index * 0.46], metal, "x");
    }
    for (const x of [-0.72, -0.36, 0, 0.36, 0.72]) {
        addHorizontalBar(THREE, roof, `roof-runner-${x}`, 2.76, [x, 2.4, 0], dark, "z");
    }
}
function addHoopAssembly(THREE, root, shell, white, red, metal) {
    box(THREE, root, "backboard-frame", [1.34, 0.88, 0.08], [0, 1.91, -1.31], metal);
    box(THREE, root, "backboard", [1.22, 0.76, 0.045], [0, 1.91, -1.255], white);
    box(THREE, root, "backboard-target-top", [0.54, 0.035, 0.012], [0, 1.93, -1.226], red);
    box(THREE, root, "backboard-target-bottom", [0.54, 0.035, 0.012], [0, 1.66, -1.226], red);
    for (const side of [-1, 1])
        box(THREE, root, "backboard-target-side", [0.035, 0.305, 0.012], [side * 0.252, 1.795, -1.226], red);
    box(THREE, root, "rim-bracket", [0.18, 0.12, 0.28], [0, 1.78, -1.08], shell);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 10, 40), red);
    rim.name = "rim";
    rim.position.set(0, MINI_HOOPS_LAYOUT.rimHeight, -0.91);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    root.add(rim);
    const net = new THREE.Group();
    net.name = "basket-net";
    root.add(net);
    for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        const strand = cylinder(THREE, net, `net-strand-${index + 1}`, 0.007, 0.42, [Math.cos(angle) * 0.22, 1.62, -0.91 + Math.sin(angle) * 0.22], white, 6);
        strand.rotation.z = Math.cos(angle) * 0.16;
        strand.rotation.x = Math.sin(angle) * 0.16;
    }
    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.245 - ringIndex * 0.045, 0.007, 6, 30), white);
        ring.name = `net-ring-${ringIndex + 1}`;
        ring.position.set(0, 1.76 - ringIndex * 0.13, -0.91);
        ring.rotation.x = Math.PI / 2;
        net.add(ring);
    }
}
export function createMiniHoopsCarnivalCabinet(THREE, definition) {
    const root = new THREE.Group();
    root.name = definition.id;
    root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };
    const shell = material(THREE, definition.palette.shell, 0.32, 0.24);
    const dark = material(THREE, "#080b17", 0.42, 0.3);
    const steel = material(THREE, "#8997a8", 0.24, 0.78);
    const court = material(THREE, "#c96b2e", 0.7, 0.02);
    const courtLight = material(THREE, "#e8a34b", 0.6, 0.02);
    const white = material(THREE, "#f5f0df", 0.52, 0.02);
    const orange = material(THREE, definition.palette.trim, 0.72, 0.02);
    const seam = material(THREE, "#2b160c", 0.75, 0.01);
    const red = emissive(THREE, definition.palette.warning, 1.8);
    const cyan = emissive(THREE, definition.palette.sky, 3.2);
    const gold = emissive(THREE, definition.palette.grass, 2.6);
    // A deep molded base and sloped court create the recognizable midway return lane.
    box(THREE, root, "floor-plinth", [2.08, 0.12, 3.14], [0, 0.06, 0], dark);
    box(THREE, root, "base-shell", [1.98, 0.38, 2.96], [0, 0.25, -0.03], shell);
    const ramp = box(THREE, root, "court-ramp", [1.72, 0.09, 2.42], [0, 0.58, -0.16], court);
    ramp.rotation.x = -0.095;
    for (const x of [-0.57, 0, 0.57]) {
        const lane = box(THREE, root, "court-lane-marking", [0.025, 0.008, 2.1], [x, 0.705, -0.22], courtLight);
        lane.rotation.x = -0.095;
    }
    box(THREE, root, "front-apron", [2.02, 0.58, 0.34], [0, 0.41, 1.42], shell);
    box(THREE, root, "ball-trough", [1.54, 0.16, 0.38], [0, 0.7, 1.25], dark);
    box(THREE, root, "trough-lip", [1.7, 0.1, 0.12], [0, 0.77, 1.45], steel);
    for (const side of [-1, 1]) {
        box(THREE, root, `ramp-rail-${side}`, [0.12, 0.4, 2.72], [side * 0.93, 0.57, 0], shell);
        box(THREE, root, `edge-light-${side}`, [0.025, 0.035, 2.48], [side * 0.995, 0.76, -0.05], cyan);
    }
    box(THREE, root, "coin-door", [0.28, 0.3, 0.025], [-0.38, 0.37, 1.601], steel);
    box(THREE, root, "coin-slot", [0.05, 0.105, 0.018], [-0.38, 0.42, 1.62], dark);
    cylinder(THREE, root, "start-button", 0.055, 0.035, [0.39, 0.58, 1.59], red, 20).rotation.x = Math.PI / 2;
    box(THREE, root, "ticket-mouth", [0.24, 0.065, 0.025], [0.38, 0.31, 1.606], dark);
    addCage(THREE, root, steel, dark);
    addHoopAssembly(THREE, root, shell, white, red, steel);
    // Seven balls fill the trough without cloning one perfectly aligned row.
    const ballPositions = [
        [-0.57, 0.86, 1.24], [-0.37, 0.84, 1.29], [-0.18, 0.86, 1.23],
        [0.02, 0.84, 1.29], [0.22, 0.86, 1.23], [0.42, 0.84, 1.29], [0.61, 0.86, 1.24],
    ];
    ballPositions.forEach(([x, y, z], index) => addBasketball(THREE, root, index + 1, x, y, z, orange, seam));
    const scoreboard = new THREE.Group();
    scoreboard.name = "scoreboard";
    root.add(scoreboard);
    box(THREE, scoreboard, "scoreboard-housing", [0.78, 0.43, 0.12], [0, 2.02, -1.39], shell);
    box(THREE, scoreboard, "scoreboard-face", [0.68, 0.33, 0.02], [0, 2.02, -1.322], dark);
    addSevenSegmentDigit(THREE, scoreboard, "score-left", -0.13, 2.02, -1.307, red);
    addSevenSegmentDigit(THREE, scoreboard, "score-right", 0.13, 2.02, -1.307, red);
    const marquee = new THREE.Group();
    marquee.name = "marquee";
    root.add(marquee);
    box(THREE, marquee, "marquee-housing", [1.9, 0.43, 0.16], [0, 2.32, -1.34], shell);
    const signTexture = createSignTexture(THREE);
    const signSurface = signTexture
        ? new THREE.MeshBasicMaterial({ map: signTexture })
        : gold;
    box(THREE, marquee, "marquee-face", [1.72, 0.31, 0.025], [0, 2.32, -1.245], signSurface);
    for (const x of [-0.82, -0.55, -0.28, 0, 0.28, 0.55, 0.82]) {
        cylinder(THREE, marquee, `marquee-bulb-${x}`, 0.025, 0.018, [x, 2.52, -1.238], gold, 12).rotation.x = Math.PI / 2;
    }
    for (const [x, color] of [[-0.72, definition.palette.sky], [0.72, definition.palette.warning]]) {
        const light = new THREE.PointLight(color, 0.9, 2.4, 2);
        light.position.set(x, 2.12, -0.82);
        root.add(light);
    }
    return root;
}
