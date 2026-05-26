import { normalizeVector } from '../core/utils.js';
import { DRAW_AXIS_SNAP_PRIMARY, DRAW_AXIS_SNAP_SECONDARY, TOOL_CONFIG } from '../core/config.js';

export function createInputSystem(state, refs, actions) {
  const keyMap = new Map([
    ['ArrowUp', 'up'],
    ['KeyW', 'up'],
    ['ArrowDown', 'down'],
    ['KeyS', 'down'],
    ['ArrowLeft', 'left'],
    ['KeyA', 'left'],
    ['ArrowRight', 'right'],
    ['KeyD', 'right']
  ]);

  function getJoystickCenter() {
    const rect = refs.joystickEl.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      radius: rect.width * 0.5
    };
  }

  function updateStickFromPointer(clientX, clientY) {
    if (state.fullView) return;

    const center = getJoystickCenter();
    const maxDistance = center.radius - refs.knobEl.offsetWidth / 2;
    const dx = clientX - center.x;
    const dy = clientY - center.y;
    const distance = Math.hypot(dx, dy);
    const clampedDistance = Math.min(distance, maxDistance);
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * clampedDistance;
    const knobY = Math.sin(angle) * clampedDistance;

    refs.knobEl.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

    const deadzone = 0.12;
    const normalized = Math.min(distance / maxDistance, 1);
    const strength = normalized < deadzone ? 0 : normalized;

    state.input.stickX = Math.cos(angle) * strength;
    state.input.stickY = Math.sin(angle) * strength;
  }

  function resetStick() {
    state.input.activePointerId = null;
    state.input.stickX = 0;
    state.input.stickY = 0;
    refs.knobEl.style.transform = 'translate(-50%, -50%)';
  }

  refs.joystickEl.addEventListener('pointerdown', (event) => {
    if (state.fullView) return;
    state.input.activePointerId = event.pointerId;
    refs.joystickEl.setPointerCapture(event.pointerId);
    updateStickFromPointer(event.clientX, event.clientY);
  });

  refs.joystickEl.addEventListener('pointermove', (event) => {
    if (event.pointerId !== state.input.activePointerId) return;
    updateStickFromPointer(event.clientX, event.clientY);
  });

  refs.joystickEl.addEventListener('pointerup', resetStick);
  refs.joystickEl.addEventListener('pointercancel', resetStick);
  refs.joystickEl.addEventListener('lostpointercapture', resetStick);

  window.addEventListener('keydown', (event) => {
    if (refs.setupOverlay.style.display !== 'none') {
      if (event.code === 'Enter') {
        actions.startCanvas();
        event.preventDefault();
      }
      return;
    }

    if (state.fullView) {
      if (event.code === 'Escape') {
        actions.setFullView(false);
        event.preventDefault();
      }
      return;
    }

    const mapped = keyMap.get(event.code);
    if (mapped) {
      state.input.keys.add(mapped);
      event.preventDefault();
      return;
    }

    if (event.code === 'Space') {
      actions.setDrawing(true);
      event.preventDefault();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
      actions.undoLastStroke();
      event.preventDefault();
      return;
    }

    if (event.code === 'Digit1') actions.setActiveTool('pencil');
    if (event.code === 'Digit2') actions.setActiveTool('brush');
    if (event.code === 'Digit3') actions.setActiveTool('spray');
    if (event.code === 'Digit4') actions.setActiveTool('eraser');
  });

  window.addEventListener('keyup', (event) => {
    const mapped = keyMap.get(event.code);
    if (mapped) {
      state.input.keys.delete(mapped);
      event.preventDefault();
      return;
    }

    if (event.code === 'Space') {
      actions.setDrawing(false);
      event.preventDefault();
    }
  });

  function getMoveVector() {
    if (state.fullView) return { x: 0, y: 0, moving: false };

    let x = state.input.stickX;
    let y = state.input.stickY;

    if (state.input.keys.has('left')) x -= 1;
    if (state.input.keys.has('right')) x += 1;
    if (state.input.keys.has('up')) y -= 1;
    if (state.input.keys.has('down')) y += 1;

    const move = normalizeVector(x, y);
    if (!move.moving) return move;

    const tool = TOOL_CONFIG[state.drawing.activeTool];
    if (state.player.drawing && tool.snap) {
      const ax = Math.abs(move.x);
      const ay = Math.abs(move.y);

      if (ax >= DRAW_AXIS_SNAP_PRIMARY && ay <= DRAW_AXIS_SNAP_SECONDARY) {
        move.x = Math.sign(move.x);
        move.y = 0;
      } else if (ay >= DRAW_AXIS_SNAP_PRIMARY && ax <= DRAW_AXIS_SNAP_SECONDARY) {
        move.x = 0;
        move.y = Math.sign(move.y);
      }
    }

    return move;
  }

  return { getMoveVector, resetStick };
}
