export const CHARACTER_COLOR_OPTIONS = Object.freeze({
  scarfColor: Object.freeze([
    { id: 'teal', label: 'Teal', hex: '#159aa2' },
    { id: 'coral', label: 'Coral', hex: '#e7685b' },
    { id: 'violet', label: 'Violet', hex: '#8b6ee8' },
    { id: 'gold', label: 'Gold', hex: '#d8a12a' },
    { id: 'sky', label: 'Sky', hex: '#3d91d6' },
  ]),
  shoeColor: Object.freeze([
    { id: 'teal', label: 'Teal', hex: '#159aa2' },
    { id: 'coral', label: 'Coral', hex: '#e7685b' },
    { id: 'violet', label: 'Violet', hex: '#8b6ee8' },
    { id: 'gold', label: 'Gold', hex: '#d8a12a' },
    { id: 'sky', label: 'Sky', hex: '#3d91d6' },
  ]),
  furColor: Object.freeze([
    { id: 'classic', label: 'Classic', hex: null },
    { id: 'ember', label: 'Ember', hex: '#cf6048' },
    { id: 'cocoa', label: 'Cocoa', hex: '#875337' },
    { id: 'snow', label: 'Snow', hex: '#b9c6d1' },
    { id: 'midnight', label: 'Midnight', hex: '#485776' },
    { id: 'mint', label: 'Mint', hex: '#5c9f83' },
  ]),
});

export const DEFAULT_CHARACTER_COSMETICS = Object.freeze({
  scarfColor: 'teal',
  shoeColor: 'teal',
  furColor: 'classic',
});

export function normalizeCharacterCosmetic(key, value) {
  const options = CHARACTER_COLOR_OPTIONS[key];
  if (!options) return null;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  return options.some(option => option.id === value) ? value : DEFAULT_CHARACTER_COSMETICS[key];
}

export function normalizeCharacterCosmetics(value = {}) {
  return {
    scarfColor: normalizeCharacterCosmetic('scarfColor', value?.scarfColor),
    shoeColor: normalizeCharacterCosmetic('shoeColor', value?.shoeColor),
    furColor: normalizeCharacterCosmetic('furColor', value?.furColor),
  };
}

export function characterColorHex(key, value) {
  const normalized = normalizeCharacterCosmetic(key, value);
  if (typeof normalized === 'string' && normalized.startsWith('#')) return normalized;
  return CHARACTER_COLOR_OPTIONS[key]?.find(option => option.id === normalized)?.hex ?? null;
}
