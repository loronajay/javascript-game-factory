import { W, L, GOAL, RAIL } from '../config.js';
import { tableRails } from '../physics/table-layout.js';
export function createTable(THREE, scene) {
    const table = new THREE.Group();
    scene.add(table);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W, .45, L), new THREE.MeshStandardMaterial({ color: 0x141b22, roughness: .32, metalness: .18 }));
    bed.position.y = -.25;
    bed.receiveShadow = true;
    table.add(bed);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(W - .32, L - .32), new THREE.MeshStandardMaterial({ color: 0x1b2730, roughness: .22, metalness: .09 }));
    field.rotation.x = -Math.PI / 2;
    field.position.y = .005;
    field.receiveShadow = true;
    table.add(field);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x86a1b1, transparent: true, opacity: .45 });
    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(W - .7, .035), lineMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = .016;
    table.add(centerLine);
    const centerRing = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.29, 64), lineMat);
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.y = .018;
    table.add(centerRing);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(.09, 24), lineMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = .02;
    table.add(dot);
    const railVisMat = new THREE.MeshStandardMaterial({ color: 0x343d46, roughness: .22, metalness: .74 });
    const railTopMat = new THREE.MeshStandardMaterial({ color: 0x7d8790, roughness: .17, metalness: .88 });
    function addWall(x, z, sx, sz, rot = 0) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, .64, sz), railVisMat);
        mesh.position.set(x, .31, z);
        mesh.rotation.y = rot;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        table.add(mesh);
        const top = new THREE.Mesh(new THREE.BoxGeometry(sx, .08, sz), railTopMat);
        top.position.set(x, .67, z);
        top.rotation.y = rot;
        table.add(top);
    }
    for (const { x, z, sx, sz, rot } of tableRails())
        addWall(x, z, sx, sz, rot);
    const cpuSideAccentMat = new THREE.MeshStandardMaterial({ color: 0x3f7194, emissive: 0x3f7194, emissiveIntensity: .45, roughness: .22, metalness: .5 });
    const playerSideAccentMat = new THREE.MeshStandardMaterial({ color: 0xa14848, emissive: 0xa14848, emissiveIntensity: .45, roughness: .22, metalness: .5 });
    function addSideAccent(z, material) {
        for (const x of [-W / 2 - RAIL / 2, W / 2 + RAIL / 2]) {
            const strip = new THREE.Mesh(new THREE.BoxGeometry(.12, .055, L / 2 - .72), material);
            strip.position.set(x, .715, z);
            table.add(strip);
        }
    }
    addSideAccent(-L / 4, cpuSideAccentMat);
    addSideAccent(L / 4, playerSideAccentMat);
    function goalFrame(z, color) {
        const g = new THREE.Group();
        const postMat = new THREE.MeshStandardMaterial({ color, metalness: .55, roughness: .22, emissive: color, emissiveIntensity: .17 });
        for (const x of [-GOAL / 2, GOAL / 2]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(.12, .65, .75), postMat);
            p.position.set(x, .32, z);
            g.add(p);
        }
        const back = new THREE.Mesh(new THREE.BoxGeometry(GOAL + .15, .10, .16), postMat);
        back.position.set(0, .08, z + (z < 0 ? -.78 : .78));
        g.add(back);
        table.add(g);
        return postMat;
    }
    const cpuGoalMat = goalFrame(-L / 2 - .25, 0x376b8d);
    const playerGoalMat = goalFrame(L / 2 + .25, 0xa14848);
    const puckMesh = new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .22, 48), new THREE.MeshStandardMaterial({ color: 0xe5e9ed, roughness: .16, metalness: .82 }));
    puckMesh.castShadow = true;
    scene.add(puckMesh);
    const puckRing = new THREE.Mesh(new THREE.TorusGeometry(.33, .035, 10, 48), new THREE.MeshBasicMaterial({ color: 0x20262c }));
    puckRing.rotation.x = Math.PI / 2;
    puckRing.position.y = .12;
    puckMesh.add(puckRing);
    function makeMallet(z, color) {
        const grp = new THREE.Group();
        const baseMat = new THREE.MeshStandardMaterial({ color, roughness: .22, metalness: .58 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(.73, .73, .26, 40), baseMat);
        base.castShadow = true;
        grp.add(base);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(.38, .48, .30, 40), new THREE.MeshStandardMaterial({ color: 0x171c22, roughness: .20, metalness: .76 }));
        cap.position.y = .26;
        cap.castShadow = true;
        grp.add(cap);
        scene.add(grp);
        return { mesh: grp, baseMat };
    }
    const player = makeMallet(5.8, 0xa14848), cpu = makeMallet(-5.8, 0x3f7194);
    function applyPlayerColor(hex) {
        player.baseMat.color.set(hex);
        playerGoalMat.color.set(hex);
        playerGoalMat.emissive.set(hex);
        playerSideAccentMat.color.set(hex);
        playerSideAccentMat.emissive.set(hex);
    }
    function sync(bodies) {
        puckMesh.position.copy(bodies.puckBody.position);
        puckMesh.quaternion.copy(bodies.puckBody.quaternion);
        player.mesh.position.copy(bodies.player.body.position);
        cpu.mesh.position.copy(bodies.cpu.body.position);
    }
    return { bed, field, railVisMat, railTopMat, lineMat, applyPlayerColor, sync };
}
