import { createVenueHelpers } from './helpers.js';

export const COMPETITION_CIRCUIT_STYLE = Object.freeze({
    floorSurface: 'arenaFloor',
    tableSurface: 'tournamentComposite',
    tableColor: 0x18242d,
    overheadSpans: false,
    bowl: Object.freeze({ width: 64, depth: 80, tiers: 8, tierRise: 1.15 }),
});

export function buildCompetitionCircuit(THREE) {
    const { makeStd, makeSurface, addBox, addInstancedBoxes, makePoints, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Competition Circuit';
    const { bowl } = COMPETITION_CIRCUIT_STYLE;
    addSkyDome(g, { top: 0x050810, bottom: 0x101820, horizon: 0x172633, radius: 58, y: 7, z: -9 });

    const floorMat = makeSurface(COMPETITION_CIRCUIT_STYLE.floorSurface, 0x121d25, {
        accent: 0x355064, repeat: [10, 14], seed: 41, roughness: .54, metalness: .12,
    });
    const concourse = makeSurface('concrete', 0x202a31, {
        accent: 0x0d1216, repeat: [9, 13], seed: 47, roughness: .78, metalness: .08,
    });
    const steel = makeStd(0x465562, { roughness: .28, metalness: .82 });
    const dark = makeStd(0x111820, { roughness: .52, metalness: .32 });
    const seat = makeSurface('rubber', 0x293946, { accent: 0x0d141a, repeat: [3, 12], seed: 53, roughness: .67, metalness: .10 });
    const blue = makeStd(0x2b8fca, { roughness: .18, metalness: .48, emissive: 0x2b8fca, emissiveIntensity: 1.0 });
    const red = makeStd(0xd24c4c, { roughness: .18, metalness: .45, emissive: 0xd24c4c, emissiveIntensity: .95 });
    const white = makeStd(0xc9e8ff, { roughness: .15, metalness: .42, emissive: 0x8cc8ed, emissiveIntensity: .85 });

    addBox(g, [bowl.width, .38, bowl.depth], [0, -.70, -8], floorMat);
    // A broad competition deck separates the table from the spectator bowl.
    addBox(g, [20, .16, 28], [0, -.55, -1], concourse);
    for (const x of [-9.8, 9.8])
        addNeonStrip(g, [.10, .06, 27.5], [x, -.43, -1], x < 0 ? 0xd24c4c : 0x2b8fca, 1.25);
    for (const z of [-14.7, 12.7])
        addNeonStrip(g, [19.6, .06, .10], [0, -.43, z], z < 0 ? 0xc9e8ff : 0x50606c, 1.0);

    // Eight substantial side tiers sit well beyond the circulation lanes.
    const stands = [];
    const tierEdges = [];
    for (const side of [-1, 1]) {
        for (let tier = 0; tier < bowl.tiers; tier++) {
            const x = side * (14.5 + tier * 1.25);
            const y = -.12 + tier * bowl.tierRise;
            stands.push({ x, y, z: -7, sx: 2.2, sy: 1.30, sz: 52 });
            for (const z of [-20, -7, 6, 17])
                tierEdges.push({ x, y: y + .68, z, sx: 2.08, sy: .08, sz: 5.5 });
        }
    }
    addInstancedBoxes(g, stands, seat);
    addInstancedBoxes(g, tierEdges, white);

    // The far bowl continues another eight tiers behind a wide service lane.
    const endStands = [];
    const endSeatBands = [];
    for (let tier = 0; tier < bowl.tiers; tier++) {
        const y = -.12 + tier * bowl.tierRise;
        const z = -21.0 - tier * 1.25;
        endStands.push({ x: 0, y, z, sx: 34 + tier * 1.6, sy: 1.30, sz: 2.2 });
        for (const x of [-12, -4, 4, 12])
            endSeatBands.push({ x, y: y + .68, z, sx: 5.2, sy: .08, sz: 2.05 });
    }
    addInstancedBoxes(g, endStands, seat);
    addInstancedBoxes(g, endSeatBands, blue);

    // Large entry tunnels give the distant end a legible human-scale destination.
    for (const x of [-10.5, 10.5]) {
        addBox(g, [5.2, 6.2, 1.2], [x, 2.45, -21.0], dark);
        addBox(g, [3.8, 4.7, 1.28], [x, 1.82, -20.92], makeStd(0x05090d, { roughness: .72, metalness: .08 }));
        addNeonStrip(g, [4.0, .13, .12], [x, 4.20, -20.20], x < 0 ? 0xd24c4c : 0x2b8fca, 1.35);
        for (const edgeX of [-1.88, 1.88])
            addNeonStrip(g, [.12, 4.55, .12], [x + edgeX, 1.90, -20.20], x < 0 ? 0xd24c4c : 0x2b8fca, 1.15);
    }

    // The broadcast wall is mounted behind the bowl; no rigging crosses the playfield.
    addBox(g, [28, 10.5, .65], [0, 7.3, -33.4], dark);
    addBox(g, [24.8, 7.4, .16], [0, 7.3, -33.0], makeStd(0x07121b, { roughness: .12, metalness: .35, emissive: 0x123a50, emissiveIntensity: .62 }));
    addNeonStrip(g, [9.6, .18, .10], [-6.2, 7.45, -32.84], 0xd24c4c, 1.55);
    addNeonStrip(g, [9.6, .18, .10], [6.2, 7.45, -32.84], 0x2b8fca, 1.55);
    addNeonStrip(g, [23.8, .14, .10], [0, 4.15, -32.82], 0xc9e8ff, 1.15);

    // Tall perimeter pylons convey stadium scale while remaining far outside the table corridor.
    for (const x of [-25.5, 25.5]) {
        for (const z of [-19, 10]) {
            addBox(g, [.55, 14.5, .55], [x, 6.55, z], steel);
            addNeonStrip(g, [.14, 11.8, .14], [x + (x < 0 ? .36 : -.36), 6.2, z], x < 0 ? 0xd24c4c : 0x2b8fca, 1.2);
        }
    }

    const crowdA = makePoints(g, 1500, 0x8ec5e5, [54, 10, 55], [0, 4.0, -8], .065, 41);
    const crowdB = makePoints(g, 1050, 0xd46666, [52, 9, 45], [0, 3.6, -12], .055, 53);
    crowdB.material.opacity = .44;

    // Fixtures remain on the extreme sidelines, aimed into the far half.
    const spotL = new THREE.SpotLight(0xbce5ff, 13, 42, .42, .55, 1.5);
    spotL.position.set(-23, 13, -17);
    spotL.target.position.set(-1, 0, -2);
    g.add(spotL, spotL.target);
    const spotR = new THREE.SpotLight(0xffffff, 11, 42, .42, .55, 1.5);
    spotR.position.set(23, 13, -17);
    spotR.target.position.set(1, 0, -2);
    g.add(spotR, spotR.target);

    g.userData.pulse = [blue, red, white];
    g.userData.crowd = [crowdA, crowdB];
    return g;
}
