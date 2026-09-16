export const ART = Object.freeze({
  animals: 'assets/art/animal-runners.png',
  foxRunner: 'assets/art/runners/fox.png',
  rabbitRunner: 'assets/art/runners/rabbit.png',
  raccoonRunner: 'assets/art/runners/raccoon.png',
  bearRunner: 'assets/art/runners/bear.png',
  menuCrew: 'assets/art/menu-custom-crew.png',
  springs: 'assets/art/springs.png',
});

export const DEFAULT_BIOME = 'construction-zone';

export const BIOME_ART = Object.freeze(Object.fromEntries([
  'construction-zone',
  'harbor',
  'glacier',
  'jungle',
  'mount-chaos',
].map((biome) => [biome, Object.freeze({
  sky: `assets/art/${biome}/sky.png`,
  city: `assets/art/${biome}/city.png`,
  cranes: `assets/art/${biome}/cranes.png`,
})])));

// Measured opaque bounds, excluding the atlas padding and soft exterior glow.
// drawImage maps these directly onto each tool's physics rectangle, including its cap.
export const SPRING_CROPS = Object.freeze({
  springYellow: { x: 49, y: 398, w: 394, h: 263 },
  springGreen: { x: 574, y: 398, w: 392, h: 263 },
  springBlue: { x: 1094, y: 398, w: 393, h: 263 },
});

const cache = new Map();
export function artImage(key, biome = DEFAULT_BIOME) {
  if (typeof Image === 'undefined') return null;
  const path = BIOME_ART[biome]?.[key] ?? ART[key];
  if (!path) return null;
  const cacheKey = `${biome}:${key}`;
  if (!cache.has(cacheKey)) {
    const image = new Image();
    image.src = new URL(`../../${path}`, import.meta.url).href;
    cache.set(cacheKey, image);
  }
  const image = cache.get(cacheKey);
  return image.complete && image.naturalWidth > 0 ? image : null;
}

export function parallaxOffset(camera, speed, tileWidth) {
  return { x: -((camera.x * speed % tileWidth + tileWidth) % tileWidth) || 0,
    y: -camera.y * speed * .3 };
}
