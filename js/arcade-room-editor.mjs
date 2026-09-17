import { findDecor } from "./arcade-room-catalog/decor.mjs";
import { addDecorItem, duplicateDecorItem, nearestWall, placeDecorItem, removeDecorItem, rotateDecorItem, setDecorColor, setDecorLength, setDecorScale, } from "./arcade-room-decor-layout.mjs";
import { createDecorThumbnails } from "./arcade-room-decor-thumbnails.mjs";
import { createEditorPanel } from "./arcade-room-editor-panel.mjs";
import { ROOM_BOUNDS_DEFAULTS, createDefaultRoomLayout, floorObstacles, roomLayoutsEqual, rotatePlacement, setItemHidden, setRoomSurface, updateItemPlacement, } from "./arcade-room-layout.mjs";
import { EDITOR_CAMERA_PRESETS, applyEditorCameraPreset, createEditorCamera, editorCameraPose, orbitEditorCamera, panEditorCamera, zoomEditorCamera, } from "./arcade-room-camera.mjs";
/**
 * Key that flips build mode on and off. It has to be a key rather than only a button because pointer
 * lock hides the cursor, and it cannot be Escape because the browser eats that to release the lock.
 */
export const ROOM_EDITOR_TOGGLE_KEY = "KeyB";
const NUDGE_STEP = 0.1;
const DECOR_SNAP_DEGREES = 15;
const SCALE_STEP = 0.1;
const LENGTH_STEP = 0.1;
const UNDO_DEPTH = 40;
/** A press that travels less than this before release is a click, not an orbit. */
const CLICK_SLOP_PX = 4;
/** How long after the last resize wheel notch the gesture closes and becomes one undo step. */
const WHEEL_GESTURE_MS = 350;
export function createRoomEditor(options) {
    const { THREE, scene, camera, canvas, shell, decor, inventory, cabinets, room, initialLayout, persist, elements, canEnter, onEditingChange } = options;
    const catalog = Object.fromEntries(cabinets.map((entry) => [entry.cabinet.id, entry.footprint]));
    const roomHeight = room.height ?? ROOM_BOUNDS_DEFAULTS.height;
    let layout = initialLayout;
    let selection = layout.items[0] ? { kind: "cabinet", instanceId: layout.items[0].instanceId } : null;
    let tab = "cabinets";
    let decorCategory = "neon";
    let editing = false;
    let dragging = false;
    let saving = false;
    const undoStack = [];
    // A colour or slider drag is one gesture: the layout before it is pushed once, every
    // preview replaces the working layout without a panel re-render, and the commit closes it.
    let gestureOpen = false;
    let previewFrame = 0;
    let wheelGestureTimer;
    const thumbnails = createDecorThumbnails(THREE);
    // Which camera gesture the current pointer owns: orbit on a left-drag over empty floor,
    // pan on a right/middle-drag or a Shift+left-drag anywhere. Decided on pointerdown.
    let cameraGesture = "none";
    let view = createEditorCamera(room);
    const lastPointer = { x: 0, y: 0 };
    // Where a camera gesture began: a press on empty floor that never moves is a click, and a click on nothing deselects.
    const gestureStart = { x: 0, y: 0 };
    // Grab offset between the floor point under the cursor and the item's origin, so a cabinet
    // picked up by its edge stays under the hand instead of snapping its centre to the cursor.
    const dragOffset = { x: 0, z: 0 };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const ceilingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), roomHeight);
    const planeHit = new THREE.Vector3();
    const selectionBox = new THREE.BoxHelper(cabinets[0]?.model, 0x70e8ff);
    selectionBox.material.depthTest = false;
    selectionBox.material.transparent = true;
    selectionBox.material.opacity = 0.9;
    selectionBox.renderOrder = 10;
    selectionBox.visible = false;
    scene.add(selectionBox);
    const panel = createEditorPanel(elements, {
        selectTab: (next) => { tab = next; renderPanel(); },
        selectCabinet: (instanceId) => selectCabinet(instanceId),
        toggleCabinetHidden: (instanceId) => toggleHidden(instanceId),
        setSurface: (kind, id) => setSurface(kind, id),
        setDecorCategory: (category) => { decorCategory = category; renderPanel(); },
        addDecor: (itemId) => addDecor(itemId),
        selectDecor: (instanceId) => selectDecor(instanceId),
        clearSelection: () => clearSelection(),
        removeDecor: (instanceId) => removeDecor(instanceId),
        duplicateDecor: (instanceId) => duplicateDecor(instanceId),
        setDecorColor: (instanceId, color, phase) => editDecor(setDecorColor(layout, instanceId, color), "Colour changed", phase),
        setDecorLength: (instanceId, length, phase) => editDecor(setDecorLength(layout, instanceId, length, room, catalog), "Length changed", phase),
        setDecorScale: (instanceId, scale, phase) => editDecor(setDecorScale(layout, instanceId, scale, room, catalog), "Resized", phase),
        setDecorMount: (instanceId, mount) => remount(instanceId, mount),
    }, { thumbnail: (definition) => thumbnails.get(definition) });
    function selectedCabinet() {
        return selection?.kind === "cabinet" ? layout.items.find((item) => item.instanceId === selection.instanceId) : undefined;
    }
    function selectedDecor() {
        return selection?.kind === "decor" ? layout.decor.find((item) => item.instanceId === selection.instanceId) : undefined;
    }
    function cabinetEntry(cabinetId) {
        return cabinets.find((entry) => entry.cabinet.id === cabinetId);
    }
    function selectedModel() {
        const cabinet = selectedCabinet();
        if (cabinet)
            return cabinet.hidden ? undefined : cabinetEntry(cabinet.cabinetId)?.model;
        const item = selectedDecor();
        return item ? decor.modelFor(item.instanceId) : undefined;
    }
    /** Push the scene into step with the layout: cabinet poses, decor meshes, surfaces, the selection box. */
    function renderScene() {
        for (const placement of layout.items) {
            const entry = cabinetEntry(placement.cabinetId);
            if (!entry)
                continue;
            entry.model.position.set(placement.x, 0, placement.z);
            entry.model.rotation.y = placement.rotationY;
            entry.model.visible = !placement.hidden;
        }
        decor.sync(layout);
        shell.applySurfaces(layout.surfaces);
        const model = selectedModel();
        if (model)
            selectionBox.setFromObject(model);
        selectionBox.visible = editing && Boolean(model);
    }
    function renderPanel() {
        panel.render({ tab, layout, selection, cabinets: cabinets.map((entry) => entry.cabinet), inventory, decorCategory });
        elements.undoButton.disabled = undoStack.length === 0;
    }
    function setStatus(message, state = "ready") {
        elements.status.textContent = message;
        elements.status.dataset.state = state;
    }
    /** Replace the layout, remembering the old one for undo, and redraw everything. */
    function commit(next, message, state = "dirty") {
        if (next === layout)
            return;
        undoStack.push(layout);
        if (undoStack.length > UNDO_DEPTH)
            undoStack.shift();
        layout = next;
        renderScene();
        renderPanel();
        setStatus(message, state);
    }
    function commitDecor(next, message) {
        if (next === layout) {
            setStatus("That change is not possible here.", "error");
            return;
        }
        commit(next, `${message} · unsaved`);
    }
    function pushUndo() {
        undoStack.push(layout);
        if (undoStack.length > UNDO_DEPTH)
            undoStack.shift();
    }
    /** Redraw the scene once per frame however many previews arrive in between. */
    function schedulePreviewRender() {
        if (previewFrame)
            return;
        previewFrame = requestAnimationFrame(() => {
            previewFrame = 0;
            renderScene();
        });
    }
    /**
     * A finish edit (colour, length, size) from the inspector. A PREVIEW opens
     * the gesture on its first call and only redraws the room; the COMMIT closes
     * it, drops the undo step if nothing changed, and lets the panel catch up.
     * A refused edit mid-drag (a prop that would grow into a cabinet) leaves the
     * last accepted value in place and says why.
     */
    function editDecor(result, message, phase) {
        if (phase === "preview") {
            if (!result.valid) {
                setStatus(result.reason === "blocked" ? "No room to grow there · move it first." : "That change is not possible here.", "error");
                return;
            }
            if (!gestureOpen) {
                gestureOpen = true;
                pushUndo();
            }
            layout = result.layout;
            schedulePreviewRender();
            setStatus(`${message} · unsaved`, "dirty");
            return;
        }
        if (gestureOpen) {
            gestureOpen = false;
            if (result.valid)
                layout = result.layout;
            const before = undoStack[undoStack.length - 1];
            if (before && roomLayoutsEqual(before, layout))
                undoStack.pop();
            if (previewFrame) {
                cancelAnimationFrame(previewFrame);
                previewFrame = 0;
            }
            renderScene();
            renderPanel();
            setStatus(result.valid ? `${message} · unsaved` : "No room to grow there · move it first.", result.valid ? "dirty" : "error");
            return;
        }
        if (!result.valid) {
            setStatus(result.reason === "blocked" ? "No room to grow there · move it first." : "That change is not possible here.", "error");
            return;
        }
        commitDecor(result.layout, message);
    }
    /** Resize or stretch the selected item by a step, from a key or a wheel notch. */
    function resizeSelected(direction, phase) {
        const item = selectedDecor();
        const definition = item && findDecor(item.itemId);
        if (!item || !definition)
            return;
        const atLimit = () => setStatus(direction > 0 ? "That's as big as it goes." : "That's as small as it goes.", "error");
        if (definition.scale.enabled) {
            const result = setDecorScale(layout, item.instanceId, item.scale + direction * SCALE_STEP, room, catalog);
            if (result.valid && roomLayoutsEqual(result.layout, layout))
                atLimit();
            else
                editDecor(result, "Resized", phase);
        }
        else if (definition.length.enabled) {
            const result = setDecorLength(layout, item.instanceId, (item.length || definition.length.default) + direction * LENGTH_STEP, room, catalog);
            if (result.valid && roomLayoutsEqual(result.layout, layout))
                atLimit();
            else
                editDecor(result, "Length changed", phase);
        }
        else {
            setStatus(`${definition.title} comes in one size.`, "error");
        }
    }
    function undo() {
        if (gestureOpen)
            return;
        const previous = undoStack.pop();
        if (!previous)
            return;
        layout = previous;
        if (selection && !selectedCabinet() && !selectedDecor())
            selection = null;
        renderScene();
        renderPanel();
        setStatus("Undone · unsaved", "dirty");
    }
    function selectCabinet(instanceId) {
        const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
        if (!item)
            return;
        selection = { kind: "cabinet", instanceId };
        tab = "cabinets";
        renderScene();
        renderPanel();
        const title = cabinetEntry(item.cabinetId)?.cabinet.title ?? "Cabinet";
        setStatus(item.hidden
            ? `${title} is hidden · press H or Show to put it back on the floor.`
            : `${title} selected · drag it, nudge with arrows, Q/R to rotate, H to hide.`);
    }
    function selectDecor(instanceId) {
        const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
        if (!item)
            return;
        selection = { kind: "decor", instanceId };
        tab = "decor";
        renderScene();
        renderPanel();
        const definition = findDecor(item.itemId);
        const hint = item.mount === "wall"
            ? "drag it along the wall, arrows to slide and raise"
            : "drag it, arrows to nudge, Q/R to rotate";
        const size = definition?.scale.enabled ? " · - / + to resize" : definition?.length.enabled ? " · [ / ] to stretch" : "";
        setStatus(`${definition?.title ?? "Item"} selected · ${hint}${size} · Delete to remove.`);
    }
    function clearSelection() {
        if (!selection)
            return;
        selection = null;
        renderScene();
        renderPanel();
        setStatus("Nothing selected · click anything in the room, or add something from the catalog.");
    }
    function setHidden(instanceId, hidden) {
        const result = setItemHidden(layout, instanceId, hidden, room, catalog);
        const title = cabinetEntry(layout.items.find((item) => item.instanceId === instanceId)?.cabinetId ?? "")?.cabinet.title ?? "Cabinet";
        if (!result.valid) {
            setStatus(`No room for ${title} · clear its old spot or the starter spot first.`, "error");
            return;
        }
        selection = { kind: "cabinet", instanceId };
        commit(result.layout, hidden ? `${title} is off the floor · unsaved` : `${title} is back on the floor · unsaved`);
    }
    function toggleHidden(instanceId = selectedCabinet()?.instanceId ?? "") {
        const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
        if (item)
            setHidden(instanceId, !item.hidden);
    }
    function setSurface(kind, id) {
        if (!inventory.owns(id)) {
            setStatus("You do not own that finish yet.", "error");
            return;
        }
        const result = setRoomSurface(layout, kind, id);
        if (!result.valid)
            return;
        commit(result.layout, `${kind[0].toUpperCase()}${kind.slice(1)} changed · unsaved`);
    }
    /** Where a freshly added item lands: near the camera's target so it appears in view. */
    function addTarget(mounts, wallHeight) {
        const target = view.target;
        const mount = mounts[0];
        if (mount === "wall") {
            const wall = nearestWall(target, room);
            const half = { x: room.width / 2, z: room.depth / 2 };
            const point = wall === "north" ? { x: target.x, y: wallHeight, z: -half.z }
                : wall === "south" ? { x: target.x, y: wallHeight, z: half.z }
                    : wall === "east" ? { x: half.x, y: wallHeight, z: target.z }
                        : { x: -half.x, y: wallHeight, z: target.z };
            return { mount, point };
        }
        return { mount, point: { x: target.x, y: mount === "ceiling" ? roomHeight : 0, z: target.z } };
    }
    function addDecor(itemId) {
        const definition = findDecor(itemId);
        if (!definition || !inventory.owns(itemId)) {
            setStatus("You do not own that item yet.", "error");
            return;
        }
        const result = addDecorItem(layout, definition, room, catalog, addTarget(definition.mounts, definition.wallHeight));
        if (!result.valid) {
            setStatus(`No room for ${definition.title} near here · move the view and try again.`, "error");
            return;
        }
        selection = { kind: "decor", instanceId: result.instanceId };
        commit(result.layout, `${definition.title} added · drag it into place · unsaved`);
    }
    function removeDecor(instanceId) {
        const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
        if (!item)
            return;
        if (selection?.kind === "decor" && selection.instanceId === instanceId)
            selection = null;
        commit(removeDecorItem(layout, instanceId), `${findDecor(item.itemId)?.title ?? "Item"} removed · unsaved`);
    }
    function duplicateDecor(instanceId) {
        const result = duplicateDecorItem(layout, instanceId, room, catalog);
        if (!result.valid) {
            setStatus("No room beside it for a copy.", "error");
            return;
        }
        selection = { kind: "decor", instanceId: result.instanceId };
        commit(result.layout, "Copied · unsaved");
    }
    function remount(instanceId, mount) {
        const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
        if (!item || item.mount === mount)
            return;
        const target = addTarget([mount], findDecor(item.itemId)?.wallHeight ?? 1.6);
        const result = placeDecorItem(layout, instanceId, target, room, catalog, mount === "wall" ? undefined : 0);
        if (!result.valid) {
            setStatus("No room there.", "error");
            return;
        }
        commit(result.layout, `Moved to the ${mount} · unsaved`);
    }
    async function storeLayout() {
        if (saving)
            return;
        saving = true;
        elements.saveButton.disabled = true;
        setStatus("Saving…", "saving");
        try {
            const result = await persist(layout);
            setStatus(result.message, result.ok ? "saved" : "error");
        }
        catch {
            setStatus("The layout could not be saved.", "error");
        }
        finally {
            saving = false;
            elements.saveButton.disabled = false;
        }
    }
    /** Move the selected cabinet; the layout rules decide whether the spot is allowed. */
    function applyCabinetPlacement(next, quiet = false) {
        const current = selectedCabinet();
        if (!current)
            return false;
        if (current.hidden) {
            setStatus("That cabinet is hidden · show it before moving it.", "error");
            return false;
        }
        const result = updateItemPlacement(layout, current.instanceId, next, room, catalog);
        if (!result.valid) {
            setStatus("That spot is blocked.", "error");
            return false;
        }
        if (quiet) {
            // Mid-drag: every pointer move is one gesture, so only the first move is an undo step.
            layout = result.layout;
            renderScene();
            setStatus("Unsaved changes", "dirty");
        }
        else {
            commit(result.layout, "Unsaved changes");
        }
        return true;
    }
    function applyDecorTarget(target, quiet = false) {
        const current = selectedDecor();
        if (!current)
            return false;
        const result = placeDecorItem(layout, current.instanceId, target, room, catalog);
        if (!result.valid) {
            setStatus("That spot is blocked.", "error");
            return false;
        }
        if (quiet) {
            layout = result.layout;
            renderScene();
            setStatus("Unsaved changes", "dirty");
        }
        else {
            commit(result.layout, "Unsaved changes");
        }
        return true;
    }
    function rotate(direction) {
        const cabinet = selectedCabinet();
        if (cabinet) {
            const entry = cabinetEntry(cabinet.cabinetId);
            if (entry)
                applyCabinetPlacement(rotatePlacement(cabinet, direction, entry.cabinet.placement.snapDegrees));
            return;
        }
        const item = selectedDecor();
        if (!item)
            return;
        const result = rotateDecorItem(layout, item.instanceId, direction, DECOR_SNAP_DEGREES, room, catalog);
        if (!result.valid) {
            setStatus(result.reason === "wall" ? "Wall items always face the room." : "That spot is blocked.", "error");
            return;
        }
        commit(result.layout, "Unsaved changes");
    }
    function cameraAxes() {
        // Camera-relative so "up" pushes the item away from the viewer whichever way the room is orbited.
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        return { forward: { x: forward.x, z: forward.z }, right: { x: -forward.z, z: forward.x } };
    }
    function nudge(screenX, screenY) {
        const { forward, right } = cameraAxes();
        const cabinet = selectedCabinet();
        if (cabinet) {
            applyCabinetPlacement({
                x: cabinet.x + (right.x * screenX + forward.x * screenY) * NUDGE_STEP,
                z: cabinet.z + (right.z * screenX + forward.z * screenY) * NUDGE_STEP,
                rotationY: cabinet.rotationY,
            });
            return;
        }
        const item = selectedDecor();
        if (!item)
            return;
        if (item.mount === "wall") {
            // On a wall, left/right slide along it and up/down raise or lower it.
            const along = item.wall === "east" || item.wall === "west" ? { x: 0, z: 1 } : { x: 1, z: 0 };
            const sign = item.wall === "south" || item.wall === "west" ? -1 : 1;
            applyDecorTarget({
                mount: "wall",
                point: { x: item.x + along.x * screenX * NUDGE_STEP * sign, y: item.y + screenY * NUDGE_STEP, z: item.z + along.z * screenX * NUDGE_STEP * sign },
            });
            return;
        }
        applyDecorTarget({
            mount: item.mount,
            point: {
                x: item.x + (right.x * screenX + forward.x * screenY) * NUDGE_STEP,
                y: item.y,
                z: item.z + (right.z * screenX + forward.z * screenY) * NUDGE_STEP,
            },
        });
    }
    function applyViewCamera() {
        const pose = editorCameraPose(view, room);
        camera.position.set(pose.position.x, pose.position.y, pose.position.z);
        camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    }
    function renderViewButtons() {
        for (const button of elements.viewButtons.querySelectorAll("[data-view]")) {
            button.setAttribute("aria-pressed", String(button.dataset.view === view.preset));
        }
    }
    function setView(preset) {
        view = applyEditorCameraPreset(view, preset, room);
        applyViewCamera();
        renderViewButtons();
    }
    function updatePointer(event) {
        const bounds = canvas.getBoundingClientRect();
        pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
    }
    function floorPoint(event) {
        updatePointer(event);
        return raycaster.intersectObject(shell.floor, false)[0]?.point ?? null;
    }
    function wallPoint(event) {
        updatePointer(event);
        return raycaster.intersectObjects(shell.wallMeshes, false)[0]?.point ?? null;
    }
    function ceilingPoint(event) {
        updatePointer(event);
        return raycaster.ray.intersectPlane(ceilingPlane, planeHit) ? planeHit.clone() : null;
    }
    function rootOf(hit, roots) {
        let object = hit;
        while (object) {
            if (roots.includes(object))
                return object;
            object = object.parent;
        }
        return undefined;
    }
    function hitCabinet(event) {
        updatePointer(event);
        const models = cabinets.map((entry) => entry.model);
        const hit = raycaster.intersectObjects(models, true)[0]?.object;
        const root = hit && rootOf(hit, models);
        const entry = root && cabinets.find((candidate) => candidate.model === root);
        return entry && layout.items.find((candidate) => candidate.cabinetId === entry.cabinet.id && !candidate.hidden);
    }
    function hitDecor(event) {
        updatePointer(event);
        const models = decor.models();
        const hit = raycaster.intersectObjects(models, true)[0]?.object;
        const root = hit && rootOf(hit, models);
        return root && layout.decor.find((candidate) => candidate.instanceId === root.userData.decorInstanceId);
    }
    /**
     * Turn the pointer into a placement target for the dragged decor. The item
     * follows whichever visible surface is under the cursor that it can mount on,
     * preferring the surface it is already on; the ceiling plane is invisible with
     * the roof off, so a ceiling item stays on the ceiling and the inspector's
     * Mount buttons are how an item gets up there.
     */
    function decorTargetFromPointer(event, item) {
        const definition = findDecor(item.itemId);
        if (!definition)
            return null;
        const mounts = definition.mounts;
        if (item.mount === "ceiling") {
            const point = ceilingPoint(event);
            return point ? { mount: "ceiling", point: { x: point.x + dragOffset.x, y: roomHeight, z: point.z + dragOffset.z } } : null;
        }
        const wall = mounts.includes("wall") ? wallPoint(event) : null;
        const floor = mounts.includes("floor") ? floorPoint(event) : null;
        if (item.mount === "wall") {
            if (wall)
                return { mount: "wall", point: { x: wall.x, y: wall.y, z: wall.z } };
            if (floor)
                return { mount: "floor", point: { x: floor.x + dragOffset.x, y: 0, z: floor.z + dragOffset.z } };
            // A wall-only item dragged onto the floor slides down its nearest wall instead.
            const fallback = floorPoint(event);
            return fallback ? { mount: "wall", point: { x: fallback.x, y: item.y, z: fallback.z } } : null;
        }
        if (floor)
            return { mount: "floor", point: { x: floor.x + dragOffset.x, y: 0, z: floor.z + dragOffset.z } };
        if (wall)
            return { mount: "wall", point: { x: wall.x, y: wall.y, z: wall.z } };
        return null;
    }
    function moveFromPointer(event) {
        const cabinet = selectedCabinet();
        if (cabinet) {
            const point = floorPoint(event);
            if (point)
                applyCabinetPlacement({ x: point.x + dragOffset.x, z: point.z + dragOffset.z, rotationY: cabinet.rotationY }, true);
            return;
        }
        const item = selectedDecor();
        if (!item)
            return;
        const target = decorTargetFromPointer(event, item);
        if (target)
            applyDecorTarget(target, true);
    }
    function enter() {
        if (editing || !canEnter())
            return;
        editing = true;
        dragging = false;
        cameraGesture = "none";
        document.exitPointerLock?.();
        document.body.classList.add("is-editing");
        elements.panel.hidden = false;
        elements.editButton.setAttribute("aria-pressed", "true");
        setView("overview");
        setStatus("Drag anything to move it · drag the floor to orbit · right-drag to pan · scroll to zoom.");
        renderScene();
        renderPanel();
        onEditingChange(true);
    }
    function finish() {
        if (!editing)
            return;
        void storeLayout();
        editing = false;
        dragging = false;
        cameraGesture = "none";
        canvas.style.cursor = "";
        document.body.classList.remove("is-editing");
        elements.panel.hidden = true;
        elements.editButton.setAttribute("aria-pressed", "false");
        selectionBox.visible = false;
        onEditingChange(false);
        canvas.focus();
    }
    function toggle() {
        if (editing)
            finish();
        else
            enter();
    }
    elements.editButton.addEventListener("click", toggle);
    elements.rotateLeftButton.addEventListener("click", () => rotate(-1));
    elements.rotateRightButton.addEventListener("click", () => rotate(1));
    elements.undoButton.addEventListener("click", undo);
    elements.saveButton.addEventListener("click", () => { void storeLayout(); });
    elements.viewButtons.addEventListener("click", (event) => {
        const button = event.target.closest("[data-view]");
        const preset = button?.dataset.view;
        if (preset && EDITOR_CAMERA_PRESETS.includes(preset))
            setView(preset);
    });
    // Right-drag pans, so the context menu must not steal the gesture while building.
    canvas.addEventListener("contextmenu", (event) => { if (editing)
        event.preventDefault(); });
    elements.finishButton.addEventListener("click", finish);
    elements.resetButton.addEventListener("click", () => {
        if (!confirm("Reset the room to the starter layout? Finishes and decor go back too, and hidden cabinets come back."))
            return;
        const starter = createDefaultRoomLayout();
        selection = starter.items[0] ? { kind: "cabinet", instanceId: starter.items[0].instanceId } : null;
        commit(starter, "Starter room restored. Save to keep it.");
    });
    canvas.addEventListener("pointerdown", (event) => {
        if (!editing)
            return;
        const panButton = event.button === 1 || event.button === 2 || (event.button === 0 && event.shiftKey);
        if (event.button !== 0 && !panButton)
            return;
        canvas.setPointerCapture?.(event.pointerId);
        lastPointer.x = event.clientX;
        lastPointer.y = event.clientY;
        gestureStart.x = event.clientX;
        gestureStart.y = event.clientY;
        if (panButton) {
            cameraGesture = "pan";
            canvas.style.cursor = "all-scroll";
            return;
        }
        const cabinet = hitCabinet(event);
        const item = cabinet ? undefined : hitDecor(event);
        if (cabinet || item) {
            if (cabinet)
                selectCabinet(cabinet.instanceId);
            else
                selectDecor(item.instanceId);
            const anchor = item?.mount === "ceiling" ? ceilingPoint(event) : floorPoint(event);
            const origin = cabinet ?? item;
            dragOffset.x = anchor ? origin.x - anchor.x : 0;
            dragOffset.z = anchor ? origin.z - anchor.z : 0;
            // The whole drag is one undo step.
            undoStack.push(layout);
            if (undoStack.length > UNDO_DEPTH)
                undoStack.shift();
            dragging = true;
            canvas.style.cursor = "grabbing";
            return;
        }
        cameraGesture = "orbit";
        canvas.style.cursor = "move";
    });
    canvas.addEventListener("pointermove", (event) => {
        if (!editing)
            return;
        if (dragging) {
            moveFromPointer(event);
            return;
        }
        const deltaX = event.clientX - lastPointer.x;
        const deltaY = event.clientY - lastPointer.y;
        lastPointer.x = event.clientX;
        lastPointer.y = event.clientY;
        if (cameraGesture === "orbit") {
            view = orbitEditorCamera(view, deltaX, deltaY);
            applyViewCamera();
            renderViewButtons();
            return;
        }
        if (cameraGesture === "pan") {
            view = panEditorCamera(view, deltaX, deltaY, room);
            applyViewCamera();
            renderViewButtons();
            return;
        }
        canvas.style.cursor = hitCabinet(event) || hitDecor(event) ? "grab" : "";
    });
    const endPointer = (event) => {
        const wasDragging = dragging;
        const wasOrbit = cameraGesture === "orbit";
        dragging = false;
        cameraGesture = "none";
        canvas.releasePointerCapture?.(event.pointerId);
        if (!editing)
            return;
        canvas.style.cursor = hitCabinet(event) || hitDecor(event) ? "grab" : "";
        if (wasDragging) {
            // Drop an undo step that changed nothing, then let the panel catch up with the final spot.
            if (undoStack[undoStack.length - 1] === layout)
                undoStack.pop();
            renderPanel();
            return;
        }
        if (wasOrbit && event.type === "pointerup" && Math.hypot(event.clientX - gestureStart.x, event.clientY - gestureStart.y) < CLICK_SLOP_PX) {
            clearSelection();
        }
    };
    canvas.addEventListener("wheel", (event) => {
        if (!editing)
            return;
        event.preventDefault();
        // Alt+wheel over the room resizes the selected item; the notches within a beat are one undo step.
        if (event.altKey && selectedDecor()) {
            resizeSelected(event.deltaY < 0 ? 1 : -1, "preview");
            clearTimeout(wheelGestureTimer);
            wheelGestureTimer = setTimeout(() => {
                const item = selectedDecor();
                if (item)
                    editDecor({ valid: true, layout, instanceId: item.instanceId, reason: "" }, "Resized", "commit");
            }, WHEEL_GESTURE_MS);
            return;
        }
        view = zoomEditorCamera(view, event.deltaY);
        applyViewCamera();
        renderViewButtons();
    }, { passive: false });
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    window.addEventListener("keydown", (event) => {
        // Keys typed into the panel's inputs (a colour, a length) are never room commands.
        const typing = event.target instanceof HTMLElement && Boolean(event.target.closest("input, textarea, select"));
        if (event.code === ROOM_EDITOR_TOGGLE_KEY) {
            if (typing)
                return;
            event.preventDefault();
            toggle();
            return;
        }
        if (!editing || typing)
            return;
        if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
            event.preventDefault();
            undo();
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.code === "KeyD") {
            event.preventDefault();
            const item = selectedDecor();
            if (item)
                duplicateDecor(item.instanceId);
            return;
        }
        const bindings = {
            // Escape backs out one level: a selection first, then build mode itself.
            Escape: () => { if (selection)
                clearSelection();
            else
                finish(); },
            KeyQ: () => rotate(-1),
            KeyR: () => rotate(1),
            KeyH: () => toggleHidden(),
            KeyF: () => setView("front"),
            KeyT: () => setView("top"),
            KeyO: () => setView("overview"),
            Delete: () => { const item = selectedDecor(); if (item)
                removeDecor(item.instanceId); },
            Backspace: () => { const item = selectedDecor(); if (item)
                removeDecor(item.instanceId); },
            Minus: () => resizeSelected(-1, "commit"),
            NumpadSubtract: () => resizeSelected(-1, "commit"),
            Equal: () => resizeSelected(1, "commit"),
            NumpadAdd: () => resizeSelected(1, "commit"),
            BracketLeft: () => resizeSelected(-1, "commit"),
            BracketRight: () => resizeSelected(1, "commit"),
            ArrowUp: () => nudge(0, 1),
            KeyW: () => nudge(0, 1),
            ArrowDown: () => nudge(0, -1),
            KeyS: () => nudge(0, -1),
            ArrowLeft: () => nudge(-1, 0),
            KeyA: () => nudge(-1, 0),
            ArrowRight: () => nudge(1, 0),
            KeyD: () => nudge(1, 0),
        };
        const digit = /^Digit([1-9])$/.exec(event.code);
        if (digit) {
            const item = layout.items[Number(digit[1]) - 1];
            if (item)
                selectCabinet(item.instanceId);
            event.preventDefault();
            return;
        }
        const action = bindings[event.code];
        if (!action)
            return;
        event.preventDefault();
        action();
    });
    renderScene();
    renderPanel();
    return {
        enter,
        finish,
        toggle,
        isEditing: () => editing,
        getLayout: () => layout,
        // Hidden cabinets have no placement as far as the room is concerned: nothing to
        // walk into, nothing to play, nothing to prompt for.
        getCabinetPlacement: (cabinetId) => layout.items.find((item) => item.cabinetId === cabinetId && !item.hidden),
        getFloorObstacles: () => floorObstacles(layout, catalog),
    };
}
