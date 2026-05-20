import { VIEWPORT_W, VIEWPORT_H } from './stage.js';

const LERP      = 0.08;
const ZOOM_LERP = 0.05;
const MIN_ZOOM  = 0.65;
const MAX_ZOOM  = 1.0;
const ZOOM_PAD  = 200;  // padding around both players before zoom pulls out

function createCamera() {
  return {
    x:    VIEWPORT_W / 2,
    y:    VIEWPORT_H / 2,
    zoom: 1.0,
  };
}

function updateCamera(camera, p1, p2) {
  const midX = (p1.x + p2.x) / 2;

  // X tracks the player midpoint; Y stays fixed at the stage center so the floor
  // always sits at the bottom of the viewport (this is a single-screen stage).
  camera.x += (midX - camera.x) * LERP;

  const span       = Math.abs(p2.x - p1.x);
  const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, VIEWPORT_W / (span + ZOOM_PAD)));
  camera.zoom += (targetZoom - camera.zoom) * ZOOM_LERP;
}

function resetCamera(camera) {
  camera.x    = VIEWPORT_W / 2;
  camera.y    = VIEWPORT_H / 2;
  camera.zoom = 1.0;
}

export { createCamera, updateCamera, resetCamera };
