export const BASE_Y = 1300;

export function deck(id, x, y, w, h = 70) {
  return { id, kind: 'solid', x, y, w, h };
}

export function lowRecovery(id, x, y = BASE_Y + 230) {
  return { id, kind: 'oneWay', x, y, w: 140, h: 18 };
}

export function pit(id, x, w, y = 1710) {
  return { id, kind: 'hazard', x, y, w, h: 80 };
}

export function block(id, x, y, w, h) {
  return { id, kind: 'blocked', x, y, w, h };
}

export function climb(id, x, y, h) {
  return { id, kind: 'climbable', x, y, h };
}
