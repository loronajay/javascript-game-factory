// Keyboard conventions shared by every 3D space editor. Keeping this tiny
// mapping outside either controller prevents the farm and arcade room from
// silently drifting onto different promised controls.

export type EditorRotationDirection = -1 | 1;

/** Q turns left and E turns right; every other key is not a rotation command. */
export function editorRotationDirection(code: string): EditorRotationDirection | null {
  if (code === "KeyQ") return -1;
  if (code === "KeyE") return 1;
  return null;
}
