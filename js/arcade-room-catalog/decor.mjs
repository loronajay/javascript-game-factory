// The room's decor catalog: everything a player can place that is not a
// cabinet — neon strips and signs, posters, rugs, lights, furniture, props.
//
// Pure data, same rule as `surfaces.mts`. A definition says WHERE an item may
// go (`mounts`), how big it is (`size`, which is also its collision footprint
// when `blocksWalking`), what the player may change on it (`tint`, `length`,
// `scale` — an item is stretchable OR scalable, never both, so it has one size
// control),
// whether it casts light, and a `model` spec that `js/arcade-room-decor-model.mts`
// turns into meshes. Nothing here knows how to draw.
//
// EVERY MODEL IS PROCEDURAL — boxes, cylinders, canvas-drawn planes — so a
// new prop is a catalog row and a small builder, never an asset. Posters are
// the one place an image is used, and it is the game's own grid preview, which
// is how a player hangs any cabinet on the grid on their wall without anyone
// drawing a poster.
//
// SOME DECOR IS INTERACTIVE. An `interaction` names a page the player opens by
// walking up and pressing E, with the same reach rules a cabinet has; the room
// shows it in an overlay and knows nothing about what is inside. The Yam Bowling
// calendar was the first: the print on the wall is the real cover, and the page
// behind it is the calendar's own flip-through viewer. The jukebox is the second,
// and the one whose page talks back — see `jukebox.mts`. Interactive items sit
// first in their category so the editor shows them before the plain decor.
export const DECOR_MOUNTS = Object.freeze(["floor", "wall", "ceiling"]);
export const DECOR_CATEGORIES = Object.freeze([
    "neon",
    "sign",
    "poster",
    "rug",
    "light",
    "furniture",
    "prop",
    "wall",
]);
export const DECOR_CATEGORY_TITLES = Object.freeze({
    neon: "Neon",
    sign: "Signs",
    poster: "Posters",
    rug: "Rugs",
    light: "Lighting",
    furniture: "Furniture",
    prop: "Props",
    wall: "Wall",
});
/** The neon palette shared by every tintable item; the first is the default when a definition names none. */
export const NEON_TINTS = Object.freeze([
    { id: "pink", title: "Hot Pink", hex: "#ff2d95" },
    { id: "cyan", title: "Cyan", hex: "#22e5ff" },
    { id: "yellow", title: "Yellow", hex: "#ffd33d" },
    { id: "lime", title: "Lime", hex: "#7dff4d" },
    { id: "purple", title: "Violet", hex: "#a35bff" },
    { id: "orange", title: "Orange", hex: "#ff7a1a" },
    { id: "red", title: "Red", hex: "#ff3b3b" },
    { id: "blue", title: "Electric Blue", hex: "#3d7bff" },
    { id: "white", title: "White", hex: "#f4f8ff" },
].map((tint) => Object.freeze(tint)));
const STARTER = Object.freeze({ type: "starter", source: "Arcade Room" });
const NO_TINT = Object.freeze({ enabled: false, default: "" });
const NO_LENGTH = Object.freeze({ enabled: false, min: 0, max: 0, default: 0 });
const NO_SCALE = Object.freeze({ enabled: false, min: 1, max: 1 });
/**
 * How far each kind of item may be resized. Flat things on a wall or floor
 * can go big — a two-metre neon joystick is the point — while solid props keep
 * to a range that still reads as furniture beside a cabinet.
 */
const SCALE_RANGES = Object.freeze({
    sign: Object.freeze({ min: 0.5, max: 3 }),
    poster: Object.freeze({ min: 0.6, max: 2.5 }),
    rug: Object.freeze({ min: 0.5, max: 2.5 }),
    light: Object.freeze({ min: 0.6, max: 2 }),
    prop: Object.freeze({ min: 0.7, max: 1.6 }),
    wall: Object.freeze({ min: 0.6, max: 2 }),
});
function decor(input) {
    return Object.freeze({
        id: `decor.${input.category}.${input.slug}`,
        category: input.category,
        title: input.title,
        mounts: Object.freeze([...input.mounts]),
        size: Object.freeze({ ...input.size }),
        blocksWalking: input.blocksWalking ?? false,
        wallHeight: input.wallHeight ?? 1.6,
        tint: input.tint ? Object.freeze({ enabled: true, default: input.tint }) : NO_TINT,
        length: input.length ? Object.freeze({ enabled: true, ...input.length }) : NO_LENGTH,
        scale: input.scale && !input.length ? Object.freeze({ enabled: true, ...input.scale }) : NO_SCALE,
        light: input.light ? Object.freeze({ ...input.light }) : null,
        model: Object.freeze({ ...input.model }),
        interaction: input.interaction ? Object.freeze({ ...input.interaction }) : null,
        unlock: STARTER,
    });
}
const NEON_LIGHT = { intensity: 2.2, distance: 5.5 };
const SIGN_LIGHT = { intensity: 1.6, distance: 4 };
/** Grid cabinets a poster can be printed from; the preview lives at `grid-previews/<slug>.png`. */
export const POSTER_GAME_SLUGS = Object.freeze([
    "tactical-arena", "lovers-lost", "battleshits", "sumorai", "mini-tactics", "illuminauts",
    "bird-duty", "creature-battler", "cockpit-swarm", "build-buddy", "echo-duel", "circuit-siege",
    "speed-demon", "yam-bowling", "mini-hoops", "hide-and-seek", "puckd-up", "shark-hall",
]);
function posterTitle(slug) {
    return slug.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}
export const DECOR_CATALOG = Object.freeze([
    // — Neon —
    decor({ slug: "strip", category: "neon", title: "Neon Strip", mounts: ["wall", "ceiling", "floor"], size: { width: 2, height: 0.05, depth: 0.05 }, wallHeight: 2.8, tint: "#ff2d95", length: { min: 0.5, max: 8, default: 2 }, light: NEON_LIGHT, model: { kind: "strip" } }),
    decor({ slug: "heart", category: "neon", title: "Neon Heart", mounts: ["wall"], size: { width: 0.7, height: 0.7, depth: 0.06 }, wallHeight: 2.3, tint: "#ff2d95", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "shape-sign", shape: "heart" } }),
    decor({ slug: "star", category: "neon", title: "Neon Star", mounts: ["wall"], size: { width: 0.7, height: 0.7, depth: 0.06 }, wallHeight: 2.3, tint: "#ffd33d", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "shape-sign", shape: "star" } }),
    decor({ slug: "bolt", category: "neon", title: "Neon Bolt", mounts: ["wall"], size: { width: 0.5, height: 0.9, depth: 0.06 }, wallHeight: 2.3, tint: "#22e5ff", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "shape-sign", shape: "bolt" } }),
    decor({ slug: "joystick", category: "neon", title: "Neon Joystick", mounts: ["wall"], size: { width: 0.6, height: 0.8, depth: 0.06 }, wallHeight: 2.3, tint: "#7dff4d", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "shape-sign", shape: "joystick" } }),
    decor({ slug: "ghost", category: "neon", title: "Neon Ghost", mounts: ["wall"], size: { width: 0.6, height: 0.7, depth: 0.06 }, wallHeight: 2.3, tint: "#a35bff", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "shape-sign", shape: "ghost" } }),
    decor({ slug: "ring", category: "neon", title: "Neon Ring", mounts: ["wall"], size: { width: 0.9, height: 0.9, depth: 0.06 }, wallHeight: 2.3, tint: "#22e5ff", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "shape-sign", shape: "circle" } }),
    // — Signs —
    decor({ slug: "open", category: "sign", title: "OPEN", mounts: ["wall"], size: { width: 1.2, height: 0.5, depth: 0.06 }, wallHeight: 2.6, tint: "#ff3b3b", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "text-sign", text: "OPEN", font: "block" } }),
    decor({ slug: "arcade", category: "sign", title: "ARCADE", mounts: ["wall"], size: { width: 2.4, height: 0.6, depth: 0.06 }, wallHeight: 3.2, tint: "#ff2d95", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "text-sign", text: "ARCADE", font: "block" } }),
    decor({ slug: "play", category: "sign", title: "PLAY", mounts: ["wall"], size: { width: 1.3, height: 0.6, depth: 0.06 }, wallHeight: 2.6, tint: "#22e5ff", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "text-sign", text: "PLAY", font: "script" } }),
    decor({ slug: "insert-coin", category: "sign", title: "INSERT COIN", mounts: ["wall"], size: { width: 2.2, height: 0.45, depth: 0.06 }, wallHeight: 2.4, tint: "#ffd33d", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "text-sign", text: "INSERT COIN", font: "block" } }),
    decor({ slug: "game-over", category: "sign", title: "GAME OVER", mounts: ["wall"], size: { width: 2.2, height: 0.5, depth: 0.06 }, wallHeight: 2.6, tint: "#ff3b3b", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "text-sign", text: "GAME OVER", font: "block" } }),
    decor({ slug: "high-score", category: "sign", title: "HIGH SCORE", mounts: ["wall"], size: { width: 2.2, height: 0.5, depth: 0.06 }, wallHeight: 2.6, tint: "#7dff4d", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "text-sign", text: "HIGH SCORE", font: "block" } }),
    decor({ slug: "good-vibes", category: "sign", title: "good vibes", mounts: ["wall"], size: { width: 1.8, height: 0.7, depth: 0.06 }, wallHeight: 2.5, tint: "#ff2d95", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "text-sign", text: "good vibes", font: "script" } }),
    decor({ slug: "no-quarters", category: "sign", title: "no quarters", mounts: ["wall"], size: { width: 1.8, height: 0.7, depth: 0.06 }, wallHeight: 2.5, tint: "#a35bff", light: SIGN_LIGHT, scale: SCALE_RANGES.sign, model: { kind: "text-sign", text: "no quarters", font: "script" } }),
    // — Posters (one per grid cabinet) —
    ...POSTER_GAME_SLUGS.map((slug) => decor({
        slug,
        category: "poster",
        title: `${posterTitle(slug)} Poster`,
        mounts: ["wall"],
        size: { width: 0.9, height: 1.2, depth: 0.03 },
        wallHeight: 1.75,
        scale: SCALE_RANGES.poster,
        model: { kind: "poster", image: `../grid-previews/${slug}.png`, frame: "#111318" },
    })),
    // — Rugs (flat, walkable) —
    decor({ slug: "round", category: "rug", title: "Round Rug", mounts: ["floor"], size: { width: 2.2, height: 0.02, depth: 2.2 }, tint: "#7a1626", scale: SCALE_RANGES.rug, model: { kind: "rug", shape: "round", pattern: "border" } }),
    decor({ slug: "runner", category: "rug", title: "Runner", mounts: ["floor"], size: { width: 3.6, height: 0.02, depth: 1.1 }, tint: "#14555c", length: { min: 1.5, max: 10, default: 3.6 }, model: { kind: "rug", shape: "rect", pattern: "stripes" } }),
    decor({ slug: "area", category: "rug", title: "Area Rug", mounts: ["floor"], size: { width: 3.2, height: 0.02, depth: 2.4 }, tint: "#3f1f5c", scale: SCALE_RANGES.rug, model: { kind: "rug", shape: "rect", pattern: "border" } }),
    decor({ slug: "checker", category: "rug", title: "Checker Mat", mounts: ["floor"], size: { width: 2.4, height: 0.02, depth: 2.4 }, tint: "#e9e4d6", scale: SCALE_RANGES.rug, model: { kind: "rug", shape: "rect", pattern: "checker" } }),
    // — Lighting —
    decor({ slug: "spot", category: "light", title: "Ceiling Spot", mounts: ["ceiling"], size: { width: 0.24, height: 0.22, depth: 0.24 }, tint: "#fff2d1", light: { intensity: 3.2, distance: 7 }, scale: SCALE_RANGES.light, model: { kind: "ceiling-light", style: "spot" } }),
    decor({ slug: "pendant", category: "light", title: "Pendant Lamp", mounts: ["ceiling"], size: { width: 0.5, height: 1.2, depth: 0.5 }, tint: "#ffd33d", light: { intensity: 2.6, distance: 6 }, scale: SCALE_RANGES.light, model: { kind: "ceiling-light", style: "pendant" } }),
    decor({ slug: "disco", category: "light", title: "Disco Ball", mounts: ["ceiling"], size: { width: 0.6, height: 1.0, depth: 0.6 }, tint: "#f4f8ff", light: { intensity: 2.4, distance: 8 }, scale: SCALE_RANGES.light, model: { kind: "ceiling-light", style: "disco" } }),
    decor({ slug: "tube", category: "light", title: "Fluorescent Tube", mounts: ["ceiling"], size: { width: 1.5, height: 0.08, depth: 0.16 }, tint: "#dff5ff", length: { min: 0.8, max: 4, default: 1.5 }, light: { intensity: 2.8, distance: 6.5 }, model: { kind: "ceiling-light", style: "tube" } }),
    decor({ slug: "floor-lamp", category: "light", title: "Floor Lamp", mounts: ["floor"], size: { width: 0.4, height: 1.7, depth: 0.4 }, blocksWalking: true, tint: "#ffd33d", light: { intensity: 2, distance: 5 }, scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "floor-lamp" } }),
    // — Furniture (solid) —
    decor({ slug: "bench", category: "furniture", title: "Bench", mounts: ["floor"], size: { width: 1.6, height: 0.5, depth: 0.5 }, blocksWalking: true, tint: "#7a1626", scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "bench" } }),
    decor({ slug: "stool", category: "furniture", title: "Bar Stool", mounts: ["floor"], size: { width: 0.4, height: 0.75, depth: 0.4 }, blocksWalking: true, tint: "#ff3b3b", scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "stool" } }),
    decor({ slug: "table", category: "furniture", title: "Café Table", mounts: ["floor"], size: { width: 0.8, height: 0.78, depth: 0.8 }, blocksWalking: true, tint: "#111318", scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "table" } }),
    decor({ slug: "beanbag", category: "furniture", title: "Beanbag", mounts: ["floor"], size: { width: 1.0, height: 0.55, depth: 1.0 }, blocksWalking: true, tint: "#a35bff", scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "beanbag" } }),
    decor({ slug: "counter", category: "furniture", title: "Prize Counter", mounts: ["floor"], size: { width: 2.4, height: 1.1, depth: 0.8 }, blocksWalking: true, tint: "#22e5ff", light: { intensity: 1.2, distance: 3.5 }, scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "counter" } }),
    // — Props (solid) —
    // The jukebox is interactive: walk up, press E, and pick a record from every cabinet's
    // soundtrack (`jukebox.mts`). The page only picks; the room plays, so the song keeps
    // going after the overlay closes and gets quieter the further you walk from the box.
    decor({
        slug: "jukebox",
        category: "prop",
        title: "Jukebox",
        mounts: ["floor"],
        size: { width: 0.9, height: 1.5, depth: 0.65 },
        blocksWalking: true,
        tint: "#ff7a1a",
        light: { intensity: 1.6, distance: 4 },
        scale: SCALE_RANGES.prop,
        model: { kind: "prop", prop: "jukebox" },
        interaction: {
            prompt: "Press E to pick a record on the jukebox",
            url: "jukebox/index.html",
            title: "Jukebox",
            radius: 1.7,
            facingThreshold: 0.45,
        },
    }),
    decor({ slug: "plant", category: "prop", title: "Potted Plant", mounts: ["floor"], size: { width: 0.55, height: 1.3, depth: 0.55 }, blocksWalking: true, tint: "#3e8a5a", scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "plant" } }),
    decor({ slug: "trash-can", category: "prop", title: "Trash Can", mounts: ["floor"], size: { width: 0.42, height: 0.8, depth: 0.42 }, blocksWalking: true, tint: "#3c424b", scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "trash-can" } }),
    decor({ slug: "stanchion", category: "prop", title: "Velvet Rope Post", mounts: ["floor"], size: { width: 0.36, height: 1.0, depth: 0.36 }, blocksWalking: true, tint: "#c9a24a", scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "stanchion" } }),
    decor({ slug: "vending", category: "prop", title: "Vending Machine", mounts: ["floor"], size: { width: 0.9, height: 1.9, depth: 0.8 }, blocksWalking: true, tint: "#3d7bff", light: { intensity: 1.4, distance: 3.5 }, scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "vending" } }),
    decor({ slug: "claw", category: "prop", title: "Claw Machine", mounts: ["floor"], size: { width: 0.9, height: 2.0, depth: 0.9 }, blocksWalking: true, tint: "#ff2d95", light: { intensity: 1.4, distance: 3.5 }, scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "claw" } }),
    decor({ slug: "pinball", category: "prop", title: "Pinball Table", mounts: ["floor"], size: { width: 0.75, height: 1.9, depth: 1.5 }, blocksWalking: true, tint: "#ffd33d", light: { intensity: 1.4, distance: 3.5 }, scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "pinball" } }),
    decor({ slug: "popcorn", category: "prop", title: "Popcorn Cart", mounts: ["floor"], size: { width: 0.9, height: 1.6, depth: 0.7 }, blocksWalking: true, tint: "#ff3b3b", light: { intensity: 1.2, distance: 3 }, scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "popcorn" } }),
    decor({ slug: "speaker-stack", category: "prop", title: "Speaker Stack", mounts: ["floor"], size: { width: 0.6, height: 1.4, depth: 0.5 }, blocksWalking: true, tint: "#111318", scale: SCALE_RANGES.prop, model: { kind: "prop", prop: "speaker-stack" } }),
    // — Wall —
    // The Yam Bowling 2027 calendar: the closed cover at 11 x 8.5 in, hung by a hook, and
    // interactive — walk up and press E to flip through it. Size is twice the real print so it
    // reads across the room; the player can scale it back down or up to a feature wall.
    decor({
        slug: "yam-calendar",
        category: "wall",
        title: "Yam Bowling 2027 Calendar",
        mounts: ["wall"],
        size: { width: 0.66, height: 0.513, depth: 0.03 },
        wallHeight: 1.75,
        scale: { min: 0.5, max: 3 },
        model: { kind: "calendar", cover: "../games/yam-bowling/assets/calendar/cover.webp" },
        interaction: {
            prompt: "Press E to flip through the Yam Bowling calendar",
            url: "../games/yam-bowling/calendar/viewer.html",
            title: "Yam Bowling 2027 Pinup Calendar",
            radius: 1.6,
            facingThreshold: 0.45,
        },
    }),
    decor({ slug: "clock", category: "wall", title: "Wall Clock", mounts: ["wall"], size: { width: 0.5, height: 0.5, depth: 0.06 }, wallHeight: 2.6, tint: "#eef0f2", scale: SCALE_RANGES.wall, model: { kind: "wall-prop", prop: "clock" } }),
    decor({ slug: "shelf", category: "wall", title: "Shelf", mounts: ["wall"], size: { width: 1.2, height: 0.3, depth: 0.28 }, wallHeight: 1.7, tint: "#9a6b36", length: { min: 0.6, max: 4, default: 1.2 }, model: { kind: "wall-prop", prop: "shelf" } }),
    decor({ slug: "speaker", category: "wall", title: "Wall Speaker", mounts: ["wall"], size: { width: 0.35, height: 0.5, depth: 0.3 }, wallHeight: 3.0, tint: "#111318", scale: SCALE_RANGES.wall, model: { kind: "wall-prop", prop: "speaker" } }),
    decor({ slug: "tv", category: "wall", title: "Flat Screen", mounts: ["wall"], size: { width: 1.4, height: 0.8, depth: 0.08 }, wallHeight: 2.2, tint: "#22e5ff", light: { intensity: 1.2, distance: 3.5 }, scale: SCALE_RANGES.wall, model: { kind: "wall-prop", prop: "tv" } }),
    decor({ slug: "mirror", category: "wall", title: "Mirror", mounts: ["wall"], size: { width: 0.8, height: 1.2, depth: 0.05 }, wallHeight: 1.7, tint: "#c9a24a", scale: SCALE_RANGES.wall, model: { kind: "wall-prop", prop: "mirror" } }),
    decor({ slug: "exit-sign", category: "wall", title: "Exit Sign", mounts: ["wall"], size: { width: 0.5, height: 0.25, depth: 0.1 }, wallHeight: 3.6, tint: "#7dff4d", light: { intensity: 0.8, distance: 2.5 }, scale: SCALE_RANGES.wall, model: { kind: "wall-prop", prop: "exit-sign" } }),
    decor({ slug: "coat-hook", category: "wall", title: "Coat Hooks", mounts: ["wall"], size: { width: 0.6, height: 0.15, depth: 0.12 }, wallHeight: 1.7, tint: "#c7ccd3", scale: SCALE_RANGES.wall, model: { kind: "wall-prop", prop: "coat-hook" } }),
]);
/**
 * Lit decor beyond this many gets no light source, only its glow material.
 * Every point light is a real cost in a forward renderer, and a wall of forty
 * strips would otherwise stall the room; the first N placed keep their light.
 */
export const MAX_LIT_DECOR = 16;
export function findDecor(id) {
    return DECOR_CATALOG.find((entry) => entry.id === id);
}
export function decorByCategory(category) {
    return DECOR_CATALOG.filter((entry) => entry.category === category);
}
export function allDecorIds() {
    return DECOR_CATALOG.map((entry) => entry.id);
}
/** Every item the player can walk up to and open. */
export function interactiveDecor() {
    return DECOR_CATALOG.filter((entry) => entry.interaction !== null);
}
/**
 * The picture an item's catalog card shows when the item IS a picture — a poster's grid
 * preview, the calendar's cover. Null for everything else, which is rendered from its model.
 */
export function decorCardImage(definition) {
    if (definition.model.kind === "poster")
        return definition.model.image;
    if (definition.model.kind === "calendar")
        return definition.model.cover;
    return null;
}
/** The item's full extent once its stored length and scale are applied. A stretched length is absolute; scale multiplies everything. */
export function decorExtent(definition, length = 0, scale = 1) {
    const factor = definition.scale.enabled && scale > 0 ? scale : 1;
    const width = definition.length.enabled && length > 0 ? length : definition.size.width * factor;
    return { width, height: definition.size.height * factor, depth: definition.size.depth * factor };
}
/** The item's footprint on the floor once its stored length and scale are applied. */
export function decorFootprint(definition, length = 0, scale = 1) {
    const extent = decorExtent(definition, length, scale);
    return { width: extent.width, depth: extent.depth };
}
/** Clamp a requested length to what the item allows, or 0 when it is not stretchable. */
export function clampDecorLength(definition, length) {
    if (!definition.length.enabled)
        return 0;
    if (!Number.isFinite(length) || length <= 0)
        return definition.length.default;
    return Number(Math.min(definition.length.max, Math.max(definition.length.min, length)).toFixed(3));
}
/** Clamp a requested scale to what the item allows; 1 when it is not resizable or the request is nonsense. */
export function clampDecorScale(definition, scale) {
    if (!definition.scale.enabled)
        return 1;
    if (!Number.isFinite(scale) || scale <= 0)
        return 1;
    return Number(Math.min(definition.scale.max, Math.max(definition.scale.min, scale)).toFixed(2));
}
