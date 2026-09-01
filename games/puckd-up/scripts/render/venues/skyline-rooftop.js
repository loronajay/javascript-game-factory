import { createVenueHelpers } from './helpers.js';

export const SKYLINE_ROOFTOP_STYLE = Object.freeze({
    floorSurface: 'roofing',
    tableSurface: 'rooftopResin',
    tableColor: 0x142631,
    overheadSpans: false,
    roof: Object.freeze({ width: 72, depth: 90, parapetHeight: 3.2, serviceHeight: 10 }),
});

export function buildSkylineRooftop(THREE) {
    const { makeStd, makeSurface, addBox, addCylinder, addInstancedBoxes, makePoints, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Skyline Rooftop';
    const { roof: roofScale } = SKYLINE_ROOFTOP_STYLE;
    addSkyDome(g, { top: 0x031129, bottom: 0x3a3352, horizon: 0x14284b, radius: 62, y: 9, z: -10 });

    const roof = makeSurface(SKYLINE_ROOFTOP_STYLE.floorSurface, 0x2c4152, { accent: 0x111c27, repeat: [18, 22], seed: 211, roughness: .68, metalness: .18 });
    const serviceDeck = makeSurface('paintedMetal', 0x304453, { accent: 0x121c24, repeat: [7, 11], seed: 223, roughness: .48, metalness: .34 });
    const metal = makeStd(0x42515e, { roughness: .25, metalness: .84 });
    const dark = makeStd(0x121b27, { roughness: .45, metalness: .46 });
    const glass = makeStd(0x183652, { roughness: .08, metalness: .32, transparent: true, opacity: .34 });
    const cyan = makeStd(0x38bff2, { roughness: .14, metalness: .48, emissive: 0x38bff2, emissiveIntensity: 1.5 });
    const violet = makeStd(0x9f63f0, { roughness: .14, metalness: .46, emissive: 0x9f63f0, emissiveIntensity: 1.35 });
    const windowMat = makeStd(0xffd37b, { roughness: .15, metalness: .15, emissive: 0xffc25a, emissiveIntensity: 1.25 });

    addBox(g, [roofScale.width, .45, roofScale.depth], [0, -.72, -8], roof);
    // A large equipment pad frames the table without pretending the entire roof is the play surface.
    addBox(g, [34, .16, 52], [0, -.53, -1], serviceDeck);
    for (const x of [-16.7, 16.7])
        addNeonStrip(g, [.09, .06, 48], [x, -.42, -1], x < 0 ? 0x9f63f0 : 0x38bff2, .85);
    for (const z of [-24.8, 22.8])
        addNeonStrip(g, [33.2, .06, .09], [0, -.42, z], z < 0 ? 0x38bff2 : 0x9f63f0, .75);
    // Flush perimeter beacons reveal the depth of the roof without hanging over play.
    for (const x of [-27, -22, 22, 27]) {
        for (const z of [-34, -16, 2, 20]) {
            addCylinder(g, .28, .06, [x, -.41, z], x < 0 ? violet : cyan, 20);
        }
    }

    // True building-edge parapets sit at the perimeter, far beyond the table circulation zone.
    for (const x of [-34.0, 34.0]) {
        addBox(g, [.55, roofScale.parapetHeight, roofScale.depth], [x, roofScale.parapetHeight / 2 - .50, -8], dark);
        addBox(g, [.72, .18, roofScale.depth], [x, roofScale.parapetHeight + 1.02, -8], metal);
        addNeonStrip(g, [.12, .10, 80], [x + (x < 0 ? .38 : -.38), roofScale.parapetHeight + 1.15, -8], x < 0 ? 0x9f63f0 : 0x38bff2, .80);
    }
    addBox(g, [68, roofScale.parapetHeight, .55], [0, roofScale.parapetHeight / 2 - .50, -52.0], dark);

    // Full-size mechanical rooms and HVAC banks establish the scale of a commercial tower.
    addBox(g, [13, roofScale.serviceHeight, 9], [-18.5, roofScale.serviceHeight / 2 - .50, -26.5], dark);
    addBox(g, [11.5, 7.6, .18], [-18.5, 4.25, -21.90], glass);
    addNeonStrip(g, [10.5, .14, .10], [-18.5, 7.8, -21.76], 0x9f63f0, 1.2);
    for (const x of [12.5, 20.5]) {
        addBox(g, [6.5, 3.8, 6.0], [x, 1.40, -22.5], makeSurface('corrugated', 0x394752, { accent: 0x171e23, repeat: [3, 2], seed: Math.round(x * 7), roughness: .58, metalness: .48 }));
        for (const z of [-24.0, -22.5, -21.0])
            addBox(g, [5.7, .16, .16], [x, 2.15, z], metal);
    }

    // Side ventilation fields and a lounge remain outside the table's clear corridor.
    for (const side of [-1, 1]) {
        for (const z of [-10, 0, 10]) {
            addCylinder(g, 1.35, .30, [side * 20.5, -.28, z], metal, 32);
            addCylinder(g, .72, 2.8, [side * 20.5, 1.18, z], dark, 24);
        }
        addBox(g, [8.0, .22, 2.0], [side * 19.5, -.14, 18.5], dark);
        addBox(g, [6.6, .18, 1.1], [side * 19.5, .72, 18.5], makeStd(0x513c61, { roughness: .55, metalness: .20 }));
    }

    // Water tower and communications mast are large, distant landmarks rather than table props.
    for (const x of [14.5, 20.5])
        addBox(g, [.42, 8.0, .42], [x, 3.5, -33.0], metal, [0, 0, x < 18 ? -.10 : .10]);
    addCylinder(g, 4.6, 5.8, [17.5, 10.0, -33.0], makeStd(0x293846, { roughness: .50, metalness: .62 }), 32);
    addCylinder(g, 4.9, .32, [17.5, 13.0, -33.0], metal, 32);
    addBox(g, [.22, 15.0, .22], [28.0, 7.0, -30.0], metal);
    addNeonStrip(g, [.30, .30, .30], [28.0, 14.7, -30.0], 0xff4066, 1.8);

    // Layered neighboring towers sit beyond the roof edge with larger architectural proportions.
    const near = [];
    const far = [];
    for (let i = 0; i < 15; i++) {
        const x = -36 + i * 5.0;
        near.push({ x, y: 5.5 + (i % 5) * 1.2, z: -44 - (i % 3) * 1.8, sx: 3.6 + (i % 3) * .5, sy: 13 + (i % 5) * 3.0, sz: 4.2 + (i % 2) * .8 });
    }
    for (let i = 0; i < 17; i++) {
        const x = -43 + i * 5.2;
        far.push({ x, y: 7.0 + (i % 6) * 1.1, z: -53 - (i % 3) * 1.2, sx: 4.0 + (i % 4) * .5, sy: 16 + (i % 6) * 3.2, sz: 4.8 });
    }
    addInstancedBoxes(g, far, makeStd(0x0a1425, { roughness: .62, metalness: .20, emissive: 0x102442, emissiveIntensity: .22 }));
    addInstancedBoxes(g, near, makeStd(0x101c30, { roughness: .48, metalness: .32, emissive: 0x122d4d, emissiveIntensity: .26 }));

    const windows = [];
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 15; col++) {
            if ((row * 19 + col * 7) % 5 === 0) continue;
            windows.push({ x: -35 + col * 4.85, y: 1.0 + row * 1.10, z: -41.78 - (col % 3) * 1.8, sx: .72, sy: .24, sz: .05 });
        }
    }
    addInstancedBoxes(g, windows, windowMat);

    const moon = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 18), new THREE.MeshBasicMaterial({ color: 0xd9e6ff }));
    moon.position.set(-19, 17, -45);
    g.add(moon);
    const stars = makePoints(g, 420, 0xc8dcff, [70, 28, 38], [0, 12, -42], .065, 77);
    stars.material.opacity = .86;
    const haze = makePoints(g, 120, 0x799de5, [55, 8, 20], [0, 3, -34], .10, 87);
    haze.material.opacity = .16;

    const skyLight = new THREE.PointLight(0x78adff, 18, 46, 1.7);
    skyLight.position.set(0, 9, -13);
    g.add(skyLight);
    const deckLight = new THREE.PointLight(0x8ecbff, 12, 35, 1.7);
    deckLight.position.set(0, 5, 13);
    g.add(deckLight);
    g.userData.pulse = [cyan, violet, windowMat];
    return g;
}
