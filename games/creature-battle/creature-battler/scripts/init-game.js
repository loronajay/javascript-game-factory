function scaleCanvas() {
  const shell  = document.getElementById('game-shell');
  const canvas = document.getElementById('game-canvas');
  const W = 960, H = 540;
  const coarsePhone = window.matchMedia && window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
  const shortLandscape = shell.clientWidth >= 700 && shell.clientHeight <= 540;
  const useMobileLayout = shell.clientWidth < 720 || coarsePhone || shortLandscape;

  canvas.classList.toggle('mobile-layout', useMobileLayout);

  if (useMobileLayout) {
    canvas.style.transform = 'none';
    canvas.style.left = '0px';
    canvas.style.top = '0px';
    canvas.style.width = `${shell.clientWidth}px`;
    canvas.style.height = `${shell.clientHeight}px`;
    canvas.style.position = 'absolute';
    return;
  }

  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
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
