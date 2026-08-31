// Art direction sampled from assets/lanes/<slug>.webp. These are surface and
// lighting choices only; no house owns collision dimensions or game settings.
const definitions = {
  'crimson-crown': { motif: 'crown', colors: [0xff2946, 0xe94456, 0x23121a], accent: 0xefb668,
    wall: 'brick', floor: 'onyx', seat: 0x27141d, trim: 0x545562, wood: 0xffead1, artGlow: .48, floorRoughness: .24, light: 0xffe1cb },
  'blue-circuit': { motif: 'circuit', colors: [0x00cfff, 0x2470ff, 0x101e2b], accent: 0x83efff,
    wall: 'metal', floor: 'onyx', seat: 0x133246, trim: 0x718e9a, wood: 0xfff1db, artGlow: .8, floorRoughness: .22, light: 0xdbedff },
  'emerald-vault': { motif: 'emerald', colors: [0x20e99a, 0x8af3bc, 0x12251e], accent: 0xd8c189,
    wall: 'stone', floor: 'marble', seat: 0x12352b, trim: 0x8fbaa0, wood: 0xffefcd, artGlow: .48, floorRoughness: .24, light: 0xe5ffeb },
  'royal-gold': { motif: 'deco', colors: [0xeebe61, 0xa55aee, 0x21132e], accent: 0xffdfa0,
    wall: 'velvet', floor: 'marble', seat: 0x54225d, trim: 0xc18d3e, wood: 0xffe8c6, artGlow: .3, floorRoughness: .2, light: 0xffdeb1 },
  'sunset-strip': { motif: 'sunset', colors: [0xff279b, 0xff852e, 0x261028], accent: 0xffd053,
    wall: 'metal', floor: 'grid', seat: 0x7b184d, trim: 0x9b346c, wood: 0xffdcc7, artGlow: .7, floorRoughness: .23, light: 0xffd6cb },
  'neon-carnival': { motif: 'carnival', colors: [0xff35c7, 0x10e4ec, 0x24132d], accent: 0xffb329,
    wall: 'metal', floor: 'confetti', seat: 0x087c89, trim: 0xec913c, wood: 0xffeccf, artGlow: .85, floorRoughness: .27, light: 0xffddf3 },
  'cosmic-bowl': { motif: 'cosmic', colors: [0x20dcff, 0xf33bc9, 0x10132d], accent: 0xc4f24b,
    wall: 'space', floor: 'stars', seat: 0x165779, trim: 0x647aa2, wood: 0xffe5d2, artGlow: .95, floorRoughness: .3, light: 0xdfddff },
  'liberty-lanes': { motif: 'liberty', colors: [0xde3344, 0x2860be, 0x26374e], accent: 0xf6e6bf,
    wall: 'ivory', floor: 'terrazzo', seat: 0x3d3030, trim: 0xb7a281, wood: 0xfff0d7, artGlow: .08, floorRoughness: .38, light: 0xffefdb },
  'oak-and-onyx': { motif: 'timber', colors: [0x258bda, 0xb88850, 0x25241f], accent: 0xd5ad71,
    wall: 'timber', floor: 'slate', seat: 0x302a24, trim: 0x9c794e, wood: 0xffe9ce, artGlow: .12, floorRoughness: .33, light: 0xffdfac },
};

export const LANE_THEMES = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([slug, theme]) =>
  [slug, Object.freeze({ ...theme, slug, colors: Object.freeze(theme.colors) })])));

export function getLaneTheme(slug) {
  return Object.hasOwn(LANE_THEMES, slug) ? LANE_THEMES[slug] : LANE_THEMES['crimson-crown'];
}

export const cssColor = hex => `#${hex.toString(16).padStart(6, '0')}`;
