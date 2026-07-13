export async function resolveAnimatedMove(command, {
  getState,
  setResolving,
  findUnit,
  dispatch,
  getDispatchEvents,
  playRolloverFx,
  render,
  effects,
} = {}, { keepResolving = false } = {}) {
  const state = getState?.();
  const unit = state ? findUnit?.(state, command.unitId) : null;
  const from = unit ? { ...unit.position } : null;

  setResolving?.(true);
  if (!dispatch?.(command, { deferRolloverFx: true })) {
    setResolving?.(false);
    return false;
  }
  const events = [...(getDispatchEvents?.() ?? [])];

  render?.();
  if (from) await effects?.animateMovement?.(command.unitId, from, command.position);
  await playRolloverFx?.(events);
  setResolving?.(keepResolving);
  render?.();
  return true;
}
