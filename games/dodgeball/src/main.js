import { SpriteLibrary } from './animation.js';
import { CONFIG } from './config.js';
import { Game } from './game.js';
import { InputManager } from './input.js';
import { Renderer } from './render.js';

const canvas = document.querySelector('#game');
const loading = document.querySelector('#loading');
const ctx = canvas.getContext('2d');
canvas.width = CONFIG.canvas.width;
canvas.height = CONFIG.canvas.height;

const input = new InputManager();
const sprites = new SpriteLibrary();
const game = new Game();
const renderer = new Renderer(ctx, sprites);

await sprites.load();
loading.remove();
canvas.classList.add('ready');

const fixedStep = 1000 / CONFIG.tickRate;
let previous = performance.now();
let accumulator = 0;

function frame(now) {
  accumulator += Math.min(250, now - previous);
  previous = now;

  while (accumulator >= fixedStep) {
    if (input.debugPressed) game.debug = !game.debug;
    game.update([input.player(0), input.player(1)], input.restartPressed);
    input.endTick();
    accumulator -= fixedStep;
  }

  renderer.draw(game, accumulator / fixedStep);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
