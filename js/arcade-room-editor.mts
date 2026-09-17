import type { CabinetDefinition } from "./arcade-room-cabinet.mjs";
import { findDecor, type DecorCategory, type DecorMount } from "./arcade-room-catalog/decor.mjs";
import type { RoomInventory } from "./arcade-room-catalog/inventory.mjs";
import type { SurfaceKind } from "./arcade-room-catalog/surfaces.mjs";
import {
  addDecorItem,
  duplicateDecorItem,
  nearestWall,
  placeDecorItem,
  removeDecorItem,
  rotateDecorItem,
  setDecorColor,
  setDecorLength,
  type DecorTarget,
} from "./arcade-room-decor-layout.mjs";
import type { DecorRuntime } from "./arcade-room-decor-runtime.mjs";
import { createEditorPanel, type EditorSelection, type EditorTab, type PanelElements } from "./arcade-room-editor-panel.mjs";
import {
  ROOM_BOUNDS_DEFAULTS,
  createDefaultRoomLayout,
  floorObstacles,
  rotatePlacement,
  setItemHidden,
  setRoomSurface,
  updateItemPlacement,
  type FloorObstacle,
  type ItemFootprint,
  type RoomBounds,
  type RoomDecorItem,
  type RoomLayout,
  type RoomLayoutItem,
} from "./arcade-room-layout.mjs";
import {
  EDITOR_CAMERA_PRESETS,
  applyEditorCameraPreset,
  createEditorCamera,
  editorCameraPose,
  orbitEditorCamera,
  panEditorCamera,
  zoomEditorCamera,
  type EditorCameraPreset,
  type EditorCameraState,
} from "./arcade-room-camera.mjs";
import type { RoomShell } from "./arcade-room-shell.mjs";

type ThreeNamespace = Record<string, any>;

type RoomEditorElements = PanelElements & Readonly<{
  panel: HTMLElement;
  editButton: HTMLButtonElement;
  rotateLeftButton: HTMLButtonElement;
  rotateRightButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  finishButton: HTMLButtonElement;
  undoButton: HTMLButtonElement;
  status: HTMLElement;
  /** Preset-view buttons, each carrying `data-view`; the reset button is the `overview` preset. */
  viewButtons: HTMLElement;
}>;

export type RoomEditorSaveResult = Readonly<{ ok: boolean; message: string }>;

type EditableCabinet = Readonly<{
  model: any;
  cabinet: CabinetDefinition;
  footprint: ItemFootprint;
}>;

type RoomEditorOptions = Readonly<{
  THREE: ThreeNamespace;
  scene: any;
  camera: any;
  canvas: HTMLCanvasElement;
  shell: RoomShell;
  decor: DecorRuntime;
  inventory: RoomInventory;
  cabinets: readonly EditableCabinet[];
  room: RoomBounds;
  /** The layout as loaded by the page's store; the editor never reads storage itself. */
  initialLayout: RoomLayout;
  /**
   * Where a save goes. The editor does not know whether that is the account or
   * this device — the store decides and reports back the true thing to say.
   */
  persist: (layout: RoomLayout) => Promise<RoomEditorSaveResult>;
  elements: RoomEditorElements;
  /** Lets the page refuse build mode while something else (a running cabinet) owns the screen. */
  canEnter: () => boolean;
  onEditingChange: (editing: boolean) => void;
}>;

export type RoomEditor = Readonly<{
  enter: () => void;
  finish: () => void;
  toggle: () => void;
  isEditing: () => boolean;
  getLayout: () => RoomLayout;
  getCabinetPlacement: (cabinetId: string) => RoomLayoutItem | undefined;
  /** Everything solid on the floor right now, for the walking player. */
  getFloorObstacles: () => readonly FloorObstacle[];
}>;

/**
 * Key that flips build mode on and off. It has to be a key rather than only a button because pointer
 * lock hides the cursor, and it cannot be Escape because the browser eats that to release the lock.
 */
export const ROOM_EDITOR_TOGGLE_KEY = "KeyB";
const NUDGE_STEP = 0.1;
const DECOR_SNAP_DEGREES = 15;
const UNDO_DEPTH = 40;

export function createRoomEditor(options: RoomEditorOptions): RoomEditor {
  const { THREE, scene, camera, canvas, shell, decor, inventory, cabinets, room, initialLayout, persist, elements, canEnter, onEditingChange } = options;
  const catalog = Object.fromEntries(cabinets.map((entry) => [entry.cabinet.id, entry.footprint]));
  const roomHeight = room.height ?? ROOM_BOUNDS_DEFAULTS.height;
  let layout = initialLayout;
  let selection: EditorSelection = layout.items[0] ? { kind: "cabinet", instanceId: layout.items[0].instanceId } : null;
  let tab: EditorTab = "cabinets";
  let decorCategory: DecorCategory = "neon";
  let editing = false;
  let dragging = false;
  let saving = false;
  const undoStack: RoomLayout[] = [];
  // Which camera gesture the current pointer owns: orbit on a left-drag over empty floor,
  // pan on a right/middle-drag or a Shift+left-drag anywhere. Decided on pointerdown.
  let cameraGesture: "none" | "orbit" | "pan" = "none";
  let view: EditorCameraState = createEditorCamera(room);
  const lastPointer = { x: 0, y: 0 };
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
    removeDecor: (instanceId) => removeDecor(instanceId),
    duplicateDecor: (instanceId) => duplicateDecor(instanceId),
    setDecorColor: (instanceId, color) => commitDecor(setDecorColor(layout, instanceId, color).layout, "Colour changed"),
    setDecorLength: (instanceId, length) => commitDecor(setDecorLength(layout, instanceId, length, room, catalog).layout, "Length changed"),
    setDecorMount: (instanceId, mount) => remount(instanceId, mount),
  });

  function selectedCabinet(): RoomLayoutItem | undefined {
    return selection?.kind === "cabinet" ? layout.items.find((item) => item.instanceId === selection!.instanceId) : undefined;
  }

  function selectedDecor(): RoomDecorItem | undefined {
    return selection?.kind === "decor" ? layout.decor.find((item) => item.instanceId === selection!.instanceId) : undefined;
  }

  function cabinetEntry(cabinetId: string): EditableCabinet | undefined {
    return cabinets.find((entry) => entry.cabinet.id === cabinetId);
  }

  function selectedModel(): any | undefined {
    const cabinet = selectedCabinet();
    if (cabinet) return cabinet.hidden ? undefined : cabinetEntry(cabinet.cabinetId)?.model;
    const item = selectedDecor();
    return item ? decor.modelFor(item.instanceId) : undefined;
  }

  /** Push the scene into step with the layout: cabinet poses, decor meshes, surfaces, the selection box. */
  function renderScene(): void {
    for (const placement of layout.items) {
      const entry = cabinetEntry(placement.cabinetId);
      if (!entry) continue;
      entry.model.position.set(placement.x, 0, placement.z);
      entry.model.rotation.y = placement.rotationY;
      entry.model.visible = !placement.hidden;
    }
    decor.sync(layout);
    shell.applySurfaces(layout.surfaces);
    const model = selectedModel();
    if (model) selectionBox.setFromObject(model);
    selectionBox.visible = editing && Boolean(model);
  }

  function renderPanel(): void {
    panel.render({ tab, layout, selection, cabinets: cabinets.map((entry) => entry.cabinet), inventory, decorCategory });
    elements.undoButton.disabled = undoStack.length === 0;
  }

  function setStatus(message: string, state = "ready"): void {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }

  /** Replace the layout, remembering the old one for undo, and redraw everything. */
  function commit(next: RoomLayout, message: string, state = "dirty"): void {
    if (next === layout) return;
    undoStack.push(layout);
    if (undoStack.length > UNDO_DEPTH) undoStack.shift();
    layout = next;
    renderScene();
    renderPanel();
    setStatus(message, state);
  }

  function commitDecor(next: RoomLayout, message: string): void {
    if (next === layout) {
      setStatus("That change is not possible here.", "error");
      return;
    }
    commit(next, `${message} · unsaved`);
  }

  function undo(): void {
    const previous = undoStack.pop();
    if (!previous) return;
    layout = previous;
    if (selection && !selectedCabinet() && !selectedDecor()) selection = null;
    renderScene();
    renderPanel();
    setStatus("Undone · unsaved", "dirty");
  }

  function selectCabinet(instanceId: string): void {
    const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
    if (!item) return;
    selection = { kind: "cabinet", instanceId };
    tab = "cabinets";
    renderScene();
    renderPanel();
    const title = cabinetEntry(item.cabinetId)?.cabinet.title ?? "Cabinet";
    setStatus(item.hidden
      ? `${title} is hidden · press H or Show to put it back on the floor.`
      : `${title} selected · drag it, nudge with arrows, Q/R to rotate, H to hide.`);
  }

  function selectDecor(instanceId: string): void {
    const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
    if (!item) return;
    selection = { kind: "decor", instanceId };
    tab = "decor";
    renderScene();
    renderPanel();
    const definition = findDecor(item.itemId);
    const hint = item.mount === "wall"
      ? "drag it along the wall, arrows to slide and raise"
      : "drag it, arrows to nudge, Q/R to rotate";
    setStatus(`${definition?.title ?? "Item"} selected · ${hint} · Delete to remove.`);
  }

  function setHidden(instanceId: string, hidden: boolean): void {
    const result = setItemHidden(layout, instanceId, hidden, room, catalog);
    const title = cabinetEntry(layout.items.find((item) => item.instanceId === instanceId)?.cabinetId ?? "")?.cabinet.title ?? "Cabinet";
    if (!result.valid) {
      setStatus(`No room for ${title} · clear its old spot or the starter spot first.`, "error");
      return;
    }
    selection = { kind: "cabinet", instanceId };
    commit(result.layout, hidden ? `${title} is off the floor · unsaved` : `${title} is back on the floor · unsaved`);
  }

  function toggleHidden(instanceId = selectedCabinet()?.instanceId ?? ""): void {
    const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
    if (item) setHidden(instanceId, !item.hidden);
  }

  function setSurface(kind: SurfaceKind, id: string): void {
    if (!inventory.owns(id)) {
      setStatus("You do not own that finish yet.", "error");
      return;
    }
    const result = setRoomSurface(layout, kind, id);
    if (!result.valid) return;
    commit(result.layout, `${kind[0]!.toUpperCase()}${kind.slice(1)} changed · unsaved`);
  }

  /** Where a freshly added item lands: near the camera's target so it appears in view. */
  function addTarget(mounts: readonly DecorMount[], wallHeight: number): DecorTarget {
    const target = view.target;
    const mount = mounts[0]!;
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

  function addDecor(itemId: string): void {
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

  function removeDecor(instanceId: string): void {
    const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
    if (!item) return;
    if (selection?.kind === "decor" && selection.instanceId === instanceId) selection = null;
    commit(removeDecorItem(layout, instanceId), `${findDecor(item.itemId)?.title ?? "Item"} removed · unsaved`);
  }

  function duplicateDecor(instanceId: string): void {
    const result = duplicateDecorItem(layout, instanceId, room, catalog);
    if (!result.valid) {
      setStatus("No room beside it for a copy.", "error");
      return;
    }
    selection = { kind: "decor", instanceId: result.instanceId };
    commit(result.layout, "Copied · unsaved");
  }

  function remount(instanceId: string, mount: DecorMount): void {
    const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
    if (!item || item.mount === mount) return;
    const target = addTarget([mount], findDecor(item.itemId)?.wallHeight ?? 1.6);
    const result = placeDecorItem(layout, instanceId, target, room, catalog, mount === "wall" ? undefined : 0);
    if (!result.valid) {
      setStatus("No room there.", "error");
      return;
    }
    commit(result.layout, `Moved to the ${mount} · unsaved`);
  }

  async function storeLayout(): Promise<void> {
    if (saving) return;
    saving = true;
    elements.saveButton.disabled = true;
    setStatus("Saving…", "saving");
    try {
      const result = await persist(layout);
      setStatus(result.message, result.ok ? "saved" : "error");
    } catch {
      setStatus("The layout could not be saved.", "error");
    } finally {
      saving = false;
      elements.saveButton.disabled = false;
    }
  }

  /** Move the selected cabinet; the layout rules decide whether the spot is allowed. */
  function applyCabinetPlacement(next: Readonly<{ x: number; z: number; rotationY: number }>, quiet = false): boolean {
    const current = selectedCabinet();
    if (!current) return false;
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
    } else {
      commit(result.layout, "Unsaved changes");
    }
    return true;
  }

  function applyDecorTarget(target: DecorTarget, quiet = false): boolean {
    const current = selectedDecor();
    if (!current) return false;
    const result = placeDecorItem(layout, current.instanceId, target, room, catalog);
    if (!result.valid) {
      setStatus("That spot is blocked.", "error");
      return false;
    }
    if (quiet) {
      layout = result.layout;
      renderScene();
      setStatus("Unsaved changes", "dirty");
    } else {
      commit(result.layout, "Unsaved changes");
    }
    return true;
  }

  function rotate(direction: -1 | 1): void {
    const cabinet = selectedCabinet();
    if (cabinet) {
      const entry = cabinetEntry(cabinet.cabinetId);
      if (entry) applyCabinetPlacement(rotatePlacement(cabinet, direction, entry.cabinet.placement.snapDegrees));
      return;
    }
    const item = selectedDecor();
    if (!item) return;
    const result = rotateDecorItem(layout, item.instanceId, direction, DECOR_SNAP_DEGREES, room, catalog);
    if (!result.valid) {
      setStatus(result.reason === "wall" ? "Wall items always face the room." : "That spot is blocked.", "error");
      return;
    }
    commit(result.layout, "Unsaved changes");
  }

  function cameraAxes(): { forward: { x: number; z: number }; right: { x: number; z: number } } {
    // Camera-relative so "up" pushes the item away from the viewer whichever way the room is orbited.
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    return { forward: { x: forward.x, z: forward.z }, right: { x: -forward.z, z: forward.x } };
  }

  function nudge(screenX: number, screenY: number): void {
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
    if (!item) return;
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

  function applyViewCamera(): void {
    const pose = editorCameraPose(view, room);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  }

  function renderViewButtons(): void {
    for (const button of elements.viewButtons.querySelectorAll<HTMLButtonElement>("[data-view]")) {
      button.setAttribute("aria-pressed", String(button.dataset.view === view.preset));
    }
  }

  function setView(preset: EditorCameraPreset): void {
    view = applyEditorCameraPreset(view, preset, room);
    applyViewCamera();
    renderViewButtons();
  }

  function updatePointer(event: PointerEvent): void {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  }

  function floorPoint(event: PointerEvent): any | null {
    updatePointer(event);
    return raycaster.intersectObject(shell.floor, false)[0]?.point ?? null;
  }

  function wallPoint(event: PointerEvent): any | null {
    updatePointer(event);
    return raycaster.intersectObjects(shell.wallMeshes, false)[0]?.point ?? null;
  }

  function ceilingPoint(event: PointerEvent): any | null {
    updatePointer(event);
    return raycaster.ray.intersectPlane(ceilingPlane, planeHit) ? planeHit.clone() : null;
  }

  function rootOf(hit: any, roots: readonly any[]): any | undefined {
    let object: any = hit;
    while (object) {
      if (roots.includes(object)) return object;
      object = object.parent;
    }
    return undefined;
  }

  function hitCabinet(event: PointerEvent): RoomLayoutItem | undefined {
    updatePointer(event);
    const models = cabinets.map((entry) => entry.model);
    const hit = raycaster.intersectObjects(models, true)[0]?.object;
    const root = hit && rootOf(hit, models);
    const entry = root && cabinets.find((candidate) => candidate.model === root);
    return entry && layout.items.find((candidate) => candidate.cabinetId === entry.cabinet.id && !candidate.hidden);
  }

  function hitDecor(event: PointerEvent): RoomDecorItem | undefined {
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
  function decorTargetFromPointer(event: PointerEvent, item: RoomDecorItem): DecorTarget | null {
    const definition = findDecor(item.itemId);
    if (!definition) return null;
    const mounts = definition.mounts;
    if (item.mount === "ceiling") {
      const point = ceilingPoint(event);
      return point ? { mount: "ceiling", point: { x: point.x + dragOffset.x, y: roomHeight, z: point.z + dragOffset.z } } : null;
    }
    const wall = mounts.includes("wall") ? wallPoint(event) : null;
    const floor = mounts.includes("floor") ? floorPoint(event) : null;
    if (item.mount === "wall") {
      if (wall) return { mount: "wall", point: { x: wall.x, y: wall.y, z: wall.z } };
      if (floor) return { mount: "floor", point: { x: floor.x + dragOffset.x, y: 0, z: floor.z + dragOffset.z } };
      // A wall-only item dragged onto the floor slides down its nearest wall instead.
      const fallback = floorPoint(event);
      return fallback ? { mount: "wall", point: { x: fallback.x, y: item.y, z: fallback.z } } : null;
    }
    if (floor) return { mount: "floor", point: { x: floor.x + dragOffset.x, y: 0, z: floor.z + dragOffset.z } };
    if (wall) return { mount: "wall", point: { x: wall.x, y: wall.y, z: wall.z } };
    return null;
  }

  function moveFromPointer(event: PointerEvent): void {
    const cabinet = selectedCabinet();
    if (cabinet) {
      const point = floorPoint(event);
      if (point) applyCabinetPlacement({ x: point.x + dragOffset.x, z: point.z + dragOffset.z, rotationY: cabinet.rotationY }, true);
      return;
    }
    const item = selectedDecor();
    if (!item) return;
    const target = decorTargetFromPointer(event, item);
    if (target) applyDecorTarget(target, true);
  }

  function enter(): void {
    if (editing || !canEnter()) return;
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

  function finish(): void {
    if (!editing) return;
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

  function toggle(): void {
    if (editing) finish();
    else enter();
  }

  elements.editButton.addEventListener("click", toggle);
  elements.rotateLeftButton.addEventListener("click", () => rotate(-1));
  elements.rotateRightButton.addEventListener("click", () => rotate(1));
  elements.undoButton.addEventListener("click", undo);
  elements.saveButton.addEventListener("click", () => { void storeLayout(); });
  elements.viewButtons.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-view]");
    const preset = button?.dataset.view;
    if (preset && (EDITOR_CAMERA_PRESETS as readonly string[]).includes(preset)) setView(preset as EditorCameraPreset);
  });
  // Right-drag pans, so the context menu must not steal the gesture while building.
  canvas.addEventListener("contextmenu", (event) => { if (editing) event.preventDefault(); });
  elements.finishButton.addEventListener("click", finish);
  elements.resetButton.addEventListener("click", () => {
    if (!confirm("Reset the room to the starter layout? Finishes and decor go back too, and hidden cabinets come back.")) return;
    const starter = createDefaultRoomLayout();
    selection = starter.items[0] ? { kind: "cabinet", instanceId: starter.items[0].instanceId } : null;
    commit(starter, "Starter room restored. Save to keep it.");
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (!editing) return;
    const panButton = event.button === 1 || event.button === 2 || (event.button === 0 && event.shiftKey);
    if (event.button !== 0 && !panButton) return;
    canvas.setPointerCapture?.(event.pointerId);
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
    if (panButton) {
      cameraGesture = "pan";
      canvas.style.cursor = "all-scroll";
      return;
    }
    const cabinet = hitCabinet(event);
    const item = cabinet ? undefined : hitDecor(event);
    if (cabinet || item) {
      if (cabinet) selectCabinet(cabinet.instanceId);
      else selectDecor(item!.instanceId);
      const anchor = item?.mount === "ceiling" ? ceilingPoint(event) : floorPoint(event);
      const origin = cabinet ?? item!;
      dragOffset.x = anchor ? origin.x - anchor.x : 0;
      dragOffset.z = anchor ? origin.z - anchor.z : 0;
      // The whole drag is one undo step.
      undoStack.push(layout);
      if (undoStack.length > UNDO_DEPTH) undoStack.shift();
      dragging = true;
      canvas.style.cursor = "grabbing";
      return;
    }
    cameraGesture = "orbit";
    canvas.style.cursor = "move";
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!editing) return;
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
  const endPointer = (event: PointerEvent): void => {
    const wasDragging = dragging;
    dragging = false;
    cameraGesture = "none";
    canvas.releasePointerCapture?.(event.pointerId);
    if (!editing) return;
    canvas.style.cursor = hitCabinet(event) || hitDecor(event) ? "grab" : "";
    if (wasDragging) {
      // Drop an undo step that changed nothing, then let the panel catch up with the final spot.
      if (undoStack[undoStack.length - 1] === layout) undoStack.pop();
      renderPanel();
    }
  };
  canvas.addEventListener("wheel", (event) => {
    if (!editing) return;
    event.preventDefault();
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
      if (typing) return;
      event.preventDefault();
      toggle();
      return;
    }
    if (!editing || typing) return;
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
      event.preventDefault();
      undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyD") {
      event.preventDefault();
      const item = selectedDecor();
      if (item) duplicateDecor(item.instanceId);
      return;
    }
    const bindings: Record<string, () => void> = {
      Escape: finish,
      KeyQ: () => rotate(-1),
      KeyR: () => rotate(1),
      KeyH: () => toggleHidden(),
      KeyF: () => setView("front"),
      KeyT: () => setView("top"),
      KeyO: () => setView("overview"),
      Delete: () => { const item = selectedDecor(); if (item) removeDecor(item.instanceId); },
      Backspace: () => { const item = selectedDecor(); if (item) removeDecor(item.instanceId); },
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
      if (item) selectCabinet(item.instanceId);
      event.preventDefault();
      return;
    }
    const action = bindings[event.code];
    if (!action) return;
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
