export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
const MAX_FRAME_MS = 100;

export function createFixedStepLoop({
  tick,
  render,
  tickMs = TICK_MS,
  maxFrameMs = MAX_FRAME_MS,
}) {
  let lastTime = null;
  let accumulator = 0;
  let frame = 0;
  let running = false;
  let rafId = null;

  function step(timestamp) {
    if (lastTime === null) {
      lastTime = timestamp ?? 0;
      render?.(0);
      return frame;
    }

    const elapsed = Math.min(Math.max((timestamp ?? lastTime) - lastTime, 0), maxFrameMs);
    lastTime = timestamp ?? lastTime;
    accumulator += elapsed;

    while (accumulator >= tickMs) {
      accumulator -= tickMs;
      frame += 1;
      tick(frame);
    }

    render?.(accumulator / tickMs);
    return frame;
  }

  function start(requestAnimationFrameRef = globalThis.requestAnimationFrame) {
    if (running || typeof requestAnimationFrameRef !== 'function') return;
    running = true;

    const loop = timestamp => {
      if (!running) return;
      step(timestamp);
      rafId = requestAnimationFrameRef(loop);
    };

    rafId = requestAnimationFrameRef(loop);
  }

  function stop(cancelAnimationFrameRef = globalThis.cancelAnimationFrame) {
    running = false;
    if (rafId !== null && typeof cancelAnimationFrameRef === 'function') {
      cancelAnimationFrameRef(rafId);
    }
    rafId = null;
  }

  return {
    get accumulator() {
      return accumulator;
    },
    get frame() {
      return frame;
    },
    start,
    step,
    stop,
  };
}
