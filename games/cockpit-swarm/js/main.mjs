import { clamp } from "./core/math.mjs";
import { createGameState } from "./core/state.mjs";
import { createInput } from "./systems/input.mjs";
import { resetGame, updateGame } from "./systems/game.mjs";
import { renderGame } from "./render/scene.mjs";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

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

let lastTime = performance.now();

input.bind();
resetGame(game);

function loop(t) {
  const dt = clamp(t - lastTime, 0, 40);
  lastTime = t;

  updateGame(game, input, dt, t);
  renderGame(ctx, game, t);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
