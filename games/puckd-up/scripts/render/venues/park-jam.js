import { createVenueHelpers } from './helpers.js';
export function buildParkJam(THREE) {
    const { makeStd, addBox, addInstancedBoxes, addSkyDome, addNeonStrip, addLampPost } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Park Jam';
    addSkyDome(g, { top: 0x5e9bd0, bottom: 0xd9d2a4, horizon: 0x9bc0d0, radius: 48, y: 7, z: -7 });
    const grass = makeStd(0x496b3d, { roughness: .94 });
    const concrete = makeStd(0x787a76, { roughness: .88 });
    const concreteDark = makeStd(0x4f5358, { roughness: .84 });
    const trunkMat = makeStd(0x604129, { roughness: .95 });
    const leafMat = makeStd(0x34613b, { roughness: .91 });
    const metal = makeStd(0x353b3d, { roughness: .62, metalness: .55 });
    addBox(g, [36, .45, 42], [0, -.75, -2], grass);
    addBox(g, [21, .18, 27], [0, -.49, -.5], concrete);
    const trunks = [], leaves = [];
    const treePositions = [[-10, -11], [-10, -5], [-9, 4], [10, -11], [10, -4], [9, 5], [-6, -15], [6, -15], [-12, 8], [12, 8]];
    for (const [x, z] of treePositions) {
        trunks.push({ x, y: .7, z, sx: .35, sy: 3.0, sz: .35 });
        leaves.push({ x, y: 2.7, z, sx: 2.15, sy: 1.55, sz: 2.15 });
    }
    addInstancedBoxes(g, trunks, trunkMat);
    const leafMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leafMat, leaves.length);
    const d = new THREE.Object3D();
    leaves.forEach((t, i) => {
        d.position.set(t.x, t.y, t.z);
        d.scale.set(t.sx, t.sy, t.sz);
        d.updateMatrix();
        leafMesh.setMatrixAt(i, d.matrix);
    });
    leafMesh.instanceMatrix.needsUpdate = true;
    g.add(leafMesh);
    // Murals form a recognizable back wall but stay low.
    const muralColors = [0xa54a42, 0x417e93, 0xc08a35, 0x815ca1];
    for (let i = 0; i < 4; i++)
        addBox(g, [4.2, 2.25, .38], [-6.5 + i * 4.35, .55, -13.0], makeStd(muralColors[i], { roughness: .8 }));
    addNeonStrip(g, [15.5, .08, .08], [0, 1.75, -12.78], 0x56b5d7, .45);
    // Skatepark forms and benches add venue identity without entering the table volume.
    addBox(g, [5.0, .32, 2.5], [-7.5, -.08, -7.1], concreteDark, [0, 0, .18]);
    addBox(g, [5.0, .32, 2.5], [7.5, -.08, -7.1], concreteDark, [0, 0, -.18]);
    addBox(g, [3.8, .25, 1.0], [-8.0, -.18, 3.8], concreteDark);
    addBox(g, [3.8, .25, 1.0], [8.0, -.18, 3.8], concreteDark);
    for (const x of [-7.2, 7.2]) {
        addBox(g, [2.2, .12, .55], [x, .05, 7.0], makeStd(0x6e5338, { roughness: .9 }));
        addBox(g, [.12, .55, .12], [x - .75, -.20, 7.0], metal);
        addBox(g, [.12, .55, .12], [x + .75, -.20, 7.0], metal);
    }
    addLampPost(g, -8.7, -1.0);
    addLampPost(g, 8.7, -1.0);
    addLampPost(g, -8.7, 7.2);
    addLampPost(g, 8.7, 7.2);
    // Real depth behind the park: elevated transit + skyline.
    const skyline = [];
    for (let i = 0; i < 15; i++)
        skyline.push({ x: -15 + i * 2.1, y: 1.8 + (i % 5) * .5, z: -22 - (i % 3) * .7, sx: 1.45, sy: 4.6 + (i % 5) * 1.1, sz: 1.5 });
    addInstancedBoxes(g, skyline, makeStd(0x637683, { roughness: .78 }));
    addBox(g, [31, .70, 1.25], [0, 5.2, -17.2], makeStd(0x696860, { roughness: .88 }));
    addBox(g, [2.0, 6.2, 1.7], [-10, 2.1, -17.2], makeStd(0x585954, { roughness: .9 }));
    addBox(g, [2.0, 6.2, 1.7], [10, 2.1, -17.2], makeStd(0x585954, { roughness: .9 }));
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe4aa }));
    sun.position.set(-12, 10, -24);
    g.add(sun);
    g.userData.pulse = [];
    return g;
}
