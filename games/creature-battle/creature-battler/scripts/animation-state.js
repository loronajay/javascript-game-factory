// ── Animation State ───────────────────────────────────────────────────────
// Manages universal creature state animations: idle breathe, hurt flinch,
// KO slump, and defend crouch.
//
// These are locked universal animations — one implementation for all creatures.
// Do not add per-creature overrides here or anywhere else.
//
// Public API (global object):
//   CreatureState.initBattle()          — start idle on all alive creatures
//   CreatureState.setKO(side, slot)     — stop idle, play KO slump
//   CreatureState.setDefend(side, slot) — apply defend crouch (held for round)
//   CreatureState.clearDefend()         — release all defend crouches (round start)
//   CreatureState.playHurt(side, slot)  — one-shot hurt flinch (fallback only)
//   CreatureState.clearAll()            — strip all state classes (battle end)
// ─────────────────────────────────────────────────────────────────────────

const CreatureState = (() => {

  function _getEl(side, slot) {
    return document.querySelector(`[data-creature="${side}-${slot}"]`);
  }

  // ── initBattle ─────────────────────────────────────────────────────────
  // Called once after renderBattle writes the field HTML.
  // Starts idle breathe on every alive creature with staggered delays
  // so all six don't pulse in perfect unison.

  function initBattle() {
    let i = 0;
    document.querySelectorAll('.battle-creature:not(.ko)').forEach(el => {
      const wrapper = el.querySelector('.creature-breathe-wrapper');
      if (wrapper) {
        // Stagger: 0s, 0.37s, 0.74s, 1.11s, 1.48s, 1.85s
        wrapper.style.animationDelay = `${(i * 0.37).toFixed(2)}s`;
      }
      el.classList.add('anim-state-idle');
      i++;
    });
  }

  // ── setKO ──────────────────────────────────────────────────────────────
  // Strips idle/defend/hurt, plays the one-shot KO slump.
  // forwards fill holds the slumped state for the rest of the battle.

  function setKO(side, slot) {
    const el = _getEl(side, slot);
    if (!el) return;
    el.classList.remove('anim-state-idle', 'anim-state-defend', 'anim-state-hurt');
    // Remove then re-add on next frame to restart the animation if called twice
    el.classList.remove('anim-state-ko');
    requestAnimationFrame(() => el.classList.add('anim-state-ko'));
  }

  // ── setDefend ──────────────────────────────────────────────────────────
  // Applies the held defend crouch. Stays until clearDefend() is called.

  function setDefend(side, slot) {
    const el = _getEl(side, slot);
    if (!el) return;
    el.classList.add('anim-state-defend');
  }

  // ── clearDefend ────────────────────────────────────────────────────────
  // Removes defend crouch from all creatures. Called at the start of each round
  // (same tick that isDefending flags are cleared in battle state).

  function clearDefend() {
    document.querySelectorAll('.battle-creature.anim-state-defend').forEach(el => {
      el.classList.remove('anim-state-defend');
    });
  }

  // ── playHurt ───────────────────────────────────────────────────────────
  // Universal fallback hurt flinch for moves with no element-specific hit
  // animation. Does not fire alongside existing element hit animations —
  // only used when there is genuinely no hit animation defined.

  function playHurt(side, slot) {
    const el = _getEl(side, slot);
    if (!el || el.classList.contains('ko')) return;
    // Remove and re-add to restart if hit again mid-animation
    el.classList.remove('anim-state-hurt');
    requestAnimationFrame(() => {
      el.classList.add('anim-state-hurt');
      el.addEventListener('animationend', () => {
        el.classList.remove('anim-state-hurt');
      }, { once: true });
    });
  }

  // ── clearAll ───────────────────────────────────────────────────────────
  // Strips all state classes. Called when the battle ends so the field is
  // clean if the player re-enters a battle without a full page reload.

  function clearAll() {
    document.querySelectorAll('.battle-creature').forEach(el => {
      el.classList.remove(
        'anim-state-idle',
        'anim-state-hurt',
        'anim-state-ko',
        'anim-state-defend'
      );
      const wrapper = el.querySelector('.creature-breathe-wrapper');
      if (wrapper) wrapper.style.removeProperty('animation-delay');
    });
  }

  return { initBattle, setKO, setDefend, clearDefend, playHurt, clearAll };

})();
