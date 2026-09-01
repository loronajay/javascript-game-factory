import { createVenueHelpers } from './helpers.js';

export const PARK_JAM_STYLE = Object.freeze({
    floorSurface: 'grass',
    tableSurface: 'outdoorComposite',
    tableColor: 0x172923,
    overheadSpans: false,
    park: Object.freeze({ width: 72, depth: 90, courtWidth: 38, courtDepth: 52, treeHeight: 10 }),
});

export function buildParkJam(THREE) {
    const { makeStd, makeSurface, addBox, addInstancedBoxes, addSkyDome, addNeonStrip } = createVenueHelpers(THREE);
    const g = new THREE.Group();
    g.name = 'Park Jam';
    const { park } = PARK_JAM_STYLE;
    addSkyDome(g, { top: 0x5e9bd0, bottom: 0xd9d2a4, horizon: 0x9bc0d0, radius: 58, y: 9, z: -10 });

    const grass = makeSurface(PARK_JAM_STYLE.floorSurface, 0x527743, { accent: 0x1f3d25, repeat: [18, 22], seed: 101 });
    const concrete = makeSurface('concrete', 0x85847d, { accent: 0x35383a, repeat: [11, 15], seed: 113 });
    const concreteDark = makeSurface('concrete', 0x5d6266, { accent: 0x292d30, repeat: [4, 4], seed: 127, roughness: .86 });
    const trunkMat = makeStd(0x604129, { roughness: .95 });
    const leafMat = makeStd(0x34613b, { roughness: .91 });
    const metal = makeStd(0x353b3d, { roughness: .62, metalness: .55 });
    const wood = makeStd(0x765238, { roughness: .90, metalness: .01 });

    addBox(g, [park.width, .45, park.depth], [0, -.75, -8], grass);
    addBox(g, [park.courtWidth, .18, park.courtDepth], [0, -.49, -1], concrete);

    // Full-size rec-court paint creates a broad circulation zone around the table.
    const courtMarkings = [];
    for (const side of [-1, 1]) {
        courtMarkings.push({ x: side * 15.3, y: -.385, z: -1, sx: .10, sy: .018, sz: 45 });
        courtMarkings.push({ x: side * 10.4, y: -.383, z: -1, sx: .07, sy: .018, sz: 35 });
    }
    for (const z of [-22.5, -13, 11, 20.5])
        courtMarkings.push({ x: 0, y: -.384, z, sx: 30.6, sy: .018, sz: .10 });
    addInstancedBoxes(g, courtMarkings, makeStd(0xd2b957, { roughness: .82, transparent: true, opacity: .52 }));

    const patchMarks = [];
    for (const [x, z, sx, sz] of [[-15.8, -18, 2.6, .34], [14.9, -9, 2.2, .28], [-16.2, 6, 2.0, .25], [15.5, 17, 2.8, .34]])
        patchMarks.push({ x, y: -.381, z, sx, sy: .016, sz, ry: x < 0 ? -.18 : .16 });
    addInstancedBoxes(g, patchMarks, makeStd(0x4a8494, { roughness: .84, transparent: true, opacity: .42 }));

    // Mature trees line the park perimeter instead of crowding the table rails.
    const trunks = [];
    const leaves = [];
    const treePositions = [
        [-23, -29], [-22, -15], [-23, 1], [-22, 17],
        [23, -29], [22, -15], [23, 1], [22, 17],
        [-12, -38], [0, -41], [12, -38], [-28, 28], [28, 28],
    ];
    for (const [x, z] of treePositions) {
        trunks.push({ x, y: 4.48, z, sx: .85, sy: park.treeHeight, sz: .85 });
        leaves.push({ x, y: 10.2, z, sx: 5.2, sy: 4.1, sz: 5.2 });
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

    // A community mural anchors the far court edge with space behind it for the larger park.
    const muralColors = [0xa54a42, 0x417e93, 0xc08a35, 0x815ca1];
    addBox(g, [37, 6.6, .65], [0, 2.65, -25.0], makeStd(0x41464a, { roughness: .86 }));
    for (let i = 0; i < 4; i++)
        addBox(g, [8.3, 5.4, .18], [-13.2 + i * 8.8, 2.65, -24.62], makeStd(muralColors[i], { roughness: .8 }));
    addNeonStrip(g, [35.2, .11, .10], [0, 5.48, -24.50], 0x56b5d7, .42);

    // Skate zones occupy separate side pads, leaving the main court and sightline untouched.
    for (const side of [-1, 1]) {
        addBox(g, [9.0, .55, 5.2], [side * 14.8, -.04, -9.5], concreteDark, [0, 0, side * -.16]);
        addBox(g, [6.5, .38, 2.2], [side * 15.3, -.12, 7.0], concreteDark, [0, 0, side * .10]);
        addBox(g, [4.6, .16, .85], [side * 14.2, .08, 16.5], wood);
        addBox(g, [.16, .90, .16], [side * 14.2 - 1.55, -.30, 16.5], metal);
        addBox(g, [.16, .90, .16], [side * 14.2 + 1.55, -.30, 16.5], metal);
    }

    // Regulation-height park lights sit outside the court sidelines.
    for (const x of [-18.0, 18.0]) {
        for (const z of [-15, 10]) {
            addBox(g, [.22, 11.0, .22], [x, 4.98, z], metal);
            addBox(g, [1.3, .18, .55], [x, 10.55, z], makeStd(0xffe1a8, { roughness: .15, metalness: .2, emissive: 0xffe1a8, emissiveIntensity: 1.15 }));
        }
    }

    // Low perimeter fencing adds depth without placing anything above the table.
    const fencePosts = [];
    for (const side of [-1, 1])
        for (let z = -31; z <= 28; z += 7.5)
            fencePosts.push({ x: side * 27.5, y: 1.8, z, sx: .16, sy: 4.6, sz: .16 });
    addInstancedBoxes(g, fencePosts, metal);
    for (const x of [-27.5, 27.5]) {
        addBox(g, [.14, .14, 60], [x, 3.75, -1.5], metal);
        addBox(g, [.14, .12, 60], [x, .65, -1.5], metal);
    }

    // Deep background layers: elevated transit and a varied skyline far beyond the mural.
    const skyline = [];
    for (let i = 0; i < 17; i++)
        skyline.push({ x: -31 + i * 3.9, y: 5.0 + (i % 5) * 1.1, z: -47 - (i % 3) * 1.4, sx: 2.8, sy: 11 + (i % 5) * 2.7, sz: 2.8 });
    addInstancedBoxes(g, skyline, makeStd(0x637683, { roughness: .78 }));
    addBox(g, [56, 1.1, 2.0], [0, 9.0, -36.0], makeStd(0x696860, { roughness: .88 }));
    for (const x of [-20, 0, 20])
        addBox(g, [2.5, 10.2, 2.4], [x, 4.1, -36.0], makeStd(0x585954, { roughness: .9 }));

    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe4aa }));
    sun.position.set(-20, 16, -48);
    g.add(sun);
    g.userData.pulse = [];
    return g;
}
