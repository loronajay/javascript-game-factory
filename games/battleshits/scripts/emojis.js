export const EMOTE_TYPES = Object.freeze([
  'heart',
  'middle-finger',
  'smile',
  'crying',
]);

export const EMOTE_KEY_MAP = Object.freeze({
  w: 'heart',
  s: 'middle-finger',
  d: 'smile',
  a: 'crying',
});

export const EMOTE_ASSET_PATHS = Object.freeze({
  heart: 'images/emojis/heart.png',
  'middle-finger': 'images/emojis/middle-finger.png',
  smile: 'images/emojis/smile.png',
  crying: 'images/emojis/crying.png',
});

export const EMOTE_COOLDOWN_MS = 1000;
export const EMOTE_DISPLAY_MS = 3000;

export function keyToEmoteType(key) {
  if (typeof key !== 'string' || key.length === 0) return null;
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  return EMOTE_KEY_MAP[normalized] || null;
}

export function sanitizeEmoteType(value) {
  return typeof value === 'string' && EMOTE_TYPES.includes(value) ? value : null;
}
