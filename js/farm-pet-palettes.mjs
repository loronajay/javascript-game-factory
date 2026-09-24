// Runtime palette treatment for the Gobkit animals.
//
// Every model uses one shared gradient-atlas material, so multiplying the whole
// material also dirties eye whites, pupils, mouths, and pale facial markings.
// Palette variants instead replace paintable atlas colors with a designed
// three-color ramp while reserving the neutral extremes used by those details.
const textureCache = new WeakMap();
function hexRgb(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
function sourceHue(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const range = max - min;
    if (range === 0)
        return 0;
    if (max === r)
        return (60 * ((g - b) / range) + 360) % 360;
    if (max === g)
        return 60 * ((b - r) / range + 2);
    return 60 * ((r - g) / range + 4);
}
function rampIndex(r, g, b) {
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma < 20)
        return 1;
    const hue = sourceHue(r, g, b);
    if (hue < 48 || hue >= 330)
        return 0;
    if (hue < 175)
        return 2;
    if (hue < 285)
        return 1;
    return 2;
}
/** Pure pixel contract used by both the renderer and headless tests. */
export function recolorPalettePixel(pixel, colors) {
    if (pixel.a === 0)
        return pixel;
    const { r, g, b, a } = pixel;
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const chroma = maximum - minimum;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Pupils/outlines and warm or cool whites occupy the atlas extremes. Keeping
    // their antialiased neutral neighbours prevents colored eye halos as well.
    const protectedDetail = luminance <= 28
        || (chroma <= 20 && (luminance <= 72 || luminance >= 214));
    if (protectedDetail)
        return pixel;
    const target = hexRgb(colors[rampIndex(r, g, b)]);
    // Retain the source atlas' light/shadow modelling instead of flattening the
    // animal to a solid swatch. The ramp supplies hue; the atlas supplies form.
    const shade = 0.56 + (luminance / 255) * 0.7;
    return {
        r: Math.round(Math.min(255, target[0] * shade)),
        g: Math.round(Math.min(255, target[1] * shade)),
        b: Math.round(Math.min(255, target[2] * shade)),
        a,
    };
}
function paletteTexture(THREE, source, palette) {
    if (!source?.image || !palette.colors || typeof document === "undefined")
        return source;
    const image = source.image;
    const width = image.naturalWidth ?? image.width ?? 0;
    const height = image.naturalHeight ?? image.height ?? 0;
    if (!width || !height)
        return source;
    const cacheKey = `${palette.id}:${palette.colors.join(",")}`;
    const imageKey = image;
    const cached = textureCache.get(imageKey)?.get(cacheKey);
    if (cached)
        return cached;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
        return source;
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
        const recolored = recolorPalettePixel({
            r: pixels.data[offset],
            g: pixels.data[offset + 1],
            b: pixels.data[offset + 2],
            a: pixels.data[offset + 3],
        }, palette.colors);
        pixels.data[offset] = recolored.r;
        pixels.data[offset + 1] = recolored.g;
        pixels.data[offset + 2] = recolored.b;
        pixels.data[offset + 3] = recolored.a;
    }
    context.putImageData(pixels, 0, 0);
    const result = source.clone?.() ?? new THREE.CanvasTexture(canvas);
    result.image = canvas;
    result.needsUpdate = true;
    let variants = textureCache.get(imageKey);
    if (!variants) {
        variants = new Map();
        textureCache.set(imageKey, variants);
    }
    variants.set(cacheKey, result);
    return result;
}
/** Clone a loaded GLB material and apply a non-destructive palette texture. */
export function materialForAnimalPalette(THREE, material, palette) {
    const copy = material.clone();
    copy.color?.set?.("#ffffff");
    if (palette.id !== "standard")
        copy.map = paletteTexture(THREE, material.map, palette);
    if (palette.finish === "pearl") {
        copy.metalness = Math.max(copy.metalness ?? 0, 0.18);
        copy.roughness = Math.min(copy.roughness ?? 1, 0.34);
        copy.envMapIntensity = Math.max(copy.envMapIntensity ?? 1, 1.35);
    }
    copy.needsUpdate = true;
    return copy;
}
export function animalPaletteDisplayName(palette) {
    return palette.tier === "super-rare" ? `${palette.title} · Super Rare` : palette.title;
}
