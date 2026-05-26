import { CAMERA_LERP } from '../core/config.js';

export function createCameraSystem(state) {
  function updateCamera() {
    if (state.fullView) return;

    const targetX = state.player.x - window.innerWidth / 2;
    const targetY = state.player.y - window.innerHeight / 2;
    const maxX = Math.max(0, state.world.width - window.innerWidth);
    const maxY = Math.max(0, state.world.height - window.innerHeight);

    const clampedTargetX = Math.max(0, Math.min(maxX, targetX));
    const clampedTargetY = Math.max(0, Math.min(maxY, targetY));

    state.camera.x += (clampedTargetX - state.camera.x) * CAMERA_LERP;
    state.camera.y += (clampedTargetY - state.camera.y) * CAMERA_LERP;
  }

  return { updateCamera };
}
