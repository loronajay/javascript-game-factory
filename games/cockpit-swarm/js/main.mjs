import { clamp } from "./core/math.mjs";
import { createGameState } from "./core/state.mjs";
import { createInput } from "./systems/input.mjs";
import { initMenuState, updateGame } from "./systems/game.mjs";
import { renderGame } from "./render/scene.mjs";
import { initAudio, startMenuMusic } from "./systems/audio.mjs";
import { RenderQuality } from "./render/quality.mjs";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

// Detect mobile/touch hardware and enable low-perf mode.
// Intercept ctx.shadowBlur at the instance level so all 100+ assignments in the
// render pipeline become no-ops — no changes required in scene or boss-scene.
RenderQuality.lowPerf =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  !!window.matchMedia?.("(pointer: coarse)")?.matches;

if (RenderQuality.lowPerf) {
  try {
    Object.defineProperty(ctx, "shadowBlur", { get: () => 0, set: () => {} });
  } catch (_) {
    // If the browser won't allow it, quality degrades gracefully
  }
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    this.beginPath();
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  };
}

const game = createGameState();
const input = createInput();

input.bind();

// Normalize DOM mouse position to logical canvas space (1280×720)
function toCanvasPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (1280 / rect.width),
    y: (clientY - rect.top)  * (720  / rect.height)
  };
}

canvas.addEventListener("mousemove", (e) => {
  const p = toCanvasPos(e.clientX, e.clientY);
  input.setMousePos(p.x, p.y);
});

canvas.addEventListener("click", (e) => {
  const p = toCanvasPos(e.clientX, e.clientY);
  input.registerClick(p.x, p.y);
});

canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length > 0) {
    const p = toCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
    input.setMousePos(p.x, p.y);
    // Don't registerClick here — the synthetic 'click' event fires after touchend
    // and handles both mouse and touch. Registering here too queues two clicks per
    // tap on mobile, causing the second to bleed through to the next screen.
  }
}, { passive: true });

initAudio();
initMenuState(game);

// Browsers block autoplay until a user gesture. Start menu music on first interaction.
// All three listeners share the same reference so whichever fires first removes all of them.
function onFirstInteraction() {
  document.removeEventListener('keydown', onFirstInteraction);
  canvas.removeEventListener('click', onFirstInteraction);
  canvas.removeEventListener('touchstart', onFirstInteraction);
  startMenuMusic();
}
document.addEventListener('keydown', onFirstInteraction);
canvas.addEventListener('click', onFirstInteraction);
canvas.addEventListener('touchstart', onFirstInteraction);

let lastTime = performance.now();

function loop(t) {
  const dt = clamp(t - lastTime, 0, 40);
  lastTime = t;

  updateGame(game, input, dt, t);
  renderGame(ctx, game, t);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
