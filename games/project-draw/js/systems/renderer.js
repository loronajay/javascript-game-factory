import { TOOL_CONFIG } from '../core/config.js';
import { hexToRgb } from '../core/utils.js';

export function createRenderer(state, refs, playerSystem) {
  function hexToGlow(hex) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, 0.35)`;
  }

  function updateCursorVisual() {
    const tool = TOOL_CONFIG[state.drawing.activeTool];
    const size = tool.cursor * 2;
    const color = state.drawing.activeTool === 'eraser' ? '#ff9fbe' : state.drawing.color;

    refs.cursorAnchorEl.style.width = `${size}px`;
    refs.cursorAnchorEl.style.height = `${size}px`;
    refs.cursorAnchorEl.style.borderColor = color;
    refs.cursorAnchorEl.style.color = color;
    refs.cursorAnchorEl.style.boxShadow = state.drawing.activeTool === 'eraser'
      ? '0 0 0 2px rgba(15,23,42,0.42), 0 0 16px rgba(255, 160, 190, 0.42)'
      : `0 0 0 2px rgba(15,23,42,0.42), 0 0 16px ${hexToGlow(color)}`;

    refs.cursorAnchorEl.classList.toggle('erase', state.drawing.activeTool === 'eraser');
    refs.cursorAnchorEl.classList.toggle('active', state.player.drawing);
    refs.cursorAnchorEl.style.opacity = state.player.drawing ? '1' : '0.78';
  }

  function updateCursorPosition() {
    let x, y;

    if (state.player.drawing && state.player.drawCursorX !== null && state.player.drawCursorY !== null) {
      x = state.player.drawCursorX;
      y = state.player.drawCursorY;
    } else {
      const tip = playerSystem.getTipPoint();
      x = tip.x;
      y = tip.y;
    }

    refs.cursorAnchorEl.style.left = `${x}px`;
    refs.cursorAnchorEl.style.top = `${y}px`;
  }

  function renderPlayer(moving) {
    refs.playerEl.style.left = `${state.player.x}px`;
    refs.playerEl.style.top = `${state.player.y}px`;
    refs.playerEl.style.setProperty('--face-x', state.player.facingName === 'left' ? -1 : 1);

    refs.playerEl.classList.toggle('moving', moving);
    refs.playerEl.classList.toggle('drawing', state.player.drawing);
    refs.playerEl.classList.toggle('facing-up', state.player.facingName === 'up');
    refs.playerEl.classList.toggle('facing-down', state.player.facingName === 'down');
    refs.playerEl.classList.toggle('facing-left', state.player.facingName === 'left');
    refs.playerEl.classList.toggle('facing-right', state.player.facingName === 'right');
  }

  function renderCamera() {
    if (state.fullView) {
      const scale = Math.min(window.innerWidth / state.world.width, window.innerHeight / state.world.height);
      const x = Math.round((window.innerWidth - state.world.width * scale) / 2);
      const y = Math.round((window.innerHeight - state.world.height * scale) / 2);
      refs.cameraEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      return;
    }

    const ix = Math.round(state.camera.x);
    const iy = Math.round(state.camera.y);
    refs.cameraEl.style.transform = `translate3d(${-ix}px, ${-iy}px, 0)`;
  }

  function renderMinimap() {
    const rect = refs.minimapView.parentElement.getBoundingClientRect();
    const mapW = rect.width || 118;
    const mapH = rect.height || 88;

    const px = (state.player.x / state.world.width) * mapW;
    const py = (state.player.y / state.world.height) * mapH;

    refs.minimapPlayer.style.left = `${px}px`;
    refs.minimapPlayer.style.top = `${py}px`;

    const viewW = Math.max(10, (window.innerWidth / state.world.width) * mapW);
    const viewH = Math.max(10, (window.innerHeight / state.world.height) * mapH);
    const viewX = (state.camera.x / state.world.width) * mapW;
    const viewY = (state.camera.y / state.world.height) * mapH;

    refs.minimapView.style.left = `${viewX}px`;
    refs.minimapView.style.top = `${viewY}px`;
    refs.minimapView.style.width = `${viewW}px`;
    refs.minimapView.style.height = `${viewH}px`;
  }

  return {
    updateCursorVisual,
    updateCursorPosition,
    renderPlayer,
    renderCamera,
    renderMinimap
  };
}
