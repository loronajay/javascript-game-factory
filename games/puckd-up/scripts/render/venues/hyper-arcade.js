import { createVenueHelpers } from './helpers.js';
export function buildHyperArcade(THREE) {
    const { makeStd, addBox, addInstancedBoxes, makePoints, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Hyper Arcade';
    addSkyDome(g, { top: 0x05020d, bottom: 0x10031b, horizon: 0x1e092b, radius: 44, y: 4, z: -5 });
    const floorMat = makeStd(0x0a0812, { roughness: .26, metalness: .34 });
    const cabinetMat = makeStd(0x16151f, { roughness: .32, metalness: .42 });
    const purple = makeStd(0xb92df0, { roughness: .18, metalness: .42, emissive: 0xb92df0, emissiveIntensity: 1.65 });
    const cyan = makeStd(0x19c8ff, { roughness: .16, metalness: .46, emissive: 0x19c8ff, emissiveIntensity: 1.8 });
    const pink = makeStd(0xff327f, { roughness: .16, metalness: .42, emissive: 0xff327f, emissiveIntensity: 1.8 });
    const amber = makeStd(0xffa52e, { roughness: .18, metalness: .38, emissive: 0xff7a18, emissiveIntensity: 1.45 });
    addBox(g, [30, .32, 36], [0, -.68, -1], floorMat);
    // Concentric neon floor frames make the room read as an arcade light tunnel.
    for (let i = 0; i < 4; i++) {
        const z = -3.5 - i * 3.0, w = 18 - i * 1.6;
        addNeonStrip(g, [w, .035, .10], [0, -.475, z], i % 2 ? 0x19c8ff : 0xff327f, 1.6).mat;
        addNeonStrip(g, [.10, .035, 5.3], [-w / 2, -.475, z + 1.7], i % 2 ? 0xb92df0 : 0x19c8ff, 1.35);
        addNeonStrip(g, [.10, .035, 5.3], [w / 2, -.475, z + 1.7], i % 2 ? 0xb92df0 : 0xff327f, 1.35);
    }
    // Cabinet rows: bodies + glowing marquee and screen bands.
    const cabs = [];
    for (const side of [-1, 1])
        for (let i = 0; i < 7; i++)
            cabs.push({ x: side * (7.2 + (i % 2) * .25), y: .55, z: -8.8 + i * 2.35, sx: 1.10, sy: 2.35, sz: .95, ry: side < 0 ? -.08 : .08 });
    addInstancedBoxes(g, cabs, cabinetMat);
    const screens = [];
    const marquees = [];
    cabs.forEach((c, i) => {
        screens.push({ x: c.x + (c.x < 0 ? .56 : -.56), y: .85, z: c.z, sx: .035, sy: .82, sz: .62, ry: 0 });
        marquees.push({ x: c.x + (c.x < 0 ? .57 : -.57), y: 1.55, z: c.z, sx: .04, sy: .28, sz: .75 });
    });
    addInstancedBoxes(g, screens, makeStd(0x1da7d9, { roughness: .1, metalness: .3, emissive: 0x1da7d9, emissiveIntensity: 1.6 }));
    addInstancedBoxes(g, marquees, pink);
    // Prize towers and side portals.
    for (const x of [-9.0, 9.0]) {
        addBox(g, [2.1, 3.4, 1.7], [x, .95, -6.8], makeStd(0x21152d, { roughness: .25, metalness: .32 }));
        addNeonStrip(g, [2.2, .12, 1.82], [x, 2.72, -6.8], x < 0 ? 0xff327f : 0x19c8ff, 2.1);
        addNeonStrip(g, [.10, 3.0, .10], [x + (x < 0 ? 1.02 : -1.02), 1.0, -6.8], x < 0 ? 0xb92df0 : 0x19c8ff, 1.8);
    }
    // Rear light wall, deliberately above/behind the far goal instead of over the table.
    addBox(g, [18, 5.0, .25], [0, 1.75, -14.2], makeStd(0x0c0b15, { roughness: .30, metalness: .55 }));
    for (let i = 0; i < 11; i++)
        addNeonStrip(g, [.13, 3.3, .08], [-7.5 + i * 1.5, 1.8, -14.0], [0xff327f, 0x19c8ff, 0xb92df0, 0xffa52e][i % 4], 1.7);
    addNeonStrip(g, [16, .13, .10], [0, 3.85, -13.95], 0x19c8ff, 2.0);
    addNeonStrip(g, [12, .10, .10], [0, 3.35, -13.93], 0xff327f, 1.9);
    // Visible ceiling strips stay high and behind camera sightline.
    for (const x of [-5.4, 0, 5.4])
        addNeonStrip(g, [.18, .16, 12], [x, 6.0, -6.5], x === 0 ? 0xb92df0 : (x < 0 ? 0xff327f : 0x19c8ff), 1.6);
    const particles = makePoints(g, 180, 0xd58aff, [25, 7, 22], [0, 2.5, -4], .045, 17);
    particles.material.opacity = .62;
    const lightL = new THREE.PointLight(0xff2d8b, 11, 13, 2);
    lightL.position.set(-7, 2.6, -4);
    g.add(lightL);
    const lightR = new THREE.PointLight(0x22caff, 11, 13, 2);
    lightR.position.set(7, 2.6, -4);
    g.add(lightR);
    g.userData.pulse = [purple, cyan, pink, amber];
    g.userData.spin = [];
    return g;
}
