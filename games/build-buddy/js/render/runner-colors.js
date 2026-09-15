import { DEFAULT_CHARACTER_COSMETICS, characterColorHex, normalizeCharacterCosmetics } from '../character-cosmetics.js';

const coloredSheets = new WeakMap();
const coloredFrames = new WeakMap();

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness };
  const delta = max - min;
  const saturation = lightness > .5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = max === r ? (g - b) / delta + (g < b ? 6 : 0)
    : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: hue / 6, s: saturation, l: lightness };
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb({ h, s, l }) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < .5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3) * 255, hueToRgb(p, q, h) * 255, hueToRgb(p, q, h - 1 / 3) * 255];
}

function hexHsl(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return rgbToHsl((value >> 16) & 255, (value >> 8) & 255, value & 255);
}

function recolor(data, index, target) {
  const source = rgbToHsl(data[index], data[index + 1], data[index + 2]);
  const [r, g, b] = hslToRgb({ h: target.h, s: target.s, l: source.l });
  data[index] = Math.round(r);
  data[index + 1] = Math.round(g);
  data[index + 2] = Math.round(b);
}

function isAccessory(r, g, b) {
  return g > 65 && b > 65 && g > r * 1.12 && b > r * 1.04 && Math.abs(g - b) < 105;
}

function isFur(characterId, r, g, b) {
  if (characterId === 'fox') return r > 175 && g > 35 && g < 175 && b < 85 && r > g * 1.35;
  if (characterId === 'bear') return r > 160 && g > 70 && g < 190 && b < 95 && r > g * 1.15;
  if (characterId === 'rabbit') return r > 175 && g > 145 && b > 105 && r - g > 4 && r - g < 62 && g - b > 7;
  if (characterId === 'raccoon') return r > 75 && r < 190 && g > 60 && g < 165 && b > 55 && b < 150 && r >= g && g >= b && r - b < 75;
  return false;
}

function createCanvas(width, height) {
  if (typeof globalThis.OffscreenCanvas === 'function') return new globalThis.OffscreenCanvas(width, height);
  const canvas = globalThis.document?.createElement?.('canvas');
  if (!canvas) return null;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function customizedRunnerFrame(sheet, characterId, cosmeticsValue, frame) {
  const cosmetics = normalizeCharacterCosmetics(cosmeticsValue);
  const original = { image: sheet, x: frame.x, y: frame.y };
  if (cosmetics.scarfColor === DEFAULT_CHARACTER_COSMETICS.scarfColor
      && cosmetics.shoeColor === DEFAULT_CHARACTER_COSMETICS.shoeColor
      && cosmetics.furColor === DEFAULT_CHARACTER_COSMETICS.furColor) return original;

  const key = `${characterId}:${cosmetics.scarfColor}:${cosmetics.shoeColor}:${cosmetics.furColor}:${frame.x}:${frame.y}`;
  let variants = coloredFrames.get(sheet);
  if (!variants) { variants = new Map(); coloredFrames.set(sheet, variants); }
  if (variants.has(key)) return variants.get(key);

  const canvas = createCanvas(frame.w, frame.h);
  const context = canvas?.getContext?.('2d', { willReadFrequently: true });
  if (!context) return original;
  try {
    context.drawImage(sheet, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    const pixels = context.getImageData(0, 0, frame.w, frame.h);
    const scarf = hexHsl(characterColorHex('scarfColor', cosmetics.scarfColor));
    const shoes = hexHsl(characterColorHex('shoeColor', cosmetics.shoeColor));
    const furHex = characterColorHex('furColor', cosmetics.furColor);
    const fur = furHex ? hexHsl(furHex) : null;
    for (let y = 0; y < frame.h; y++) {
      const lowerBody = y > frame.h * .58;
      for (let x = 0; x < frame.w; x++) {
        const index = (y * frame.w + x) * 4;
        if (pixels.data[index + 3] < 16) continue;
        const r = pixels.data[index], g = pixels.data[index + 1], b = pixels.data[index + 2];
        if (isAccessory(r, g, b)) recolor(pixels.data, index, lowerBody ? shoes : scarf);
        else if (fur && isFur(characterId, r, g, b)) recolor(pixels.data, index, fur);
      }
    }
    context.putImageData(pixels, 0, 0);
    const result = { image: canvas, x: 0, y: 0 };
    variants.set(key, result);
    return result;
  } catch {
    return original;
  }
}

export function customizedRunnerSheet(sheet, characterId, cosmeticsValue, atlas) {
  const cosmetics = normalizeCharacterCosmetics(cosmeticsValue);
  if (cosmetics.scarfColor === DEFAULT_CHARACTER_COSMETICS.scarfColor
      && cosmetics.shoeColor === DEFAULT_CHARACTER_COSMETICS.shoeColor
      && cosmetics.furColor === DEFAULT_CHARACTER_COSMETICS.furColor) return sheet;

  const key = `${characterId}:${cosmetics.scarfColor}:${cosmetics.shoeColor}:${cosmetics.furColor}`;
  let variants = coloredSheets.get(sheet);
  if (!variants) { variants = new Map(); coloredSheets.set(sheet, variants); }
  if (variants.has(key)) return variants.get(key);

  const canvas = createCanvas(atlas.width, atlas.height);
  const context = canvas?.getContext?.('2d', { willReadFrequently: true });
  if (!context) return sheet;
  try {
    context.drawImage(sheet, 0, 0);
    const pixels = context.getImageData(0, 0, atlas.width, atlas.height);
    const scarf = hexHsl(characterColorHex('scarfColor', cosmetics.scarfColor));
    const shoes = hexHsl(characterColorHex('shoeColor', cosmetics.shoeColor));
    const furHex = characterColorHex('furColor', cosmetics.furColor);
    const fur = furHex ? hexHsl(furHex) : null;
    for (const frame of atlas.frames) {
      for (let y = frame.y; y < frame.y + frame.h; y++) {
        const lowerBody = y - frame.y > frame.h * .58;
        for (let x = frame.x; x < frame.x + frame.w; x++) {
          const index = (y * atlas.width + x) * 4;
          if (pixels.data[index + 3] < 16) continue;
          const r = pixels.data[index], g = pixels.data[index + 1], b = pixels.data[index + 2];
          if (isAccessory(r, g, b)) recolor(pixels.data, index, lowerBody ? shoes : scarf);
          else if (fur && isFur(characterId, r, g, b)) recolor(pixels.data, index, fur);
        }
      }
    }
    context.putImageData(pixels, 0, 0);
    variants.set(key, canvas);
    return canvas;
  } catch {
    return sheet;
  }
}
