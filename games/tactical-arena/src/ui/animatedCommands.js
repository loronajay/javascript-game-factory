export async function resolveAnimatedMove(command, {
  getState,
  setResolving,
  findUnit,
  dispatch,
  render,
  effects,
} = {}, { keepResolving = false } = {}) {
  const state = getState?.();
  const unit = state ? findUnit?.(state, command.unitId) : null;
  const from = unit ? { ...unit.position } : null;

  setResolving?.(true);
  if (!dispatch?.(command)) {
    setResolving?.(false);
    return false;
  }

  render?.();
  if (from) await effects?.animateMovement?.(command.unitId, from, command.position);
  setResolving?.(keepResolving);
  render?.();
  return true;
}
