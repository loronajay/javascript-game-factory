import { CONFIG } from './config.js';

const FRAME_ROOT = './assets/characters/frank-roswell/frames/';
const frame = (filename, w, h, pivotX, pivotY) => ({
  src: `${FRAME_ROOT}${filename}`, w, h, pivotX, pivotY,
});

// Each pose is a standalone masked PNG. This is deliberately not a sheet-grid
// crop: several figures overlap their nominal cells in the generated artwork.
export const ANIMATIONS = {
  idle: { frames: [
    frame('idle-0.png', 334, 471, 157, 463), frame('idle-1.png', 321, 477, 151, 469),
    frame('idle-2.png', 332, 469, 158, 461), frame('idle-3.png', 333, 470, 158, 462),
    frame('idle-4.png', 321, 476, 153, 468), frame('idle-5.png', 326, 470, 168, 462),
  ] },
  run: { frames: [
    frame('run-0.png', 365, 481, 165, 473), frame('run-1.png', 308, 477, 145, 469),
    frame('run-2.png', 337, 485, 194, 477), frame('run-3.png', 379, 478, 185, 470),
    frame('run-4.png', 301, 477, 140, 469), frame('run-5.png', 347, 482, 188, 474),
  ] },
  crouch: { frames: [
    frame('crouch-0.png', 333, 468, 154, 460), frame('crouch-1.png', 321, 411, 148, 403),
    frame('crouch-2.png', 282, 333, 146, 325), frame('crouch-3.png', 280, 330, 155, 322),
    frame('crouch-4.png', 318, 416, 155, 408), frame('crouch-5.png', 319, 469, 170, 461),
  ] },
  jump: { frames: [
    frame('jump-0.png', 301, 316, 166, 308), frame('jump-1.png', 329, 436, 191, 428),
    frame('jump-2.png', 347, 388, 199, 380), frame('jump-3.png', 373, 406, 214, 398),
    frame('jump-4.png', 406, 406, 217, 398), frame('jump-5.png', 356, 301, 194, 293),
  ] },
  groundAttack: { frames: [
    frame('groundAttack-0.png', 334, 462, 167, 454), frame('groundAttack-1.png', 364, 465, 189, 457),
    frame('groundAttack-2.png', 306, 464, 188, 456), frame('groundAttack-3.png', 481, 464, 211, 456),
    frame('groundAttack-4.png', 281, 458, 98, 450), frame('groundAttack-5.png', 330, 463, 158, 455),
  ] },
  airAttack: { frames: [
    frame('airAttack-0.png', 350, 392, 173, 384), frame('airAttack-1.png', 288, 428, 178, 420),
    frame('airAttack-2.png', 384, 411, 216, 403), frame('airAttack-3.png', 516, 363, 249, 355),
    frame('airAttack-4.png', 364, 385, 118, 377), frame('airAttack-5.png', 281, 427, 114, 419),
  ] },
  spotDodge: { frames: [
    frame('spotDodge-0.png', 328, 446, 162, 438), frame('spotDodge-1.png', 294, 397, 152, 389),
    frame('spotDodge-2.png', 309, 430, 162, 422), frame('spotDodge-3.png', 423, 391, 192, 383),
    frame('spotDodge-4.png', 279, 434, 99, 426), frame('spotDodge-5.png', 316, 447, 150, 439),
  ] },
  airDodge: { frames: [
    frame('airDodge-0.png', 330, 414, 181, 406), frame('airDodge-1.png', 320, 338, 186, 330),
    frame('airDodge-2.png', 438, 348, 213, 340), frame('airDodge-3.png', 321, 333, 117, 325),
    frame('airDodge-4.png', 346, 379, 150, 371), frame('airDodge-5.png', 326, 416, 152, 408),
  ] },
};

export class SpriteLibrary {
  constructor() {
    this.images = new Map();
  }

  async load() {
    const frames = Object.values(ANIMATIONS).flatMap((animation) => animation.frames);
    await Promise.all(frames.map((frameData) => new Promise((resolve, reject) => {
      if (this.images.has(frameData.src)) return resolve();
      const image = new Image();
      image.onload = () => { this.images.set(frameData.src, image); resolve(); };
      image.onerror = reject;
      image.src = frameData.src;
    })));
  }

  draw(ctx, player, tick) {
    const { name, index } = selectFrame(player, tick);
    const animation = ANIMATIONS[name];
    const safeIndex = Number.isFinite(index)
      ? Math.max(0, Math.min(animation.frames.length - 1, Math.floor(index)))
      : 0;
    const frame = animation.frames[safeIndex];
    const image = this.images.get(frame.src);
    if (!image) return;

    const scale = CONFIG.render.spriteScale;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(player.facing, 1);
    ctx.globalAlpha = player.invulnerable ? 0.52 : 1;
    ctx.shadowColor = player.id === 0 ? '#3de4ff' : '#ff4c8b';
    ctx.shadowBlur = player.invulnerable ? 26 : 10;
    ctx.drawImage(
      image,
      -frame.pivotX * scale, -frame.pivotY * scale,
      frame.w * scale, frame.h * scale,
    );
    ctx.restore();
  }
}

function actionIndex(frame, total) {
  return Math.min(5, Math.floor((frame / Math.max(1, total)) * 6));
}

function selectFrame(player, tick) {
  switch (player.state) {
    case 'groundAttack': {
      const f = player.stateFrame;
      return { name: 'groundAttack', index: f < 4 ? 0 : f < 8 ? 1 : f < 10 ? 2 : f < 13 ? 3 : f < 20 ? 4 : 5 };
    }
    case 'airAttack': {
      const f = player.stateFrame;
      return { name: 'airAttack', index: f < 3 ? 0 : f < 5 ? 1 : f < 7 ? 2 : f < 10 ? 3 : f < 16 ? 4 : 5 };
    }
    case 'spotDodge': return { name: 'spotDodge', index: actionIndex(player.stateFrame, CONFIG.player.spotDodge.total) };
    case 'airDodge': return { name: 'airDodge', index: actionIndex(player.stateFrame, CONFIG.player.airDodge.total) };
    case 'crouch': return { name: 'crouch', index: Math.min(3, Math.floor(player.stateFrame / 3)) };
    case 'jumpSquat': return { name: 'jump', index: 0 };
    case 'landing': return { name: 'jump', index: 5 };
    case 'airborne':
      return { name: 'jump', index: player.vy < -5 ? 2 : player.vy < 3 ? 3 : 4 };
    case 'dash':
    case 'run':
    case 'turnaround':
    case 'skid': return { name: 'run', index: Math.floor(tick / 5) % 6 };
    default: return { name: 'idle', index: Math.floor(tick / 10) % 6 };
  }
}
