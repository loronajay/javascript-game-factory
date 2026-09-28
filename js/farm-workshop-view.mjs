// Carpentry, in the world: the board on the Workbench while a piece is being
// made (pencil marks, the cut, the nail heads — the bench model's own handle,
// `group.userData.workbench`), and the finished piece set down in front of
// the bench in the finish it earned, until the player walks off or the next
// piece starts. The bench model lives in farm-props-furniture.mts; this file
// only drives it.
import { WORKBENCH_ANCHORS, createFurniturePiece } from "./farm-props-furniture.mjs";
import { findFarmDecor } from "./farm-catalog/decor.mjs";
export function createWorkshopView(THREE, scene, world) {
    let bench = null;
    let showcase = null;
    function handleOf(row) {
        const model = row ? world.modelFor(row.instanceId) : undefined;
        return model?.userData?.workbench ?? null;
    }
    function clearShowcase() {
        if (!showcase)
            return;
        scene.remove(showcase);
        showcase.traverse?.((child) => child.geometry?.dispose?.());
        showcase = null;
    }
    function begin(row) {
        clearShowcase();
        bench = row;
        handleOf(row)?.setWork("measure");
    }
    function finish(row, itemId, stars) {
        handleOf(row)?.setWork("idle");
        clearShowcase();
        const definition = findFarmDecor(itemId);
        if (!definition)
            return;
        showcase = createFurniturePiece(THREE, definition.model, itemId, stars);
        // In front of the bench, turned to face the player who made it.
        const { showcase: at } = WORKBENCH_ANCHORS;
        const cos = Math.cos(row.rotationY);
        const sin = Math.sin(row.rotationY);
        showcase.position.set(row.x + at.x * cos + at.z * sin, 0, row.z - at.x * sin + at.z * cos);
        showcase.rotation.y = row.rotationY;
        scene.add(showcase);
    }
    return Object.freeze({
        begin,
        step: (kind) => handleOf(bench)?.setWork(kind),
        progress: (done) => handleOf(bench)?.setProgress(done),
        finish,
        cancel() {
            handleOf(bench)?.setWork("idle");
            bench = null;
        },
        sync(decor) {
            if (bench && !decor.some((row) => row.instanceId === bench.instanceId))
                bench = null;
            // The showcase is a moment, not furniture: any change to the field clears it.
            clearShowcase();
        },
    });
}
