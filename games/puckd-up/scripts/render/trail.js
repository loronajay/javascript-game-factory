import { PUCK_R } from '../config.js';
export function createTrail(THREE, scene) {
    // Fixed-size trail pool: no mesh/material allocation occurs during gameplay.
    const TRAIL_COUNT = 14, TRAIL_THRESHOLD = 13.0, TRAIL_LIFE = .24;
    const trailGeometry = new THREE.BoxGeometry(.22, .025, 1.0);
    const trail = [];
    for (let i = 0; i < TRAIL_COUNT; i++) {
        const material = new THREE.MeshBasicMaterial({ color: 0xa9ddff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(trailGeometry, material);
        mesh.visible = false;
        mesh.position.y = .055;
        scene.add(mesh);
        trail.push({ mesh, material, age: TRAIL_LIFE });
    }
    let trailHead = 0, lastTrailX = 0, lastTrailZ = 0, trailSeeded = false;
    function clearTrail() {
        trailSeeded = false;
        for (const item of trail) {
            item.age = TRAIL_LIFE;
            item.mesh.visible = false;
            item.material.opacity = 0;
        }
    }
    function updateTrail(dt, speed, puckBody, live) {
        for (const item of trail) {
            if (!item.mesh.visible)
                continue;
            item.age += dt;
            if (item.age >= TRAIL_LIFE) {
                item.mesh.visible = false;
                item.material.opacity = 0;
                continue;
            }
            const life = 1 - item.age / TRAIL_LIFE;
            item.material.opacity = .42 * life * life;
            item.mesh.scale.x = .7 + .3 * life;
        }
        if (!live || speed < TRAIL_THRESHOLD) {
            trailSeeded = false;
            return;
        }
        const x = puckBody.position.x, z = puckBody.position.z;
        if (!trailSeeded) {
            lastTrailX = x;
            lastTrailZ = z;
            trailSeeded = true;
            return;
        }
        const dx = x - lastTrailX, dz = z - lastTrailZ;
        if (dx * dx + dz * dz < .12)
            return;
        const vx = puckBody.velocity.x, vz = puckBody.velocity.z;
        const vlen = Math.hypot(vx, vz);
        if (vlen < .001)
            return;
        const nx = vx / vlen, nz = vz / vlen;
        const strength = Math.max(0, Math.min(1, (speed - TRAIL_THRESHOLD) / (29 - TRAIL_THRESHOLD)));
        const segmentLength = .62 + strength * .95;
        const item = trail[trailHead];
        trailHead = (trailHead + 1) % TRAIL_COUNT;
        item.age = 0;
        item.mesh.visible = true;
        // BoxGeometry is centered on its origin. Offset its center opposite velocity so
        // the near end begins just behind the puck rather than extending through/ahead of it.
        const behind = PUCK_R + .04 + segmentLength * .5;
        item.mesh.position.set(x - nx * behind, .055, z - nz * behind);
        item.mesh.rotation.set(0, Math.atan2(vx, vz), 0);
        item.mesh.scale.set(1, 1, segmentLength);
        item.material.opacity = .28 + .22 * strength;
        lastTrailX = x;
        lastTrailZ = z;
    }
    return { clear: clearTrail, update: updateTrail };
}
