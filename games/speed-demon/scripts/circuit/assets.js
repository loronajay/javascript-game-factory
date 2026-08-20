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

const REPRESENTATIVE_MODELS = [
  ["kaido-gts", "Kaido GTS", "gt"],
  ["tsunami-rz", "Tsunami RZ", "coupe"],
  ["meridian-rs", "Meridian RS", "euro"],
  ["skyward-r", "Skyward R", "gt"],
  ["toro-sv", "Toro SV", "exotic"],
  ["scalpel-r", "Scalpel R", "hatch"],
  ["chrono-12", "Chrono 12", "wedge"],
  ["colt-gt", "Colt GT", "muscle"],
];

export const CIRCUIT_MODELS = Object.freeze(REPRESENTATIVE_MODELS.map(
  ([modelId, label, archetype]) => Object.freeze({
    modelId,
    label,
    archetype,
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
