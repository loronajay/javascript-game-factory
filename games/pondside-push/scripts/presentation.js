/** Farm animal GLBs face local -Z after their canonical PI model offset. */
export function yawForFacing(x, z) {
  return Math.atan2(-x, -z);
}
