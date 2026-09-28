// The shadows on the water: every shadow the server published, drawn where
// its path puts it (farm-fish.mts `shadowAt`), so everyone in the Cove sees
// the same fish in the same place.
//
// A shadow is a SILHOUETTE, never the fish: the server keeps what it is, so
// the eye gets only its size, and a fin cutting the surface for an Epic or
// Legendary fish. A shadow the player has already caught is gone for them; one
// that sees a lure (the page says which) turns and swims to it.
import { COVE_WATER_LEVEL } from "./farm-cove.mjs";
import { shadowAt } from "./farm-fish.mjs";
/** How long a silhouette of each size is, in metres. */
export const SHADOW_LENGTH = Object.freeze({ s: 0.28, m: 0.55, l: 1.1, xl: 2.2 });
const DEPTH = 0.4;
function silhouetteGeometry(THREE) {
    // A fish seen from above: a teardrop body and a forked tail, in the xz plane, nose along −z.
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.bezierCurveTo(0.2, -0.42, 0.22, 0.1, 0.06, 0.32);
    shape.lineTo(0.18, 0.5);
    shape.lineTo(0, 0.4);
    shape.lineTo(-0.18, 0.5);
    shape.lineTo(-0.06, 0.32);
    shape.bezierCurveTo(-0.22, 0.1, -0.2, -0.42, 0, -0.5);
    const geometry = new THREE.ShapeGeometry(shape, 10);
    geometry.rotateX(Math.PI / 2);
    return geometry;
}
export function createShadowsView(THREE, scene) {
    const root = new THREE.Group();
    root.name = "cove-shadows";
    scene.add(root);
    const geometry = silhouetteGeometry(THREE);
    const finGeometry = new THREE.BufferGeometry();
    finGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.1, 0, 0.32, 0.12, 0, 0, 0.22], 3));
    finGeometry.computeVertexNormals();
    const finMaterial = new THREE.MeshStandardMaterial({ color: "#26323a", roughness: 0.6, side: THREE.DoubleSide });
    const drawn = new Map();
    let hidden = new Set();
    let lured = null;
    function build(shadow) {
        const group = new THREE.Group();
        const length = SHADOW_LENGTH[shadow.size];
        // Both faces: the silhouette is flat, and it is seen from above.
        const material = new THREE.MeshBasicMaterial({ color: "#07131a", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        const body = new THREE.Mesh(geometry, material);
        body.scale.setScalar(length);
        body.position.y = COVE_WATER_LEVEL - DEPTH;
        body.renderOrder = 1;
        group.add(body);
        let fin = null;
        if (shadow.fin) {
            fin = new THREE.Mesh(finGeometry, finMaterial);
            fin.scale.setScalar(Math.max(0.6, length * 0.55));
            fin.position.y = COVE_WATER_LEVEL - 0.08;
            fin.castShadow = false;
            group.add(fin);
        }
        root.add(group);
        return { shadow, group, body, fin, wake: 0, x: shadow.path.cx, z: shadow.path.cz, heading: 0, placed: false };
    }
    function remove(entry) {
        entry.group.removeFromParent();
        entry.body.material.dispose();
        drawn.delete(entry.shadow.id);
    }
    return Object.freeze({
        sync(shadows) {
            const seen = new Set();
            for (const shadow of shadows) {
                seen.add(shadow.id);
                if (!drawn.has(shadow.id))
                    drawn.set(shadow.id, build(shadow));
            }
            for (const entry of [...drawn.values()])
                if (!seen.has(entry.shadow.id))
                    remove(entry);
        },
        hide(ids) {
            hidden = ids;
        },
        lure(id, point) {
            lured = id && point ? { id, point: { x: point.x, z: point.z } } : null;
        },
        update(now, dt) {
            for (const entry of drawn.values()) {
                const at = shadowAt(entry.shadow, now);
                if (!at || hidden.has(entry.shadow.id)) {
                    entry.group.visible = false;
                    entry.placed = false;
                    if (at === null && now > entry.shadow.goneAt + 10_000)
                        remove(entry);
                    continue;
                }
                entry.group.visible = true;
                let targetX = at.x;
                let targetZ = at.z;
                let heading = at.heading;
                if (lured?.id === entry.shadow.id) {
                    // It saw the lure: nose to it, and come in slowly.
                    const dx = lured.point.x - entry.x;
                    const dz = lured.point.z - entry.z;
                    const distance = Math.hypot(dx, dz);
                    heading = Math.atan2(-dx, -dz);
                    const step = Math.min(distance, dt * 0.8);
                    targetX = entry.x + (distance > 0.3 ? (dx / distance) * step : 0);
                    targetZ = entry.z + (distance > 0.3 ? (dz / distance) * step : 0);
                }
                if (!entry.placed) {
                    entry.x = targetX;
                    entry.z = targetZ;
                    entry.heading = heading;
                    entry.placed = true;
                }
                else {
                    const ease = 1 - Math.exp(-dt * 6);
                    entry.x += (targetX - entry.x) * ease;
                    entry.z += (targetZ - entry.z) * ease;
                    let turn = heading - entry.heading;
                    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
                    entry.heading += turn * ease;
                }
                entry.group.position.set(entry.x, 0, entry.z);
                entry.group.rotation.y = entry.heading;
                entry.wake += dt;
                // A swimming fish's body flexes a little side to side.
                entry.body.rotation.y = Math.sin(entry.wake * 5) * 0.12;
                entry.body.material.opacity = 0.5 * at.fade;
                if (entry.fin)
                    entry.fin.visible = at.fade > 0.5;
            }
        },
        dispose() {
            for (const entry of [...drawn.values()])
                remove(entry);
            root.removeFromParent();
        },
    });
}
