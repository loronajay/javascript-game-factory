// The room's surface catalog: every floor, wall finish, ceiling and trim a
// player can pick, as DATA.
//
// This folder is a pure layer — no THREE, no DOM, no canvas, no storage — the
// same rule Shark Hall's `scripts/cosmetics/` follows, and for the same reason:
// the whole catalog is validated under node in CI, and the renderer is handed
// a resolved presentation payload (`SurfaceStyle`) rather than an id, so
// "which id means what" is decided in exactly one place.
//
// EVERY SURFACE IS PROCEDURAL. A style names a pattern and a few colours;
// `js/arcade-room-surfaces.mts` draws that pattern onto a canvas texture at
// runtime. No art assets, so a new floor is one entry here and a tinted
// variant of an existing one is one entry with different colours.

export type SurfaceKind = "floor" | "wall" | "ceiling" | "trim";
export const SURFACE_KINDS: readonly SurfaceKind[] = Object.freeze(["floor", "wall", "ceiling", "trim"]);

/**
 * The patterns the renderer knows how to draw. The renderer's drawing table is
 * keyed by these names and a test asserts every one is implemented there.
 */
export const SURFACE_PATTERNS = Object.freeze([
  "solid",
  "checker",
  "planks",
  "tiles",
  "hex",
  "carpet",
  "galaxy-carpet",
  "concrete",
  "diamond-plate",
  "neon-grid",
  "terrazzo",
  "stripes",
  "chevron",
  "brick",
  "cinderblock",
  "memphis",
  "diamonds",
  "wainscot",
  "acoustic",
  "panels",
  "starfield",
] as const);
export type SurfacePattern = typeof SURFACE_PATTERNS[number];

export type SurfaceStyle = Readonly<{
  pattern: SurfacePattern;
  /** One to four colours; what each means is up to the pattern (base, accent, line…). */
  colors: readonly string[];
  /** How many times the tile repeats across the room's 20 m span. */
  repeat: number;
  roughness: number;
  metalness: number;
  /** Self-lit surfaces (neon grids, glowing trim). */
  emissive?: string;
  emissiveIntensity?: number;
}>;

export type SurfaceDefinition = Readonly<{
  id: string;
  kind: SurfaceKind;
  title: string;
  /** Group label in the picker. */
  group: string;
  /** Two swatch colours for the picker chip; the first is the dominant one. */
  swatch: readonly [string, string];
  style: SurfaceStyle;
  unlock: Readonly<{ type: "starter" | "achievement" | "purchase"; source: string }>;
}>;

const STARTER = Object.freeze({ type: "starter", source: "Arcade Room" } as const);

function surface(
  kind: SurfaceKind,
  slug: string,
  title: string,
  group: string,
  style: SurfaceStyle,
  swatch?: readonly [string, string],
): SurfaceDefinition {
  return Object.freeze({
    id: `${kind}.${slug}`,
    kind,
    title,
    group,
    swatch: swatch ?? [style.colors[0] ?? "#888888", style.colors[1] ?? style.colors[0] ?? "#888888"] as const,
    style: Object.freeze({ ...style, colors: Object.freeze([...style.colors]) }),
    unlock: STARTER,
  });
}

const matte = { roughness: 0.78, metalness: 0.04 };
const satin = { roughness: 0.5, metalness: 0.1 };
const gloss = { roughness: 0.28, metalness: 0.18 };

export const FLOOR_CATALOG: readonly SurfaceDefinition[] = Object.freeze([
  // The starter floor keeps the room's original look for every existing layout.
  surface("floor", "showroom-slate", "Showroom Slate", "Concrete", { pattern: "concrete", colors: ["#151c29", "#1c2536"], repeat: 6, roughness: 0.7, metalness: 0.18 }),
  surface("floor", "checker-black-white", "Checker · Black & White", "Checker", { pattern: "checker", colors: ["#111318", "#e9e4d6"], repeat: 20, ...gloss }),
  surface("floor", "checker-black-cyan", "Checker · Black & Cyan", "Checker", { pattern: "checker", colors: ["#0b1220", "#22b6d8"], repeat: 20, ...gloss }),
  surface("floor", "checker-purple-pink", "Checker · Purple & Pink", "Checker", { pattern: "checker", colors: ["#2b1050", "#ff5caf"], repeat: 20, ...gloss }),
  surface("floor", "checker-red-cream", "Checker · Diner Red", "Checker", { pattern: "checker", colors: ["#b3202c", "#f4ead2"], repeat: 20, ...gloss }),
  surface("floor", "galaxy-carpet", "Galaxy Carpet", "Carpet", { pattern: "galaxy-carpet", colors: ["#0c0a2e", "#ff2d95", "#22e5ff", "#ffd33d"], repeat: 5, roughness: 0.96, metalness: 0 }),
  surface("floor", "carpet-crimson", "Crimson Carpet", "Carpet", { pattern: "carpet", colors: ["#6e1220", "#851a2b"], repeat: 10, roughness: 0.98, metalness: 0 }),
  surface("floor", "carpet-charcoal", "Charcoal Carpet", "Carpet", { pattern: "carpet", colors: ["#23262b", "#2c3037"], repeat: 10, roughness: 0.98, metalness: 0 }),
  surface("floor", "carpet-teal", "Teal Carpet", "Carpet", { pattern: "carpet", colors: ["#0f4f55", "#146068"], repeat: 10, roughness: 0.98, metalness: 0 }),
  surface("floor", "oak-planks", "Oak Planks", "Wood", { pattern: "planks", colors: ["#b5803f", "#8e6230", "#d9a866"], repeat: 5, ...satin }),
  surface("floor", "walnut-planks", "Walnut Planks", "Wood", { pattern: "planks", colors: ["#4a2f1c", "#352113", "#6b4527"], repeat: 5, ...satin }),
  surface("floor", "whitewash-planks", "Whitewash Planks", "Wood", { pattern: "planks", colors: ["#d8d2c4", "#bfb8a8", "#ebe6da"], repeat: 5, ...matte }),
  surface("floor", "polished-concrete", "Polished Concrete", "Concrete", { pattern: "concrete", colors: ["#3a3f47", "#4a505a"], repeat: 4, roughness: 0.32, metalness: 0.12 }),
  surface("floor", "slate-tiles", "Slate Tiles", "Tile", { pattern: "tiles", colors: ["#2e3138", "#1b1d22"], repeat: 10, ...satin }),
  surface("floor", "white-tiles", "White Tiles", "Tile", { pattern: "tiles", colors: ["#e6e8ea", "#b9bdc2"], repeat: 10, ...gloss }),
  surface("floor", "hex-tiles", "Hex Tiles", "Tile", { pattern: "hex", colors: ["#1d2430", "#3b4a5e"], repeat: 8, ...satin }),
  surface("floor", "diamond-plate", "Diamond Plate", "Industrial", { pattern: "diamond-plate", colors: ["#6f7680", "#9aa2ad"], repeat: 12, roughness: 0.38, metalness: 0.78 }),
  surface("floor", "neon-grid-cyan", "Neon Grid · Cyan", "Neon", { pattern: "neon-grid", colors: ["#05070f", "#22e5ff"], repeat: 10, roughness: 0.4, metalness: 0.2, emissive: "#0b3a44", emissiveIntensity: 0.9 }),
  surface("floor", "neon-grid-pink", "Neon Grid · Pink", "Neon", { pattern: "neon-grid", colors: ["#0c0512", "#ff2d95"], repeat: 10, roughness: 0.4, metalness: 0.2, emissive: "#3f0b28", emissiveIntensity: 0.9 }),
  surface("floor", "terrazzo", "Terrazzo", "Tile", { pattern: "terrazzo", colors: ["#e3dccf", "#c2473f", "#2b4a7a", "#3e8a5a"], repeat: 6, ...gloss }),
]);

export const WALL_CATALOG: readonly SurfaceDefinition[] = Object.freeze([
  surface("wall", "paint-midnight", "Midnight", "Paint", { pattern: "solid", colors: ["#203a50"], repeat: 1, roughness: 0.82, metalness: 0, emissive: "#071522", emissiveIntensity: 0.82 }),
  surface("wall", "paint-charcoal", "Charcoal", "Paint", { pattern: "solid", colors: ["#2a2d33"], repeat: 1, ...matte }),
  surface("wall", "paint-crimson", "Crimson", "Paint", { pattern: "solid", colors: ["#7a1626"], repeat: 1, ...matte }),
  surface("wall", "paint-teal", "Deep Teal", "Paint", { pattern: "solid", colors: ["#14555c"], repeat: 1, ...matte }),
  surface("wall", "paint-plum", "Plum", "Paint", { pattern: "solid", colors: ["#3f1f5c"], repeat: 1, ...matte }),
  surface("wall", "paint-cream", "Cream", "Paint", { pattern: "solid", colors: ["#e8dfc8"], repeat: 1, ...matte }),
  surface("wall", "paint-forest", "Forest", "Paint", { pattern: "solid", colors: ["#1f4a34"], repeat: 1, ...matte }),
  surface("wall", "paint-black", "Pitch Black", "Paint", { pattern: "solid", colors: ["#0b0c10"], repeat: 1, ...matte }),
  surface("wall", "brick-red", "Red Brick", "Brick", { pattern: "brick", colors: ["#8a3b2c", "#6f2d22", "#c9b9a4"], repeat: 8, roughness: 0.92, metalness: 0 }),
  surface("wall", "brick-black", "Painted Brick", "Brick", { pattern: "brick", colors: ["#1c1d22", "#15161a", "#2a2c33"], repeat: 8, roughness: 0.88, metalness: 0 }),
  surface("wall", "cinderblock", "Cinderblock", "Brick", { pattern: "cinderblock", colors: ["#7d7f84", "#65676c"], repeat: 6, roughness: 0.9, metalness: 0 }),
  surface("wall", "stripes-cyan", "Pinstripe · Cyan", "Wallpaper", { pattern: "stripes", colors: ["#132238", "#1f6d8a"], repeat: 10, ...matte }),
  surface("wall", "stripes-gold", "Pinstripe · Gold", "Wallpaper", { pattern: "stripes", colors: ["#2a1d10", "#b98a2e"], repeat: 10, ...matte }),
  surface("wall", "chevron-pink", "Chevron · Pink", "Wallpaper", { pattern: "chevron", colors: ["#2a1230", "#ff5caf"], repeat: 6, ...matte }),
  surface("wall", "memphis", "Memphis '86", "Wallpaper", { pattern: "memphis", colors: ["#f2ecd9", "#ff4d91", "#22b6d8", "#ffd33d"], repeat: 4, ...matte }),
  surface("wall", "diamonds-teal", "Harlequin · Teal", "Wallpaper", { pattern: "diamonds", colors: ["#0f3a40", "#17555c"], repeat: 8, ...matte }),
  surface("wall", "wainscot-oak", "Oak Wainscot", "Panelling", { pattern: "wainscot", colors: ["#d8cfbb", "#8e6230", "#6b4527"], repeat: 4, ...satin }),
  surface("wall", "wainscot-navy", "Navy Wainscot", "Panelling", { pattern: "wainscot", colors: ["#1b2a44", "#2c3e5c", "#1a2538"], repeat: 4, ...satin }),
  surface("wall", "panels-steel", "Steel Panels", "Industrial", { pattern: "panels", colors: ["#3c424b", "#2b3038"], repeat: 6, roughness: 0.42, metalness: 0.7 }),
  surface("wall", "neon-grid-cyan", "Neon Grid · Cyan", "Neon", { pattern: "neon-grid", colors: ["#05070f", "#22e5ff"], repeat: 8, roughness: 0.5, metalness: 0.1, emissive: "#0b3a44", emissiveIntensity: 0.8 }),
]);

export const CEILING_CATALOG: readonly SurfaceDefinition[] = Object.freeze([
  surface("ceiling", "tile-dark", "Dark Tile", "Tile", { pattern: "tiles", colors: ["#172a3d", "#0f1d2b"], repeat: 8, roughness: 0.76, metalness: 0, emissive: "#07121c", emissiveIntensity: 0.7 }),
  surface("ceiling", "acoustic-white", "Acoustic Tile", "Tile", { pattern: "acoustic", colors: ["#d9d8d2", "#b9b8b2"], repeat: 10, ...matte }),
  surface("ceiling", "void-black", "Black Void", "Paint", { pattern: "solid", colors: ["#050608"], repeat: 1, roughness: 0.95, metalness: 0 }),
  surface("ceiling", "steel-grid", "Exposed Steel", "Industrial", { pattern: "panels", colors: ["#2a2e35", "#1a1d22"], repeat: 6, roughness: 0.5, metalness: 0.6 }),
  surface("ceiling", "starfield", "Starfield", "Neon", { pattern: "starfield", colors: ["#040616", "#ffffff", "#8fd7ff"], repeat: 3, roughness: 0.9, metalness: 0, emissive: "#0a0f2e", emissiveIntensity: 1.1 }),
  surface("ceiling", "oak-planks", "Oak Planks", "Wood", { pattern: "planks", colors: ["#b5803f", "#8e6230", "#d9a866"], repeat: 5, ...satin }),
  surface("ceiling", "paint-cream", "Cream", "Paint", { pattern: "solid", colors: ["#e8dfc8"], repeat: 1, ...matte }),
]);

export const TRIM_CATALOG: readonly SurfaceDefinition[] = Object.freeze([
  surface("trim", "steel-navy", "Navy Steel", "Metal", { pattern: "solid", colors: ["#1b4058"], repeat: 1, roughness: 0.52, metalness: 0.34 }),
  surface("trim", "chrome", "Chrome", "Metal", { pattern: "solid", colors: ["#c7ccd3"], repeat: 1, roughness: 0.18, metalness: 0.95 }),
  surface("trim", "brass", "Brass", "Metal", { pattern: "solid", colors: ["#c9a24a"], repeat: 1, roughness: 0.3, metalness: 0.85 }),
  surface("trim", "matte-black", "Matte Black", "Paint", { pattern: "solid", colors: ["#111318"], repeat: 1, roughness: 0.8, metalness: 0.1 }),
  surface("trim", "white", "Gloss White", "Paint", { pattern: "solid", colors: ["#eef0f2"], repeat: 1, roughness: 0.3, metalness: 0.05 }),
  surface("trim", "oak", "Oak", "Wood", { pattern: "solid", colors: ["#9a6b36"], repeat: 1, ...satin }),
  surface("trim", "neon-cyan", "Neon · Cyan", "Neon", { pattern: "solid", colors: ["#22e5ff"], repeat: 1, roughness: 0.3, metalness: 0.1, emissive: "#22e5ff", emissiveIntensity: 1.6 }, ["#22e5ff", "#0b3a44"]),
  surface("trim", "neon-pink", "Neon · Pink", "Neon", { pattern: "solid", colors: ["#ff2d95"], repeat: 1, roughness: 0.3, metalness: 0.1, emissive: "#ff2d95", emissiveIntensity: 1.6 }, ["#ff2d95", "#3f0b28"]),
]);

export const SURFACE_CATALOG: Readonly<Record<SurfaceKind, readonly SurfaceDefinition[]>> = Object.freeze({
  floor: FLOOR_CATALOG,
  wall: WALL_CATALOG,
  ceiling: CEILING_CATALOG,
  trim: TRIM_CATALOG,
});

/** The starter room: the look every layout had before surfaces were a choice. */
export const DEFAULT_SURFACE_IDS: Readonly<Record<SurfaceKind, string>> = Object.freeze({
  floor: "floor.showroom-slate",
  wall: "wall.paint-midnight",
  ceiling: "ceiling.tile-dark",
  trim: "trim.steel-navy",
});

export function findSurface(kind: SurfaceKind, id: string): SurfaceDefinition | undefined {
  return SURFACE_CATALOG[kind].find((entry) => entry.id === id);
}

/** Every surface id, for ownership and validation sweeps. */
export function allSurfaceIds(): string[] {
  return SURFACE_KINDS.flatMap((kind) => SURFACE_CATALOG[kind].map((entry) => entry.id));
}

/** The picker's groups for one kind, in catalog order. */
export function surfaceGroups(kind: SurfaceKind): readonly string[] {
  const seen: string[] = [];
  for (const entry of SURFACE_CATALOG[kind]) {
    if (!seen.includes(entry.group)) seen.push(entry.group);
  }
  return seen;
}
