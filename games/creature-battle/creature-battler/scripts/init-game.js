function scaleCanvas() {
  const shell  = document.getElementById('game-shell');
  const canvas = document.getElementById('game-canvas');
  const W = 960, H = 540;
  const scaleX = shell.clientWidth  / W;
  const scaleY = shell.clientHeight / H;
  const scale  = Math.min(scaleX, scaleY);
  canvas.style.transform = `scale(${scale})`;
  canvas.style.left = `${(shell.clientWidth  - W * scale) / 2}px`;
  canvas.style.top  = `${(shell.clientHeight - H * scale) / 2}px`;
  canvas.style.position = 'absolute';
}

function init() {
  scaleCanvas();
  window.addEventListener('resize', scaleCanvas);
  initSounds();
  renderTitle();
  setScreen('title');
  initInput();
}

document.addEventListener('DOMContentLoaded', init);
