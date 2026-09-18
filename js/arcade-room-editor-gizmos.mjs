// The editor's in-scene widgets: resize handles on the selected item and the
// alignment guides drawn while something moves.
//
// This is the THREE side of `arcade-room-decor-resize.mts` and
// `arcade-room-decor-align.mts`. Those decide WHERE a handle is and WHAT a
// guide is; this file only draws what it is handed and answers "which handle
// is under the pointer". Nothing here reads the layout.
//
// Handles are built once and re-posed, never rebuilt per frame, and they are
// kept a constant size on screen — an arrow that is comfortable to grab up
// close would be a speck from the overview, so each one is scaled by its
// distance to the camera on every frame.
const HANDLE_COLOR = 0xffd33d;
const ACTIVE_COLOR = 0xffffff;
const GUIDE_COLOR = 0x70e8ff;
/** Handle size at one metre from the camera; grows linearly with distance so it holds on screen. */
const HANDLE_SCREEN_SIZE = 0.055;
/** How far a handle stands off the surface, in metres at scale 1, so it is never buried in the wall. */
const HANDLE_LIFT = 0.06;
const MAX_HANDLES = 4;
function sameHandle(a, b) {
    if (!a || !b || a.kind !== b.kind)
        return false;
    return a.kind === "stretch" ? a.end === b.end : a.u === b.u && a.v === b.v;
}
export function createEditorGizmos(THREE, scene) {
    const group = new THREE.Group();
    group.name = "editor-gizmos";
    group.visible = false;
    scene.add(group);
    const material = new THREE.MeshBasicMaterial({ color: HANDLE_COLOR, depthTest: false, transparent: true, opacity: 0.95 });
    const activeMaterial = new THREE.MeshBasicMaterial({ color: ACTIVE_COLOR, depthTest: false, transparent: true, opacity: 1 });
    const outline = new THREE.MeshBasicMaterial({ color: 0x1a1d24, depthTest: false, transparent: true, opacity: 0.85, side: THREE.BackSide });
    // A stretch handle is an arrow: a shaft and a head pointing along +Y in its own frame.
    const arrowShaft = new THREE.CylinderGeometry(0.16, 0.16, 0.7, 12);
    const arrowHead = new THREE.ConeGeometry(0.42, 0.7, 16);
    // A scale handle is a cube.
    const grip = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const slots = [];
    for (let index = 0; index < MAX_HANDLES; index += 1) {
        const root = new THREE.Group();
        root.visible = false;
        root.renderOrder = 12;
        group.add(root);
        slots.push({ root, meshes: [], handle: null });
    }
    let active = null;
    const up = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();
    function clearSlot(slot) {
        for (const mesh of slot.meshes)
            slot.root.remove(mesh);
        slot.meshes = [];
        slot.handle = null;
        slot.root.visible = false;
    }
    function fill(slot, handle, normal) {
        clearSlot(slot);
        const parts = [];
        const add = (geometry, position) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...position);
            mesh.renderOrder = 12;
            mesh.userData.handle = handle;
            const rim = new THREE.Mesh(geometry, outline);
            rim.position.set(...position);
            rim.scale.setScalar(1.18);
            rim.renderOrder = 11;
            slot.root.add(rim, mesh);
            parts.push(rim, mesh);
        };
        if (handle.kind === "stretch") {
            add(arrowShaft, [0, 0.35, 0]);
            add(arrowHead, [0, 1.05, 0]);
            direction.set(handle.direction.x, handle.direction.y, handle.direction.z).normalize();
            slot.root.quaternion.setFromUnitVectors(up, direction);
        }
        else {
            add(grip, [0, 0, 0]);
            slot.root.quaternion.identity();
        }
        slot.meshes = parts;
        slot.handle = handle;
        slot.root.position.set(handle.point.x + normal.x * HANDLE_LIFT, handle.point.y + normal.y * HANDLE_LIFT, handle.point.z + normal.z * HANDLE_LIFT);
        slot.root.userData.normal = { ...normal };
        slot.root.visible = true;
    }
    function setHandles(handles, normal) {
        handles.slice(0, MAX_HANDLES).forEach((handle, index) => fill(slots[index], handle, normal));
        for (let index = handles.length; index < MAX_HANDLES; index += 1)
            clearSlot(slots[index]);
        group.visible = handles.length > 0;
        setActive(active);
    }
    function setActive(handle) {
        active = handle;
        for (const slot of slots) {
            const held = sameHandle(slot.handle, handle);
            for (const mesh of slot.meshes) {
                if (mesh.material === material || mesh.material === activeMaterial)
                    mesh.material = held ? activeMaterial : material;
            }
        }
    }
    function pick(raycaster) {
        if (!group.visible)
            return undefined;
        const meshes = slots.flatMap((slot) => slot.root.visible ? slot.meshes : []);
        return raycaster.intersectObjects(meshes, false)[0]?.object.userData.handle;
    }
    function update(camera) {
        if (!group.visible)
            return;
        for (const slot of slots) {
            if (!slot.root.visible)
                continue;
            const distance = camera.position.distanceTo(slot.root.position);
            slot.root.scale.setScalar(Math.max(0.05, distance * HANDLE_SCREEN_SIZE));
        }
    }
    // Guides: one line-segments mesh whose buffer is replaced when the guides change.
    const guideMaterial = new THREE.LineBasicMaterial({ color: GUIDE_COLOR, depthTest: false, transparent: true, opacity: 0.95 });
    const guideGeometry = new THREE.BufferGeometry();
    const guideLines = new THREE.LineSegments(guideGeometry, guideMaterial);
    guideLines.renderOrder = 11;
    guideLines.frustumCulled = false;
    guideLines.visible = false;
    scene.add(guideLines);
    // A dot at each end so a guide reads as "this edge to that edge" and not as a stray line.
    const dotGeometry = new THREE.SphereGeometry(0.035, 8, 6);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: GUIDE_COLOR, depthTest: false, transparent: true, opacity: 0.95 });
    const dots = new THREE.InstancedMesh(dotGeometry, dotMaterial, 16);
    dots.renderOrder = 11;
    dots.frustumCulled = false;
    dots.visible = false;
    dots.count = 0;
    scene.add(dots);
    const dotMatrix = new THREE.Matrix4();
    function setGuides(guides) {
        if (!guides.length) {
            guideLines.visible = false;
            dots.visible = false;
            return;
        }
        const points = [];
        let dotCount = 0;
        for (const guide of guides) {
            points.push(guide.from.x, guide.from.y, guide.from.z, guide.to.x, guide.to.y, guide.to.z);
            for (const end of [guide.from, guide.to]) {
                if (dotCount >= 16)
                    break;
                dotMatrix.makeTranslation(end.x, end.y, end.z);
                dots.setMatrixAt(dotCount, dotMatrix);
                dotCount += 1;
            }
        }
        guideGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
        guideGeometry.computeBoundingSphere();
        dots.count = dotCount;
        dots.instanceMatrix.needsUpdate = true;
        guideLines.visible = true;
        dots.visible = true;
    }
    function dispose() {
        for (const slot of slots)
            clearSlot(slot);
        for (const geometry of [arrowShaft, arrowHead, grip, guideGeometry, dotGeometry])
            geometry.dispose();
        for (const item of [material, activeMaterial, outline, guideMaterial, dotMaterial])
            item.dispose();
        scene.remove(group, guideLines, dots);
    }
    return Object.freeze({ setHandles, pick, setActive, setGuides, update, dispose });
}
