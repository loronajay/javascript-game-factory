const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getFirstPersonIntent(input, yaw) {
  const held = new Set([...input.held, ...(input.justPressed || [])]);
  const forward = Number(held.has('KeyW')) - Number(held.has('KeyS'));
  const strafe = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  const arrowForward = Number(held.has('ArrowUp')) - Number(held.has('ArrowDown'));
  const f = forward || arrowForward;
  const length = Math.max(1, Math.hypot(f, strafe));
  return { dx: (strafe * Math.cos(yaw) - f * Math.sin(yaw)) / length,
    dy: (-strafe * Math.sin(yaw) - f * Math.cos(yaw)) / length };
}

export function applyLookInput(player, input, dt) {
  const down = code => input.held.has(code) || input.justPressed?.has(code);
  const turn = Number(Boolean(down('ArrowLeft'))) - Number(Boolean(down('ArrowRight')));
  player.yaw = (player.yaw + turn * 1.9 * dt - (input.lookX || 0) * 0.0022) % (Math.PI * 2);
  player.pitch = clamp(player.pitch - (input.lookY || 0) * 0.0019, -1.18, 1.18);
  input.lookX = 0; input.lookY = 0;
}

// DOM events queue intent only; the fixed-step player update owns camera angles.
export function bindFirstPersonControls(canvas, input, isPlaying) {
  let drag = null;
  const reset = () => { drag = null; input.lookX = 0; input.lookY = 0; input.held.clear(); input.justPressed.clear(); };
  const look = (dx, dy, scale = 1) => {
    input.lookX = (input.lookX || 0) + dx * scale;
    input.lookY = (input.lookY || 0) + dy * scale;
  };
  canvas.addEventListener('click', () => {
    if (!isPlaying() || !matchMedia('(pointer: fine)').matches || document.pointerLockElement === canvas) return;
    // Keyboard turn and drag-look remain available if pointer lock is denied.
    try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* embedded-browser restriction */ }
  });
  document.addEventListener('mousemove', e => {
    if (isPlaying() && document.pointerLockElement === canvas) look(e.movementX, e.movementY);
  });
  canvas.addEventListener('pointerdown', e => {
    if (!isPlaying() || document.pointerLockElement === canvas) return;
    if (e.pointerType === 'touch' && e.clientX < canvas.getBoundingClientRect().width * 0.4) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, scale: e.pointerType === 'touch' ? 2.7 : 1 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId || !isPlaying()) return;
    look(e.clientX - drag.x, e.clientY - drag.y, drag.scale);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { drag = null; });
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) reset(); });
  return { reset, release() { reset(); if (document.pointerLockElement === canvas) document.exitPointerLock(); } };
}
