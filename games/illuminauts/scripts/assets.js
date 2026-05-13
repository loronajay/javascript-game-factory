// Paths are relative to index.html (document root), not this script file.
const ASSET_BASE_PATH = './assets';

function beaconSlice(col, row) {
  return { cols: 3, rows: 3, col, row };
}

export const spriteAssetDefs = {
  playerDown:  { src: `${ASSET_BASE_PATH}/player-down.png` },
  playerUp:    { src: `${ASSET_BASE_PATH}/player-up.png` },
  playerLeft:  { src: `${ASSET_BASE_PATH}/player-left.png` },
  playerRight: { src: `${ASSET_BASE_PATH}/player-right.png` },

  alienPatrol: { src: `${ASSET_BASE_PATH}/alien.png` },
  powerCell:   { src: `${ASSET_BASE_PATH}/power-cell.png` },
  accessChip:  { src: `${ASSET_BASE_PATH}/access-chip.png` },

  turretUp:    { src: `${ASSET_BASE_PATH}/turret-up.png` },
  turretDown:  { src: `${ASSET_BASE_PATH}/turret-down.png` },
  turretLeft:  { src: `${ASSET_BASE_PATH}/turret-left.png` },
  turretRight: { src: `${ASSET_BASE_PATH}/turret-right.png` },

  laserDoorActiveWide:    { src: `${ASSET_BASE_PATH}/closed-door.png` },
  laserDoorDisabledLeft:  { src: `${ASSET_BASE_PATH}/unlocked-door-left.png` },
  laserDoorDisabledRight: { src: `${ASSET_BASE_PATH}/unlocked-door-right.png` },

  // Beacon behavior stays the same as before: one art source sliced into 3x3 logical pieces.
  beacon00: { src: `${ASSET_BASE_PATH}/beacon-core.png`, slice: beaconSlice(0, 0) },
  beacon01: { src: `${ASSET_BASE_PATH}/beacon-core.png`, slice: beaconSlice(1, 0) },
  beacon02: { src: `${ASSET_BASE_PATH}/beacon-core.png`, slice: beaconSlice(2, 0) },
  beacon10: { src: `${ASSET_BASE_PATH}/beacon-core.png`, slice: beaconSlice(0, 1) },
  beacon11: { src: `${ASSET_BASE_PATH}/beacon-core.png`, slice: beaconSlice(1, 1) },
  beacon12: { src: `${ASSET_BASE_PATH}/beacon-core.png`, slice: beaconSlice(2, 1) },
  beacon20: { src: `${ASSET_BASE_PATH}/beacon-core.png`, slice: beaconSlice(0, 2) },
  beacon21: { src: `${ASSET_BASE_PATH}/beacon-core.png`, slice: beaconSlice(1, 2) },
  beacon22: { src: `${ASSET_BASE_PATH}/beacon-core.png`, slice: beaconSlice(2, 2) },

  menuSplash:  { src: `${ASSET_BASE_PATH}/menu-splash1.png` },
  lobbySplash: { src: `${ASSET_BASE_PATH}/lobby-splash.png` }
};

const PLAYER_SPRITE_NAMES = ['playerDown', 'playerUp', 'playerLeft', 'playerRight'];

export let sprites = {};

function sliceDimension(total, index, segments) {
  return Math.round(index * total / segments);
}

function buildSpriteEntry(image, def) {
  if (!def.slice) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    return { image, w: width, h: height };
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const sx = sliceDimension(width, def.slice.col, def.slice.cols);
  const sy = sliceDimension(height, def.slice.row, def.slice.rows);
  const nextSx = sliceDimension(width, def.slice.col + 1, def.slice.cols);
  const nextSy = sliceDimension(height, def.slice.row + 1, def.slice.rows);
  return {
    image,
    sx,
    sy,
    sw: nextSx - sx,
    sh: nextSy - sy,
    w: nextSx - sx,
    h: nextSy - sy
  };
}

export function createSpriteCatalog(imagesBySource) {
  const catalog = {};
  for (const [name, def] of Object.entries(spriteAssetDefs)) {
    const image = imagesBySource[def.src];
    if (!image) continue;
    catalog[name] = buildSpriteEntry(image, def);
  }
  return catalog;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }

  return [h, s, l];
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

export function recolorCyanPixelToBeta(r, g, b, a) {
  if (a === 0) return [r, g, b, a];
  const [h, s, l] = rgbToHsl(r, g, b);
  const isCoolSuitTone = s > 0.16 && h >= 155 && h <= 230 && b > r * 1.08;
  if (!isCoolSuitTone) return [r, g, b, a];

  const targetHue = 34;
  const targetSaturation = Math.min(1, Math.max(0.58, s * 1.08));
  const targetLightness = Math.min(0.88, Math.max(0.1, l * 1.03));
  const [nr, ng, nb] = hslToRgb(targetHue, targetSaturation, targetLightness);
  return [nr, ng, nb, a];
}

function recolorImageDataToBeta(imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = recolorCyanPixelToBeta(data[i], data[i + 1], data[i + 2], data[i + 3]);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return imageData;
}

function createCanvasForImage(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function createBetaPaletteSprite(sprite) {
  if (!sprite || typeof sprite.sx === 'number') return null;
  const canvas = createCanvasForImage(sprite.w, sprite.h);
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return null;
  ctx.drawImage(sprite.image, 0, 0, sprite.w, sprite.h);
  ctx.putImageData(recolorImageDataToBeta(ctx.getImageData(0, 0, sprite.w, sprite.h)), 0, 0);
  return { image: canvas, w: sprite.w, h: sprite.h };
}

function addBetaPlayerSprites(catalog) {
  for (const name of PLAYER_SPRITE_NAMES) {
    const betaSprite = createBetaPaletteSprite(catalog[name]);
    if (betaSprite) catalog[`${name}Beta`] = betaSprite;
  }
}

export function loadImageSource(src, ImageCtor = Image) {
  return new Promise((resolve, reject) => {
    const image = new ImageCtor();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`[Illuminauts] Failed to load ${src}`));
    image.src = src;
  });
}

export async function loadAssets() {
  const uniqueSources = [...new Set(Object.values(spriteAssetDefs).map((def) => def.src))];
  const loaded = await Promise.all(uniqueSources.map(async (src) => [src, await loadImageSource(src)]));
  sprites = createSpriteCatalog(Object.fromEntries(loaded));
  addBetaPlayerSprites(sprites);
}

export function drawSprite(ctx, name, x, y, w, h, catalog = sprites) {
  const sprite = catalog[name];
  if (!sprite) return false;
  ctx.imageSmoothingEnabled = false;
  if (typeof sprite.sx === 'number') {
    ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, x, y, w, h);
  } else {
    ctx.drawImage(sprite.image, x, y, w, h);
  }
  return true;
}

export function drawSpriteContain(ctx, name, cx, cy, maxW, maxH, catalog = sprites) {
  const sprite = catalog[name];
  if (!sprite) return false;
  const scale = Math.min(maxW / sprite.w, maxH / sprite.h);
  return drawSprite(
    ctx,
    name,
    cx - (sprite.w * scale) / 2,
    cy - (sprite.h * scale) / 2,
    sprite.w * scale,
    sprite.h * scale,
    catalog
  );
}

export function drawScreenSpriteContain(ctx, name, width, height, catalog = sprites) {
  const rect = getScreenSpriteContainRect(name, width, height, catalog);
  if (!rect) return false;
  ctx.drawImage(catalog[name].image, rect.x, rect.y, rect.w, rect.h);
  return true;
}

export function getScreenSpriteContainRect(name, width, height, catalog = sprites) {
  const sprite = catalog[name];
  if (!sprite) return null;
  const scale = Math.min(width / sprite.w, height / sprite.h);
  const drawW = sprite.w * scale;
  const drawH = sprite.h * scale;
  return {
    x: (width - drawW) / 2,
    y: (height - drawH) / 2,
    w: drawW,
    h: drawH,
  };
}
