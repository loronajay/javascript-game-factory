import { createVenueHelpers } from './helpers.js';

export const BOARDWALK_BASH_STYLE = Object.freeze({
    floorSurface: 'wood',
    tableSurface: 'boardwalkComposite',
    tableColor: 0x142a30,
    overheadSpans: false,
    pier: Object.freeze({ width: 180, depth: 240, plazaWidth: 48, plazaDepth: 64 }),
    landmarks: Object.freeze({ wheelRadius: 72, vendorWidth: 36, vendorHeight: 22, lampHeight: 32 }),
});

export function buildBoardwalkBash(THREE) {
    const { makeStd, makeSurface, addBox, addCylinder, addInstancedBoxes, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Boardwalk Bash';
    const { pier, landmarks } = BOARDWALK_BASH_STYLE;

    addSkyDome(g, { top: 0x704e87, bottom: 0xf3a665, horizon: 0xe97967, radius: 280, y: 62, z: -90 });
    const wood = makeSurface(BOARDWALK_BASH_STYLE.floorSurface, 0x866044, {
        accent: 0x2f211c, repeat: [12, 18], seed: 401, roughness: .86, metalness: .01,
    });
    const darkWood = makeSurface('wood', 0x4b342a, {
        accent: 0x17100e, repeat: [8, 3], seed: 409, roughness: .92, metalness: 0,
    });
    const ocean = makeSurface('water', 0x347d91, {
        accent: 0x9fd0d5, repeat: [18, 8], seed: 419, transparent: true, opacity: .86,
    });
    const steel = makeStd(0x4b4851, { roughness: .36, metalness: .72 });
    const piling = makeStd(0x2e2521, { roughness: .92, metalness: .01 });
    const cream = makeStd(0xf0d7a2, { roughness: .68, metalness: .03 });

    addBox(g, [pier.width, .55, pier.depth], [0, -.78, -14], wood);
    const plankSeams = [];
    for (let z = -132; z <= 104; z += 1.3)
        plankSeams.push({ x: 0, y: -.492, z, sx: pier.width, sy: .024, sz: .045 });
    addInstancedBoxes(g, plankSeams, darkWood);

    // A broad, marked games plaza separates the table from concessions and rides.
    for (const side of [-1, 1])
        addNeonStrip(g, [.16, .07, pier.plazaDepth], [side * pier.plazaWidth / 2, -.43, 0], side < 0 ? 0xf06482 : 0x4bb7c2, .72);
    addNeonStrip(g, [pier.plazaWidth, .07, .16], [0, -.43, -pier.plazaDepth / 2], 0xf2a34e, .68);
    addNeonStrip(g, [pier.plazaWidth, .07, .16], [0, -.43, pier.plazaDepth / 2], 0x4bb7c2, .68);

    // The sea and pier structure continue well beyond the public deck.
    addBox(g, [360, .22, 130], [0, -2.0, -190], ocean);
    const piles = [];
    for (const x of [-78, -52, -26, 0, 26, 52, 78]) {
        for (const z of [-125, -92, -59, -26, 7, 40, 73])
            piles.push({ x, y: -7.5, z, sx: 3.0, sy: 15, sz: 3.0 });
    }
    addInstancedBoxes(g, piles, piling);

    // Full-scale vendor buildings sit beyond the game plaza with a wide circulation aisle.
    function addVendor(x, z, color, neon) {
        const wall = makeStd(color, { roughness: .76, metalness: .03 });
        addBox(g, [landmarks.vendorWidth, landmarks.vendorHeight, 24], [x, landmarks.vendorHeight / 2 - .5, z], wall);
        addBox(g, [landmarks.vendorWidth - 7, 10, .35], [x, 9, z + 12.2], makeStd(0x173038, {
            roughness: .16, metalness: .20, transparent: true, opacity: .58,
        }));
        addBox(g, [landmarks.vendorWidth + 4, 2.4, 12], [x, 16.5, z + 15], cream, [0, 0, x < 0 ? .035 : -.035]);
        addNeonStrip(g, [landmarks.vendorWidth - 9, .45, .24], [x, 19.0, z + 12.45], neon, 1.25);
        for (const postX of [x - landmarks.vendorWidth / 2 + 2, x + landmarks.vendorWidth / 2 - 2])
            addBox(g, [1.2, landmarks.vendorHeight, 1.2], [postX, landmarks.vendorHeight / 2 - .5, z + 11.6], darkWood);
    }
    addVendor(-52, -62, 0x3c7180, 0x54d4d3);
    addVendor(30, -34, 0x8b4f51, 0xff8c62);

    // A true amusement-pier Ferris wheel towers beyond the left edge, never above play.
    const wheel = new THREE.Group();
    wheel.position.set(-82, 76, -108);
    wheel.rotation.y = .04;
    g.add(wheel);
    const rimMat = makeStd(0xf2c25c, { roughness: .22, metalness: .45, emissive: 0xf09a42, emissiveIntensity: .9 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(landmarks.wheelRadius, 1.35, 14, 96), rimMat);
    wheel.add(rim);
    const gondolaCyan = makeStd(0x3fb7c3, { roughness: .38, metalness: .22, emissive: 0x3fb7c3, emissiveIntensity: .34 });
    const gondolaPink = makeStd(0xd94e72, { roughness: .38, metalness: .22, emissive: 0xd94e72, emissiveIntensity: .34 });
    for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2;
        addBox(wheel, [1.0, landmarks.wheelRadius * 2, 1.0], [0, 0, 0], steel, [0, 0, angle]);
        addBox(wheel, [10, 8, 8], [Math.cos(angle) * landmarks.wheelRadius, Math.sin(angle) * landmarks.wheelRadius, 0], i % 2 ? gondolaCyan : gondolaPink);
    }
    for (const x of [-35, 35])
        addCylinder(g, 2.1, 115, [-82 + x, 56.5, -108], steel, 24);

    // Human-scale lamps and benches line the plaza perimeter, not the playfield.
    const lampMat = makeStd(0x35383d, { roughness: .42, metalness: .68 });
    const lampGlow = makeStd(0xffd18a, { emissive: 0xffb14d, emissiveIntensity: 1.55, roughness: .1 });
    const pulse = [rimMat, lampGlow, gondolaCyan, gondolaPink];
    for (const side of [-1, 1]) {
        for (const z of [-20, 24]) {
            addBox(g, [1.0, landmarks.lampHeight, 1.0], [side * 14.5, landmarks.lampHeight / 2 - .5, z], lampMat);
            addBox(g, [7, 1.2, 3.5], [side * 14.5, landmarks.lampHeight - .2, z], lampGlow);
        }
        addBox(g, [5, 4.0, 26], [side * 16, 1.5, 3], darkWood);
        addBox(g, [8, 1.6, 26], [side * 16, 4.0, 3], makeStd(0x72513b, { roughness: .82, metalness: .01 }));
    }

    // Perimeter rails remain far outside the table and preserve the elevated camera view.
    for (const x of [-87, 87]) {
        addBox(g, [1.2, 10, 1.2], [x, 4.5, -14], steel);
        addBox(g, [1.0, 2.0, pier.depth - 8], [x, 8.5, -14], steel);
    }

    const sunset = new THREE.PointLight(0xff9a62, 28, 120, 1.7);
    sunset.position.set(34, 28, -48);
    g.add(sunset);
    const seaLight = new THREE.PointLight(0x58c3ce, 18, 100, 1.8);
    seaLight.position.set(-38, 18, -18);
    g.add(seaLight);
    g.userData.pulse = pulse;
    return g;
}
