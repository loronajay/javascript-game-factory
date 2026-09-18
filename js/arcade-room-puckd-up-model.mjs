// Puck'd Up is a floor attraction, not a video cabinet. This module owns its
// physical table so the upright builder never grows exceptions for goals,
// playfield markings, scoring hardware, or the table's sculpted underbody.
export const PUCK_D_UP_PLAYFIELD = Object.freeze({ width: 1.08, length: 2.08, height: 0.805 });
function material(THREE, color, roughness = 0.45, metalness = 0.08) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function emissive(THREE, color, intensity = 3) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: intensity,
        roughness: 0.2,
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
function cylinder(THREE, parent, name, radii, height, position, surface, segments = 24) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radii[0], radii[1], height, segments), surface);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
function addMallet(THREE, parent, name, x, z, color) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, PUCK_D_UP_PLAYFIELD.height + 0.035, z);
    const paint = material(THREE, color, 0.24, 0.16);
    const grip = material(THREE, "#dcebf3", 0.3, 0.5);
    cylinder(THREE, group, `${name}-skirt`, [0.105, 0.118], 0.045, [0, 0.022, 0], paint, 32);
    cylinder(THREE, group, `${name}-shoulder`, [0.075, 0.09], 0.05, [0, 0.068, 0], paint, 32);
    cylinder(THREE, group, `${name}-grip`, [0.04, 0.054], 0.105, [0, 0.142, 0], grip, 24);
    cylinder(THREE, group, `${name}-cap`, [0.062, 0.045], 0.026, [0, 0.207, 0], paint, 24);
    parent.add(group);
}
function addScoreTower(THREE, parent, name, x, z, facing, shell, lit) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, 0, z);
    group.rotation.y = facing;
    box(THREE, group, `${name}-post`, [0.08, 0.34, 0.08], [0, 1.01, 0], shell);
    box(THREE, group, `${name}-head`, [0.46, 0.21, 0.09], [0, 1.14, 0], shell);
    box(THREE, group, `${name}-face`, [0.38, 0.145, 0.012], [0, 1.14, 0.051], material(THREE, "#02050a", 0.4, 0.15));
    // A bright zero reads as real table scoring hardware without turning the
    // attraction into a cabinet screen.
    for (const [index, x, y, width, height] of [
        [0, 0, 0.048, 0.105, 0.018], [1, 0, -0.048, 0.105, 0.018],
        [2, -0.052, 0, 0.018, 0.08], [3, 0.052, 0, 0.018, 0.08],
    ])
        box(THREE, group, `${name}-digit-${index}`, [width, height, 0.009], [x, 1.14 + y, 0.059], lit);
    parent.add(group);
}
function addChevron(THREE, parent, name, x, z, turn, surface) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.13, -0.045);
    shape.lineTo(0, 0.065);
    shape.lineTo(0.13, -0.045);
    shape.lineTo(0.09, -0.075);
    shape.lineTo(0, 0.005);
    shape.lineTo(-0.09, -0.075);
    shape.closePath();
    const mark = new THREE.Mesh(new THREE.ShapeGeometry(shape), surface);
    mark.name = name;
    mark.position.set(x, 0.816, z);
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = turn;
    parent.add(mark);
}
export function createPuckdUpAirHockeyTable(THREE, definition) {
    const root = new THREE.Group();
    root.name = definition.id;
    root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };
    const shell = material(THREE, definition.palette.shell, 0.28, 0.34);
    const black = material(THREE, "#02050a", 0.32, 0.42);
    const steel = material(THREE, "#8aa0b2", 0.2, 0.82);
    const ice = material(THREE, definition.palette.grass, 0.18, 0.05);
    const cyan = emissive(THREE, definition.palette.trim, 3.7);
    const blue = emissive(THREE, definition.palette.sky, 3.1);
    const red = emissive(THREE, definition.palette.warning, 3.4);
    // Wide plinth and inward-tapered support masses give the table the planted,
    // commercial silhouette of a real arcade machine rather than four furniture legs.
    box(THREE, root, "floor-plinth", [0.98, 0.09, 1.56], [0, 0.045, 0], black);
    box(THREE, root, "underbody", [1.04, 0.42, 1.72], [0, 0.31, 0], shell);
    box(THREE, root, "underbody-waist", [0.88, 0.22, 1.9], [0, 0.57, 0], shell);
    for (const side of [-1, 1]) {
        const fairing = box(THREE, root, side < 0 ? "fairing-left" : "fairing-right", [0.12, 0.44, 1.78], [side * 0.53, 0.37, 0], shell);
        fairing.rotation.z = side * -0.085;
        box(THREE, root, side < 0 ? "side-inlay-left" : "side-inlay-right", [0.018, 0.12, 1.24], [side * 0.605, 0.4, 0], cyan);
    }
    box(THREE, root, "coin-door", [0.3, 0.29, 0.025], [0, 0.32, 0.873], steel);
    box(THREE, root, "coin-slot", [0.055, 0.12, 0.018], [-0.07, 0.37, 0.89], black);
    box(THREE, root, "puck-return", [0.12, 0.055, 0.025], [0.065, 0.25, 0.89], black);
    box(THREE, root, "table-bed", [1.3, 0.16, 2.36], [0, 0.72, 0], shell);
    box(THREE, root, "playfield", [PUCK_D_UP_PLAYFIELD.width, 0.035, PUCK_D_UP_PLAYFIELD.length], [0, PUCK_D_UP_PLAYFIELD.height, 0], ice);
    // Regulation-style markings sit just above the bed so they cannot z-fight.
    box(THREE, root, "center-line", [PUCK_D_UP_PLAYFIELD.width - 0.04, 0.004, 0.018], [0, 0.825, 0], blue);
    const circle = new THREE.Mesh(new THREE.RingGeometry(0.205, 0.219, 48), blue);
    circle.name = "center-circle";
    circle.position.set(0, 0.828, 0);
    circle.rotation.x = -Math.PI / 2;
    root.add(circle);
    cylinder(THREE, root, "center-dot", [0.025, 0.025], 0.005, [0, 0.83, 0], red, 24);
    for (const side of [-1, 1]) {
        addChevron(THREE, root, side < 0 ? "chevron-home" : "chevron-away", 0, side * 0.69, side < 0 ? 0 : Math.PI, side < 0 ? red : blue);
    }
    // Forty-five perforations are enough to read clearly at room scale without
    // burning geometry on holes that would collapse to sub-pixels at walking distance.
    const holeMaterial = material(THREE, "#6f8492", 0.6, 0.1);
    let hole = 0;
    for (let row = -4; row <= 4; row += 1) {
        for (let column = -2; column <= 2; column += 1) {
            hole += 1;
            cylinder(THREE, root, `air-hole-${hole}`, [0.008, 0.008], 0.006, [column * 0.175, 0.831, row * 0.195], holeMaterial, 10);
        }
    }
    // Rails leave a real mouth at each goal instead of hiding the opening behind
    // a decorative end cap.
    for (const side of [-1, 1]) {
        box(THREE, root, side < 0 ? "rail-left" : "rail-right", [0.105, 0.14, 2.24], [side * 0.592, 0.86, 0], steel);
        box(THREE, root, side < 0 ? "bumper-left" : "bumper-right", [0.035, 0.085, 2.06], [side * 0.535, 0.875, 0], black);
    }
    for (const end of [-1, 1]) {
        for (const side of [-1, 1]) {
            box(THREE, root, "end-rail", [0.35, 0.14, 0.105], [side * 0.39, 0.86, end * 1.122], steel);
            cylinder(THREE, root, "corner-guard", [0.105, 0.105], 0.14, [side * 0.592, 0.86, end * 1.122], steel, 24);
        }
        const goalName = end < 0 ? "goal-away" : "goal-home";
        box(THREE, root, goalName, [0.48, 0.085, 0.17], [0, 0.77, end * 1.145], black);
        box(THREE, root, `${goalName}-mouth`, [0.4, 0.07, 0.035], [0, 0.84, end * 1.07], end < 0 ? blue : red);
        box(THREE, root, `${goalName}-tray`, [0.44, 0.055, 0.23], [0, 0.68, end * 1.11], black);
    }
    box(THREE, root, "neon-left", [0.025, 0.035, 2.05], [-0.66, 0.76, 0], cyan);
    box(THREE, root, "neon-right", [0.025, 0.035, 2.05], [0.66, 0.76, 0], cyan);
    box(THREE, root, "neon-home", [0.48, 0.035, 0.025], [0, 0.735, 1.21], red);
    box(THREE, root, "neon-away", [0.48, 0.035, 0.025], [0, 0.735, -1.21], blue);
    addMallet(THREE, root, "mallet-home", -0.18, 0.7, definition.palette.warning);
    addMallet(THREE, root, "mallet-away", 0.16, -0.7, definition.palette.sky);
    cylinder(THREE, root, "puck", [0.075, 0.075], 0.024, [0.08, 0.842, 0.1], black, 32);
    // Side-mounted score pods keep both short ends completely clear: a player
    // can square up to the table and reach every point in their half naturally.
    addScoreTower(THREE, root, "scoreboard-home", -0.67, 0, -Math.PI / 2, shell, red);
    addScoreTower(THREE, root, "scoreboard-away", 0.67, 0, Math.PI / 2, shell, blue);
    for (const [x, z, light] of [
        [-0.5, 0.78, definition.palette.warning], [0.5, 0.78, definition.palette.warning],
        [-0.5, -0.78, definition.palette.sky], [0.5, -0.78, definition.palette.sky],
    ]) {
        const glow = new THREE.PointLight(light, 0.7, 1.8, 2);
        glow.position.set(x, 0.88, z);
        root.add(glow);
    }
    return root;
}
