import { clamp } from '../core/utils.js';

export function createPlayerSystem(state) {
  function updateFacing(move) {
    if (!move.moving) return;

    state.player.facingX = move.x;
    state.player.facingY = move.y;

    let nextFacing;
    if (Math.abs(move.x) > Math.abs(move.y)) {
      nextFacing = move.x < 0 ? 'left' : 'right';
    } else {
      nextFacing = move.y < 0 ? 'up' : 'down';
    }

    if (nextFacing !== state.player.facingName) state.player.facingName = nextFacing;
  }

  function getTipPoint() {
    let offsetX = 9;
    let offsetY = 31;

    if (state.player.facingName === 'left') {
      offsetX = -9;
      offsetY = 31;
    } else if (state.player.facingName === 'up') {
      offsetX = 3;
      offsetY = 22;
    }

    return {
      x: state.player.x + offsetX,
      y: state.player.y + offsetY
    };
  }

  function movePlayer(move, dt) {
    const beforeX = state.player.x;
    const beforeY = state.player.y;

    if (move.moving) {
      state.player.x += move.x * state.player.speed * dt;
      state.player.y += move.y * state.player.speed * dt;
    }

    updateFacing(move);
    clampPlayerToWorld();

    state.player.prevX = beforeX;
    state.player.prevY = beforeY;
  }

  function clampPlayerToWorld() {
    const halfW = state.player.width / 2;
    const halfH = state.player.height / 2;

    state.player.x = clamp(state.player.x, halfW, state.world.width - halfW);
    state.player.y = clamp(state.player.y, halfH, state.world.height - halfH);
  }

  return { movePlayer, getTipPoint, clampPlayerToWorld };
}
