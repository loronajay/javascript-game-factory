import type { CabinetDefinition } from "./arcade-room-cabinet.mjs";
import {
  createDefaultRoomLayout,
  rotatePlacement,
  setItemHidden,
  updateItemPlacement,
  type ItemFootprint,
  type RoomBounds,
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

type ThreeNamespace = Record<string, any>;

type RoomEditorElements = Readonly<{
  panel: HTMLElement;
  editButton: HTMLButtonElement;
  cabinetList: HTMLElement;
  rotateLeftButton: HTMLButtonElement;
  rotateRightButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  finishButton: HTMLButtonElement;
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
  floor: any;
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
}>;

/**
 * Key that flips build mode on and off. It has to be a key rather than only a button because pointer
 * lock hides the cursor, and it cannot be Escape because the browser eats that to release the lock.
 */
export const ROOM_EDITOR_TOGGLE_KEY = "KeyB";
const NUDGE_STEP = 0.1;

export function createRoomEditor(options: RoomEditorOptions): RoomEditor {
  const { THREE, scene, camera, canvas, floor, cabinets, room, initialLayout, persist, elements, canEnter, onEditingChange } = options;
  const catalog = Object.fromEntries(cabinets.map((entry) => [entry.cabinet.id, entry.footprint]));
  let layout = initialLayout;
  let selectedInstanceId = layout.items[0]?.instanceId ?? "";
  let editing = false;
  let dragging = false;
  let saving = false;
  // Which camera gesture the current pointer owns: orbit on a left-drag over empty floor,
  // pan on a right/middle-drag or a Shift+left-drag anywhere. Decided on pointerdown.
  let cameraGesture: "none" | "orbit" | "pan" = "none";
  let view: EditorCameraState = createEditorCamera(room);
  const lastPointer = { x: 0, y: 0 };
  // Grab offset between the floor point under the cursor and the cabinet's origin, so a cabinet
  // picked up by its edge stays under the hand instead of snapping its centre to the cursor.
  const dragOffset = { x: 0, z: 0 };
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const selection = new THREE.BoxHelper(cabinets[0]?.model, 0x70e8ff);
  selection.material.depthTest = false;
  selection.material.transparent = true;
  selection.material.opacity = 0.9;
  selection.renderOrder = 10;
  selection.visible = false;
  scene.add(selection);

  function cabinetPlacement(): RoomLayoutItem {
    return layout.items.find((item) => item.instanceId === selectedInstanceId)
      ?? layout.items[0]
      ?? createDefaultRoomLayout().items[0];
  }

  function cabinetEntry(cabinetId: string): EditableCabinet | undefined {
    return cabinets.find((entry) => entry.cabinet.id === cabinetId);
  }

  function placementLabel(placement: RoomLayoutItem): string {
    const degrees = Math.round(placement.rotationY * 180 / Math.PI);
    return `X ${placement.x.toFixed(1)} · Z ${placement.z.toFixed(1)} · ${degrees}°`;
  }

  function renderCabinetList(): void {
    elements.cabinetList.replaceChildren(...layout.items.map((placement, index) => {
      const entry = cabinetEntry(placement.cabinetId);
      const row = document.createElement("div");
      row.className = "cabinet-list__row";
      row.dataset.hidden = String(placement.hidden);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cabinet-list__item";
      button.dataset.instanceId = placement.instanceId;
      button.setAttribute("aria-pressed", String(placement.instanceId === selectedInstanceId));
      button.title = `Select ${entry?.cabinet.title ?? "cabinet"} (${index + 1})`;
      const image = document.createElement("img");
      image.src = `../grid-previews/${entry?.cabinet.gameSlug ?? "bird-duty"}.png`;
      image.alt = "";
      const text = document.createElement("div");
      const hotkey = document.createElement("span");
      hotkey.textContent = `CABINET ${index + 1}`;
      const title = document.createElement("strong");
      title.textContent = entry?.cabinet.title ?? placement.cabinetId;
      const position = document.createElement("small");
      position.textContent = placement.hidden ? "Hidden · off the floor" : placementLabel(placement);
      text.append(hotkey, title, position);
      button.append(image, text);
      // The toggle sits beside the select button rather than inside it: a button
      // cannot contain a button, and the two are different decisions anyway.
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "cabinet-list__toggle";
      toggle.dataset.toggleInstanceId = placement.instanceId;
      toggle.setAttribute("aria-pressed", String(!placement.hidden));
      toggle.title = placement.hidden ? "Put this cabinet back on the floor (H)" : "Take this cabinet off the floor (H)";
      toggle.textContent = placement.hidden ? "Show" : "Hide";
      row.append(button, toggle);
      return row;
    }));
  }

  function renderPlacement(): void {
    for (const placement of layout.items) {
      const entry = cabinetEntry(placement.cabinetId);
      if (!entry) continue;
      entry.model.position.set(placement.x, 0, placement.z);
      entry.model.rotation.y = placement.rotationY;
      entry.model.visible = !placement.hidden;
    }
    const current = cabinetPlacement();
    const selected = cabinetEntry(current.cabinetId);
    if (selected) selection.setFromObject(selected.model);
    selection.visible = editing && !current.hidden;
    renderCabinetList();
  }

  function setStatus(message: string, state = "ready"): void {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }

  function select(instanceId: string): void {
    if (!layout.items.some((item) => item.instanceId === instanceId)) return;
    selectedInstanceId = instanceId;
    renderPlacement();
    const current = cabinetPlacement();
    const entry = cabinetEntry(current.cabinetId);
    const title = entry?.cabinet.title ?? "Cabinet";
    setStatus(current.hidden
      ? `${title} is hidden · press H or Show to put it back on the floor.`
      : `${title} selected · drag it, nudge with arrows, Q/R to rotate, H to hide.`);
  }

  function setHidden(instanceId: string, hidden: boolean): void {
    const result = setItemHidden(layout, instanceId, hidden, room, catalog);
    const title = cabinetEntry(layout.items.find((item) => item.instanceId === instanceId)?.cabinetId ?? "")?.cabinet.title ?? "Cabinet";
    if (!result.valid) {
      setStatus(`No room for ${title} · clear its old spot or the starter spot first.`, "error");
      return;
    }
    layout = result.layout;
    selectedInstanceId = instanceId;
    renderPlacement();
    setStatus(hidden ? `${title} is off the floor · unsaved` : `${title} is back on the floor · unsaved`, "dirty");
  }

  function toggleHidden(instanceId = cabinetPlacement().instanceId): void {
    const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
    if (item) setHidden(instanceId, !item.hidden);
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

  function applyPlacement(next: Readonly<{ x: number; z: number; rotationY: number }>): boolean {
    const current = cabinetPlacement();
    if (current.hidden) {
      setStatus("That cabinet is hidden · show it before moving it.", "error");
      return false;
    }
    const result = updateItemPlacement(layout, current.instanceId, next, room, catalog);
    if (!result.valid) {
      setStatus("That spot is blocked by another cabinet.", "error");
      return false;
    }
    layout = result.layout;
    renderPlacement();
    setStatus("Unsaved changes", "dirty");
    return true;
  }

  function rotate(direction: -1 | 1): void {
    const current = cabinetPlacement();
    const entry = cabinetEntry(current.cabinetId);
    if (entry) applyPlacement(rotatePlacement(current, direction, entry.cabinet.placement.snapDegrees));
  }

  function nudge(screenX: number, screenY: number): void {
    // Camera-relative so "up" pushes the cabinet away from the viewer whichever way the room is orbited.
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = { x: -forward.z, z: forward.x };
    const current = cabinetPlacement();
    applyPlacement({
      x: current.x + (right.x * screenX + forward.x * screenY) * NUDGE_STEP,
      z: current.z + (right.z * screenX + forward.z * screenY) * NUDGE_STEP,
      rotationY: current.rotationY,
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
    return raycaster.intersectObject(floor, false)[0]?.point ?? null;
  }

  function hitCabinet(event: PointerEvent): RoomLayoutItem | undefined {
    updatePointer(event);
    const hit = raycaster.intersectObjects(cabinets.map((entry) => entry.model), true)[0]?.object;
    if (!hit) return undefined;
    const entry = cabinets.find((candidate) => {
      let object: any = hit;
      while (object) {
        if (object === candidate.model) return true;
        object = object.parent;
      }
      return false;
    });
    return entry && layout.items.find((candidate) => candidate.cabinetId === entry.cabinet.id && !candidate.hidden);
  }

  function moveFromPointer(event: PointerEvent): void {
    const point = floorPoint(event);
    if (!point) return;
    const current = cabinetPlacement();
    applyPlacement({ x: point.x + dragOffset.x, z: point.z + dragOffset.z, rotationY: current.rotationY });
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
    setStatus("Drag a cabinet to move it · drag the floor to orbit · right-drag to pan · scroll to zoom.");
    renderPlacement();
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
    selection.visible = false;
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
    if (!confirm("Reset the room to the starter layout? Hidden cabinets come back too.")) return;
    layout = createDefaultRoomLayout();
    selectedInstanceId = layout.items[0]?.instanceId ?? "";
    renderPlacement();
    setStatus("Starter layout restored. Save to keep it.", "dirty");
  });
  elements.cabinetList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const toggle = target.closest<HTMLElement>("[data-toggle-instance-id]");
    if (toggle?.dataset.toggleInstanceId) {
      toggleHidden(toggle.dataset.toggleInstanceId);
      return;
    }
    const button = target.closest<HTMLElement>("[data-instance-id]");
    if (button?.dataset.instanceId) select(button.dataset.instanceId);
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
    const hit = hitCabinet(event);
    if (hit) {
      select(hit.instanceId);
      const point = floorPoint(event);
      const current = cabinetPlacement();
      dragOffset.x = point ? current.x - point.x : 0;
      dragOffset.z = point ? current.z - point.z : 0;
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
    canvas.style.cursor = hitCabinet(event) ? "grab" : "";
  });
  const endPointer = (event: PointerEvent): void => {
    dragging = false;
    cameraGesture = "none";
    canvas.releasePointerCapture?.(event.pointerId);
    if (editing) canvas.style.cursor = hitCabinet(event) ? "grab" : "";
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
    if (event.code === ROOM_EDITOR_TOGGLE_KEY) {
      event.preventDefault();
      toggle();
      return;
    }
    if (!editing) return;
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) return;
    const bindings: Record<string, () => void> = {
      Escape: finish,
      KeyQ: () => rotate(-1),
      KeyR: () => rotate(1),
      KeyH: () => toggleHidden(),
      KeyF: () => setView("front"),
      KeyT: () => setView("top"),
      KeyO: () => setView("overview"),
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
      if (item) select(item.instanceId);
      event.preventDefault();
      return;
    }
    const action = bindings[event.code];
    if (!action) return;
    event.preventDefault();
    action();
  });

  renderPlacement();
  return {
    enter,
    finish,
    toggle,
    isEditing: () => editing,
    getLayout: () => layout,
    // Hidden cabinets have no placement as far as the room is concerned: nothing to
    // walk into, nothing to play, nothing to prompt for.
    getCabinetPlacement: (cabinetId) => layout.items.find((item) => item.cabinetId === cabinetId && !item.hidden),
  };
}
