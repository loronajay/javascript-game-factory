// Online outcomes offer a way back to online setup, never a solo restart.
export function createOnlineResults({ world, spectator, document }) {
  return {
    show({ eyebrow, title, message, outcome = null }) {
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
      const restart = document.getElementById('restartBtn');
      if (restart) restart.textContent = 'FIND ANOTHER MATCH';
      overlay?.classList.add('visible');
      document.body.classList.add('caught');
      // Set menu state before releasing pointer lock so the unlock cannot open a pause menu.
      world.emit('caught', { outcome, online: true });
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    },
  };
}
