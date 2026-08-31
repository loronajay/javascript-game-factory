// Tile coordinates remain on the wire for compatibility; fractional pose makes 3D motion smooth.
export function createPositionPacket(player, sequence) {
  return { x: player.tx, y: player.ty, dir: player.dir, px: player.px, py: player.py, yaw: player.yaw, sequence };
}
export function applyRemotePosition(state, value) {
  if (!value || !Number.isInteger(value.x) || !Number.isInteger(value.y)) return false;
  const px = value.px ?? value.x + 0.5, py = value.py ?? value.y + 0.5;
  if (![px, py].every(Number.isFinite) || px < 0 || py < 0 || px >= state.map.width || py >= state.map.height) return false;
  if (Math.floor(px) !== value.x || Math.floor(py) !== value.y) return false;
  if (value.sequence != null && (!Number.isInteger(value.sequence) || value.sequence <= (state.remote.sequence ?? -1))) return false;
  Object.assign(state.remote, { tx: value.x, ty: value.y, px, py, active: true,
    dir: ['up', 'down', 'left', 'right'].includes(value.dir) ? value.dir : 'down',
    yaw: Number.isFinite(value.yaw) ? value.yaw : 0, sequence: value.sequence ?? state.remote.sequence });
  return true;
}
