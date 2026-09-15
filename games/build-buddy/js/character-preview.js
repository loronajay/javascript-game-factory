import { ART } from './render/art-assets.js';
import { RUNNER_FRAMES } from './render/runner-frames.js';
import { customizedRunnerFrame } from './render/runner-colors.js';
import { normalizeCharacterCosmetics, normalizeCharacterId } from './characters.js';

const imageCache = new Map();

export function previewBackingSize(cssWidth, cssHeight, pixelRatio = globalThis.devicePixelRatio || 1) {
  const ratio = Math.max(1, Math.min(2, Number(pixelRatio) || 1));
  const width = Number(cssWidth) > 0 ? Number(cssWidth) : 210;
  const height = Number(cssHeight) > 0 ? Number(cssHeight) : 180;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    pixelRatio: ratio,
  };
}

function syncBackingStore(canvas) {
  const bounds = canvas?.getBoundingClientRect?.();
  const size = previewBackingSize(bounds?.width, bounds?.height);
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  return size.pixelRatio;
}

function imageFor(characterId, redraw) {
  if (typeof Image === 'undefined') return null;
  if (!imageCache.has(characterId)) {
    const image = new Image();
    image.src = new URL(`../${ART[`${characterId}Runner`]}`, import.meta.url).href;
    imageCache.set(characterId, image);
  }
  const image = imageCache.get(characterId);
  if (!image.complete) image.addEventListener('load', redraw, { once: true });
  return image;
}

export function drawCharacterPreview(canvas, appearance) {
  const pixelRatio = syncBackingStore(canvas);
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  const characterId = normalizeCharacterId(appearance?.characterId);
  const cosmetics = normalizeCharacterCosmetics(appearance?.cosmetics);
  const redraw = () => drawCharacterPreview(canvas, appearance);
  const image = imageFor(characterId, redraw);
  const width = canvas.width || 210;
  const height = canvas.height || 180;
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient?.(0, 0, 0, height);
  if (gradient) {
    gradient.addColorStop(0, '#193846');
    gradient.addColorStop(1, '#0a1821');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  if (!image?.complete || !image.naturalWidth) return;
  const atlas = RUNNER_FRAMES[characterId];
  const frame = atlas.frames[0];
  const rendered = customizedRunnerFrame(image, characterId, cosmetics, frame);
  const scale = Math.min(pixelRatio, (132 * pixelRatio) / atlas.bodyHeight);
  const drawWidth = frame.w * scale;
  const drawHeight = frame.h * scale;
  const x = width / 2 - frame.anchor * scale;
  const y = height - drawHeight - 16 * pixelRatio;
  ctx.drawImage(rendered.image, rendered.x, rendered.y, frame.w, frame.h, x, y, drawWidth, drawHeight);
}

export function observeCharacterPreview(canvas, appearance) {
  const redraw = () => drawCharacterPreview(canvas, appearance);
  const Observer = globalThis.ResizeObserver;
  if (typeof Observer !== 'function') {
    globalThis.requestAnimationFrame?.(redraw);
    return () => {};
  }
  const observer = new Observer(redraw);
  observer.observe(canvas);
  return () => observer.disconnect();
}
