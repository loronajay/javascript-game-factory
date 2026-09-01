import { createVenueHelpers } from './helpers.js';
export function buildCompetitionCircuit(THREE) {
    const { makeStd, makeSurface, addBox, addInstancedBoxes, makePoints, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Competition Circuit';
    addSkyDome(g, { top: 0x070b12, bottom: 0x10151a, horizon: 0x111b24, radius: 45, y: 5, z: -6 });
    const floorMat = makeSurface('arenaFloor', 0x111a22, { accent: 0x05080b, repeat: [7, 10], seed: 41, roughness: .48, metalness: .18 });
    const steel = makeStd(0x38434d, { roughness: .28, metalness: .82 });
    const dark = makeStd(0x151b21, { roughness: .52, metalness: .32 });
    const seat = makeSurface('rubber', 0x26323c, { accent: 0x0d1115, repeat: [2, 9], seed: 53, roughness: .67, metalness: .10 });
    const blue = makeStd(0x2b8fca, { roughness: .18, metalness: .48, emissive: 0x2b8fca, emissiveIntensity: 1.0 });
    const white = makeStd(0xc9e8ff, { roughness: .15, metalness: .42, emissive: 0x8cc8ed, emissiveIntensity: .85 });
    addBox(g, [30, .38, 38], [0, -.70, -2], floorMat);
    // Stadium bowl stays outside the playfield and low enough not to cut through camera view.
    const stands = [];
    for (const side of [-1, 1])
        for (let tier = 0; tier < 5; tier++)
            stands.push({ x: side * (7.7 + tier * .55), y: -.20 + tier * .34, z: -3.2, sx: 1.2, sy: .62, sz: 20 });
    addInstancedBoxes(g, stands, seat);
    const endStands = [];
    for (let tier = 0; tier < 4; tier++)
        endStands.push({ x: 0, y: -.22 + tier * .32, z: -12.2 - tier * .55, sx: 14.5, sy: .55, sz: 1.05 });
    addInstancedBoxes(g, endStands, seat);
    // Vertical truss pylons and rear gantry only. Nothing crosses above the active table/camera line.
    for (const x of [-8.9, 8.9]) {
        addBox(g, [.28, 6.8, .28], [x, 2.8, -10.6], steel);
        addBox(g, [.28, 6.8, .28], [x, 2.8, 6.8], steel);
        addNeonStrip(g, [.10, 5.4, .10], [x + (x < 0 ? .18 : -.18), 2.7, -10.55], x < 0 ? 0x428fcc : 0xd45d5d, 1.2);
    }
    addBox(g, [17.8, .28, .28], [0, 6.05, -10.6], steel);
    addBox(g, [17.8, .18, .18], [0, 5.72, -10.5], white);
    // Broadcast wall/jumbotron is behind the opponent goal and raised, never over the table.
    addBox(g, [10.2, 3.8, .40], [0, 3.25, -14.1], dark);
    addBox(g, [9.3, 2.85, .12], [0, 3.25, -13.86], makeStd(0x07121b, { roughness: .12, metalness: .35, emissive: 0x123a50, emissiveIntensity: .6 }));
    addNeonStrip(g, [3.7, .12, .08], [-2.35, 3.30, -13.73], 0xd24c4c, 1.55);
    addNeonStrip(g, [3.7, .12, .08], [2.35, 3.30, -13.73], 0x2b8fca, 1.55);
    addNeonStrip(g, [8.8, .10, .08], [0, 1.95, -13.71], 0xc9e8ff, 1.15);
    // Perimeter LED strips create the competition-circuit identity without cluttering play.
    for (const x of [-7.0, 7.0]) {
        addNeonStrip(g, [.10, .12, 14], [x, .25, -2.3], x < 0 ? 0xd24c4c : 0x2b8fca, 1.3);
    }
    const crowdA = makePoints(g, 850, 0x8ec5e5, [20, 4.0, 4.5], [0, 2.0, -11.0], .05, 41);
    const crowdB = makePoints(g, 650, 0xd46666, [21, 3.5, 14], [0, 1.55, -2.0], .042, 53);
    crowdB.material.opacity = .48;
    // Two high spotlights point toward the far half, but their fixtures stay outside the view corridor.
    const spotL = new THREE.SpotLight(0xbce5ff, 12, 30, .45, .55, 1.5);
    spotL.position.set(-8.2, 6.4, -9.8);
    spotL.target.position.set(-1, 0, -2);
    g.add(spotL, spotL.target);
    const spotR = new THREE.SpotLight(0xffffff, 10, 30, .45, .55, 1.5);
    spotR.position.set(8.2, 6.4, -9.8);
    spotR.target.position.set(1, 0, -2);
    g.add(spotR, spotR.target);
    g.userData.pulse = [blue, white];
    g.userData.crowd = [crowdA, crowdB];
    return g;
}
