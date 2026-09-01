import { createVenueHelpers } from './helpers.js';

export function buildFreightYard(THREE) {
    const { makeStd, makeSurface, addBox, addInstancedBoxes, addSkyDome, addNeonStrip, addLampPost } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Freight Yard';
    addSkyDome(g, { top: 0x07111a, bottom: 0x28353a, horizon: 0x182830, radius: 50, y: 6, z: -8 });
    const ground = makeSurface('asphalt', 0x303536, { accent: 0x101314, repeat: [10, 12], seed: 503 });
    const steel = makeStd(0x363e42, { roughness: .44, metalness: .72 });
    addBox(g, [38, .42, 44], [0, -.72, -2], ground);
    const containers = [], colors = [0x814237, 0x335b67, 0x76602f, 0x424f55];
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++) for (let tier = 0; tier < 1 + (i % 3); tier++)
        containers.push({ side, i, tier, x: side * (8.7 + tier * .15), y: .18 + tier * 1.55, z: -12 + i * 3.7, sx: 3.0, sy: 1.45, sz: 2.4 });
    colors.forEach((color, index) => addInstancedBoxes(g, containers.filter((_, i) => i % colors.length === index), makeSurface('corrugated', color, { accent: 0x251813, repeat: [4, 2], seed: 521 + index * 13 })));
    // Modeled ribs catch the side lighting on the inward container faces. The
    // texture supplies wear; this geometry makes the material read from camera.
    const containerRibs = [];
    for (const container of containers) {
        const faceX = container.x - container.side * 1.52;
        for (let offset = -.9; offset <= .9; offset += .45)
            containerRibs.push({ x: faceX, y: container.y, z: container.z + offset, sx: .075, sy: 1.24, sz: .055 });
    }
    addInstancedBoxes(g, containerRibs, makeStd(0x242829, { roughness: .58, metalness: .48 }));
    // Two embedded service tracks explain the yard layout and give the broad
    // asphalt apron a strong perspective rhythm.
    const railSleepers = [];
    for (const side of [-1, 1]) {
        for (const x of [side * 7.35, side * 8.05]) addBox(g, [.09, .07, 31], [x, -.43, -1.5], steel);
        for (let z = -15; z <= 13; z += 1.25)
            railSleepers.push({ x: side * 7.70, y: -.47, z, sx: 1.35, sy: .055, sz: .16 });
    }
    addInstancedBoxes(g, railSleepers, makeSurface('wood', 0x51402f, { accent: 0x171310, repeat: [1, 1], seed: 557, roughness: .94 }));
    // Gantry crane frames the rear skyline without crossing the playable sightline.
    for (const x of [-11.5, 11.5]) addBox(g, [.38, 8.5, .38], [x, 3.55, -15], steel);
    addBox(g, [23.4, .5, .5], [0, 7.4, -15], steel);
    addBox(g, [.22, 4.5, .22], [4.2, 5.2, -15], steel);
    addBox(g, [1.2, .42, 1.2], [4.2, 2.95, -15], steel);
    const stripes = makeStd(0xe2a43d, { emissive: 0xb76a18, emissiveIntensity: .35, roughness: .45 });
    for (let i = 0; i < 8; i++) addBox(g, [1.4, .03, .16], [-5.4 + i * 1.55, -.48, 10.3], stripes, [0, i % 2 ? .35 : -.35, 0]);
    addLampPost(g, -7.7, -5, 0xffb35e); addLampPost(g, 7.7, -5, 0xffb35e); addLampPost(g, -7.7, 8, 0xffb35e); addLampPost(g, 7.7, 8, 0xffb35e);
    addNeonStrip(g, [.1, .1, 16], [-7.0, -.38, 0], 0xe18b31, .65);
    addNeonStrip(g, [.1, .1, 16], [7.0, -.38, 0], 0x52a9b5, .65);
    const haze = new THREE.PointLight(0xe28c38, 12, 20, 2); haze.position.set(-7, 3, -8); g.add(haze);
    g.userData.pulse = [stripes];
    return g;
}
