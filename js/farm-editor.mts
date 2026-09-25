// The farm's build mode: what a pointer and a keyboard do to the layout while
// the player is building, and nothing about what the layout means.
//
// The same shape as the room's editor on the same shared parts — the camera
// controller and the undo history from `js/space-editor/`, the resize handles
// and guides from the room's gizmos — with the farm's own placement rules
// (`farm-decor-layout.mts`) and panel (`farm-editor-panel.mts`) plugged in.
// Everything the player can touch on the field is a decor row, so there is
// one kind of selection and one drag.
//
// GESTURES. Drag an item to move it (a grab offset keeps it under the hand);
// drag empty ground to orbit; right-drag, middle-drag or Shift+drag to pan;
// wheel to zoom toward the cursor; drag an end arrow to stretch a fence with
// its far end anchored. A drag is one undo step, a typed length is a
// preview-then-commit gesture, and a click on nothing deselects.

import { findFarmDecor, type FarmDecorDefinition } from "./farm-catalog/decor.mjs";
import type { FarmInventory } from "./farm-catalog/inventory.mjs";
import { addFarmDecor, alignFarmDecorPlacement, duplicateFarmDecor, farmDecorHandles, placeFarmDecor, removeFarmDecor, rotateFarmDecor, setFarmDecorLength, stretchFarmDecorEnd, type FarmDecorResult } from "./farm-decor-layout.mjs";
import { FARM_BOUNDS, createDefaultFarmLayout, farmLayoutsEqual, normalizeFarmLayout, setFarmGround, waterPets, type FarmDecorRow, type FarmLayout } from "./farm-layout.mjs";
import { farmObstacles, type FarmObstacleState } from "./farm-scene.mjs";
import { createFarmEditorPanel, type FarmEditorTab, type FarmPanelElements } from "./farm-editor-panel.mjs";
import type { EditPhase } from "./arcade-room-editor-panel.mjs";
import { createEditorGizmos } from "./arcade-room-editor-gizmos.mjs";
import type { DecorHandle } from "./arcade-room-decor-resize.mjs";
import { createEditorCameraController } from "./space-editor/editor-camera-controller.mjs";
import { createEditHistory } from "./space-editor/editor-history.mjs";
import type { FarmWorld } from "./farm-world.mjs";
import type { FloorObstacle } from "./arcade-room-layout.mjs";

type ThreeNamespace = Record<string, any>;

export type FarmEditorElements = FarmPanelElements & Readonly<{
  /** The whole build-mode chrome; shown and hidden as one. */
  panel: HTMLElement;
  editButton: HTMLButtonElement;
  rotateLeftButton: HTMLButtonElement;
  rotateRightButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  finishButton: HTMLButtonElement;
  undoButton: HTMLButtonElement;
  status: HTMLElement;
  viewButtons: HTMLElement;
}>;

export type FarmEditorSaveResult = Readonly<{ ok: boolean; message: string }>;
export type FarmEditorPurchaseResult = Readonly<{ ok: boolean; itemId: string; price?: number; balance?: number; alreadyOwned?: boolean; error?: string }>;
export type FarmSeedPurchaseResult = Readonly<{ ok: boolean; layout?: FarmLayout; price?: number; balance?: number; error?: string }>;

export type FarmEditorOptions = Readonly<{
  THREE: ThreeNamespace;
  scene: any;
  camera: any;
  canvas: HTMLCanvasElement;
  world: FarmWorld;
  initialLayout: FarmLayout;
  inventory: FarmInventory;
  ticketPrices?: ReadonlyMap<string, number>;
  ticketBalance?: number | null;
  purchaseItem?: ((itemId: string) => Promise<FarmEditorPurchaseResult | null>) | null;
  purchaseSeeds?: ((cropId: string, quantity: number) => Promise<FarmSeedPurchaseResult | null>) | null;
  /** Where a save goes; the store decides account or device and reports the true thing to say. */
  persist: (layout: FarmLayout) => Promise<FarmEditorSaveResult>;
  elements: FarmEditorElements;
  thumbnail?: (definition: FarmDecorDefinition) => string | null;
  cropThumbnail?: (cropId: string, onReady: (url: string) => void) => string | null;
  canEnter: () => boolean;
  onEditingChange: (editing: boolean) => void;
  /** The page hears every layout change (from the panel or a drag) so the sim and the pets panel follow. */
  onLayoutChange: (layout: FarmLayout) => void;
}>;

export type FarmEditor = Readonly<{
  enter: () => void;
  finish: () => void;
  toggle: () => void;
  isEditing: () => boolean;
  getLayout: () => FarmLayout;
  /** Everything solid on the field right now, for the walking player and the pets. */
  getObstacles: (state: FarmObstacleState) => readonly FloorObstacle[];
  /** A change made outside build mode (adopting a pet) lands here so the editor's copy stays true. */
  replaceLayout: (layout: FarmLayout) => void;
}>;

/** B flips build mode, like the room: pointer lock hides the cursor, and the browser eats Escape. */
export const FARM_EDITOR_TOGGLE_KEY = "KeyB";
const NUDGE_STEP = 0.1;
const LENGTH_STEP = 0.1;
const CLICK_SLOP_PX = 4;
const SNAP_SCREEN_FRACTION = 0.02;
const SNAP_RANGE_M = Object.freeze({ min: 0.08, max: 0.4 });
const WHEEL_GESTURE_MS = 350;

export function createFarmEditor(options: FarmEditorOptions): FarmEditor {
  const { THREE, scene, camera, canvas, world, inventory, persist, elements, canEnter, onEditingChange, onLayoutChange } = options;
  let layout = options.initialLayout;
  let selection = "";
  let tab: FarmEditorTab = "fence";
  let editing = false;
  let dragging = false;
  let saving = false;
  let purchasingItemId = "";
  let ticketBalance = Number.isSafeInteger(options.ticketBalance) && Number(options.ticketBalance) >= 0 ? Number(options.ticketBalance) : null;
  let previewFrame = 0;
  let wheelGestureTimer: ReturnType<typeof setTimeout> | undefined;
  let cameraGesture: "none" | "orbit" | "pan" = "none";
  const lastPointer = { x: 0, y: 0 };
  const gestureStart = { x: 0, y: 0 };
  const dragOffset = { x: 0, z: 0 };
  let handleDrag: DecorHandle | null = null;
  const history = createEditHistory<FarmLayout>({ equal: farmLayoutsEqual });
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const planeHit = new THREE.Vector3();
  const selectionBounds = new THREE.Box3();
  const selectionBox = new THREE.Box3Helper(selectionBounds, 0xffd33d);
  selectionBox.material.depthTest = false;
  selectionBox.material.transparent = true;
  selectionBox.material.opacity = 0.9;
  selectionBox.renderOrder = 10;
  selectionBox.visible = false;
  scene.add(selectionBox);
  const gizmos = createEditorGizmos(THREE, scene);

  const view = createEditorCameraController({
    THREE,
    camera,
    canvas,
    bounds: FARM_BOUNDS,
    viewButtons: elements.viewButtons,
    offsetBlocks: () => (elements.panel.hidden ? [] : [elements.tabs, elements.drawer ?? elements.tabs, elements.inspector]),
    onPose: () => gizmos.update(camera),
  });

  const panel = createFarmEditorPanel(elements, {
    selectTab: (next) => { tab = next; renderPanel(); },
    setGround: (id) => {
      if (!inventory.owns(id)) { setStatus("You do not own that ground yet.", "error"); return; }
      const result = setFarmGround(layout, id);
      if (!result.valid) return;
      commit(result.layout, "Ground changed · unsaved");
    },
    addDecor: (itemId) => addDecor(itemId),
    selectDecor: (instanceId) => { select(instanceId); focusSelection(); },
    clearSelection: () => clearSelection(),
    removeDecor: (instanceId) => remove(instanceId),
    duplicateDecor: (instanceId) => duplicate(instanceId),
    rotateDecor: (instanceId, direction) => { select(instanceId, true); rotate(direction); },
    setDecorLength: (instanceId, length, phase) => editLength(setFarmDecorLength(layout, instanceId, length), phase),
    purchaseItem: (itemId) => { void purchaseItem(itemId); },
    purchaseSeeds: (cropId, quantity) => { void purchaseSeeds(cropId, quantity); },
  }, { thumbnail: options.thumbnail, cropThumbnail: options.cropThumbnail });

  function selected(): FarmDecorRow | undefined {
    return selection ? layout.decor.find((row) => row.instanceId === selection) : undefined;
  }

  function selectedDefinition(): FarmDecorDefinition | undefined {
    const row = selected();
    return row ? findFarmDecor(row.itemId) : undefined;
  }

  function removeBlockedReason(): string {
    const definition = selectedDefinition();
    if (!definition || definition.habitat !== "water") return "";
    const ponds = layout.decor.filter((row) => findFarmDecor(row.itemId)?.habitat === "water").length;
    const swimmers = waterPets(layout).length;
    return ponds === 1 && swimmers > 0 ? `${swimmers === 1 ? "A swimmer lives" : `${swimmers} swimmers live`} here · release them before removing the last pond.` : "";
  }

  function renderScene(): void {
    world.sync(layout);
    const model = selection ? world.modelFor(selection) : undefined;
    if (model) selectionBounds.setFromObject(model);
    selectionBox.visible = editing && Boolean(model);
    refreshHandles();
  }

  function refreshHandles(): void {
    gizmos.setHandles(editing && selection ? farmDecorHandles(layout, selection) : [], { x: 0, y: 1, z: 0 });
    gizmos.update(camera);
  }

  function renderPanel(): void {
    panel.render({
      tab, layout, selection, removeBlockedReason: removeBlockedReason(), inventory,
      ticketPrices: options.ticketPrices ?? new Map(), ticketBalance,
      canPurchase: options.purchaseItem != null && purchasingItemId === "",
      canPurchaseSeeds: options.purchaseSeeds != null && purchasingItemId === "",
    });
    elements.undoButton.disabled = !history.canUndo();
  }

  function setStatus(message: string, state = "ready"): void {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }

  async function purchaseItem(itemId: string): Promise<void> {
    if (!options.purchaseItem || purchasingItemId) {
      setStatus("Sign in to buy permanent farm unlocks.", "error");
      return;
    }
    purchasingItemId = itemId;
    renderPanel();
    setStatus("Buying item…");
    const result = await options.purchaseItem(itemId).catch(() => null);
    purchasingItemId = "";
    if (!result?.ok || !inventory.grant(result.itemId)) {
      renderPanel();
      setStatus(result?.error === "insufficient_tickets" ? "You do not have enough tickets for that yet." : "That purchase did not go through. Try again.", "error");
      return;
    }
    if (Number.isSafeInteger(result.balance) && Number(result.balance) >= 0) ticketBalance = Number(result.balance);
    renderPanel();
    setStatus(result.alreadyOwned ? "Already owned · ready to use." : "Unlocked permanently · ready to use.");
  }

  async function purchaseSeeds(cropId: string, quantity: number): Promise<void> {
    if (!options.purchaseSeeds || purchasingItemId) {
      setStatus("Sign in to buy seeds with tickets.", "error");
      return;
    }
    purchasingItemId = `seed.${cropId}`;
    renderPanel();
    setStatus("Buying seeds…");
    const result = await options.purchaseSeeds(cropId, quantity).catch(() => null);
    purchasingItemId = "";
    if (!result?.ok || !result.layout) {
      renderPanel();
      setStatus(result?.error === "insufficient_tickets" ? "You do not have enough tickets for those seeds." : result?.error === "inventory_full" ? "That seed stack is full." : "That seed purchase did not go through. Try again.", "error");
      return;
    }
    if (Number.isSafeInteger(result.balance) && Number(result.balance) >= 0) ticketBalance = Number(result.balance);
    setLayout(normalizeFarmLayout(result.layout));
    renderScene();
    renderPanel();
    setStatus(`${quantity} seeds purchased · ready in Inventory.`);
  }

  function setLayout(next: FarmLayout): void {
    layout = next;
    onLayoutChange(layout);
  }

  function commit(next: FarmLayout, message: string, state = "dirty"): void {
    if (next === layout) return;
    history.record(layout);
    setLayout(next);
    renderScene();
    renderPanel();
    setStatus(message, state);
  }

  function schedulePreviewRender(): void {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      renderScene();
    });
  }

  function explain(reason: string): string {
    if (reason === "blocked") return "That spot is taken · move it somewhere clear.";
    if (reason === "outside") return "That is off the field.";
    if (reason === "spawn") return "The gate has to stay clear · that is where you arrive.";
    if (reason === "habitat") return "Swimmers live in that pond · release them first.";
    if (reason === "full") return "The field is full.";
    if (reason === "fixed") return "That comes in one size.";
    return "That change is not possible here.";
  }

  /** A length edit: a PREVIEW opens the gesture and only redraws; the COMMIT closes it and lets the panel catch up. */
  function editLength(result: FarmDecorResult, phase: EditPhase): void {
    if (phase === "preview") {
      if (!result.valid) {
        setStatus(explain(result.reason), "error");
        return;
      }
      history.open(layout);
      setLayout(result.layout);
      schedulePreviewRender();
      setStatus("Length changed · unsaved", "dirty");
      return;
    }
    if (history.isOpen()) {
      if (result.valid) setLayout(result.layout);
      history.close(layout);
      if (previewFrame) {
        cancelAnimationFrame(previewFrame);
        previewFrame = 0;
      }
      renderScene();
      renderPanel();
      setStatus(result.valid ? "Length changed · unsaved" : explain(result.reason), result.valid ? "dirty" : "error");
      return;
    }
    if (!result.valid) {
      setStatus(explain(result.reason), "error");
      return;
    }
    commit(result.layout, "Length changed · unsaved");
  }

  function resizeSelected(direction: -1 | 1, phase: EditPhase): void {
    const row = selected();
    const definition = selectedDefinition();
    if (!row || !definition) return;
    if (!definition.length.enabled) {
      setStatus(`${definition.title} comes in one size.`, "error");
      return;
    }
    const result = setFarmDecorLength(layout, row.instanceId, row.length + direction * LENGTH_STEP);
    if (result.valid && farmLayoutsEqual(result.layout, layout)) setStatus(direction > 0 ? "That's as long as it goes." : "That's as short as it goes.", "error");
    else editLength(result, phase);
  }

  function undo(): void {
    const previous = history.undo();
    if (!previous) return;
    setLayout(previous);
    if (selection && !selected()) selection = "";
    renderScene();
    renderPanel();
    setStatus("Undone · unsaved", "dirty");
  }

  function select(instanceId: string, quiet = false): void {
    const row = layout.decor.find((candidate) => candidate.instanceId === instanceId);
    const definition = row && findFarmDecor(row.itemId);
    if (!row || !definition) return;
    selection = instanceId;
    tab = definition.category;
    renderScene();
    renderPanel();
    if (quiet) return;
    const size = definition.length.enabled ? " · drag an end arrow to stretch it" : "";
    setStatus(`${definition.title} selected · drag it, arrows to nudge, Q/R to turn${size} · hold Alt to skip snapping · Delete to remove.`);
  }

  function clearSelection(): void {
    if (!selection) return;
    selection = "";
    renderScene();
    renderPanel();
    setStatus("Nothing selected · click anything on the field, or add something from the catalog.");
  }

  function addDecor(itemId: string): void {
    const definition = findFarmDecor(itemId);
    if (!definition || !inventory.owns(itemId)) {
      setStatus("You do not own that item yet.", "error");
      return;
    }
    const target = view.view().target;
    const result = addFarmDecor(layout, definition, { x: target.x, z: target.z, rotationY: 0 });
    if (!result.valid) {
      setStatus(result.reason === "full" ? "The field is full." : `No room for ${definition.title} near here · move the view and try again.`, "error");
      return;
    }
    selection = result.instanceId;
    tab = definition.category;
    commit(result.layout, `${definition.title} added · drag it into place · unsaved`);
  }

  function remove(instanceId: string): void {
    const row = layout.decor.find((candidate) => candidate.instanceId === instanceId);
    if (!row) return;
    if (row.itemId === "decor.prop.pet-tombstone" && !confirm("Remove this memorial stone permanently? The pet's history will stay in your farm records, but the stone cannot be restored.")) return;
    const result = removeFarmDecor(layout, instanceId);
    if (!result.valid) {
      setStatus(explain(result.reason), "error");
      return;
    }
    if (selection === instanceId) selection = "";
    commit(result.layout, `${findFarmDecor(row.itemId)?.title ?? "Item"} removed · unsaved`);
  }

  function duplicate(instanceId: string): void {
    if (layout.decor.find((row) => row.instanceId === instanceId)?.memorialId) {
      setStatus("A pet memorial is unique and cannot be copied.", "error");
      return;
    }
    const result = duplicateFarmDecor(layout, instanceId);
    if (!result.valid) {
      setStatus(result.reason === "full" ? "The field is full." : "No room beside it for a copy.", "error");
      return;
    }
    selection = result.instanceId;
    commit(result.layout, "Copied · unsaved");
  }

  function rotate(direction: -1 | 1): void {
    const row = selected();
    if (!row) return;
    const result = rotateFarmDecor(layout, row.instanceId, direction);
    if (!result.valid) {
      setStatus(explain(result.reason), "error");
      return;
    }
    commit(result.layout, "Unsaved changes");
  }

  /** Move the selected item; the placement rules decide whether the spot is allowed. */
  function applyPlacement(next: Readonly<{ x: number; z: number; rotationY: number }>, quiet = false): boolean {
    const row = selected();
    if (!row) return false;
    const result = placeFarmDecor(layout, row.instanceId, next);
    if (!result.valid) {
      setStatus(explain(result.reason), "error");
      return false;
    }
    if (quiet) {
      // Mid-drag: every pointer move is one gesture, so only the first move is an undo step.
      setLayout(result.layout);
      renderScene();
      setStatus("Unsaved changes", "dirty");
    } else {
      commit(result.layout, "Unsaved changes");
    }
    return true;
  }

  function cameraAxes(): { forward: { x: number; z: number }; right: { x: number; z: number } } {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    return { forward: { x: forward.x, z: forward.z }, right: { x: -forward.z, z: forward.x } };
  }

  function nudge(screenX: number, screenY: number): void {
    const row = selected();
    if (!row) return;
    const { forward, right } = cameraAxes();
    applyPlacement({
      x: row.x + (right.x * screenX + forward.x * screenY) * NUDGE_STEP,
      z: row.z + (right.z * screenX + forward.z * screenY) * NUDGE_STEP,
      rotationY: row.rotationY,
    });
  }

  function focusSelection(): void {
    const row = selected();
    if (row) view.focus({ x: row.x, z: row.z });
  }

  function snapThreshold(event: Readonly<{ altKey: boolean }>): number {
    if (event.altKey) return 0;
    return Math.min(SNAP_RANGE_M.max, Math.max(SNAP_RANGE_M.min, view.view().radius * SNAP_SCREEN_FRACTION));
  }

  function updatePointer(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }

  function groundPoint(event: PointerEvent): { x: number; z: number } | null {
    updatePointer(event);
    return raycaster.ray.intersectPlane(groundPlane, planeHit) ? { x: planeHit.x, z: planeHit.z } : null;
  }

  function rootOf(hit: any, roots: readonly any[]): any | undefined {
    let object: any = hit;
    while (object) {
      if (roots.includes(object)) return object;
      object = object.parent;
    }
    return undefined;
  }

  function hitDecor(event: PointerEvent): FarmDecorRow | undefined {
    updatePointer(event);
    const models = world.models();
    const hit = raycaster.intersectObjects(models, true)[0]?.object;
    const root = hit && rootOf(hit, models);
    return root && layout.decor.find((candidate) => candidate.instanceId === root.userData.decorInstanceId);
  }

  function moveFromPointer(event: PointerEvent): void {
    const row = selected();
    if (!row) return;
    const point = groundPoint(event);
    if (!point) return;
    const wanted = { x: point.x + dragOffset.x, z: point.z + dragOffset.z, rotationY: row.rotationY };
    const aligned = alignFarmDecorPlacement(layout, row.instanceId, wanted, snapThreshold(event));
    const moved = applyPlacement(aligned.value, true);
    gizmos.setGuides(moved ? aligned.guides : []);
  }

  function beginHandleDrag(handle: DecorHandle): void {
    handleDrag = handle;
    gizmos.setActive(handle);
    canvas.style.cursor = "ew-resize";
  }

  function resizeFromPointer(event: PointerEvent): void {
    const row = selected();
    if (!row || !handleDrag || handleDrag.kind !== "stretch") return;
    const point = groundPoint(event);
    if (!point) return;
    const result = stretchFarmDecorEnd(layout, row.instanceId, handleDrag.end, point, FARM_BOUNDS, snapThreshold(event));
    editLength(result, "preview");
    gizmos.setGuides(result.valid ? result.guides : []);
  }

  function endHandleDrag(): void {
    const row = selected();
    handleDrag = null;
    gizmos.setActive(null);
    gizmos.setGuides([]);
    if (row && history.isOpen()) editLength({ valid: true, layout, instanceId: row.instanceId, reason: "" }, "commit");
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
    view.enter({ x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, pitch: camera.rotation.x });
    setStatus("Drag anything to move it · drag the ground to orbit · right-drag to pan · scroll to zoom · C to centre on the selection.");
    renderScene();
    renderPanel();
    onEditingChange(true);
  }

  function finish(): void {
    if (!editing) return;
    void storeLayout();
    editing = false;
    dragging = false;
    handleDrag = null;
    cameraGesture = "none";
    canvas.style.cursor = "";
    document.body.classList.remove("is-editing");
    elements.panel.hidden = true;
    elements.editButton.setAttribute("aria-pressed", "false");
    selectionBox.visible = false;
    gizmos.setHandles([], { x: 0, y: 1, z: 0 });
    gizmos.setGuides([]);
    view.exit();
    onEditingChange(false);
    canvas.focus();
  }

  function toggle(): void {
    if (editing) finish();
    else enter();
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
      setStatus("The farm could not be saved.", "error");
    } finally {
      saving = false;
      elements.saveButton.disabled = false;
    }
  }

  function hoverCursor(event: PointerEvent): string {
    updatePointer(event);
    if (gizmos.pick(raycaster)) return "ew-resize";
    return hitDecor(event) ? "grab" : "";
  }

  elements.editButton.addEventListener("click", toggle);
  elements.rotateLeftButton.addEventListener("click", () => rotate(-1));
  elements.rotateRightButton.addEventListener("click", () => rotate(1));
  elements.undoButton.addEventListener("click", undo);
  elements.saveButton.addEventListener("click", () => { void storeLayout(); });
  elements.finishButton.addEventListener("click", finish);
  elements.resetButton.addEventListener("click", () => {
    if (!confirm("Reset the field to the starter farm? Fences, buildings, plants and ponds go back; your pets stay (swimmers need a pond to stay).")) return;
    const starter = normalizeFarmLayout({ ...createDefaultFarmLayout(), ground: layout.ground, pets: layout.pets });
    selection = "";
    commit(starter, "Starter field restored. Save to keep it.");
  });
  canvas.addEventListener("contextmenu", (event) => { if (editing) event.preventDefault(); });
  canvas.addEventListener("pointerdown", (event) => {
    if (!editing) return;
    const panButton = event.button === 1 || event.button === 2 || (event.button === 0 && event.shiftKey);
    if (event.button !== 0 && !panButton) return;
    view.cancelTransition();
    canvas.setPointerCapture?.(event.pointerId);
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
    gestureStart.x = event.clientX;
    gestureStart.y = event.clientY;
    if (panButton) {
      cameraGesture = "pan";
      view.beginPan(event);
      canvas.style.cursor = "all-scroll";
      return;
    }
    updatePointer(event);
    const handle = gizmos.pick(raycaster);
    if (handle && selected()) {
      beginHandleDrag(handle);
      return;
    }
    const row = hitDecor(event);
    if (row) {
      select(row.instanceId);
      const anchor = groundPoint(event);
      dragOffset.x = anchor ? row.x - anchor.x : 0;
      dragOffset.z = anchor ? row.z - anchor.z : 0;
      // The whole drag is one undo step.
      history.open(layout);
      dragging = true;
      canvas.style.cursor = "grabbing";
      return;
    }
    cameraGesture = "orbit";
    canvas.style.cursor = "move";
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!editing) return;
    if (handleDrag) {
      resizeFromPointer(event);
      return;
    }
    if (dragging) {
      moveFromPointer(event);
      return;
    }
    const deltaX = event.clientX - lastPointer.x;
    const deltaY = event.clientY - lastPointer.y;
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
    if (cameraGesture === "orbit") {
      view.orbit(deltaX, deltaY);
      return;
    }
    if (cameraGesture === "pan") {
      view.pan(event, deltaX, deltaY);
      return;
    }
    canvas.style.cursor = hoverCursor(event);
  });
  const endPointer = (event: PointerEvent): void => {
    const wasDragging = dragging;
    const wasOrbit = cameraGesture === "orbit";
    dragging = false;
    cameraGesture = "none";
    view.endPan();
    canvas.releasePointerCapture?.(event.pointerId);
    if (!editing) return;
    if (handleDrag) {
      endHandleDrag();
      canvas.style.cursor = hoverCursor(event);
      return;
    }
    canvas.style.cursor = hoverCursor(event);
    if (wasDragging) {
      gizmos.setGuides([]);
      history.close(layout);
      renderPanel();
      return;
    }
    if (wasOrbit && event.type === "pointerup" && Math.hypot(event.clientX - gestureStart.x, event.clientY - gestureStart.y) < CLICK_SLOP_PX) {
      clearSelection();
    }
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", (event) => {
    if (!editing) return;
    event.preventDefault();
    if (event.altKey && selected()) {
      resizeSelected(event.deltaY < 0 ? 1 : -1, "preview");
      clearTimeout(wheelGestureTimer);
      wheelGestureTimer = setTimeout(() => {
        const row = selected();
        if (row) editLength({ valid: true, layout, instanceId: row.instanceId, reason: "" }, "commit");
      }, WHEEL_GESTURE_MS);
      return;
    }
    view.zoom(event);
  }, { passive: false });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => { if (editing) view.applyViewOffset(); });
    observer.observe(canvas);
    if (elements.drawer) observer.observe(elements.drawer);
    observer.observe(elements.inspector);
  }
  window.addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLElement && Boolean(event.target.closest("input, textarea, select"));
    if (event.code === FARM_EDITOR_TOGGLE_KEY) {
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
      if (selection) duplicate(selection);
      return;
    }
    const bindings: Record<string, () => void> = {
      Escape: () => { if (selection) clearSelection(); else finish(); },
      KeyQ: () => rotate(-1),
      KeyR: () => rotate(1),
      KeyF: () => view.setView("front"),
      KeyT: () => view.setView("top"),
      KeyO: () => view.setView("overview"),
      KeyC: () => focusSelection(),
      Delete: () => { if (selection) remove(selection); },
      Backspace: () => { if (selection) remove(selection); },
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
    const action = bindings[event.code];
    if (!action) return;
    event.preventDefault();
    action();
  });

  renderScene();
  renderPanel();
  return Object.freeze({
    enter,
    finish,
    toggle,
    isEditing: () => editing,
    getLayout: () => layout,
    getObstacles: (state) => farmObstacles(layout, state),
    replaceLayout: (next) => {
      layout = next;
      renderScene();
      if (editing) renderPanel();
    },
  });
}
