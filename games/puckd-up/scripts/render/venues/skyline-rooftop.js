import { createVenueHelpers } from './helpers.js';
export function buildSkylineRooftop(THREE) {
    const { makeStd, makeSurface, addBox, addCylinder, addInstancedBoxes, makePoints, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Skyline Rooftop';
    addSkyDome(g, { top: 0x031129, bottom: 0x3a3352, horizon: 0x14284b, radius: 50, y: 7, z: -7 });
    const roof = makeSurface('roofing', 0x182431, { accent: 0x070b10, repeat: [8, 11], seed: 211, roughness: .68, metalness: .18 });
    const metal = makeStd(0x384653, { roughness: .25, metalness: .84 });
    const glass = makeStd(0x183652, { roughness: .08, metalness: .32, transparent: true, opacity: .34 });
    const cyan = makeStd(0x38bff2, { roughness: .14, metalness: .48, emissive: 0x38bff2, emissiveIntensity: 1.5 });
    const violet = makeStd(0x9f63f0, { roughness: .14, metalness: .46, emissive: 0x9f63f0, emissiveIntensity: 1.35 });
    const windowMat = makeStd(0xffd37b, { roughness: .15, metalness: .15, emissive: 0xffc25a, emissiveIntensity: 1.25 });
    addBox(g, [31, .45, 38], [0, -.72, -1], roof);
    // Rooftop perimeter: low glass panels and architectural light lines.
    for (const x of [-13.2, 13.2]) {
        addBox(g, [.12, 1.35, 31], [x, .03, -1], glass);
        addBox(g, [.24, .12, 31], [x, .77, -1], metal);
        addNeonStrip(g, [.08, .08, 28], [x + (x < 0 ? .10 : -.10), .83, -1], x < 0 ? 0x9f63f0 : 0x38bff2, 1.0);
    }
    addBox(g, [26.4, 1.35, .12], [0, .03, -16.2], glass);
    addBox(g, [26.4, .12, .24], [0, .77, -16.2], metal);
    addNeonStrip(g, [24, .08, .08], [0, .84, -16.08], 0x38bff2, 1.15);
    // A layered city, not a single wall. Buildings are pushed well behind the playable table.
    const near = [], far = [];
    for (let i = 0; i < 18; i++) {
        const x = -18 + i * 2.15;
        near.push({ x, y: 1.7 + (i % 5) * .55, z: -22 - (i % 3) * 1.2, sx: 1.4 + (i % 3) * .2, sy: 5.0 + (i % 5) * 1.5, sz: 1.7 + (i % 2) * .45 });
    }
    for (let i = 0; i < 22; i++) {
        const x = -24 + i * 2.25;
        far.push({ x, y: 2.0 + (i % 7) * .45, z: -30 - (i % 4) * 1.4, sx: 1.5 + (i % 4) * .18, sy: 6 + (i % 7) * 1.35, sz: 2.0 });
    }
    addInstancedBoxes(g, far, makeStd(0x0a1425, { roughness: .62, metalness: .20, emissive: 0x102442, emissiveIntensity: .22 }));
    addInstancedBoxes(g, near, makeStd(0x101c30, { roughness: .48, metalness: .32, emissive: 0x122d4d, emissiveIntensity: .26 }));
    // One draw call worth of city windows on the camera-facing building fronts.
    const windows = [];
    for (let row = 0; row < 7; row++)
        for (let col = 0; col < 18; col++) {
            if ((row * 19 + col * 7) % 5 === 0)
                continue;
            windows.push({ x: -17.5 + col * 2.05, y: .4 + row * .72, z: -20.95 - (col % 3) * 1.2, sx: .42, sy: .16, sz: .035 });
        }
    addInstancedBoxes(g, windows, windowMat);
    // Rooftop structures: lounge canopy, vents, antenna mast, all kept outside play sightline.
    addBox(g, [5.3, 2.6, .30], [-8.0, 1.15, -12.8], makeStd(0x141d2b, { roughness: .24, metalness: .62 }));
    addNeonStrip(g, [4.5, .10, .08], [-8.0, 2.25, -12.62], 0x9f63f0, 1.5);
    addCylinder(g, 1.0, .18, [8.0, -.37, -11.5], metal, 32);
    addCylinder(g, .48, 2.3, [8.0, .72, -11.5], metal, 24);
    addBox(g, [.10, 5.0, .10], [10.0, 2.0, -13.0], metal);
    addNeonStrip(g, [.16, .16, .16], [10.0, 4.6, -13.0], 0xff4066, 1.8);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 18), new THREE.MeshBasicMaterial({ color: 0xd9e6ff }));
    moon.position.set(-11, 11, -30);
    g.add(moon);
    const stars = makePoints(g, 320, 0xc8dcff, [52, 19, 24], [0, 8, -30], .05, 77);
    stars.material.opacity = .86;
    const haze = makePoints(g, 90, 0x799de5, [30, 5, 12], [0, 2, -18], .08, 87);
    haze.material.opacity = .18;
    addNeonStrip(g, [11, .08, .08], [0, -.40, -13.7], 0x38bff2, 1.35);
    addNeonStrip(g, [9, .08, .08], [0, -.40, 11.5], 0x9f63f0, 1.20);
    const skyLight = new THREE.PointLight(0x588cff, 8, 18, 2);
    skyLight.position.set(0, 5, -9);
    g.add(skyLight);
    g.userData.pulse = [cyan, violet, windowMat];
    return g;
}
