import { createVenueHelpers } from './helpers.js';

export function buildBoardwalkBash(THREE) {
    const { makeStd, makeSurface, addBox, addCylinder, addInstancedBoxes, addSkyDome, addNeonStrip, addLampPost } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Boardwalk Bash';
    addSkyDome(g, { top: 0x704e87, bottom: 0xf3a665, horizon: 0xe97967, radius: 52, y: 6, z: -8 });
    const wood = makeSurface('wood', 0x866044, { accent: 0x2f211c, repeat: [6, 12], seed: 401 });
    const darkWood = makeSurface('wood', 0x4b342a, { accent: 0x17100e, repeat: [5, 2], seed: 409, roughness: .9 });
    const ocean = makeSurface('water', 0x347d91, { accent: 0x9fd0d5, repeat: [8, 5], seed: 419, transparent: true, opacity: .82 });
    const steel = makeStd(0x4b4851, { roughness: .36, metalness: .72 });
    addBox(g, [34, .38, 40], [0, -.72, -1], wood);
    for (let z = -18; z < 18; z += 1.25) addBox(g, [34, .025, .055], [0, -.50, z], darkWood);
    addBox(g, [60, .15, 25], [0, -1.1, -30], ocean);
    // Ferris wheel is an actual landmark, placed behind the far goal.
    const wheel = new THREE.Group(); wheel.position.set(-10.5, 5.4, -19); wheel.rotation.y = .08; g.add(wheel);
    const rimMat = makeStd(0xf2c25c, { roughness: .22, metalness: .45, emissive: 0xf09a42, emissiveIntensity: .9 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.2, .12, 12, 64), rimMat); wheel.add(rim);
    for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2;
        const spoke = addBox(wheel, [.06, 5.1, .06], [Math.cos(angle) * 2.55, Math.sin(angle) * 2.55, 0], steel, [0, 0, angle - Math.PI / 2]);
        spoke.position.set(0, 0, 0);
        addBox(wheel, [.7, .5, .55], [Math.cos(angle) * 5.2, Math.sin(angle) * 5.2, 0], makeStd(i % 2 ? 0x3fb7c3 : 0xd94e72, { emissive: i % 2 ? 0x3fb7c3 : 0xd94e72, emissiveIntensity: .45 }));
    }
    addCylinder(g, .16, 8.5, [-13.2, 2.2, -19], steel); addCylinder(g, .16, 8.5, [-7.8, 2.2, -19], steel);
    // Vendor huts, pier rails, and warm string lights.
    for (const x of [-10, 10]) {
        addBox(g, [4.5, 2.6, 2.3], [x, .8, -10.5], makeStd(x < 0 ? 0x3c7180 : 0x8b4f51, { roughness: .74 }));
        addBox(g, [5.0, .22, 2.8], [x, 2.25, -10.5], darkWood, [0, 0, x < 0 ? .08 : -.08]);
    }
    const bulbs = [];
    for (let i = 0; i < 15; i++) bulbs.push({ x: -10.5 + i * 1.5, y: 3.2 + Math.sin(i / 14 * Math.PI) * .8, z: -8.5, sx: .12, sy: .12, sz: .12 });
    const bulbMat = makeStd(0xffd18a, { emissive: 0xffb14d, emissiveIntensity: 1.7, roughness: .1 });
    addInstancedBoxes(g, bulbs, bulbMat);
    addLampPost(g, -9, 6, 0xffc27b); addLampPost(g, 9, 6, 0xffc27b);
    addNeonStrip(g, [18, .08, .08], [0, -.41, -13.6], 0xf06482, .75);
    const sunset = new THREE.PointLight(0xff9a62, 12, 28, 2); sunset.position.set(10, 7, -14); g.add(sunset);
    g.userData.pulse = [rimMat, bulbMat];
    return g;
}
