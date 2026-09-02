import { createVenueHelpers } from './helpers.js';

export const FREIGHT_YARD_STYLE = Object.freeze({
    floorSurface: 'asphalt',
    tableSurface: 'yardComposite',
    tableColor: 0x15282c,
    overheadSpans: false,
    yard: Object.freeze({ width: 260, depth: 320, apronWidth: 64, apronDepth: 82 }),
    container: Object.freeze({ length: 96, width: 20, height: 21 }),
    crane: Object.freeze({ height: 84, sideClearance: 72 }),
});

export function buildFreightYard(THREE) {
    const { makeStd, makeSurface, addBox, addCylinder, addInstancedBoxes, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Freight Yard';
    const { yard, container, crane } = FREIGHT_YARD_STYLE;

    addSkyDome(g, { top: 0x07111a, bottom: 0x28353a, horizon: 0x182830, radius: 330, y: 70, z: -100 });
    const ground = makeSurface(FREIGHT_YARD_STYLE.floorSurface, 0x303536, {
        accent: 0x101314, repeat: [22, 28], seed: 503, roughness: .93, metalness: .01,
    });
    const apron = makeSurface('paintedMetal', 0x293335, {
        accent: 0x101617, repeat: [9, 12], seed: 511, roughness: .64, metalness: .16,
    });
    const steel = makeStd(0x414c51, { roughness: .40, metalness: .72 });
    const darkSteel = makeStd(0x222a2d, { roughness: .52, metalness: .62 });
    const safety = makeStd(0xe2a43d, { emissive: 0xb76a18, emissiveIntensity: .30, roughness: .45, metalness: .18 });
    const railWood = makeSurface('wood', 0x51402f, {
        accent: 0x171310, repeat: [1, 1], seed: 557, roughness: .94,
    });

    addBox(g, [yard.width, .55, yard.depth], [0, -.78, -28], ground);
    addBox(g, [yard.apronWidth, .09, yard.apronDepth], [0, -.44, 0], apron);

    // Flush hazard boundaries define a dedicated event apron without fencing in the table.
    const pulse = [];
    for (const side of [-1, 1])
        pulse.push(addNeonStrip(g, [.16, .07, yard.apronDepth - 3], [side * (yard.apronWidth / 2 - .8), -.37, 0], side < 0 ? 0xe18b31 : 0x52a9b5, .72).mat);
    pulse.push(addNeonStrip(g, [yard.apronWidth - 3, .07, .16], [0, -.37, -yard.apronDepth / 2 + .8], 0xe18b31, .68).mat);
    pulse.push(addNeonStrip(g, [yard.apronWidth - 3, .07, .16], [0, -.37, yard.apronDepth / 2 - .8], 0x52a9b5, .68).mat);

    // One standard-gauge service track runs beside the event apron, never beneath play.
    for (const x of [14, 25])
        addBox(g, [.48, .28, 250], [x, -.34, -30], steel);
    const railSleepers = [];
    for (let z = -150; z <= 90; z += 5)
        railSleepers.push({ x: 19.5, y: -.46, z, sx: 18, sy: .10, sz: .80 });
    addInstancedBoxes(g, railSleepers, railWood);

    function addContainer(x, z, color, tier = 0) {
        const y = -.5 + container.height / 2 + tier * (container.height + 1.2);
        const shell = makeSurface('corrugated', color, {
            accent: 0x251813, repeat: [14, 4], seed: 521 + tier * 19 + Math.round(Math.abs(x)), roughness: .65, metalness: .38,
        });
        addBox(g, [container.length, container.height, container.width], [x, y, z], shell);
        // Modeled containerRibs maintain readable corrugation at gameplay distance.
        const containerRibs = [];
        for (let localX = -container.length / 2 + 3; localX <= container.length / 2 - 3; localX += 4)
            containerRibs.push({ x: x + localX, y, z: z + container.width / 2 + .12, sx: .55, sy: container.height - 2, sz: .30 });
        addInstancedBoxes(g, containerRibs, darkSteel);
        for (const edgeX of [x - container.length / 2 + 1, x + container.length / 2 - 1])
            addBox(g, [1.1, container.height, .55], [edgeX, y, z + container.width / 2 + .25], steel);
        addBox(g, [container.length - 2, 1.0, .55], [x, y + container.height / 2 - .8, z + container.width / 2 + .25], steel);
    }

    // Real-size containers occupy a rear loading row, never the immediate table perimeter.
    addContainer(40, -31, 0x814237);
    addContainer(-62, -78, 0x335b67);
    addContainer(62, -91, 0x76602f, 1);
    addContainer(-60, -112, 0x424f55, 1);

    // A forklift provides a single familiar scale reference in the rear-left service lane.
    const forklift = makeStd(0xd5982d, { roughness: .50, metalness: .36 });
    addBox(g, [16, 8, 25], [-22, 3.5, -30], forklift);
    addBox(g, [15, 12, 11], [-22, 12, -35], forklift);
    addBox(g, [12, 8, 7], [-22, 13, -30], darkSteel);
    for (const x of [-29.5, -14.5]) {
        for (const z of [-39, -23]) {
            const wheel = addCylinder(g, 3.1, 2.0, [x, 2.6, z], darkSteel, 24);
            wheel.rotation.z = Math.PI / 2;
        }
    }
    for (const x of [-28, -16])
        addBox(g, [1.2, 27, 1.2], [x, 13, -17], steel);
    addBox(g, [22, 1.0, 2.0], [-22, 24.5, -17], steel);

    // The gantry crane runs down the remote right boundary instead of crossing the playfield.
    for (const z of [-120, 58])
        addBox(g, [5.0, crane.height, 5.0], [crane.sideClearance, crane.height / 2 - .5, z], steel);
    addBox(g, [7.0, 6.0, 183], [crane.sideClearance, crane.height - 3.5, -31], steel);
    addBox(g, [12, 8, 18], [crane.sideClearance, crane.height - 10, -36], safety);

    // Large yard lamps stay outside the open apron and never span overhead.
    const lampGlow = makeStd(0xffc06c, { emissive: 0xffa23c, emissiveIntensity: 1.45, roughness: .10 });
    for (const [x, z] of [[-38, 28], [44, 26], [-45, -55]]) {
        addBox(g, [1.3, 42, 1.3], [x, 20.5, z], darkSteel);
        addBox(g, [12, 1.4, 5], [x, 41, z], lampGlow);
    }
    pulse.push(lampGlow);

    const warmHaze = new THREE.PointLight(0xe28c38, 28, 110, 1.8);
    warmHaze.position.set(-34, 22, -38);
    g.add(warmHaze);
    const coolHaze = new THREE.PointLight(0x4a9eaa, 22, 100, 1.8);
    coolHaze.position.set(34, 18, -18);
    g.add(coolHaze);
    g.userData.pulse = pulse;
    return g;
}
