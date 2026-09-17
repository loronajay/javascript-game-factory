// The build-mode camera as pure state: an orbit around a target on the floor.
//
// No THREE in here on purpose. The editor turns this into a camera pose with
// two calls (`position.set`, `lookAt`), and everything that decides WHERE the
// camera goes — orbit limits, pan bounds, zoom range, the preset views — is
// plain arithmetic that runs under node in the test suite.

import type { RoomBounds } from "./arcade-room-layout.mjs";

export type EditorCameraPreset = "overview" | "front" | "left" | "right" | "back" | "top";
export const EDITOR_CAMERA_PRESETS: readonly EditorCameraPreset[] = Object.freeze([
  "overview", "front", "left", "right", "back", "top",
]);

export type EditorCameraState = Readonly<{
  /** The point on the floor plane the camera orbits and looks at. */
  target: Readonly<{ x: number; y: number; z: number }>;
  /** Horizontal orbit angle, radians. 0 looks down -Z from +Z, the same convention as the player's yaw. */
  yaw: number;
  /** Elevation above the floor plane, radians. Clamped so the camera never dips under the floor. */
  pitch: number;
  /** Distance from the target. */
  radius: number;
  /** The preset this pose came from, or `null` once a gesture has moved it. */
  preset: EditorCameraPreset | null;
}>;

export const EDITOR_CAMERA_LIMITS = Object.freeze({
  radius: Object.freeze({ min: 2.5, max: 16 }),
  pitch: Object.freeze({ min: 0.12, max: 1.5 }),
  targetHeight: 0.9,
  orbitSpeed: 0.006,
  pitchSpeed: 0.005,
  zoomSpeed: 0.004,
});

const DEFAULT_TARGET = Object.freeze({ x: 0, y: EDITOR_CAMERA_LIMITS.targetHeight, z: -1.6 });

const PRESETS: Readonly<Record<EditorCameraPreset, Readonly<{ yaw: number; pitch: number; radius: number }>>> = Object.freeze({
  overview: Object.freeze({ yaw: 0.72, pitch: 0.62, radius: 7.2 }),
  front: Object.freeze({ yaw: 0, pitch: 0.3, radius: 6.5 }),
  back: Object.freeze({ yaw: Math.PI, pitch: 0.3, radius: 6.5 }),
  left: Object.freeze({ yaw: Math.PI / 2, pitch: 0.3, radius: 6.5 }),
  right: Object.freeze({ yaw: -Math.PI / 2, pitch: 0.3, radius: 6.5 }),
  top: Object.freeze({ yaw: 0, pitch: EDITOR_CAMERA_LIMITS.pitch.max, radius: 11 }),
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampTarget(target: { x: number; y: number; z: number }, room: RoomBounds): { x: number; y: number; z: number } {
  const limitX = Math.max(0, room.width / 2 - room.wallInset);
  const limitZ = Math.max(0, room.depth / 2 - room.wallInset);
  return { x: clamp(target.x, -limitX, limitX), y: target.y, z: clamp(target.z, -limitZ, limitZ) };
}

export function createEditorCamera(room: RoomBounds): EditorCameraState {
  return applyEditorCameraPreset({ target: DEFAULT_TARGET, ...PRESETS.overview, preset: "overview" }, "overview", room);
}

/**
 * A preset keeps the current target when the player has panned to a corner of the
 * room — "look from the front" means the front of what I am arranging — except
 * `overview`, which is also the reset and returns to the room's centre.
 */
export function applyEditorCameraPreset(state: EditorCameraState, preset: EditorCameraPreset, room: RoomBounds): EditorCameraState {
  const target = preset === "overview" ? DEFAULT_TARGET : clampTarget(state.target, room);
  return { target, ...PRESETS[preset], preset };
}

export function orbitEditorCamera(state: EditorCameraState, deltaX: number, deltaY: number): EditorCameraState {
  if (!deltaX && !deltaY) return state;
  return {
    ...state,
    yaw: state.yaw - deltaX * EDITOR_CAMERA_LIMITS.orbitSpeed,
    pitch: clamp(state.pitch + deltaY * EDITOR_CAMERA_LIMITS.pitchSpeed, EDITOR_CAMERA_LIMITS.pitch.min, EDITOR_CAMERA_LIMITS.pitch.max),
    preset: null,
  };
}

/**
 * Pan slides the target across the floor in screen-relative directions, so
 * dragging right always moves the view right whichever way it has been orbited.
 * Scaled by radius so a zoomed-out view pans faster across the room.
 */
export function panEditorCamera(state: EditorCameraState, deltaX: number, deltaY: number, room: RoomBounds): EditorCameraState {
  if (!deltaX && !deltaY) return state;
  const step = state.radius * 0.0016;
  const forward = { x: -Math.sin(state.yaw), z: -Math.cos(state.yaw) };
  const right = { x: -forward.z, z: forward.x };
  const target = clampTarget({
    x: state.target.x - right.x * deltaX * step + forward.x * deltaY * step,
    y: state.target.y,
    z: state.target.z - right.z * deltaX * step + forward.z * deltaY * step,
  }, room);
  return { ...state, target, preset: null };
}

export function zoomEditorCamera(state: EditorCameraState, deltaY: number): EditorCameraState {
  if (!deltaY) return state;
  return {
    ...state,
    radius: clamp(state.radius + deltaY * EDITOR_CAMERA_LIMITS.zoomSpeed, EDITOR_CAMERA_LIMITS.radius.min, EDITOR_CAMERA_LIMITS.radius.max),
    preset: null,
  };
}

/**
 * The camera pose for a state: where it sits and what it looks at.
 *
 * The position is kept INSIDE the walls when a room is given: a zoomed-out view
 * from a corner would otherwise put the camera behind a wall looking at its
 * back face. Height is not clamped — the editor lifts the ceiling off while
 * building, so the overview and top presets look down into the room like a
 * dollhouse rather than at the roof.
 */
export function editorCameraPose(state: EditorCameraState, room?: RoomBounds): Readonly<{
  position: Readonly<{ x: number; y: number; z: number }>;
  target: Readonly<{ x: number; y: number; z: number }>;
}> {
  const flat = Math.cos(state.pitch) * state.radius;
  const raw = {
    x: state.target.x + Math.sin(state.yaw) * flat,
    y: state.target.y + Math.sin(state.pitch) * state.radius,
    z: state.target.z + Math.cos(state.yaw) * flat,
  };
  return {
    position: room ? clampTarget(raw, room) : raw,
    target: state.target,
  };
}
