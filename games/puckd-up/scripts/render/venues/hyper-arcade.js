import { createVenueHelpers } from './helpers.js';

export const HYPER_ARCADE_STYLE = Object.freeze({
    floorSurface: 'arcadeCarpet',
    tableSurface: 'acrylic',
    tableColor: 0x24343d,
    overheadSpans: false,
    room: Object.freeze({ width: 48, depth: 68, wallHeight: 13.5 }),
    cabinet: Object.freeze({ width: 3.0, height: 8.0, depth: 3.4 }),
});

export function buildHyperArcade(THREE) {
    const { makeStd, makeSurface, addBox, addCylinder, addInstancedBoxes, makePoints, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Hyper Arcade';
    const { room, cabinet } = HYPER_ARCADE_STYLE;
    addSkyDome(g, { top: 0x030108, bottom: 0x10031b, horizon: 0x210932, radius: 48, y: 5, z: -5 });
    const floorMat = makeSurface(HYPER_ARCADE_STYLE.floorSurface, 0x1f122a, { accent: 0xa12b7a, repeat: [11, 14], seed: 17, emissive: 0x0c0412, emissiveIntensity: .12 });
    const platformMat = makeSurface('paintedMetal', 0x11131d, { accent: 0x06070c, repeat: [5, 8], seed: 23, roughness: .38, metalness: .34 });
    const cabinetMat = makeSurface('paintedMetal', 0x3a2348, { accent: 0x0d0912, repeat: [2, 3], seed: 29, roughness: .30, metalness: .48 });
    const wallMat = makeSurface('paintedMetal', 0x1c1127, { accent: 0x07050b, repeat: [5, 3], seed: 31, roughness: .42, metalness: .30 });
    const trimMat = makeStd(0x34283f, { roughness: .28, metalness: .70 });
    const purple = makeStd(0xb92df0, { roughness: .18, metalness: .42, emissive: 0xb92df0, emissiveIntensity: 1.65 });
    const cyan = makeStd(0x19c8ff, { roughness: .16, metalness: .46, emissive: 0x19c8ff, emissiveIntensity: 1.8 });
    const pink = makeStd(0xff327f, { roughness: .16, metalness: .42, emissive: 0xff327f, emissiveIntensity: 1.8 });
    const amber = makeStd(0xffa52e, { roughness: .18, metalness: .38, emissive: 0xff7a18, emissiveIntensity: 1.45 });
    addBox(g, [room.width, .30, room.depth], [0, -.69, -7], floorMat);
    // A raised service plinth grounds the oversized competition table in the room.
    addBox(g, [14.4, .18, 21.6], [0, -.56, 0], platformMat);
    for (const x of [-7.1, 7.1])
        addNeonStrip(g, [.10, .06, 21.2], [x, -.43, 0], x < 0 ? 0xff327f : 0x19c8ff, 1.7);
    for (const z of [-10.55, 10.55])
        addNeonStrip(g, [14.2, .06, .10], [0, -.43, z], z < 0 ? 0xb92df0 : 0xffa52e, 1.45);

    // Full-height walls, columns, and a rear header establish a room large enough for the table.
    addBox(g, [room.width, room.wallHeight, .45], [0, room.wallHeight / 2 - .55, -34.2], wallMat);
    for (const x of [-23.8, 23.8]) {
        addBox(g, [.45, room.wallHeight, room.depth], [x, room.wallHeight / 2 - .55, -7], wallMat);
        for (const z of [-31, -20, -9, 2, 13, 24])
            addBox(g, [.92, room.wallHeight + .35, .92], [x * .988, room.wallHeight / 2 - .38, z], trimMat);
    }
    addBox(g, [37.0, 1.45, .85], [0, 10.8, -33.55], trimMat);
    addNeonStrip(g, [33.5, .20, .18], [0, 10.8, -33.08], 0x19c8ff, 2.1);
    addNeonStrip(g, [25.0, .14, .20], [0, 10.15, -33.06], 0xff327f, 1.9);

    // Cabinets are furniture-scale silhouettes with deep shells, readable screens, and control decks.
    const cabs = [];
    for (const side of [-1, 1])
        for (let i = 0; i < 5; i++)
            cabs.push({ x: side * (13.3 + (i % 2) * .25), y: cabinet.height / 2 - .48, z: -10.8 + i * 6.0, sx: cabinet.width, sy: cabinet.height, sz: cabinet.depth, ry: side < 0 ? -.035 : .035 });
    // A second, more distant bank makes the room continue beyond the hero table.
    for (const side of [-1, 1])
        for (let i = 0; i < 4; i++)
            cabs.push({ x: side * 20.0, y: cabinet.height / 2 - .48, z: -25.5 + i * 10.2, sx: cabinet.width, sy: cabinet.height, sz: cabinet.depth, ry: side < 0 ? -.08 : .08 });
    addInstancedBoxes(g, cabs, cabinetMat);
    const screens = [];
    const marquees = [];
    const controls = [];
    const cabinetEdges = [];
    cabs.forEach((c, i) => {
        const faceX = c.x + (c.x < 0 ? cabinet.width / 2 + .025 : -cabinet.width / 2 - .025);
        screens.push({ x: faceX, y: 3.25, z: c.z, sx: .075, sy: 2.65, sz: 2.25 });
        marquees.push({ x: faceX + (c.x < 0 ? .02 : -.02), y: 6.35, z: c.z, sx: .10, sy: .82, sz: 2.55 });
        controls.push({ x: faceX + (c.x < 0 ? .58 : -.58), y: 1.82, z: c.z, sx: 1.20, sy: .25, sz: 2.38, rz: c.x < 0 ? -.18 : .18 });
        for (const edgeZ of [-1.34, 1.34])
            cabinetEdges.push({ x: faceX + (c.x < 0 ? .06 : -.06), y: 4.05, z: c.z + edgeZ, sx: .11, sy: 5.30, sz: .11 });
    });
    addInstancedBoxes(g, screens, makeStd(0x123e68, { roughness: .08, metalness: .32, emissive: 0x168ed1, emissiveIntensity: 1.75 }));
    addInstancedBoxes(g, marquees, pink);
    addInstancedBoxes(g, controls, trimMat);
    addInstancedBoxes(g, cabinetEdges, cyan);

    // A staffed prize counter and display bays give the far end a familiar human-scale destination.
    addBox(g, [25.0, 2.1, 3.8], [0, .50, -21.5], cabinetMat);
    addBox(g, [26.0, .30, 4.15], [0, 1.68, -21.5], trimMat);
    for (const x of [-9.6, -4.8, 0, 4.8, 9.6]) {
        addBox(g, [3.25, 5.2, .42], [x, 5.0, -24.45], makeStd(0x151020, { roughness: .30, metalness: .32 }));
        addNeonStrip(g, [2.90, 3.65, .10], [x, 5.05, -24.18], [0xff327f, 0x19c8ff, 0xb92df0][Math.abs(Math.round(x)) % 3], 1.45);
    }
    for (const x of [-18.4, 18.4]) {
        addBox(g, [4.8, 7.2, .34], [x, 3.05, -24.40], trimMat);
        addNeonStrip(g, [4.5, .15, .11], [x, 6.73, -24.12], x < 0 ? 0xff327f : 0x19c8ff, 1.7);
        for (const edgeX of [-2.2, 2.2])
            addNeonStrip(g, [.12, 6.85, .11], [x + edgeX, 3.12, -24.12], x < 0 ? 0xb92df0 : 0x19c8ff, 1.45);
    }
    for (const x of [-9.0, 9.0]) {
        addCylinder(g, 1.10, .30, [x, -.25, 19.0], trimMat, 24);
        addBox(g, [.18, 2.0, .18], [x, .60, 19.0], trimMat);
        addCylinder(g, 1.55, .20, [x, 1.64, 19.0], cabinetMat, 24);
    }

    // Keep the complete camera-to-playfield corridor open; scale comes from side and rear architecture.
    const particles = makePoints(g, 160, 0xd58aff, [45, 12, 58], [0, 5.0, -7], .055, 17);
    particles.material.opacity = .42;
    const lightL = new THREE.PointLight(0xff2d8b, 11, 13, 2);
    lightL.position.set(-13.0, 6.0, -4);
    g.add(lightL);
    const lightR = new THREE.PointLight(0x22caff, 11, 13, 2);
    lightR.position.set(13.0, 6.0, -4);
    g.add(lightR);
    g.userData.pulse = [purple, cyan, pink, amber];
    g.userData.spin = [];
    return g;
}
