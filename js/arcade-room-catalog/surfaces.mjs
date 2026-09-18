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
export const SURFACE_KINDS = Object.freeze(["floor", "wall", "ceiling", "trim"]);
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
    "herringbone",
    "marble",
    "hazard",
    "subway",
    "tartan",
    "circuit",
]);
const STARTER = Object.freeze({ type: "starter", source: "Arcade Room" });
function surface(kind, slug, title, group, style, swatch) {
    return Object.freeze({
        id: `${kind}.${slug}`,
        kind,
        title,
        group,
        swatch: swatch ?? [style.colors[0] ?? "#888888", style.colors[1] ?? style.colors[0] ?? "#888888"],
        style: Object.freeze({ ...style, colors: Object.freeze([...style.colors]) }),
        unlock: STARTER,
    });
}
const matte = { roughness: 0.78, metalness: 0.04 };
const satin = { roughness: 0.5, metalness: 0.1 };
const gloss = { roughness: 0.28, metalness: 0.18 };
export const FLOOR_CATALOG = Object.freeze([
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
    // — Second pass (2026-09-17): more checkers and carpets, herringbone, stone, hazard and neon —
    surface("floor", "checker-black-lime", "Checker · Black & Lime", "Checker", { pattern: "checker", colors: ["#0b120b", "#7dff4d"], repeat: 20, ...gloss }),
    surface("floor", "checker-black-orange", "Checker · Black & Orange", "Checker", { pattern: "checker", colors: ["#15100b", "#ff7a1a"], repeat: 20, ...gloss }),
    surface("floor", "checker-navy-gold", "Checker · Navy & Gold", "Checker", { pattern: "checker", colors: ["#141e3a", "#c9a24a"], repeat: 20, ...gloss }),
    surface("floor", "checker-mint-cream", "Checker · Mint & Cream", "Checker", { pattern: "checker", colors: ["#58c9a4", "#f4ead2"], repeat: 20, ...gloss }),
    surface("floor", "checker-large-black-white", "Big Checker · Black & White", "Checker", { pattern: "checker", colors: ["#111318", "#e9e4d6"], repeat: 8, ...gloss }),
    surface("floor", "galaxy-carpet-purple", "Galaxy Carpet · Violet", "Carpet", { pattern: "galaxy-carpet", colors: ["#170a2e", "#a35bff", "#22e5ff", "#ff2d95"], repeat: 5, roughness: 0.96, metalness: 0 }),
    surface("floor", "galaxy-carpet-green", "Galaxy Carpet · Toxic", "Carpet", { pattern: "galaxy-carpet", colors: ["#061a10", "#7dff4d", "#ffd33d", "#22e5ff"], repeat: 5, roughness: 0.96, metalness: 0 }),
    surface("floor", "carpet-navy", "Navy Carpet", "Carpet", { pattern: "carpet", colors: ["#141e3a", "#1b2a4d"], repeat: 10, roughness: 0.98, metalness: 0 }),
    surface("floor", "carpet-plum", "Plum Carpet", "Carpet", { pattern: "carpet", colors: ["#3f1f5c", "#4d2870"], repeat: 10, roughness: 0.98, metalness: 0 }),
    surface("floor", "carpet-forest", "Forest Carpet", "Carpet", { pattern: "carpet", colors: ["#1f4a34", "#285c42"], repeat: 10, roughness: 0.98, metalness: 0 }),
    surface("floor", "carpet-sand", "Sand Carpet", "Carpet", { pattern: "carpet", colors: ["#b8a47c", "#c9b78f"], repeat: 10, roughness: 0.98, metalness: 0 }),
    surface("floor", "cherry-planks", "Cherry Planks", "Wood", { pattern: "planks", colors: ["#8a3b2c", "#6e2c21", "#a85a3f"], repeat: 5, ...satin }),
    surface("floor", "ash-planks", "Ash Planks", "Wood", { pattern: "planks", colors: ["#c9b68f", "#a8946e", "#e0d0ab"], repeat: 5, ...satin }),
    surface("floor", "ebony-planks", "Ebony Planks", "Wood", { pattern: "planks", colors: ["#1d1a17", "#14120f", "#2b2621"], repeat: 5, ...satin }),
    surface("floor", "herringbone-oak", "Oak Herringbone", "Wood", { pattern: "herringbone", colors: ["#b5803f", "#8e6230", "#d9a866"], repeat: 6, ...satin }),
    surface("floor", "herringbone-walnut", "Walnut Herringbone", "Wood", { pattern: "herringbone", colors: ["#4a2f1c", "#352113", "#6b4527"], repeat: 6, ...satin }),
    surface("floor", "marble-white", "White Marble", "Stone", { pattern: "marble", colors: ["#ece9e2", "#b9b5ad", "#8f8b84"], repeat: 4, roughness: 0.22, metalness: 0.08 }),
    surface("floor", "marble-black", "Black Marble", "Stone", { pattern: "marble", colors: ["#141518", "#3a3c42", "#c9a24a"], repeat: 4, roughness: 0.22, metalness: 0.12 }),
    surface("floor", "marble-green", "Verde Marble", "Stone", { pattern: "marble", colors: ["#173a2c", "#2e6b52", "#cfd8d2"], repeat: 4, roughness: 0.22, metalness: 0.1 }),
    surface("floor", "slate-dark", "Dark Concrete", "Concrete", { pattern: "concrete", colors: ["#1b1d22", "#25282e"], repeat: 5, roughness: 0.62, metalness: 0.14 }),
    surface("floor", "red-tiles", "Red Quarry Tiles", "Tile", { pattern: "tiles", colors: ["#9a3b2e", "#5a241c"], repeat: 12, ...satin }),
    surface("floor", "hex-pink", "Hex Tiles · Pink", "Tile", { pattern: "hex", colors: ["#2a1230", "#ff5caf"], repeat: 8, ...satin }),
    surface("floor", "terrazzo-dark", "Midnight Terrazzo", "Tile", { pattern: "terrazzo", colors: ["#1b1f2a", "#ffd33d", "#22e5ff", "#ff2d95"], repeat: 6, ...gloss }),
    surface("floor", "hazard-yellow", "Hazard Stripes", "Industrial", { pattern: "hazard", colors: ["#111318", "#ffd33d"], repeat: 8, roughness: 0.6, metalness: 0.2 }),
    surface("floor", "steel-panels", "Steel Deck", "Industrial", { pattern: "panels", colors: ["#3c424b", "#2b3038"], repeat: 8, roughness: 0.42, metalness: 0.7 }),
    surface("floor", "neon-grid-purple", "Neon Grid · Violet", "Neon", { pattern: "neon-grid", colors: ["#0a0614", "#a35bff"], repeat: 10, roughness: 0.4, metalness: 0.2, emissive: "#2a1548", emissiveIntensity: 0.9 }),
    surface("floor", "neon-grid-lime", "Neon Grid · Lime", "Neon", { pattern: "neon-grid", colors: ["#050f07", "#7dff4d"], repeat: 10, roughness: 0.4, metalness: 0.2, emissive: "#153f12", emissiveIntensity: 0.9 }),
    surface("floor", "circuit-cyan", "Circuit Board", "Neon", { pattern: "circuit", colors: ["#06141c", "#22e5ff", "#0d4a5a"], repeat: 6, roughness: 0.45, metalness: 0.25, emissive: "#062c36", emissiveIntensity: 0.8 }),
    surface("floor", "starfield", "Starfield", "Neon", { pattern: "starfield", colors: ["#040616", "#ffffff", "#8fd7ff"], repeat: 3, roughness: 0.9, metalness: 0, emissive: "#0a0f2e", emissiveIntensity: 1.1 }),
]);
export const WALL_CATALOG = Object.freeze([
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
    // — Second pass (2026-09-17): more paints, tile, stone, wallpaper and neon —
    surface("wall", "paint-navy", "Navy", "Paint", { pattern: "solid", colors: ["#141e3a"], repeat: 1, ...matte }),
    surface("wall", "paint-mustard", "Mustard", "Paint", { pattern: "solid", colors: ["#b98a2e"], repeat: 1, ...matte }),
    surface("wall", "paint-coral", "Coral", "Paint", { pattern: "solid", colors: ["#d95d4a"], repeat: 1, ...matte }),
    surface("wall", "paint-sky", "Sky", "Paint", { pattern: "solid", colors: ["#6fb2d8"], repeat: 1, ...matte }),
    surface("wall", "paint-mint", "Mint", "Paint", { pattern: "solid", colors: ["#7fcbb0"], repeat: 1, ...matte }),
    surface("wall", "paint-lavender", "Lavender", "Paint", { pattern: "solid", colors: ["#9b8bd0"], repeat: 1, ...matte }),
    surface("wall", "paint-rust", "Rust", "Paint", { pattern: "solid", colors: ["#8a3b2c"], repeat: 1, ...matte }),
    surface("wall", "paint-white", "Gallery White", "Paint", { pattern: "solid", colors: ["#f2f1ec"], repeat: 1, ...matte }),
    surface("wall", "brick-white", "Whitewashed Brick", "Brick", { pattern: "brick", colors: ["#d9d4c8", "#c4beb0", "#eae6dc"], repeat: 8, roughness: 0.92, metalness: 0 }),
    surface("wall", "brick-tan", "Tan Brick", "Brick", { pattern: "brick", colors: ["#b58a5a", "#9a7248", "#d6c5ad"], repeat: 8, roughness: 0.92, metalness: 0 }),
    surface("wall", "subway-white", "Subway Tile · White", "Tile", { pattern: "subway", colors: ["#eef0f2", "#9aa2ad"], repeat: 8, ...gloss }),
    surface("wall", "subway-black", "Subway Tile · Black", "Tile", { pattern: "subway", colors: ["#15161a", "#3c424b"], repeat: 8, ...gloss }),
    surface("wall", "subway-teal", "Subway Tile · Teal", "Tile", { pattern: "subway", colors: ["#14555c", "#0d3a40"], repeat: 8, ...gloss }),
    surface("wall", "subway-pink", "Subway Tile · Pink", "Tile", { pattern: "subway", colors: ["#ff8ec8", "#b85a8c"], repeat: 8, ...gloss }),
    surface("wall", "marble-white", "White Marble", "Stone", { pattern: "marble", colors: ["#ece9e2", "#b9b5ad", "#8f8b84"], repeat: 3, roughness: 0.24, metalness: 0.08 }),
    surface("wall", "marble-black", "Black Marble", "Stone", { pattern: "marble", colors: ["#141518", "#3a3c42", "#c9a24a"], repeat: 3, roughness: 0.24, metalness: 0.12 }),
    surface("wall", "stripes-pink", "Pinstripe · Pink", "Wallpaper", { pattern: "stripes", colors: ["#2a1230", "#ff5caf"], repeat: 10, ...matte }),
    surface("wall", "stripes-cream", "Pinstripe · Cream", "Wallpaper", { pattern: "stripes", colors: ["#e8dfc8", "#c9b78f"], repeat: 10, ...matte }),
    surface("wall", "chevron-cyan", "Chevron · Cyan", "Wallpaper", { pattern: "chevron", colors: ["#0b1220", "#22b6d8"], repeat: 6, ...matte }),
    surface("wall", "chevron-gold", "Chevron · Gold", "Wallpaper", { pattern: "chevron", colors: ["#2a1d10", "#c9a24a"], repeat: 6, ...matte }),
    surface("wall", "diamonds-pink", "Harlequin · Pink", "Wallpaper", { pattern: "diamonds", colors: ["#2a1230", "#5c2a4a"], repeat: 8, ...matte }),
    surface("wall", "diamonds-cream", "Harlequin · Cream", "Wallpaper", { pattern: "diamonds", colors: ["#e8dfc8", "#cfc3a6"], repeat: 8, ...matte }),
    surface("wall", "memphis-dark", "Memphis · After Dark", "Wallpaper", { pattern: "memphis", colors: ["#111318", "#ff2d95", "#22e5ff", "#ffd33d"], repeat: 4, ...matte }),
    surface("wall", "tartan-red", "Tartan · Red", "Wallpaper", { pattern: "tartan", colors: ["#7a1626", "#1b1d22", "#c9a24a"], repeat: 6, ...matte }),
    surface("wall", "tartan-green", "Tartan · Hunter", "Wallpaper", { pattern: "tartan", colors: ["#1f4a34", "#141e3a", "#e8dfc8"], repeat: 6, ...matte }),
    surface("wall", "wainscot-cream", "Cream Wainscot", "Panelling", { pattern: "wainscot", colors: ["#e8dfc8", "#f2f1ec", "#cfc3a6"], repeat: 4, ...satin }),
    surface("wall", "wainscot-walnut", "Walnut Wainscot", "Panelling", { pattern: "wainscot", colors: ["#7a1626", "#4a2f1c", "#352113"], repeat: 4, ...satin }),
    surface("wall", "wainscot-black", "Black Wainscot", "Panelling", { pattern: "wainscot", colors: ["#2a2d33", "#111318", "#0b0c10"], repeat: 4, ...satin }),
    surface("wall", "panels-copper", "Copper Panels", "Industrial", { pattern: "panels", colors: ["#8a4f2c", "#6b3a20"], repeat: 6, roughness: 0.4, metalness: 0.75 }),
    surface("wall", "cinderblock-painted", "Painted Cinderblock", "Industrial", { pattern: "cinderblock", colors: ["#203a50", "#172a3d"], repeat: 6, roughness: 0.88, metalness: 0 }),
    surface("wall", "hazard-yellow", "Hazard Stripes", "Industrial", { pattern: "hazard", colors: ["#111318", "#ffd33d"], repeat: 6, roughness: 0.6, metalness: 0.2 }),
    surface("wall", "neon-grid-pink", "Neon Grid · Pink", "Neon", { pattern: "neon-grid", colors: ["#0c0512", "#ff2d95"], repeat: 8, roughness: 0.5, metalness: 0.1, emissive: "#3f0b28", emissiveIntensity: 0.8 }),
    surface("wall", "neon-grid-purple", "Neon Grid · Violet", "Neon", { pattern: "neon-grid", colors: ["#0a0614", "#a35bff"], repeat: 8, roughness: 0.5, metalness: 0.1, emissive: "#2a1548", emissiveIntensity: 0.8 }),
    surface("wall", "circuit-cyan", "Circuit Board · Cyan", "Neon", { pattern: "circuit", colors: ["#06141c", "#22e5ff", "#0d4a5a"], repeat: 5, roughness: 0.45, metalness: 0.25, emissive: "#062c36", emissiveIntensity: 0.8 }),
    surface("wall", "circuit-pink", "Circuit Board · Pink", "Neon", { pattern: "circuit", colors: ["#140612", "#ff2d95", "#5a0d3a"], repeat: 5, roughness: 0.45, metalness: 0.25, emissive: "#36062a", emissiveIntensity: 0.8 }),
    surface("wall", "circuit-lime", "Circuit Board · Lime", "Neon", { pattern: "circuit", colors: ["#061206", "#7dff4d", "#1a4d12"], repeat: 5, roughness: 0.45, metalness: 0.25, emissive: "#0d3609", emissiveIntensity: 0.8 }),
    surface("wall", "starfield", "Starfield", "Neon", { pattern: "starfield", colors: ["#040616", "#ffffff", "#8fd7ff"], repeat: 3, roughness: 0.9, metalness: 0, emissive: "#0a0f2e", emissiveIntensity: 1.1 }),
]);
export const CEILING_CATALOG = Object.freeze([
    surface("ceiling", "tile-dark", "Dark Tile", "Tile", { pattern: "tiles", colors: ["#172a3d", "#0f1d2b"], repeat: 8, roughness: 0.76, metalness: 0, emissive: "#07121c", emissiveIntensity: 0.7 }),
    surface("ceiling", "acoustic-white", "Acoustic Tile", "Tile", { pattern: "acoustic", colors: ["#d9d8d2", "#b9b8b2"], repeat: 10, ...matte }),
    surface("ceiling", "void-black", "Black Void", "Paint", { pattern: "solid", colors: ["#050608"], repeat: 1, roughness: 0.95, metalness: 0 }),
    surface("ceiling", "steel-grid", "Exposed Steel", "Industrial", { pattern: "panels", colors: ["#2a2e35", "#1a1d22"], repeat: 6, roughness: 0.5, metalness: 0.6 }),
    surface("ceiling", "starfield", "Starfield", "Neon", { pattern: "starfield", colors: ["#040616", "#ffffff", "#8fd7ff"], repeat: 3, roughness: 0.9, metalness: 0, emissive: "#0a0f2e", emissiveIntensity: 1.1 }),
    surface("ceiling", "oak-planks", "Oak Planks", "Wood", { pattern: "planks", colors: ["#b5803f", "#8e6230", "#d9a866"], repeat: 5, ...satin }),
    surface("ceiling", "paint-cream", "Cream", "Paint", { pattern: "solid", colors: ["#e8dfc8"], repeat: 1, ...matte }),
    // — Second pass (2026-09-17) —
    surface("ceiling", "paint-midnight", "Midnight", "Paint", { pattern: "solid", colors: ["#203a50"], repeat: 1, ...matte }),
    surface("ceiling", "paint-plum", "Plum", "Paint", { pattern: "solid", colors: ["#3f1f5c"], repeat: 1, ...matte }),
    surface("ceiling", "paint-crimson", "Crimson", "Paint", { pattern: "solid", colors: ["#7a1626"], repeat: 1, ...matte }),
    surface("ceiling", "tile-white", "White Tile", "Tile", { pattern: "tiles", colors: ["#e6e8ea", "#b9bdc2"], repeat: 8, ...matte }),
    surface("ceiling", "acoustic-dark", "Acoustic Tile · Dark", "Tile", { pattern: "acoustic", colors: ["#2a2d33", "#1b1d22"], repeat: 10, ...matte }),
    surface("ceiling", "walnut-planks", "Walnut Planks", "Wood", { pattern: "planks", colors: ["#4a2f1c", "#352113", "#6b4527"], repeat: 5, ...satin }),
    surface("ceiling", "whitewash-planks", "Whitewash Planks", "Wood", { pattern: "planks", colors: ["#d8d2c4", "#bfb8a8", "#ebe6da"], repeat: 5, ...matte }),
    surface("ceiling", "marble-white", "White Marble", "Stone", { pattern: "marble", colors: ["#ece9e2", "#b9b5ad", "#8f8b84"], repeat: 3, roughness: 0.3, metalness: 0.08 }),
    surface("ceiling", "copper-panels", "Copper Panels", "Industrial", { pattern: "panels", colors: ["#8a4f2c", "#6b3a20"], repeat: 6, roughness: 0.4, metalness: 0.75 }),
    surface("ceiling", "diamond-plate", "Diamond Plate", "Industrial", { pattern: "diamond-plate", colors: ["#3c424b", "#5a616b"], repeat: 12, roughness: 0.38, metalness: 0.78 }),
    surface("ceiling", "neon-grid-cyan", "Neon Grid · Cyan", "Neon", { pattern: "neon-grid", colors: ["#05070f", "#22e5ff"], repeat: 8, roughness: 0.5, metalness: 0.1, emissive: "#0b3a44", emissiveIntensity: 0.8 }),
    surface("ceiling", "neon-grid-pink", "Neon Grid · Pink", "Neon", { pattern: "neon-grid", colors: ["#0c0512", "#ff2d95"], repeat: 8, roughness: 0.5, metalness: 0.1, emissive: "#3f0b28", emissiveIntensity: 0.8 }),
    surface("ceiling", "circuit-cyan", "Circuit Board", "Neon", { pattern: "circuit", colors: ["#06141c", "#22e5ff", "#0d4a5a"], repeat: 5, roughness: 0.45, metalness: 0.25, emissive: "#062c36", emissiveIntensity: 0.8 }),
    surface("ceiling", "starfield-violet", "Starfield · Violet", "Neon", { pattern: "starfield", colors: ["#0c0420", "#ffffff", "#d9a0ff"], repeat: 3, roughness: 0.9, metalness: 0, emissive: "#1a0a3a", emissiveIntensity: 1.1 }),
]);
export const TRIM_CATALOG = Object.freeze([
    surface("trim", "steel-navy", "Navy Steel", "Metal", { pattern: "solid", colors: ["#1b4058"], repeat: 1, roughness: 0.52, metalness: 0.34 }),
    surface("trim", "chrome", "Chrome", "Metal", { pattern: "solid", colors: ["#c7ccd3"], repeat: 1, roughness: 0.18, metalness: 0.95 }),
    surface("trim", "brass", "Brass", "Metal", { pattern: "solid", colors: ["#c9a24a"], repeat: 1, roughness: 0.3, metalness: 0.85 }),
    surface("trim", "matte-black", "Matte Black", "Paint", { pattern: "solid", colors: ["#111318"], repeat: 1, roughness: 0.8, metalness: 0.1 }),
    surface("trim", "white", "Gloss White", "Paint", { pattern: "solid", colors: ["#eef0f2"], repeat: 1, roughness: 0.3, metalness: 0.05 }),
    surface("trim", "oak", "Oak", "Wood", { pattern: "solid", colors: ["#9a6b36"], repeat: 1, ...satin }),
    surface("trim", "neon-cyan", "Neon · Cyan", "Neon", { pattern: "solid", colors: ["#22e5ff"], repeat: 1, roughness: 0.3, metalness: 0.1, emissive: "#22e5ff", emissiveIntensity: 1.6 }, ["#22e5ff", "#0b3a44"]),
    surface("trim", "neon-pink", "Neon · Pink", "Neon", { pattern: "solid", colors: ["#ff2d95"], repeat: 1, roughness: 0.3, metalness: 0.1, emissive: "#ff2d95", emissiveIntensity: 1.6 }, ["#ff2d95", "#3f0b28"]),
    // — Second pass (2026-09-17). Trim stays solid: it is drawn on thin columns and skirting with a unit span, so a tiled pattern would smear —
    surface("trim", "copper", "Copper", "Metal", { pattern: "solid", colors: ["#b8703f"], repeat: 1, roughness: 0.32, metalness: 0.85 }),
    surface("trim", "gold", "Gold", "Metal", { pattern: "solid", colors: ["#e0b74a"], repeat: 1, roughness: 0.22, metalness: 0.95 }),
    surface("trim", "gunmetal", "Gunmetal", "Metal", { pattern: "solid", colors: ["#3c424b"], repeat: 1, roughness: 0.4, metalness: 0.8 }),
    surface("trim", "rose-gold", "Rose Gold", "Metal", { pattern: "solid", colors: ["#d9a08c"], repeat: 1, roughness: 0.25, metalness: 0.9 }),
    surface("trim", "crimson", "Crimson", "Paint", { pattern: "solid", colors: ["#7a1626"], repeat: 1, roughness: 0.5, metalness: 0.1 }),
    surface("trim", "teal", "Deep Teal", "Paint", { pattern: "solid", colors: ["#14555c"], repeat: 1, roughness: 0.5, metalness: 0.1 }),
    surface("trim", "cream", "Cream", "Paint", { pattern: "solid", colors: ["#e8dfc8"], repeat: 1, roughness: 0.6, metalness: 0.05 }),
    surface("trim", "walnut", "Walnut", "Wood", { pattern: "solid", colors: ["#4a2f1c"], repeat: 1, ...satin }),
    surface("trim", "whitewash", "Whitewash", "Wood", { pattern: "solid", colors: ["#d8d2c4"], repeat: 1, ...matte }),
    surface("trim", "neon-yellow", "Neon · Yellow", "Neon", { pattern: "solid", colors: ["#ffd33d"], repeat: 1, roughness: 0.3, metalness: 0.1, emissive: "#ffd33d", emissiveIntensity: 1.6 }, ["#ffd33d", "#3f3208"]),
    surface("trim", "neon-lime", "Neon · Lime", "Neon", { pattern: "solid", colors: ["#7dff4d"], repeat: 1, roughness: 0.3, metalness: 0.1, emissive: "#7dff4d", emissiveIntensity: 1.6 }, ["#7dff4d", "#153f12"]),
    surface("trim", "neon-purple", "Neon · Violet", "Neon", { pattern: "solid", colors: ["#a35bff"], repeat: 1, roughness: 0.3, metalness: 0.1, emissive: "#a35bff", emissiveIntensity: 1.6 }, ["#a35bff", "#2a1548"]),
    surface("trim", "neon-red", "Neon · Red", "Neon", { pattern: "solid", colors: ["#ff3b3b"], repeat: 1, roughness: 0.3, metalness: 0.1, emissive: "#ff3b3b", emissiveIntensity: 1.6 }, ["#ff3b3b", "#3f0b0b"]),
    surface("trim", "neon-white", "Neon · White", "Neon", { pattern: "solid", colors: ["#f4f8ff"], repeat: 1, roughness: 0.3, metalness: 0.1, emissive: "#f4f8ff", emissiveIntensity: 1.3 }, ["#f4f8ff", "#3a3f4a"]),
]);
export const SURFACE_CATALOG = Object.freeze({
    floor: FLOOR_CATALOG,
    wall: WALL_CATALOG,
    ceiling: CEILING_CATALOG,
    trim: TRIM_CATALOG,
});
/** The starter room: the look every layout had before surfaces were a choice. */
export const DEFAULT_SURFACE_IDS = Object.freeze({
    floor: "floor.showroom-slate",
    wall: "wall.paint-midnight",
    ceiling: "ceiling.tile-dark",
    trim: "trim.steel-navy",
});
export function findSurface(kind, id) {
    return SURFACE_CATALOG[kind].find((entry) => entry.id === id);
}
/** Every surface id, for ownership and validation sweeps. */
export function allSurfaceIds() {
    return SURFACE_KINDS.flatMap((kind) => SURFACE_CATALOG[kind].map((entry) => entry.id));
}
/** A colour a player may paint a surface slot: six-digit lowercase hex, the same shape a decor tint takes. */
export const SURFACE_COLOR_PATTERN = /^#[0-9a-f]{6}$/;
/** The most colour slots any pattern reads; a definition's `colors` length says how many it has. */
export const SURFACE_COLOR_SLOTS_MAX = 4;
export function isSurfaceColor(value) {
    return typeof value === "string" && SURFACE_COLOR_PATTERN.test(value);
}
/**
 * The player's colours for one surface, as a list matched slot for slot to
 * the definition's `colors`: a hex where they changed one, "" where the
 * catalog colour stands. Anything that is not a hex is the catalog colour,
 * slots the pattern does not have are dropped, and trailing empties are
 * trimmed — so an untouched surface is `[]` and compares equal to one that
 * was recoloured and put back.
 */
export function normalizeSurfaceColors(definition, value) {
    const source = Array.isArray(value) ? value : [];
    const slots = definition ? definition.style.colors.length : 0;
    const colors = [];
    for (let index = 0; index < Math.min(slots, source.length, SURFACE_COLOR_SLOTS_MAX); index += 1) {
        const raw = source[index];
        colors.push(typeof raw === "string" && SURFACE_COLOR_PATTERN.test(raw.toLowerCase()) ? raw.toLowerCase() : "");
    }
    while (colors.length && colors[colors.length - 1] === "")
        colors.pop();
    return colors;
}
/** `hex` moved most of the way to black: the glow a self-lit surface keeps under a recolour. */
function dim(hex, keep) {
    const value = Number.parseInt(hex.slice(1), 16);
    const channel = (shift) => Math.round(((value >> shift) & 255) * keep).toString(16).padStart(2, "0");
    return `#${channel(16)}${channel(8)}${channel(0)}`;
}
/**
 * The style the renderer draws: the catalog's, with the player's colours
 * written over it slot by slot. A self-lit surface's glow follows its accent
 * (slot 1), so a cyan neon grid painted pink glows pink and not cyan.
 */
export function resolveSurfaceStyle(definition, colors = []) {
    const overrides = normalizeSurfaceColors(definition, colors);
    if (overrides.length === 0)
        return definition.style;
    const resolved = definition.style.colors.map((base, index) => overrides[index] || base);
    const style = { ...definition.style, colors: Object.freeze(resolved) };
    if (definition.style.emissive && overrides[1])
        return { ...style, emissive: dim(overrides[1], 0.28) };
    return style;
}
/** The picker's groups for one kind, in catalog order. */
export function surfaceGroups(kind) {
    const seen = [];
    for (const entry of SURFACE_CATALOG[kind]) {
        if (!seen.includes(entry.group))
            seen.push(entry.group);
    }
    return seen;
}
