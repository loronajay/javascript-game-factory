import { Game } from './game.js';
import { VIEW } from './constants.js';

const canvas = document.getElementById('game');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const game = new Game(canvas);
let last = performance.now();
let acc = 0;
const fixedDt = 1 / 60;

function frame(now) {
  const rawDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += rawDt;
  while (acc >= fixedDt) {
    game.update(fixedDt);
    acc -= fixedDt;
  }
  game.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
