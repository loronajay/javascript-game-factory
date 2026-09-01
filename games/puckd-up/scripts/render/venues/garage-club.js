import { createVenueHelpers } from './helpers.js';

export function buildGarageClub(THREE) {
    const { makeStd, addBox, addCylinder, addInstancedBoxes, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Garage Club';
    const concrete = makeStd(0x2a2927, { roughness: .92 });
    const floor = makeStd(0x17191a, { roughness: .62, metalness: .12 });
    const steel = makeStd(0x35393c, { roughness: .38, metalness: .78 });
    const yellow = makeStd(0xe2a332, { roughness: .42, metalness: .34, emissive: 0xb16d18, emissiveIntensity: .48 });
    addBox(g, [32, .45, 38], [0, -.72, -1], floor);
    // Open trusses imply a low garage ceiling without putting an opaque slab
    // between the elevated broadcast camera and the table.
    for (const z of [-11, -5]) addBox(g, [23, .32, .5], [0, 6.15, z], steel);
    for (const x of [-10.5, 10.5]) addBox(g, [.5, .32, 18], [x, 6.15, -4], steel);
    const pillars = [];
    for (const x of [-10.5, 10.5]) for (const z of [-12, -4, 4, 10]) pillars.push({ x, y: 2.7, z, sx: 1.05, sy: 6.2, sz: 1.05 });
    addInstancedBoxes(g, pillars, concrete);
    for (const x of [-10.5, 10.5]) for (const z of [-12, -4, 4, 10]) {
        addBox(g, [1.12, .25, 1.12], [x, 1.0, z], yellow);
        addBox(g, [1.12, .25, 1.12], [x, 1.55, z], makeStd(0x141414, { roughness: .8 }));
    }
    // Fluorescent lanes and exposed pipework sell a real after-hours parking level.
    const pulse = [];
    for (const x of [-6, 0, 6]) for (const z of [-10, -2, 6]) pulse.push(addNeonStrip(g, [3.4, .08, .18], [x, 5.95, z], 0xc9f1e9, 1.2).mat);
    for (const x of [-8.7, 8.7]) {
        addCylinder(g, .11, 26, [x, 5.75, -1], steel, 12).rotation.x = Math.PI / 2;
        addNeonStrip(g, [.12, .12, 15], [x, -.42, -1], x < 0 ? 0xdf8330 : 0x4ab5bf, .72);
    }
    // Parked-car silhouettes remain outside the active table corridor.
    for (const [x, z, color] of [[-9, -8, 0x5a3130], [9, -6, 0x223d54], [-9, 3, 0x404348], [9, 5, 0x5a5435]]) {
        const car = makeStd(color, { roughness: .38, metalness: .55 });
        addBox(g, [3.2, .62, 1.5], [x, -.12, z], car);
        addBox(g, [1.7, .55, 1.35], [x, .38, z], car, [0, 0, x < 0 ? -.05 : .05]);
    }
    addBox(g, [16, 3.2, .25], [0, 1.1, -14.3], makeStd(0x1d2022, { roughness: .7, metalness: .25 }));
    addNeonStrip(g, [12, .1, .08], [0, 2.0, -14.1], 0xdf8330, 1.25);
    const amber = new THREE.PointLight(0xd97928, 10, 18, 2); amber.position.set(-8, 2, -5); g.add(amber);
    const teal = new THREE.PointLight(0x3faab4, 8, 16, 2); teal.position.set(8, 2, 1); g.add(teal);
    g.userData.pulse = pulse;
    return g;
}
