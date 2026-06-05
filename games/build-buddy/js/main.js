import { AppController } from './app-controller.js';

const canvas = document.getElementById('game');
const shellRoot = document.getElementById('shell');
const hudRoot = document.getElementById('hud');
const viewModeControls = document.getElementById('viewModeControls');
const mobileControls = document.getElementById('mobileControls');

const app = new AppController({ canvas, shellRoot, hudRoot, viewModeControls, mobileControls });

function frame(now) {
  app.update(now);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
