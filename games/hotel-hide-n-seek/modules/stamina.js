// The sprint meter. Sprinting is the one thing that lets a player outrun The Bellhop, so it is a
// spend-and-recover resource rather than a modifier: the bar drains while you run and refills while
// you walk, stand, or crouch, and emptying it takes sprinting away until you have earned it back.
//
// Every rule lives in `stamina-logic.js` so a server can run it headlessly; this module is only the
// HUD and the one-shot "you are winded" callout.
export function createStamina({ logic, config, world, document }) {
  const meterEl = document.getElementById('staminaMeter');
  const fillEl = document.getElementById('staminaFill');
  const readoutEl = document.getElementById('staminaReadout');
  let state = logic.createStaminaState();

  function updateHud() {
    const percent = Math.round(state.value * 100);
    fillEl.style.width = `${percent}%`;
    meterEl.dataset.state = state.exhausted ? 'spent' : state.sprinting ? 'sprinting' : state.value < 0.3 ? 'low' : 'ready';
    readoutEl.textContent = state.exhausted ? 'WINDED' : `${percent}%`;
  }

  // Returns whether the player is actually sprinting this tick, which is the only answer the movement
  // code needs — it never has to reason about the bar itself.
  function update(delta, { wantSprint = false, moving = false, crouching = false } = {}) {
    const wasExhausted = state.exhausted;
    state = logic.updateStamina(state, { delta, wantSprint, moving, crouching, config });
    if (state.exhausted && !wasExhausted) world.notify('YOUR LEGS GIVE OUT.', 2000);
    updateHud();
    return state.sprinting;
  }

  updateHud();
  return { update, isSprinting: () => state.sprinting, canSprint: () => logic.canSprint(state), getState: () => ({ ...state }) };
}
