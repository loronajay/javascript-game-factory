export function pushDestinationAwayFrom(actor, target) {
  const dx = Math.sign(target.position.x - actor.position.x);
  const dy = Math.sign(target.position.y - actor.position.y);
  if (Math.abs(target.position.x - actor.position.x) >= Math.abs(target.position.y - actor.position.y)) {
    return { x: target.position.x + dx, y: target.position.y };
  }
  return { x: target.position.x, y: target.position.y + dy };
}
