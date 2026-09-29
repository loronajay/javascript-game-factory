// What the rider sees of themselves in the saddle (planning-docs/FARM_RIDING_PLAN.md):
// two gloved hands low in front and the reins running from them to the bit. The
// horse itself is its ordinary body (the pet bodies draw it, glued to the ride),
// seen from where the rider sits — its neck, mane, ears and head ahead, moving
// with the gait — so this module only adds the hands and the reins.
//
// The hands follow the HORSE's heading, not the camera's: look round and the
// reins stay where the horse is going, as they would.
import { forwardOf } from "./arcade-room-walker.mjs";
/** Where the bit is on the Quaternius horse, as shares of its height: ahead of its middle, and up. */
export const BIT_AHEAD = 0.58;
export const BIT_UP = 0.63;
export function createRiderView(THREE, scene) {
    const root = new THREE.Group();
    root.name = "rider-view";
    root.visible = false;
    scene.add(root);
    const glove = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.85, metalness: 0 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.8, metalness: 0 });
    const hands = [-1, 1].map(() => {
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), glove);
        hand.scale.set(1.25, 0.8, 1);
        hand.renderOrder = 5;
        root.add(hand);
        return hand;
    });
    const reins = [-1, 1].map(() => {
        const rein = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5), leather);
        root.add(rein);
        return rein;
    });
    const up = new THREE.Vector3(0, 1, 0);
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const along = new THREE.Vector3();
    function stretch(mesh, a, b) {
        along.subVectors(b, a);
        const length = along.length();
        mesh.position.copy(a).addScaledVector(along, 0.5);
        mesh.scale.set(1, Math.max(0.001, length), 1);
        mesh.quaternion.setFromUnitVectors(up, along.normalize());
    }
    return Object.freeze({
        update(pose) {
            root.visible = Boolean(pose);
            if (!pose)
                return;
            const forward = forwardOf(pose.horse.heading);
            const right = { x: -forward.z, z: forward.x };
            const ahead = 0.5 + 0.12 * pose.reach;
            const bit = {
                x: pose.horse.x + forward.x * pose.horse.height * BIT_AHEAD,
                y: pose.horse.y + pose.horse.height * BIT_UP,
                z: pose.horse.z + forward.z * pose.horse.height * BIT_AHEAD,
            };
            hands.forEach((hand, index) => {
                const side = index === 0 ? -1 : 1;
                hand.position.set(pose.eye.x + forward.x * ahead + right.x * side * 0.09, pose.eye.y - 0.62, pose.eye.z + forward.z * ahead + right.z * side * 0.09);
                hand.rotation.y = pose.horse.heading;
                from.copy(hand.position);
                to.set(bit.x + right.x * side * 0.08, bit.y, bit.z + right.z * side * 0.08);
                stretch(reins[index], from, to);
            });
        },
        dispose() {
            scene.remove(root);
            glove.dispose();
            leather.dispose();
        },
    });
}
