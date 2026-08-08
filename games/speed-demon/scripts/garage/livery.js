// A livery is everything a player changes about a car that is not the car.
//
// PURE. No canvas, no DOM, no storage — this owns *what a configuration is* and
// *what a valid one looks like*, and `render/livery.js` draws whatever it says.
// Same split as `radio/playlist.js` against `radio/stereo.js`, and for the same
// reason: rules belong somewhere a test can reach without a browser.
//
// The 24 base models are deliberately neutral bodies (measured roof saturation
// runs 0.006–0.041 across the whole roster), which is what makes a livery a
// *tint* rather than a second set of sprites. Nothing here holds pixels; a
// livery is a handful of numbers, which is also what makes it cheap to store
// and cheap to hand to an opponent over the wire.
//
// A livery has three parts, and they stack in this order:
//
//   1. `paint` — one colour over all the bodywork, optionally faded along an
//      axis toward `fade`'s second stop.
//   2. `layers` — up to `MAX_LAYERS` shapes, each with its own flat paint, drawn
//      over the base in order. A **band** runs across the car, a **stripe** runs
//      down it, and either can be mirrored about the centreline.
//   3. `windowTint`, `tailLightHue` and `underglow`, which are not paint at all.
//
// **The fade belongs to the base paint and layers are flat**, which is a scope
// line rather than a limitation of the maths — `mixPaint` would fade a stripe
// perfectly well. It is drawn here because a gradient on a layer is four more
// controls in a section that already holds ten, and nothing in the schema stops
// a later pass from moving `fade` down onto each paint.
//
// **`normalizeLivery` is total, and that is the point.** A livery arrives from
// three places that can all lie to us: a save file written by an older build, a
// server payload, and an opponent's config fetched during an online race. None
// of those may be able to produce a car that cannot be drawn, so every field is
// clamped to its range, every unknown id falls back to a default, and the layer
// list is truncated before it is walked rather than after. A malformed livery
// yields a plain car, never an exception mid-race.
//
// Older saves have no `fade` and no `layers`, and get an empty list and a
// switched-off fade — which bake to exactly the pixels they baked to before, so
// nobody's stored paint changes under them.

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
 * Which way a fade runs. Four entries rather than two so reversing a gradient is
 * one press instead of swapping both colour stops by hand, which is three
 * controls' worth of work to undo a mistake.
 *
 * `at` maps a pixel's normalized position in the frame onto the 0–1 the mix
 * runs over. The cars are drawn nose-up, so `y` increases toward the tail.
 */
// `along` names the one dimension each axis actually varies over, which the
// renderer needs in order to resolve a fade once per row (or per column) instead
// of once per pixel. It is stated rather than inferred because probing `at` with
// sample points to find out would be a guess that happens to be right.
export const FADE_AXES = [
  { id: "nose-tail", label: "Nose → Tail", along: "y", at: (xf, yf) => yf },
  { id: "tail-nose", label: "Tail → Nose", along: "y", at: (xf, yf) => 1 - yf },
  { id: "left-right", label: "Left → Right", along: "x", at: (xf) => xf },
  { id: "right-left", label: "Right → Left", along: "x", at: (xf) => 1 - xf },
];

export const DEFAULT_FADE_AXIS = "nose-tail";

/** A layer is one shape on one axis. See `zoneWeight` for what each means. */
export const LAYER_KINDS = [
  { id: "band", label: "Band" },
  { id: "stripe", label: "Stripe" },
];

export const DEFAULT_LAYER_KIND = "band";

/**
 * How many colour layers a livery may carry.
 *
 * Four, and the ceiling is a real constraint rather than a round number. Every
 * layer is evaluated per bodywork pixel during the bake, it rides in the wire
 * payload an online opponent has to normalize before it can draw your car, and
 * it is one more section the editor's cursor has to walk. Four covers the looks
 * people actually build — a roof, a bonnet, a stripe pair and one accent — and a
 * mirrored stripe layer counts once, so the classic twin stripe is not two.
 */
export const MAX_LAYERS = 4;

/**
 * Field ranges, in one place because both the editor's cursor steps and the
 * normalizer's clamps read them. Two copies of a range is how a slider ends up
 * able to select a value the normalizer then rejects.
 *
 * **`brightness` reaches genuine black, and it did not used to.** The floor sat
 * at 0.65 — measured, a car painted there has a median body luminance of 129,
 * which is mid-grey and nobody's idea of a black car. The note that used to live
 * here said a wider range would crush the panel shading into a flat silhouette,
 * and that was true of the paint model at the time but was a symptom rather than
 * a reason: the clearcoat term was scaled by the *tint's* brightness, and a
 * black paint's tint is white, so a dark car lost every highlight it had. That
 * is fixed in `paintWith`, so the floor can now sit where the artwork actually
 * runs out. The ceiling stays at 1.35 for the original reason — past it the
 * highlights blow out and the shape stops reading.
 */
export const LIVERY_LIMITS = {
  hue: { min: 0, max: 359, step: 5, wraps: true },
  saturation: { min: 0, max: 1, step: 0.05 },
  brightness: { min: 0.12, max: 1.35, step: 0.02 },
  windowTint: { min: 0, max: 1, step: 0.1 },
  tailLightHue: { min: 0, max: 359, step: 5, wraps: true },
  underglowHue: { min: 0, max: 359, step: 5, wraps: true },
  underglowIntensity: { min: 0.2, max: 1, step: 0.1 },
  layerPosition: { min: 0, max: 1, step: 0.01 },
  layerSize: { min: 0.02, max: 1, step: 0.01 },
  layerFeather: { min: 0, max: 0.3, step: 0.01 },
};

/** Factory settings: a plain silver car with clear glass and red lamps. */
export const DEFAULT_LIVERY = Object.freeze({
  paint: Object.freeze({ hue: 0, saturation: 0, brightness: 1, finish: DEFAULT_FINISH }),
  fade: Object.freeze({ enabled: false, hue: 210, saturation: 0.7, brightness: 0.9, axis: DEFAULT_FADE_AXIS }),
  layers: Object.freeze([]),
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
  { id: "black", label: "Black", hue: 0, saturation: 0, brightness: 0.16 },
  { id: "gunmetal", label: "Gunmetal", hue: 0, saturation: 0, brightness: 0.5 },
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

/**
 * Starting shapes for a colour layer, named after the part of the car each one
 * lands on.
 *
 * **These are seeds, not panels.** The words are the player's vocabulary — a
 * roof is what someone asks for — but the numbers are just a band placed where a
 * roof usually is, and the player is expected to nudge them. That distinction is
 * the whole reason the layer system exists in this shape: the 24 renders are
 * different enough that a fixed "roof" fraction reads correctly on the Kaido and
 * lands across the engine cover on the Toro, so a preset that could not be moved
 * would be wrong on a quarter of the roster with no way out.
 *
 * The positions below were read off the measured renders (nose at 0, tail at 1):
 * the upper deck runs to about 0.38, the glass house 0.39–0.60, the decklid
 * 0.61–0.79, and the rear valance past 0.83.
 */
export const LAYER_PRESETS = [
  // The roof reaches past the top of the frame on purpose. Stopping it at 0.03
  // left a sliver of body colour across the nose, which reads as the preset
  // having missed rather than as a design — and a player who wants that sliver
  // can pull the position down, where the same player would not think to push a
  // short band off the edge.
  { id: "roof", label: "Roof", kind: "band", position: 0.185, size: 0.38, feather: 0, mirrored: false },
  { id: "nose", label: "Nose", kind: "band", position: 0.03, size: 0.12, feather: 0, mirrored: false },
  { id: "trunk", label: "Trunk", kind: "band", position: 0.70, size: 0.18, feather: 0, mirrored: false },
  { id: "rear", label: "Rear", kind: "band", position: 0.92, size: 0.18, feather: 0, mirrored: false },
  { id: "two-tone", label: "Two-Tone", kind: "band", position: 0.78, size: 0.46, feather: 0.06, mirrored: false },
  { id: "stripes", label: "Stripes", kind: "stripe", position: 0.44, size: 0.06, feather: 0, mirrored: true },
  { id: "sills", label: "Sills", kind: "stripe", position: 0.07, size: 0.13, feather: 0.02, mirrored: true },
  { id: "spine", label: "Spine", kind: "stripe", position: 0.5, size: 0.1, feather: 0.03, mirrored: false },
];

export function findLayerPreset(id) {
  return LAYER_PRESETS.find((preset) => preset.id === id) ?? null;
}

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

export function findFadeAxis(id) {
  return FADE_AXES.find((axis) => axis.id === id) ?? null;
}

export function findLayerKind(id) {
  return LAYER_KINDS.find((kind) => kind.id === id) ?? null;
}

/**
 * One paint, clamped. Split out because a livery now holds several — the body's,
 * the far end of its fade, and one per colour layer — and three copies of the
 * same four clamps is three places for a range to drift.
 */
export function createPaint(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    hue: clampField("hue", source.hue ?? DEFAULT_LIVERY.paint.hue),
    saturation: clampField("saturation", source.saturation ?? DEFAULT_LIVERY.paint.saturation),
    brightness: clampField("brightness", source.brightness ?? DEFAULT_LIVERY.paint.brightness),
    finish: findFinish(source.finish)?.id ?? DEFAULT_FINISH,
  };
}

/**
 * One colour layer, clamped, with a stable id.
 *
 * The id exists so the editor can address a layer that has moved — reordering or
 * deleting a layer shifts every index after it, and a cursor holding an index
 * would silently start editing its neighbour. It is generated from a counter the
 * caller supplies rather than from `Math.random`, because this module is pure
 * and a livery has to serialize the same way twice.
 */
export function createLayer(input = {}, index = 0) {
  const source = input && typeof input === "object" ? input : {};
  const kind = findLayerKind(source.kind)?.id ?? DEFAULT_LAYER_KIND;
  return {
    id: typeof source.id === "string" && source.id ? source.id.slice(0, 40) : `layer-${index + 1}`,
    kind,
    position: clampField("layerPosition", source.position ?? 0.5),
    size: clampField("layerSize", source.size ?? 0.2),
    feather: clampField("layerFeather", source.feather ?? 0),
    // Only a literal `true`, for the same reason underglow insists on one: a
    // truthy leftover from an older save must not silently double a stripe.
    mirrored: source.mirrored === true,
    paint: createPaint(source.paint),
  };
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
  const underglow = source.underglow && typeof source.underglow === "object" ? source.underglow : {};
  const fade = source.fade && typeof source.fade === "object" ? source.fade : {};
  // Anything but an array is no layers at all, and the slice comes before the
  // map so a payload holding ten thousand of them costs ten normalizations
  // rather than ten thousand. This runs on an opponent's config mid-race.
  const layers = Array.isArray(source.layers) ? source.layers.slice(0, MAX_LAYERS) : [];

  return {
    paint: createPaint(source.paint),
    fade: {
      enabled: fade.enabled === true,
      hue: clampField("hue", fade.hue ?? DEFAULT_LIVERY.fade.hue),
      saturation: clampField("saturation", fade.saturation ?? DEFAULT_LIVERY.fade.saturation),
      brightness: clampField("brightness", fade.brightness ?? DEFAULT_LIVERY.fade.brightness),
      axis: findFadeAxis(fade.axis)?.id ?? DEFAULT_FADE_AXIS,
    },
    layers: layers.map((layer, index) => createLayer(layer, index)),
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
 * A paint that will read against `against` — near-white over a dark car, near-
 * black over a pale one.
 *
 * A fresh layer has to be *visible*, or adding one looks like the button did
 * nothing: a white stripe defaulted onto factory silver is invisible, and the
 * player's next move is to go looking for the bug rather than for the colour
 * picker. Judged on perceived brightness rather than on the brightness field,
 * because a fully saturated blue at brightness 1.2 is still a dark colour.
 */
export function contrastPaint(against) {
  const paint = createPaint(against);
  // Saturation pulls the tint away from white, so it costs perceived brightness
  // on top of whatever the brightness field already did.
  const perceived = paint.brightness * (1 - paint.saturation * 0.45);
  return perceived > 0.8
    ? { hue: 0, saturation: 0, brightness: 0.16, finish: paint.finish }
    : { hue: 0, saturation: 0, brightness: 1.3, finish: paint.finish };
}

/** Whether another layer will fit. Asked by the editor before it offers to add one. */
export function canAddLayer(livery) {
  return createLivery(livery).layers.length < MAX_LAYERS;
}

/**
 * A livery with one more layer on it, seeded from a `LAYER_PRESETS` entry.
 *
 * The new layer goes on the end, which is also the top: later layers paint over
 * earlier ones, so the thing you just added is the thing you can see. Ids count
 * from the layer's position rather than from a running total, so two liveries
 * built the same way serialize identically.
 */
export function addLayer(livery, presetId) {
  const current = createLivery(livery);
  if (current.layers.length >= MAX_LAYERS) return current;
  const preset = findLayerPreset(presetId) ?? LAYER_PRESETS[0];
  const index = current.layers.length;
  return {
    ...current,
    layers: [
      ...current.layers,
      createLayer(
        {
          id: `layer-${index + 1}-${preset.id}`,
          kind: preset.kind,
          position: preset.position,
          size: preset.size,
          feather: preset.feather,
          mirrored: preset.mirrored,
          paint: contrastPaint(current.paint),
        },
        index,
      ),
    ],
  };
}

export function removeLayer(livery, layerId) {
  const current = createLivery(livery);
  return { ...current, layers: current.layers.filter((layer) => layer.id !== layerId) };
}

/** One layer, with `changes` merged in and re-clamped. Unknown ids are a no-op. */
export function updateLayer(livery, layerId, changes) {
  const current = createLivery(livery);
  return {
    ...current,
    layers: current.layers.map((layer, index) =>
      layer.id === layerId ? createLayer({ ...layer, ...changes, id: layer.id }, index) : layer,
    ),
  };
}

export function layerById(livery, layerId) {
  return createLivery(livery).layers.find((layer) => layer.id === layerId) ?? null;
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
/**
 * The neutral greys, by brightness. Four rather than the old three because the
 * range below the old 0.65 floor is now open, and calling everything under 0.85
 * "Black" would have a genuine black and a mid grey share a name in the picker.
 */
const NEUTRAL_NAMES = [
  { below: 0.3, label: "Black" },
  { below: 0.62, label: "Graphite" },
  { below: 1.15, label: "Silver" },
  { below: Infinity, label: "White" },
];

export function describeLivery(livery) {
  const { paint, fade, layers } = createLivery(livery);
  const finish = paint.finish === "gloss" ? "" : ` ${findFinish(paint.finish).label}`;
  // A layer count rather than a second colour name: two names plus a finish
  // overruns the 24 characters a preset name is stored in, and truncating one
  // produces things like "Deep Blue Metal…". A number always fits.
  const extra = layers.length > 0 ? ` +${layers.length}` : fade.enabled ? " Fade" : "";

  if (paint.saturation < 0.12) {
    const neutral = NEUTRAL_NAMES.find((entry) => paint.brightness < entry.below).label;
    return `${neutral}${finish}${extra}`;
  }
  const shade = paint.brightness < 0.4 ? "Midnight "
    : paint.brightness < 0.85 ? "Deep "
    : paint.brightness > 1.15 ? "Bright "
    : "";
  return `${shade}${hueName(paint.hue)}${finish}${extra}`;
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
    paintEquals(left.paint, right.paint)
    && fadeEquals(left.fade, right.fade)
    && layersEqual(left.layers, right.layers)
    && left.windowTint === right.windowTint
    && left.tailLightHue === right.tailLightHue
    && left.underglow.enabled === right.underglow.enabled
    && left.underglow.hue === right.underglow.hue
    && left.underglow.intensity === right.underglow.intensity
  );
}

const paintEquals = (a, b) =>
  a.hue === b.hue && a.saturation === b.saturation
  && a.brightness === b.brightness && a.finish === b.finish;

/**
 * A fade that is switched off is equal to any other switched-off fade. Its
 * colour stops still exist — turning it off must not throw them away, or
 * toggling twice would lose the gradient — but they change nothing about the
 * car, and a livery that looks identical has to compare identical or the editor
 * offers to save a change nobody made.
 */
const fadeEquals = (a, b) => {
  if (a.enabled !== b.enabled) return false;
  if (!a.enabled) return true;
  return a.hue === b.hue && a.saturation === b.saturation
    && a.brightness === b.brightness && a.axis === b.axis;
};

/** Order matters: layers paint over each other, so two orders are two cars. */
const layersEqual = (a, b) =>
  a.length === b.length && a.every((layer, index) => (
    layer.kind === b[index].kind
    && layer.position === b[index].position
    && layer.size === b[index].size
    && layer.feather === b[index].feather
    && layer.mirrored === b[index].mirrored
    && paintEquals(layer.paint, b[index].paint)
  ));

/**
 * A stable key for one livery's *appearance*, so the renderer can cache a
 * tinted sprite and reuse it. Two liveries that look identical must produce the
 * same key or the cache grows without bound; two that differ must not, or a car
 * draws in someone else's colours.
 */
export function liveryKey(livery) {
  const { paint, fade, layers, windowTint, tailLightHue, underglow } = createLivery(livery);
  // Underglow is drawn under the car rather than into the sprite, so it is
  // deliberately absent here — including it would split the cache into entries
  // that hold identical pixels.
  //
  // A disabled fade contributes one character for the same reason `fadeEquals`
  // ignores its stops: two cars that bake to the same pixels must share a cache
  // entry, and a stashed gradient nobody can see does not change a pixel.
  return [
    paintKey(paint),
    fade.enabled ? `f${fade.axis}/${fade.hue}/${fade.saturation}/${fade.brightness}` : "f-",
    layers.map((layer) => [
      layer.kind,
      layer.position,
      layer.size,
      layer.feather,
      layer.mirrored ? "m" : "-",
      paintKey(layer.paint),
    ].join("/")).join("|"),
    windowTint,
    tailLightHue,
  ].join(":");
}

const paintKey = (paint) =>
  `${paint.hue}/${paint.saturation}/${paint.brightness}/${paint.finish}`;
