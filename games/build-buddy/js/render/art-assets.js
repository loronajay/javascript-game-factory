export const ART = Object.freeze({
  sky: 'assets/art/sky.png', city: 'assets/art/city.png',
  cranes: 'assets/art/cranes.png', springs: 'assets/art/springs.png',
});

// Measured opaque bounds, excluding the atlas padding and soft exterior glow.
// drawImage maps these directly onto each tool's physics rectangle, including its cap.
export const SPRING_CROPS = Object.freeze({
  springYellow: { x: 49, y: 398, w: 394, h: 263 },
  springGreen: { x: 574, y: 398, w: 392, h: 263 },
  springBlue: { x: 1094, y: 398, w: 393, h: 263 },
});

const cache = new Map();
export function artImage(key) {
  if (typeof Image === 'undefined') return null;
  if (!cache.has(key)) {
    const image = new Image();
    image.src = new URL(`../../${ART[key]}`, import.meta.url).href;
    cache.set(key, image);
  }
  const image = cache.get(key);
  return image.complete && image.naturalWidth > 0 ? image : null;
}

export function parallaxOffset(camera, speed, tileWidth) {
  return { x: -((camera.x * speed % tileWidth + tileWidth) % tileWidth) || 0,
    y: -camera.y * speed * .3 };
}
