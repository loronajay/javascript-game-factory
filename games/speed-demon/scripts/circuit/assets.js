// Circuit car asset catalog.
//
// A model id is the identity boundary: this catalog deliberately returns null
// for the sixteen canonical models whose directional art is not ready. Circuit
// callers must surface that as unavailable; substituting another body's sheet
// would make the canonical `{ modelId, livery }` loadout lie.

export const CIRCUIT_FRAME_SIZE = 64;

export const CIRCUIT_DIRECTIONS = Object.freeze([
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
]);

// The compiler manifest and physical atlas columns use the same nose headings.
export const CIRCUIT_FRAME_HEADINGS = CIRCUIT_DIRECTIONS;

// The generated masters do not share one silhouette mass. These measured
// factors normalize their mean visible area, so choosing a slim body does not
// make the player's car look smaller than the fixed CPU model in a race.
const REPRESENTATIVE_MODELS = [
  ["kaido-gts", "Kaido GTS", "gt", 1.0404223810178697],
  ["tsunami-rz", "Tsunami RZ", "coupe", 0.9736575032883077],
  ["meridian-rs", "Meridian RS", "euro", 1.001656433139303],
  ["skyward-r", "Skyward R", "gt", 1.037823336392831],
  ["toro-sv", "Toro SV", "exotic", 0.9765656028304245],
  ["scalpel-r", "Scalpel R", "hatch", 0.9729539197796079],
  ["chrono-12", "Chrono 12", "wedge", 0.9989523711318379],
  ["colt-gt", "Colt GT", "muscle", 1.0054534480305393],
];

export const CIRCUIT_MODELS = Object.freeze(REPRESENTATIVE_MODELS.map(
  ([modelId, label, archetype, renderScale]) => Object.freeze({
    modelId,
    label,
    archetype,
    renderScale,
    spritesheet: `${modelId}/spritesheet-clockwise-from-north.png`,
    manifest: `${modelId}/spritesheet.json`,
    src: `assets/circuit-cars/${modelId}/spritesheet-clockwise-from-north.png`,
    footprint: Object.freeze({ halfLength: 16, halfWidth: 9 }),
  }),
));

export function circuitModelById(modelId) {
  return CIRCUIT_MODELS.find((model) => model.modelId === modelId) ?? null;
}

export function hasCircuitAtlas(modelId) {
  return circuitModelById(modelId) !== null;
}
