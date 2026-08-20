export const ANGLE_IDS = [
  "front",
  "front-right",
  "right",
  "rear-right",
  "rear",
  "rear-left",
  "left",
  "front-left",
];

export function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

export function assetUrlFor(characterRoot, relativePath, revision) {
  return `${characterRoot}${relativePath}?v=${encodeURIComponent(revision)}`;
}

export function directionForDegrees(degrees) {
  const index = Math.round(normalizeDegrees(degrees) / 45) % ANGLE_IDS.length;
  return ANGLE_IDS[index];
}

export function viewerSelectionForSearch(search) {
  const parameters = new URLSearchParams(search);
  return {
    characterId: parameters.get("character") || "maddie-bloom",
    action: parameters.get("action") || "idle",
  };
}
