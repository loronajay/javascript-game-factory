import { createVenueHelpers } from './helpers.js';

export const ZERO_G_ARENA_STYLE = Object.freeze({
    floorSurface: 'spacePanels',
    tableSurface: 'zeroGComposite',
    tableColor: 0x101f2d,
    overheadSpans: false,
    station: Object.freeze({ width: 200, depth: 260, clearHeight: 54, apronWidth: 56, apronDepth: 76 }),
    landmarks: Object.freeze({ ringRadius: 66, planetRadius: 80, airlockHeight: 32 }),
});

export function buildZeroGArena(THREE) {
    const { makeStd, makeSurface, addBox, addCylinder, addInstancedBoxes, makePoints, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Zero-G Arena';
    const { station, landmarks } = ZERO_G_ARENA_STYLE;

    addSkyDome(g, { top: 0x01040c, bottom: 0x09142a, horizon: 0x050b18, radius: 340, y: 76, z: -120 });
    const floor = makeSurface(ZERO_G_ARENA_STYLE.floorSurface, 0x22384c, {
        accent: 0x040910, repeat: [10, 14], seed: 601, roughness: .34, metalness: .58,
    });
    const apron = makeSurface('paintedMetal', 0x253e50, {
        accent: 0x071018, repeat: [7, 10], seed: 603, roughness: .38, metalness: .48,
    });
    const white = makeSurface('paintedMetal', 0xb7c5cf, {
        accent: 0x53616c, repeat: [3, 8], seed: 607, roughness: .25, metalness: .64,
    });
    const dark = makeSurface('spacePanels', 0x1b2634, {
        accent: 0x070b10, repeat: [4, 10], seed: 613, roughness: .34, metalness: .64,
    });
    const cyan = makeStd(0x4ed9e8, { emissive: 0x4ed9e8, emissiveIntensity: 1.25, roughness: .12, metalness: .5 });
    const gold = makeStd(0xe9bd5b, { emissive: 0xc98b2e, emissiveIntensity: 1.05, roughness: .18, metalness: .58 });
    const glass = makeStd(0x173b59, { roughness: .08, metalness: .28, transparent: true, opacity: .42 });
    const moduleShell = makeSurface('paintedMetal', 0x536b79, {
        accent: 0x202d35, repeat: [5, 7], seed: 619, roughness: .36, metalness: .56,
    });

    addBox(g, [station.width, .55, station.depth], [0, -.78, -22], floor);
    addBox(g, [station.apronWidth, .10, station.apronDepth], [0, -.43, 0], apron);

    // Floor-level channels define the competition apron without spanning above it.
    const pulse = [cyan, gold];
    for (const side of [-1, 1])
        pulse.push(addNeonStrip(g, [.16, .08, station.apronDepth - 3], [side * (station.apronWidth / 2 - .8), -.36, 0], side < 0 ? 0xe9bd5b : 0x4ed9e8, .92).mat);
    pulse.push(addNeonStrip(g, [station.apronWidth - 3, .08, .16], [0, -.36, -station.apronDepth / 2 + .8], 0x4ed9e8, .82).mat);
    pulse.push(addNeonStrip(g, [station.apronWidth - 3, .08, .16], [0, -.36, station.apronDepth / 2 - .8], 0xe9bd5b, .82).mat);

    // Monumental side bulkheads establish the hangar scale while leaving the center completely open.
    for (const side of [-1, 1]) {
        addBox(g, [8, station.clearHeight, station.depth - 20], [side * 82, station.clearHeight / 2 - .5, -22], dark);
        const ribs = [];
        for (const z of [-125, -95, -65, -35, -5, 25, 55, 85])
            ribs.push({ x: side * 77.8, y: station.clearHeight / 2 - .5, z, sx: 2.0, sy: station.clearHeight, sz: 3.0 });
        addInstancedBoxes(g, ribs, white);
        for (const z of [-110, -50, 10, 70])
            addNeonStrip(g, [1.0, station.clearHeight - 8, .35], [side * 76.6, station.clearHeight / 2 - .5, z], side < 0 ? 0xe9bd5b : 0x4ed9e8, .80);
    }

    function addAirlock(x, z, accentColor) {
        addBox(g, [34, landmarks.airlockHeight, 24], [x, landmarks.airlockHeight / 2 - .5, z], moduleShell);
        addBox(g, [24, .60, 14], [x, landmarks.airlockHeight - .25, z], glass);
        addNeonStrip(g, [21, .22, .22], [x, landmarks.airlockHeight + .08, z - 6.4], accentColor, 1.05);
        addNeonStrip(g, [21, .22, .22], [x, landmarks.airlockHeight + .08, z + 6.4], accentColor, 1.05);
        addBox(g, [25, landmarks.airlockHeight - 8, .40], [x, landmarks.airlockHeight / 2 - .5, z + 12.2], glass);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 1.3, 12, 56), white);
        ring.position.set(x, landmarks.airlockHeight / 2, z + 12.6);
        g.add(ring);
        addNeonStrip(g, [19, .50, .25], [x, landmarks.airlockHeight - 4.0, z + 12.7], accentColor, 1.35);
        for (const side of [-1, 1])
            addBox(g, [2.0, landmarks.airlockHeight - 5, 2.0], [x + side * 14, landmarks.airlockHeight / 2 - .5, z + 11], white);
    }
    // One camera-readable airlock and one distant module keep the apron from feeling boxed in.
    addAirlock(22, -29, 0x4ed9e8);
    addAirlock(-58, -82, 0xe9bd5b);

    // A rear observation ring frames the horizon behind the far goal, clear of the table.
    const observationRing = new THREE.Mesh(new THREE.TorusGeometry(landmarks.ringRadius, 2.2, 16, 112), white);
    observationRing.position.set(-45, 72, -126);
    g.add(observationRing);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(landmarks.ringRadius - 8, .8, 12, 96), cyan);
    innerRing.position.copy(observationRing.position);
    g.add(innerRing);

    // A planet now dominates the distant glazing at true architectural scale.
    const planet = new THREE.Mesh(
        new THREE.SphereGeometry(landmarks.planetRadius, 48, 32),
        new THREE.MeshStandardMaterial({ color: 0x356ba1, emissive: 0x153d70, emissiveIntensity: .38, roughness: .70 })
    );
    planet.position.set(-58, 58, -220);
    g.add(planet);
    const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(landmarks.planetRadius + 1.4, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0xcce8ef, transparent: true, opacity: .11, wireframe: true })
    );
    cloud.position.copy(planet.position);
    g.add(cloud);

    const stars = makePoints(g, 900, 0xddeaff, [320, 180, 180], [0, 72, -205], .16, 911);
    stars.material.opacity = .92;

    // Service pedestals are large floor fixtures beyond the far edge of the apron.
    for (const x of [-40, 48]) {
        addCylinder(g, 5.2, 1.2, [x, .10, -58], dark, 36);
        addCylinder(g, 2.0, 14, [x, 6.5, -58], white, 24);
        addBox(g, [8, 6, 5], [x, 13.2, -58], glass);
    }

    const stationLight = new THREE.PointLight(0x4ed9e8, 42, 125, 1.8);
    stationLight.position.set(32, 22, -30);
    g.add(stationLight);
    const championLight = new THREE.PointLight(0xe9bd5b, 22, 105, 1.8);
    championLight.position.set(-34, 20, -18);
    g.add(championLight);
    g.userData.pulse = pulse;
    return g;
}
