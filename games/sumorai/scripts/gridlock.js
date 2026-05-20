import { GRIDLOCK_KNOCKBACK } from './combat.js';

const MASH_PER_PRESS = 0.08;  // progress added per attack-just-pressed

export function createGridlockState() {
  return {
    p1Progress: 0,
    p2Progress: 0,
    resolved:   false,
    winner:     null,   // 'p1' | 'p2' | 'tie'
  };
}

// Advances the mash minigame one tick.
// Mutates p1/p2 speedX on resolution.
// Returns { resolved, winner } when done, null while ongoing.
export function tickGridlock(state, p1, p2, p1In, p2In) {
  if (state.resolved) return { resolved: true, winner: state.winner };

  if (p1In.attackJustPressed) state.p1Progress = Math.min(1, state.p1Progress + MASH_PER_PRESS);
  if (p2In.attackJustPressed) state.p2Progress = Math.min(1, state.p2Progress + MASH_PER_PRESS);

  const p1Done = state.p1Progress >= 1;
  const p2Done = state.p2Progress >= 1;
  if (!p1Done && !p2Done) return null;

  state.resolved = true;

  if (p1Done && p2Done) {
    state.winner = 'tie';
    p1.speedX = -GRIDLOCK_KNOCKBACK;
    p2.speedX =  GRIDLOCK_KNOCKBACK;
  } else if (p1Done) {
    state.winner = 'p1';
    p2.speedX = (p2.x >= p1.x ? 1 : -1) * GRIDLOCK_KNOCKBACK;
  } else {
    state.winner = 'p2';
    p1.speedX = (p1.x >= p2.x ? 1 : -1) * GRIDLOCK_KNOCKBACK;
  }

  return { resolved: true, winner: state.winner };
}
