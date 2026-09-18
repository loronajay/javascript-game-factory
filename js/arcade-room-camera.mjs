// The build-mode camera as pure state: an orbit around a target on the floor.
//
// No THREE in here on purpose. The editor turns this into a camera pose with
// two calls (`position.set`, `lookAt`), and everything that decides WHERE the
// camera goes — orbit limits, pan bounds, zoom range, the preset views, which
// walls to ghost, where the projection centre sits — is plain arithmetic that
// runs under node in the test suite.
//
// The model is the one every scene editor converges on: the camera looks at a
// point on a plane just above the floor and the player moves THAT point. Zoom
// goes toward the cursor, pan grabs the floor, focus jumps to the selection,
// and the camera is free to stand outside the room because the walls it would
// otherwise press against become see-through.
export const EDITOR_CAMERA_PRESETS = Object.freeze([
    "overview", "front", "left", "right", "back", "top",
]);
export const EDITOR_CAMERA_LIMITS = Object.freeze({
    radius: Object.freeze({ min: 2.5, max: 22 }),
    pitch: Object.freeze({ min: 0.12, max: 1.5 }),
    /** The target plane: a little above the floor so a cabinet's body, not its base, is what the orbit circles. */
    targetHeight: 0.9,
    /** Where a focus jump lands when the view was further out than this. */
    focusRadius: 7,
    /** A wall this close to the lens (or behind it) is ghosted: it would otherwise fill the frame. */
    cutawayMargin: 0.6,
    orbitSpeed: 0.006,
    pitchSpeed: 0.005,
    /** Multiplicative: one 100 px wheel notch scales the radius by e^0.12 ≈ 1.13. */
    zoomSpeed: 0.0012,
    /** The preset and focus moves ease over this long. */
    transitionMs: 260,
});
const DEFAULT_TARGET = Object.freeze({ x: 0, y: EDITOR_CAMERA_LIMITS.targetHeight, z: -1.6 });
const PRESETS = Object.freeze({
    overview: Object.freeze({ yaw: 0.72, pitch: 0.66, radius: 11 }),
    front: Object.freeze({ yaw: 0, pitch: 0.3, radius: 6.5 }),
    back: Object.freeze({ yaw: Math.PI, pitch: 0.3, radius: 6.5 }),
    left: Object.freeze({ yaw: Math.PI / 2, pitch: 0.3, radius: 6.5 }),
    right: Object.freeze({ yaw: -Math.PI / 2, pitch: 0.3, radius: 6.5 }),
    top: Object.freeze({ yaw: 0, pitch: EDITOR_CAMERA_LIMITS.pitch.max, radius: 14 }),
});
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function clampTarget(target, room) {
    const limitX = Math.max(0, room.width / 2 - room.wallInset);
    const limitZ = Math.max(0, room.depth / 2 - room.wallInset);
    return { x: clamp(target.x, -limitX, limitX), y: target.y, z: clamp(target.z, -limitZ, limitZ) };
}
export function createEditorCamera(room) {
    return applyEditorCameraPreset({ target: DEFAULT_TARGET, ...PRESETS.overview, preset: "overview" }, "overview", room);
}
/**
 * A preset keeps the current target when the player has panned to a corner of the
 * room — "look from the front" means the front of what I am arranging — except
 * `overview`, which is also the reset and returns to the room's centre.
 */
export function applyEditorCameraPreset(state, preset, room) {
    const target = preset === "overview" ? DEFAULT_TARGET : clampTarget(state.target, room);
    return { target, ...PRESETS[preset], preset };
}
/**
 * The editor view that puts the lens exactly where the walking camera is and
 * looks exactly where it looks, so pressing Build changes nothing on screen
 * and the player arranges what they were already standing in front of.
 *
 * The walking pose is the player's eye (`x`,`y`,`z`), heading `yaw` (forward is
 * `(-sin yaw, -cos yaw)`, the editor's convention too) and `pitch` as a rotation
 * about X, negative looking down. The orbit target is where that gaze meets the
 * working plane; a level or upward gaze cannot meet it, so it takes the
 * shallowest orbit the editor allows and looks at the floor ahead instead. A
 * radius outside the orbit range is clamped, which lifts or drops the lens along
 * the same line of sight rather than changing what it points at.
 */
export function editorCameraFromWalkingPose(walking, room) {
    const pitch = clamp(-walking.pitch, EDITOR_CAMERA_LIMITS.pitch.min, EDITOR_CAMERA_LIMITS.pitch.max);
    const drop = walking.y - EDITOR_CAMERA_LIMITS.targetHeight;
    const radius = drop > 0
        ? clamp(drop / Math.sin(pitch), EDITOR_CAMERA_LIMITS.radius.min, EDITOR_CAMERA_LIMITS.radius.max)
        : EDITOR_CAMERA_LIMITS.radius.min;
    const flat = Math.cos(pitch) * radius;
    const target = clampTarget({
        x: walking.x - Math.sin(walking.yaw) * flat,
        y: EDITOR_CAMERA_LIMITS.targetHeight,
        z: walking.z - Math.cos(walking.yaw) * flat,
    }, room);
    return { target, yaw: walking.yaw, pitch, radius, preset: null };
}
export function orbitEditorCamera(state, deltaX, deltaY) {
    if (!deltaX && !deltaY)
        return state;
    return {
        ...state,
        yaw: state.yaw - deltaX * EDITOR_CAMERA_LIMITS.orbitSpeed,
        pitch: clamp(state.pitch + deltaY * EDITOR_CAMERA_LIMITS.pitchSpeed, EDITOR_CAMERA_LIMITS.pitch.min, EDITOR_CAMERA_LIMITS.pitch.max),
        preset: null,
    };
}
/**
 * Pan by screen delta: slides the target across the floor in screen-relative
 * directions, scaled by radius so a zoomed-out view pans faster. This is the
 * fallback for when the cursor's ray misses the target plane (looking at the
 * horizon); `panEditorCameraToAnchor` is the one that feels like grabbing the floor.
 */
export function panEditorCamera(state, deltaX, deltaY, room) {
    if (!deltaX && !deltaY)
        return state;
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
/**
 * Grab-pan: the player pressed on `anchor` (a point on the target plane) and the
 * same pixel now hits `hit`. Moving the target by the difference puts the anchor
 * back under the cursor exactly, whatever the pitch or zoom. Only x/z are used —
 * both points are on the target plane.
 */
export function panEditorCameraToAnchor(state, anchor, hit, room) {
    const dx = anchor.x - hit.x;
    const dz = anchor.z - hit.z;
    if (!dx && !dz)
        return state;
    const target = clampTarget({ x: state.target.x + dx, y: state.target.y, z: state.target.z + dz }, room);
    return { ...state, target, preset: null };
}
/**
 * Zoom, optionally toward a point. Without an anchor the radius just scales.
 * With one — the cursor's hit on the target plane — the whole camera/target pair
 * is scaled about the anchor, so the ray from the lens to the anchor is unchanged
 * and the thing under the cursor stays under the cursor. That is the difference
 * between "zoom" and "zoom to where I am pointing".
 */
export function zoomEditorCamera(state, deltaY, options) {
    if (!deltaY)
        return state;
    const radius = clamp(state.radius * Math.exp(deltaY * EDITOR_CAMERA_LIMITS.zoomSpeed), EDITOR_CAMERA_LIMITS.radius.min, EDITOR_CAMERA_LIMITS.radius.max);
    if (radius === state.radius)
        return state;
    const anchor = options?.anchor;
    if (!anchor)
        return { ...state, radius, preset: null };
    const k = radius / state.radius;
    const scaled = {
        x: anchor.x + (state.target.x - anchor.x) * k,
        y: state.target.y,
        z: anchor.z + (state.target.z - anchor.z) * k,
    };
    return { ...state, radius, target: options?.room ? clampTarget(scaled, options.room) : scaled, preset: null };
}
/**
 * Jump the target onto a point (the selection) keeping the current angle, and
 * come in to working distance if the view was further out than that.
 */
export function focusEditorCamera(state, point, room) {
    const target = clampTarget({ x: point.x, y: EDITOR_CAMERA_LIMITS.targetHeight, z: point.z }, room);
    return { ...state, target, radius: Math.min(state.radius, EDITOR_CAMERA_LIMITS.focusRadius), preset: null };
}
function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
}
/**
 * The view part-way through a transition from one state to another, eased, with
 * the yaw taking the short way round. `t` is 0..1; 1 returns `to` itself so the
 * final frame is exactly the destination and not a rounding of it. The
 * destination's preset is shown throughout so the view buttons do not flicker.
 */
export function interpolateEditorCamera(from, to, t) {
    if (t >= 1)
        return to;
    const e = easeOutCubic(Math.max(0, t));
    let yawDelta = (to.yaw - from.yaw) % (Math.PI * 2);
    if (yawDelta > Math.PI)
        yawDelta -= Math.PI * 2;
    if (yawDelta < -Math.PI)
        yawDelta += Math.PI * 2;
    return {
        target: {
            x: from.target.x + (to.target.x - from.target.x) * e,
            y: from.target.y + (to.target.y - from.target.y) * e,
            z: from.target.z + (to.target.z - from.target.z) * e,
        },
        yaw: from.yaw + yawDelta * e,
        pitch: from.pitch + (to.pitch - from.pitch) * e,
        radius: from.radius + (to.radius - from.radius) * e,
        preset: to.preset,
    };
}
/**
 * The camera pose for a state: where it sits and what it looks at.
 *
 * The camera is deliberately allowed outside the room. The editor pairs this
 * pose with `editorCutawayWalls`, giving the player a dollhouse view instead of
 * crushing the camera against the inside face of a wall. Room bounds clamp the
 * target, never the lens.
 */
export function editorCameraPose(state, room) {
    void room;
    const flat = Math.cos(state.pitch) * state.radius;
    return {
        position: {
            x: state.target.x + Math.sin(state.yaw) * flat,
            y: state.target.y + Math.sin(state.pitch) * state.radius,
            z: state.target.z + Math.cos(state.yaw) * flat,
        },
        target: state.target,
    };
}
/**
 * The walls to ghost for a view: each one whose inner face the lens is beyond,
 * or within `cutawayMargin` of. Decided from where the camera actually IS rather
 * than which way it faces, so a view from inside the room keeps every wall solid
 * exactly as walking does, and a wall only turns see-through at the moment it
 * would otherwise be the only thing on screen.
 */
export function editorCutawayWalls(state, room) {
    const { position } = editorCameraPose(state);
    const thickness = room.wallThickness ?? 0;
    const reachX = room.width / 2 - thickness / 2 - EDITOR_CAMERA_LIMITS.cutawayMargin;
    const reachZ = room.depth / 2 - thickness / 2 - EDITOR_CAMERA_LIMITS.cutawayMargin;
    const walls = [];
    if (position.z < -reachZ)
        walls.push("north");
    if (position.z > reachZ)
        walls.push("south");
    if (position.x > reachX)
        walls.push("east");
    if (position.x < -reachX)
        walls.push("west");
    return walls;
}
/**
 * How far to shift the projection centre so it lands in the middle of the part of
 * the canvas the build panel leaves free, in CSS pixels. Without this the orbit
 * target — the thing every gesture is about — sits under the panel. A panel
 * that covers most of the width (a phone) leaves no strip worth centring on, so
 * the offset is zero there rather than shoving the view off the edge.
 */
export function editorViewOffset(canvas, panel) {
    if (!panel || canvas.width <= 0)
        return { x: 0, y: 0 };
    const freeWidth = clamp(panel.left, 0, canvas.width);
    if (freeWidth / canvas.width < 0.4 || freeWidth >= canvas.width)
        return { x: 0, y: 0 };
    return { x: (canvas.width - freeWidth) / 2, y: 0 };
}
