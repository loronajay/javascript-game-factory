// Moving hazards. A spike ball floats back and forth along a straight lane
// between `from` and `to`, easing at each end. Its position is a pure function
// of stage time, so every client draws the same ball from the timer it already
// has and nothing about it needs to be in a snapshot.

export function spikeBallProgress(ball, t) {
  const period = ball.period > 0 ? ball.period : 1;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / period + (ball.phase ?? 0)));
}

export function spikeBallCenter(ball, t) {
  const s = spikeBallProgress(ball, t);
  return {
    x: ball.from.x + (ball.to.x - ball.from.x) * s,
    y: ball.from.y + (ball.to.y - ball.from.y) * s,
  };
}

// The rectangle the ball sweeps over its whole trip. Nothing may be built in it.
export function spikeBallLane(ball) {
  const r = ball.r;
  const left = Math.min(ball.from.x, ball.to.x) - r;
  const top = Math.min(ball.from.y, ball.to.y) - r;
  return {
    x: left,
    y: top,
    w: Math.max(ball.from.x, ball.to.x) + r - left,
    h: Math.max(ball.from.y, ball.to.y) + r - top,
  };
}

// Sets each ball's current centre for stage time `t` (seconds).
export function updateMovingHazards(stage, t) {
  for (const ball of stage.movingHazards ?? []) {
    const c = spikeBallCenter(ball, t);
    ball.cx = c.x;
    ball.cy = c.y;
  }
}

// Circle against rectangle. `inset` shrinks the lethal core so the visible
// spikes and the death check feel aligned, the way stage spikes are handled.
export function spikeBallHits(ball, rect, inset = 6) {
  const radius = Math.max(0, ball.r - inset);
  const nx = Math.max(rect.x, Math.min(ball.cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(ball.cy, rect.y + rect.h));
  const dx = ball.cx - nx;
  const dy = ball.cy - ny;
  return dx * dx + dy * dy < radius * radius;
}
