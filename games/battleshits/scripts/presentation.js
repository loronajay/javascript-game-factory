export const SHOT_ANIMATION_MS = 1200;

export function getBattleStatusCopy(turn) {
  if (turn === 'mine') return 'Your turn - pick a target bowl space.';
  if (turn === 'awaiting_result') return 'Missile in the air...';
  return 'Opponent is lining up a shot...';
}

export function getTargetLabelCopy() {
  return 'Target Bowl';
}

export function getEndedScreenCopy(result) {
  if (result === 'win') {
    return {
      title: 'Victory',
      message: 'You flushed their whole fleet.',
    };
  }

  if (result === 'forfeit_win') {
    return {
      title: 'Victory by Forfeit',
      message: 'Opponent disconnected. The bowl is yours.',
    };
  }

  return {
    title: 'Defeat',
    message: 'Your fleet went under. Run it back.',
  };
}
