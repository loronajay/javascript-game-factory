// Online outcomes offer a way back to online setup, never a solo restart.
export function createOnlineResults({ world, spectator, document }) {
  return {
    // `won` is deliberately three-valued: true and false paint the win and loss palettes, and null is
    // an interruption, which is neither and must not be dressed as a defeat.
    show({ eyebrow, title, message, outcome = null, won = null }) {
      spectator?.stop();
      world.state.gameOver = true;
      world.state.isLocked = false;
      const overlay = document.getElementById('caughtOverlay');
      const panel = overlay?.querySelector('.caughtPanel');
      if (panel) {
        panel.querySelector('.caughtEyebrow').textContent = eyebrow;
        panel.querySelector('h1').textContent = title;
        panel.querySelector('p').textContent = message;
      }
      if (overlay) overlay.dataset.result = won === null ? 'neutral' : (won ? 'win' : 'loss');
      const restart = document.getElementById('restartBtn');
      if (restart) restart.textContent = 'FIND ANOTHER MATCH';
      overlay?.classList.add('visible');
      document.body.classList.add('caught');
      // Set menu state before releasing pointer lock so the unlock cannot open a pause menu.
      world.emit('caught', { outcome, online: true, roundOver: true });
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    },
  };
}
