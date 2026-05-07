// Path is relative to index.html (document root), not this script file.
const SPRITE_SHEET_PATH = './illuminauts_modular_demo/assets/sprite-sheet.png';

export const sprites = {
  playerDown:  { x: 76,   y: 96,  w: 119, h: 154 },
  playerUp:    { x: 280,  y: 96,  w: 115, h: 154 },
  playerLeft:  { x: 454,  y: 104, w: 100, h: 152 },
  playerRight: { x: 588,  y: 104, w: 103, h: 152 },

  alienPatrol: { x: 767,  y: 87,  w: 183, h: 182 },
  powerCell:   { x: 1042, y: 90,  w: 83,  h: 174 },
  accessChip:  { x: 1191, y: 127, w: 183, h: 117 },

  turretUp:    { x: 106,  y: 342, w: 137, h: 197 },
  turretDown:  { x: 370,  y: 380, w: 120, h: 171 },
  turretLeft:  { x: 562,  y: 380, w: 205, h: 140 },
  turretRight: { x: 884,  y: 380, w: 212, h: 140 },

  laserDoorActiveWide:    { x: 100, y: 645, w: 421, h: 200 },
  laserDoorDisabledLeft:  { x: 663, y: 660, w: 64,  h: 182 },
  laserDoorDisabledRight: { x: 783, y: 659, w: 63,  h: 183 },

  beacon00: { x: 943,  y: 564, w: 121, h: 122 },
  beacon01: { x: 1077, y: 564, w: 144, h: 122 },
  beacon02: { x: 1233, y: 564, w: 122, h: 122 },
  beacon10: { x: 942,  y: 699, w: 119, h: 144 },
  beacon11: { x: 1074, y: 699, w: 147, h: 144 },
  beacon12: { x: 1234, y: 699, w: 120, h: 144 },
  beacon20: { x: 943,  y: 856, w: 121, h: 123 },
  beacon21: { x: 1077, y: 856, w: 144, h: 123 },
  beacon22: { x: 1233, y: 856, w: 120, h: 122 }
};

let spriteSheet = null;

export function loadAssets() {
  return new Promise((resolve, reject) => {
    const source = new Image();
    source.src = SPRITE_SHEET_PATH;
    source.onload = () => {
      spriteSheet = buildTransparentSheet(source);
      resolve();
    };
    source.onerror = () => reject(new Error(`[Illuminauts] Failed to load ${SPRITE_SHEET_PATH}`));
  });
}

// Strips high-value neutral checker pixels from prototype sheets that lack real alpha.
function buildTransparentSheet(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    if (min >= 226 && max - min <= 16) data[i + 3] = 0;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function drawSprite(ctx, name, x, y, w, h) {
  const frame = sprites[name];
  if (!spriteSheet || !frame) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spriteSheet, frame.x, frame.y, frame.w, frame.h, x, y, w, h);
  return true;
}

export function drawSpriteContain(ctx, name, cx, cy, maxW, maxH) {
  const frame = sprites[name];
  if (!frame) return false;
  const scale = Math.min(maxW / frame.w, maxH / frame.h);
  return drawSprite(ctx, name, cx - (frame.w * scale) / 2, cy - (frame.h * scale) / 2, frame.w * scale, frame.h * scale);
}
