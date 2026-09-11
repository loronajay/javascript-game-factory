import { W, L, GOAL, RAIL } from '../config.js';
import { createPuckFeedback } from './puck-feedback.js';
import { createMalletAppearance } from './mallet-appearance.js';
import { createSurfaceTexture } from './table-surface.js';

// The table, built as TWO HALVES AND A NEUTRAL CENTRE.
//
// Each player owns the presentation of their own half and nothing else: their
// tabletop, their markings, their rail sections, their goal and their side
// trim. There is no code path that lets one half's config touch the other, and
// no caller can ask for one — `applyHalfAppearance` takes a side and only ever
// writes that side's materials.
//
// THE CENTRE IS SHARED AND STAYS NEUTRAL. The centre band, the face-off ring
// and dot, the centre rail collars and the cabinet body are venue-themed and
// never customized. Two strongly contrasting halves still have to read as ONE
// physical table rather than two textures pasted together, and the shared
// structure running through the middle is what does that.
//
// PRESENTATION ONLY. `tableRails()` — the physics rail geometry — is untouched
// and still comes from `physics/table-layout.js`; the segments below are a
// visual subdivision of the same walls so a rail can be recoloured per half
// without a body moving. The mallet meshes are cosmetic; their bodies are
// constants in `physics/world.js`.

/** How much of the table stays neutral either side of the centre line, in metres. */
const CENTER_BAND = 1.1;

/**
 * The rails as VISUAL segments. The long side rails are cut into a section per
 * half plus a centre collar; end rails and corner deflectors belong to the half
 * they sit in. Same walls, same positions — just drawn in pieces so each half
 * can own its own.
 */
export function visualRailSegments() {
  const segments = [];
  const add = (side, x, z, sx, sz, rot = 0) => segments.push({ side, x, z, sx, sz, rot });
  const end = L / 2 + RAIL;
  const halfSpan = end - CENTER_BAND / 2;

  for (const x of [-W / 2 - RAIL / 2, W / 2 + RAIL / 2]) {
    add('cpu', x, -(CENTER_BAND / 2 + halfSpan / 2), RAIL, halfSpan);
    add('center', x, 0, RAIL, CENTER_BAND);
    add('player', x, CENTER_BAND / 2 + halfSpan / 2, RAIL, halfSpan);
  }

  const endSeg = (W - GOAL) / 2;
  for (const [side, z] of [['cpu', -L / 2 - RAIL / 2], ['player', L / 2 + RAIL / 2]]) {
    add(side, -(GOAL / 2 + endSeg / 2), z, endSeg, RAIL);
    add(side, (GOAL / 2 + endSeg / 2), z, endSeg, RAIL);
  }

  add('cpu', -W / 2 + .18, -L / 2 + .18, 1.25, .32, Math.PI / 4);
  add('cpu', W / 2 - .18, -L / 2 + .18, 1.25, .32, -Math.PI / 4);
  add('player', -W / 2 + .18, L / 2 - .18, 1.25, .32, -Math.PI / 4);
  add('player', W / 2 - .18, L / 2 - .18, 1.25, .32, Math.PI / 4);
  return segments;
}

export function createTable(THREE, scene) {
    const table = new THREE.Group();
    scene.add(table);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W, .45, L), new THREE.MeshStandardMaterial({ color: 0x141b22, roughness: .32, metalness: .18 }));
    bed.position.y = -.25;
    bed.receiveShadow = true;
    table.add(bed);

    // Three field planes: my half, the neutral centre, the opponent's half.
    const fieldWidth = W - .32;
    const halfDepth = (L - .32) / 2 - CENTER_BAND / 2;
    const halfOffset = CENTER_BAND / 2 + halfDepth / 2;
    function makeField(depth, z) {
        const material = new THREE.MeshStandardMaterial({ color: 0x1b2730, roughness: .22, metalness: .09 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(fieldWidth, depth), material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, .005, z);
        mesh.receiveShadow = true;
        table.add(mesh);
        return mesh;
    }
    const fieldCpu = makeField(halfDepth, -halfOffset);
    const fieldCenter = makeField(CENTER_BAND, 0);
    const fieldPlayer = makeField(halfDepth, halfOffset);
    const fieldMaterials = [fieldCpu.material, fieldCenter.material, fieldPlayer.material];

    // Shared markings. The centre division belongs to both players, so neither
    // of them gets to restyle or erase it.
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

    /** One half's own markings: a goal crease and a perimeter inset line. */
    function halfMarkings(sign) {
        const material = new THREE.MeshBasicMaterial({ color: 0x86a1b1, transparent: true, opacity: .45 });
        const crease = new THREE.Mesh(new THREE.RingGeometry(1.42, 1.47, 48, 1, Math.PI, Math.PI), material);
        crease.rotation.x = -Math.PI / 2;
        crease.rotation.z = sign > 0 ? 0 : Math.PI;
        crease.position.set(0, .017, sign * (L / 2 - .05));
        table.add(crease);
        const inset = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.5, .028), material);
        inset.rotation.x = -Math.PI / 2;
        inset.position.set(0, .017, sign * (L / 2 - .62));
        table.add(inset);
        return material;
    }
    const playerMarkingMat = halfMarkings(1), cpuMarkingMat = halfMarkings(-1);

    // Rails: one material pair per half plus a neutral centre pair.
    const railMaterials = Object.fromEntries(['cpu', 'center', 'player'].map(side => [side, {
        body: new THREE.MeshStandardMaterial({ color: 0x343d46, roughness: .22, metalness: .74 }),
        top: new THREE.MeshStandardMaterial({ color: 0x7d8790, roughness: .17, metalness: .88 }),
    }]));
    for (const { side, x, z, sx, sz, rot } of visualRailSegments()) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, .64, sz), railMaterials[side].body);
        mesh.position.set(x, .31, z);
        mesh.rotation.y = rot;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        table.add(mesh);
        const top = new THREE.Mesh(new THREE.BoxGeometry(sx, .08, sz), railMaterials[side].top);
        top.position.set(x, .67, z);
        top.rotation.y = rot;
        table.add(top);
    }
    // Kept for the venue layer, which themes the whole cabinet rather than a half.
    const railVisMat = railMaterials.center.body, railTopMat = railMaterials.center.top;

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

    const puckMesh = new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .22, 48), new THREE.MeshStandardMaterial({ color: 0xe5e9ed, emissive: 0x000000, emissiveIntensity: 0, roughness: .16, metalness: .82 }));
    puckMesh.castShadow = true;
    scene.add(puckMesh);
    const puckRing = new THREE.Mesh(new THREE.TorusGeometry(.33, .035, 10, 48), new THREE.MeshBasicMaterial({ color: 0x20262c }));
    puckRing.rotation.x = Math.PI / 2;
    puckRing.position.y = .12;
    puckMesh.add(puckRing);
    const feedback = createPuckFeedback(THREE, scene, puckMesh);

    // Both mallets come from the shared cosmetic renderer. There is no second
    // mallet builder anywhere in the cabinet.
    const mallets = {
        player: createMalletAppearance(THREE),
        cpu: createMalletAppearance(THREE),
    };
    for (const appearance of Object.values(mallets)) scene.add(appearance.group);

    const sides = {
        player: { field: fieldPlayer, markings: playerMarkingMat, rails: railMaterials.player, goal: playerGoalMat, trim: playerSideAccentMat, flip: false },
        cpu: { field: fieldCpu, markings: cpuMarkingMat, rails: railMaterials.cpu, goal: cpuGoalMat, trim: cpuSideAccentMat, flip: true },
    };
    /** The half config currently equipped per side, or null for "venue default". */
    const equipped = { player: null, cpu: null };
    const surfaceTextures = { player: null, cpu: null };
    const surfaceKeys = { player: '', cpu: '' };

    /**
     * Dress one half.
     *
     * Only this side's materials are written. There is deliberately no "both"
     * and no side-swap: a player owns one half and the API only ever hands the
     * cabinet one half per player.
     */
    function applyHalfAppearance(side, half) {
        const target = sides[side];
        if (!target) return;
        equipped[side] = half;
        if (!half) return;

        const { surface, markings, rails, goal, trim } = half;
        // A canvas texture is regenerated only when a surface parameter moves,
        // never per frame, and the replaced one is disposed.
        const key = JSON.stringify(surface);
        if (surfaceKeys[side] !== key) {
            surfaceKeys[side] = key;
            surfaceTextures[side]?.dispose();
            surfaceTextures[side] = createSurfaceTexture(THREE, surface, { flip: target.flip });
        }
        const material = target.field.material;
        material.map = surfaceTextures[side];
        material.color.set(0xffffff);
        material.roughness = surface.roughness;
        material.metalness = surface.metalness;
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
        material.needsUpdate = true;

        target.markings.color.set(markings.color);
        target.markings.opacity = markings.opacity;

        target.rails.body.color.set(rails.bodyColor);
        target.rails.body.roughness = rails.roughness;
        target.rails.body.metalness = rails.metalness;
        target.rails.top.color.set(rails.topColor);
        target.rails.top.roughness = rails.roughness;
        target.rails.top.metalness = rails.metalness;

        target.goal.color.set(goal.color);
        target.goal.emissive.set(goal.emissiveColor);
        target.goal.emissiveIntensity = goal.glowIntensity;

        target.trim.color.set(trim.color);
        target.trim.emissive.set(trim.color);
        target.trim.emissiveIntensity = trim.glowIntensity;
    }

    /** Drop a half back to the venue's own dressing. */
    function clearHalfAppearance(side) {
        equipped[side] = null;
        surfaceKeys[side] = '';
        surfaceTextures[side]?.dispose();
        surfaceTextures[side] = null;
    }

    /** Re-assert equipped halves after the venue layer has themed the cabinet. */
    function refreshHalves() {
        for (const side of ['cpu', 'player']) if (equipped[side]) applyHalfAppearance(side, equipped[side]);
    }

    function applyMalletAppearance(side, mallet) {
        mallets[side]?.apply(mallet);
    }

    function showCollisionOverlay(visible) {
        for (const appearance of Object.values(mallets)) appearance.showCollision(visible);
    }

    /**
     * The cabinet's side colours.
     *
     * A half with an equipped design owns its own goal and trim, so this leaves
     * those alone rather than painting over the player's saved work every time
     * a rival is selected.
     */
    function applyColors(playerHex, opponentHex) {
        if (!equipped.player) {
            playerGoalMat.color.set(playerHex);
            playerGoalMat.emissive.set(playerHex);
            playerSideAccentMat.color.set(playerHex);
            playerSideAccentMat.emissive.set(playerHex);
        }
        if (!equipped.cpu) {
            cpuGoalMat.color.set(opponentHex);
            cpuGoalMat.emissive.set(opponentHex);
            cpuSideAccentMat.color.set(opponentHex);
            cpuSideAccentMat.emissive.set(opponentHex);
        }
    }

    function sync(bodies) {
        puckMesh.position.copy(bodies.puckBody.position);
        puckMesh.quaternion.copy(bodies.puckBody.quaternion);
        mallets.player.group.position.copy(bodies.player.body.position);
        mallets.cpu.group.position.copy(bodies.cpu.body.position);
    }

    function dispose() {
        for (const appearance of Object.values(mallets)) appearance.dispose();
        for (const texture of Object.values(surfaceTextures)) texture?.dispose();
    }

    return {
        bed, field: fieldCenter, fieldMaterials, railVisMat, railTopMat, railMaterials, lineMat,
        applyColors, applyHalfAppearance, clearHalfAppearance, refreshHalves,
        applyMalletAppearance, showCollisionOverlay,
        handleFeedback: feedback.handle, tickFeedback: feedback.tick, sync, dispose,
    };
}
