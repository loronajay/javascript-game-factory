// The build-mode camera as a controller: orbit, pan, zoom, preset views and
// the eased transitions between them, wrapped around the pure maths in
// `arcade-room-camera.mts`.
//
// Shared by every walkable space. The pure module decides WHERE the camera is
// for a given state; this one owns the state, the THREE camera it drives, the
// projection offset that keeps the orbit target in the strip of canvas the
// build chrome leaves free, and the far-plane swap on enter/exit. It reads
// pointer events only to project them onto the target plane; which button
// starts which gesture is the editor's business, so nothing here listens to
// the canvas.
//
// `onPose` fires after every camera move — a space hangs its own follow-ups
// on it (the room drops the walls between the lens and the floor, both spaces
// re-scale the resize handles).

import {
  EDITOR_CAMERA_LIMITS,
  EDITOR_CAMERA_PRESETS,
  applyEditorCameraPreset,
  createEditorCamera,
  editorCameraFromWalkingPose,
  editorCameraPose,
  editorViewOffset,
  focusEditorCamera,
  interpolateEditorCamera,
  orbitEditorCamera,
  panEditorCamera,
  panEditorCameraToAnchor,
  zoomEditorCamera,
  type EditorCameraPreset,
  type EditorCameraState,
} from "../arcade-room-camera.mjs";
import type { RoomBounds } from "../arcade-room-layout.mjs";

type ThreeNamespace = Record<string, any>;

export type EditorCameraControllerOptions = Readonly<{
  THREE: ThreeNamespace;
  camera: any;
  canvas: HTMLCanvasElement;
  bounds: RoomBounds;
  /** Preset-view buttons, each carrying `data-view`; their pressed state follows the view. */
  viewButtons?: HTMLElement | null;
  /** The chrome blocks that cover the canvas while building; the projection is centred between them. */
  offsetBlocks?: () => readonly HTMLElement[];
  /** After every camera move, with the view that produced it. */
  onPose?: (view: EditorCameraState) => void;
}>;

export type EditorCameraController = Readonly<{
  view: () => EditorCameraState;
  /**
   * Take the camera over from the walking pose so nothing on screen jumps, and
   * push the far plane out so the far wall survives a zoomed-out view.
   */
  enter: (walking: Readonly<{ x: number; y: number; z: number; yaw: number; pitch: number }>) => void;
  /** Hand the camera back: far plane and projection centre as they were. */
  exit: () => void;
  setView: (preset: EditorCameraPreset, immediate?: boolean) => void;
  /** Ease the view to a point on the floor (a selected item). */
  focus: (point: Readonly<{ x: number; z: number }>) => void;
  cancelTransition: () => void;
  orbit: (deltaX: number, deltaY: number) => void;
  /** Start a grab-the-floor pan at the pointer; the point pressed on stays under the cursor. */
  beginPan: (event: PointerEvent) => void;
  pan: (event: PointerEvent, deltaX: number, deltaY: number) => void;
  endPan: () => void;
  zoom: (event: WheelEvent) => void;
  /** Where the cursor's ray meets the target plane, or null when it looks over the horizon. */
  targetPlanePoint: (event: PointerEvent | WheelEvent) => Readonly<{ x: number; z: number }> | null;
  /** Re-centre the projection on the free strip; call when the chrome or the canvas resizes. */
  applyViewOffset: () => void;
  /** Re-pose the THREE camera from the current view (after an external change to the scene). */
  apply: () => void;
  /** True when a `data-view` value names a preset. */
  isPreset: (value: string | undefined) => value is EditorCameraPreset;
}>;

export function createEditorCameraController(options: EditorCameraControllerOptions): EditorCameraController {
  const { THREE, camera, canvas, bounds } = options;
  const viewButtons = options.viewButtons ?? null;
  const offsetBlocks = options.offsetBlocks ?? (() => []);
  const onPose = options.onPose ?? (() => undefined);
  let view: EditorCameraState = createEditorCamera(bounds);
  // A preset or focus eases from `transitionFrom` to `transitionTo`; any gesture cuts it short where it is.
  let transitionFrom: EditorCameraState | null = null;
  let transitionTo: EditorCameraState | null = null;
  let transitionStart = 0;
  let transitionFrame = 0;
  // The point on the target plane the player grabbed for a pan, so it can be kept under the cursor.
  let panAnchor: { x: number; z: number } | null = null;
  // The walking camera's far plane, put back on exit.
  let walkingFar = camera.far;
  let entered = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  // The orbit target lives on this plane; pan and zoom read the cursor against it so
  // the point under the hand is the one that stays put.
  const targetPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), EDITOR_CAMERA_LIMITS.targetHeight);
  const planeHit = new THREE.Vector3();

  function renderViewButtons(): void {
    if (!viewButtons) return;
    for (const button of viewButtons.querySelectorAll<HTMLButtonElement>("[data-view]")) {
      button.setAttribute("aria-pressed", String(button.dataset.view === view.preset));
    }
  }

  /**
   * Centre the projection on the widest strip of canvas the build chrome leaves
   * free, so the orbit target - what every gesture is about - is in the middle of
   * what the player can see and not under the drawer or the inspector. Re-read
   * each time because those blocks and the canvas all resize.
   */
  function applyViewOffset(): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const canvasRect = canvas.getBoundingClientRect();
    const blocks = entered
      ? offsetBlocks()
        .filter((block) => !block.hidden && block.offsetParent !== null)
        .map((block) => block.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ left: rect.left - canvasRect.left, top: rect.top - canvasRect.top, width: rect.width, height: rect.height }))
      : [];
    const offset = editorViewOffset({ width, height }, blocks);
    if (offset.x || offset.y) camera.setViewOffset(width, height, offset.x, offset.y, width, height);
    else camera.clearViewOffset();
  }

  function apply(): void {
    const pose = editorCameraPose(view, bounds);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    applyViewOffset();
    onPose(view);
  }

  function moved(): void {
    apply();
    renderViewButtons();
  }

  function cancelTransition(): void {
    if (transitionFrame) cancelAnimationFrame(transitionFrame);
    transitionFrame = 0;
    transitionFrom = transitionTo = null;
  }

  function stepTransition(now: number): void {
    transitionFrame = 0;
    if (!transitionFrom || !transitionTo) return;
    const t = (now - transitionStart) / EDITOR_CAMERA_LIMITS.transitionMs;
    view = interpolateEditorCamera(transitionFrom, transitionTo, t);
    apply();
    if (t >= 1) {
      transitionFrom = transitionTo = null;
      return;
    }
    transitionFrame = requestAnimationFrame(stepTransition);
  }

  /** Ease the view to a destination; a gesture during the move keeps whatever frame it reached. */
  function transitionView(to: EditorCameraState): void {
    cancelTransition();
    transitionFrom = view;
    transitionTo = to;
    transitionStart = performance.now();
    view = interpolateEditorCamera(transitionFrom, transitionTo, 0);
    moved();
    transitionFrame = requestAnimationFrame(stepTransition);
  }

  function updatePointer(event: PointerEvent | WheelEvent): void {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  }

  function targetPlanePoint(event: PointerEvent | WheelEvent): { x: number; z: number } | null {
    updatePointer(event);
    if (!raycaster.ray.intersectPlane(targetPlane, planeHit)) return null;
    // A hit far beyond the target is the ray grazing the plane near the horizon, where a
    // few pixels are metres: useless as an anchor, so the screen-delta pan takes over.
    if (Math.hypot(planeHit.x - view.target.x, planeHit.z - view.target.z) > view.radius * 2) return null;
    return { x: planeHit.x, z: planeHit.z };
  }

  const isPreset = (value: string | undefined): value is EditorCameraPreset =>
    typeof value === "string" && (EDITOR_CAMERA_PRESETS as readonly string[]).includes(value);

  if (viewButtons) {
    viewButtons.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>("[data-view]");
      const preset = button?.dataset.view;
      if (isPreset(preset)) setView(preset);
    });
  }

  function setView(preset: EditorCameraPreset, immediate = false): void {
    const next = applyEditorCameraPreset(view, preset, bounds);
    if (immediate) {
      cancelTransition();
      view = next;
      moved();
      return;
    }
    transitionView(next);
  }

  return Object.freeze({
    view: () => view,
    enter(walking) {
      entered = true;
      // The lens may stand well outside the space now; the walking camera's far plane would clip the far edge.
      walkingFar = camera.far;
      camera.far = Math.max(walkingFar, EDITOR_CAMERA_LIMITS.radius.max + Math.hypot(bounds.width, bounds.depth) + 4);
      // Build from where the player stands and looks: the walking pose becomes the orbit,
      // and nothing on screen jumps. The overview preset still resets it.
      cancelTransition();
      view = editorCameraFromWalkingPose(walking, bounds);
      moved();
    },
    exit() {
      entered = false;
      cancelTransition();
      panAnchor = null;
      camera.clearViewOffset();
      camera.far = walkingFar;
      camera.updateProjectionMatrix();
    },
    setView,
    focus: (point) => transitionView(focusEditorCamera(view, point, bounds)),
    cancelTransition,
    orbit(deltaX, deltaY) {
      view = orbitEditorCamera(view, deltaX, deltaY);
      moved();
    },
    beginPan(event) {
      cancelTransition();
      panAnchor = targetPlanePoint(event);
    },
    pan(event, deltaX, deltaY) {
      // Grab the floor: the point pressed on stays under the cursor. Over the horizon
      // (no plane hit) the screen-delta pan takes over so the drag never dies.
      const hit = panAnchor ? targetPlanePoint(event) : null;
      view = hit && panAnchor ? panEditorCameraToAnchor(view, panAnchor, hit, bounds) : panEditorCamera(view, deltaX, deltaY, bounds);
      moved();
    },
    endPan() {
      panAnchor = null;
    },
    zoom(event) {
      cancelTransition();
      view = zoomEditorCamera(view, event.deltaY, { anchor: targetPlanePoint(event), room: bounds });
      moved();
    },
    targetPlanePoint,
    applyViewOffset,
    apply,
    isPreset,
  });
}
