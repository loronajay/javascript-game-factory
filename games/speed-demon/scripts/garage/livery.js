// A livery is everything a player changes about a car that is not the car.
//
// PURE. No canvas, no DOM, no storage — this owns *what a configuration is* and
// *what a valid one looks like*, and `render/livery.js` draws whatever it says.
// Same split as `radio/playlist.js` against `radio/stereo.js`, and for the same
// reason: rules belong somewhere a test can reach without a browser.
//
// The 24 base models are deliberately neutral bodies (measured roof saturation
// runs 0.004–0.019 across the whole roster), which is what makes a livery a
// *tint* rather than a second set of sprites. Nothing here holds pixels; a
// livery is a handful of numbers, which is also what makes it cheap to store
// and cheap to hand to an opponent over the wire.
//
// **`normalizeLivery` is total, and that is the point.** A livery arrives from
// three places that can all lie to us: a save file written by an older build, a
// server payload, and an opponent's config fetched during an online race. None
// of those may be able to produce a car that cannot be drawn, so every field is
// clamped to its range and every unknown id falls back to a default rather than
// throwing. A malformed livery yields a plain car, never an exception mid-race.

/**
 * How the paint reacts to light. The base art is painted with gloss highlights
 * already in it, so `gloss` is the identity finish and the other two are
 * adjustments to the highlight range rather than separate lighting models.
 */
export const FINISHES = [
  { id: "gloss", label: "Gloss" },
  { id: "matte", label: "Matte" },
  { id: "metallic", label: "Metallic" },
];

export const DEFAULT_FINISH = "gloss";

/**
 * Field ranges, in one place because both the editor's cursor steps and the
 * normalizer's clamps read them. Two copies of a range is how a slider ends up
 * able to select a value the normalizer then rejects.
 *
 * `brightness` is bounded well inside [0, 2] on purpose: the tint multiplies the
 * body's own luminance, so a wide range would either crush the panel shading to
 * black or blow the highlights out to a flat silhouette. Both destroy the shape
 * reading that makes a top-down car recognisable.
 */
export const LIVERY_LIMITS = {
  hue: { min: 0, max: 359, step: 5, wraps: true },
  saturation: { min: 0, max: 1, step: 0.05 },
  brightness: { min: 0.65, max: 1.35, step: 0.05 },
  windowTint: { min: 0, max: 1, step: 0.1 },
  tailLightHue: { min: 0, max: 359, step: 5, wraps: true },
  underglowHue: { min: 0, max: 359, step: 5, wraps: true },
  underglowIntensity: { min: 0.2, max: 1, step: 0.1 },
};

/** Factory settings: a plain silver car with clear glass and red lamps. */
export const DEFAULT_LIVERY = Object.freeze({
  paint: Object.freeze({ hue: 0, saturation: 0, brightness: 1, finish: DEFAULT_FINISH }),
  windowTint: 0,
  tailLightHue: 0,
  underglow: Object.freeze({ enabled: false, hue: 210, intensity: 0.6 }),
});

/**
 * Starting points offered in the editor. These are conveniences, not a
 * restriction — a player may leave a preset on any value in range — so nothing
 * else in the cabinet is allowed to assume a livery matches one of these.
 */
export const PAINT_PRESETS = [
  { id: "silver", label: "Silver", hue: 0, saturation: 0, brightness: 1 },
  { id: "black", label: "Black", hue: 0, saturation: 0, brightness: 0.7 },
  { id: "white", label: "White", hue: 0, saturation: 0, brightness: 1.3 },
  { id: "red", label: "Red", hue: 0, saturation: 0.85, brightness: 1 },
  { id: "orange", label: "Orange", hue: 25, saturation: 0.9, brightness: 1.05 },
  { id: "gold", label: "Gold", hue: 45, saturation: 0.75, brightness: 1.1 },
  { id: "lime", label: "Lime", hue: 85, saturation: 0.8, brightness: 1.05 },
  { id: "green", label: "Racing Green", hue: 140, saturation: 0.7, brightness: 0.8 },
  { id: "teal", label: "Teal", hue: 175, saturation: 0.7, brightness: 0.95 },
  { id: "blue", label: "Blue", hue: 215, saturation: 0.8, brightness: 0.95 },
  { id: "purple", label: "Purple", hue: 275, saturation: 0.7, brightness: 0.9 },
  { id: "pink", label: "Pink", hue: 325, saturation: 0.7, brightness: 1.1 },
];

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * Clamps into a limit, or wraps where the field is angular. Hue is a circle:
 * clamping it would make 355 and 5 both collapse onto an endpoint, so stepping
 * past the top of the range has to come out at the bottom.
 */
export function clampField(name, value) {
  const limit = LIVERY_LIMITS[name];
  if (!limit) return value;
  if (!isFiniteNumber(value)) return DEFAULT_LIVERY.paint[name] ?? limit.min;
  if (limit.wraps) {
    const span = limit.max - limit.min + 1;
    return limit.min + (((Math.round(value) - limit.min) % span) + span) % span;
  }
  return Math.min(limit.max, Math.max(limit.min, value));
}

/** Steps a field by whole increments, wrapping or clamping as that field needs. */
export function stepField(name, value, direction) {
  const limit = LIVERY_LIMITS[name];
  if (!limit) return value;
  const next = (isFiniteNumber(value) ? value : limit.min) + limit.step * direction;
  // Float steps accumulate error (0.55 + 0.05 lands on 0.6000000000000001), and
  // this value gets serialized and compared, so round it to the step's own
  // precision rather than letting the drift reach storage.
  const rounded = limit.wraps ? Math.round(next) : Math.round(next * 1000) / 1000;
  return clampField(name, rounded);
}

export function findFinish(id) {
  return FINISHES.find((finish) => finish.id === id) ?? null;
}

export function findPaintPreset(id) {
  return PAINT_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * The one way a livery is built. Every field is clamped and every unknown id
 * falls back, so the result is always drawable — see the note at the top about
 * the three untrusted sources a livery can arrive from.
 */
export function createLivery(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const paint = source.paint && typeof source.paint === "object" ? source.paint : {};
  const underglow = source.underglow && typeof source.underglow === "object" ? source.underglow : {};

  return {
    paint: {
      hue: clampField("hue", paint.hue ?? DEFAULT_LIVERY.paint.hue),
      saturation: clampField("saturation", paint.saturation ?? DEFAULT_LIVERY.paint.saturation),
      brightness: clampField("brightness", paint.brightness ?? DEFAULT_LIVERY.paint.brightness),
      finish: findFinish(paint.finish)?.id ?? DEFAULT_FINISH,
    },
    windowTint: clampField("windowTint", source.windowTint ?? DEFAULT_LIVERY.windowTint),
    tailLightHue: clampField("tailLightHue", source.tailLightHue ?? DEFAULT_LIVERY.tailLightHue),
    underglow: {
      // Only a literal `true` turns it on. A truthy leftover from an older save
      // ("yes", 1) would otherwise light up a car the player never lit.
      enabled: underglow.enabled === true,
      hue: clampField("underglowHue", underglow.hue ?? DEFAULT_LIVERY.underglow.hue),
      intensity: clampField(
        "underglowIntensity",
        underglow.intensity ?? DEFAULT_LIVERY.underglow.intensity,
      ),
    },
  };
}

/** Alias that reads correctly at a trust boundary. Same total behaviour. */
export function normalizeLivery(value) {
  return createLivery(value);
}

/** A livery with one paint preset applied, leaving glass, lamps and glow alone. */
export function applyPaintPreset(livery, presetId) {
  const preset = findPaintPreset(presetId);
  if (!preset) return createLivery(livery);
  const current = createLivery(livery);
  return {
    ...current,
    paint: {
      ...current.paint,
      hue: preset.hue,
      saturation: preset.saturation,
      brightness: preset.brightness,
    },
  };
}

/**
 * Colour names, by the hue each one sits at. Used to name a saved config after
 * the paint on it.
 *
 * That naming is deliberate rather than a shortcut. Letting a player type a name
 * would need a text-entry mode, and the stereo row (`B` `P` `N` `L` `F` `0`) is
 * live on *every* screen by design — so typing "Purple" would hit play/pause and
 * open the folder picker. Suppressing the stereo for one screen would break the
 * rule that a car stereo does not stop being a car stereo because of what you
 * are looking at. A derived name keeps both properties and needs no new mode.
 */
const HUE_NAMES = [
  { hue: 0, label: "Red" },
  { hue: 25, label: "Orange" },
  { hue: 45, label: "Gold" },
  { hue: 65, label: "Citrus" },
  { hue: 85, label: "Lime" },
  { hue: 140, label: "Green" },
  { hue: 175, label: "Teal" },
  { hue: 195, label: "Cyan" },
  { hue: 215, label: "Blue" },
  { hue: 250, label: "Indigo" },
  { hue: 275, label: "Purple" },
  { hue: 300, label: "Magenta" },
  { hue: 325, label: "Pink" },
];

/** Shortest distance between two hues, the long way round being wrong. */
function hueDistance(a, b) {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

export function hueName(hue) {
  const wrapped = clampField("hue", hue);
  return HUE_NAMES.reduce((best, entry) =>
    hueDistance(entry.hue, wrapped) < hueDistance(best.hue, wrapped) ? entry : best,
  ).label;
}

/**
 * A readable name for a livery — "Deep Blue Metallic", "Silver", "Bright Lime".
 *
 * Below a low saturation the hue carries no information at all (every hue at
 * saturation 0 is the same grey), so those are named by brightness instead.
 * Naming them "Red" because the hue slider happens to sit at 0 would be actively
 * misleading in the picker.
 */
export function describeLivery(livery) {
  const { paint } = createLivery(livery);
  const finish = paint.finish === "gloss" ? "" : ` ${findFinish(paint.finish).label}`;

  if (paint.saturation < 0.12) {
    const neutral = paint.brightness < 0.85 ? "Black" : paint.brightness > 1.15 ? "White" : "Silver";
    return `${neutral}${finish}`;
  }
  const shade = paint.brightness < 0.85 ? "Deep " : paint.brightness > 1.15 ? "Bright " : "";
  return `${shade}${hueName(paint.hue)}${finish}`;
}

/**
 * Value equality over the normalized form. Used to tell "the player changed
 * something" from "the player opened the editor", which is what decides whether
 * a preset needs saving and whether the server needs telling.
 */
export function liveryEquals(a, b) {
  const left = createLivery(a);
  const right = createLivery(b);
  return (
    left.paint.hue === right.paint.hue
    && left.paint.saturation === right.paint.saturation
    && left.paint.brightness === right.paint.brightness
    && left.paint.finish === right.paint.finish
    && left.windowTint === right.windowTint
    && left.tailLightHue === right.tailLightHue
    && left.underglow.enabled === right.underglow.enabled
    && left.underglow.hue === right.underglow.hue
    && left.underglow.intensity === right.underglow.intensity
  );
}

/**
 * A stable key for one livery's *appearance*, so the renderer can cache a
 * tinted sprite and reuse it. Two liveries that look identical must produce the
 * same key or the cache grows without bound; two that differ must not, or a car
 * draws in someone else's colours.
 */
export function liveryKey(livery) {
  const { paint, windowTint, tailLightHue, underglow } = createLivery(livery);
  // Underglow is drawn under the car rather than into the sprite, so it is
  // deliberately absent here — including it would split the cache into entries
  // that hold identical pixels.
  return [
    paint.hue,
    paint.saturation,
    paint.brightness,
    paint.finish,
    windowTint,
    tailLightHue,
  ].join(":");
}
