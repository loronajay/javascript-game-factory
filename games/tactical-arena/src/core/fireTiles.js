// The single authority for putting fire ON the board and taking it off. Every ignition
// source (Throw Cigar, Flamespitter's cone, Heatwave/Gargoyle crit riders, mission random
// fire) routes through igniteFireTile so the rain rule lives in exactly one place:
// while a rain-bearing weather holds (Spring Shower, Thunderstorm) nothing ignites, and
// any fire already burning is put out. See weather.js `extinguishesFire`.

import { positionKey } from "../rules/movement.js";
import { getWeatherExtinguishesFire } from "./unitWeather.js";

// False while rain is falling — no source may light a tile.
export function canIgniteFire(state) {
  return !getWeatherExtinguishesFire(state);
}

// Normalizes an authored fire spec (`{ permanent }` or `{ turnsLeft }` / `{ turns }`) into
// the stored tile object. `ownerId` carries kill credit forward (killAttribution.js).
export function makeFireTile(spec = null, ownerId = null) {
  const owner = ownerId ?? null;
  if (spec?.permanent) return { kind: "fire", permanent: true, ownerId: owner };
  const authored = Number.isFinite(spec?.turnsLeft) ? spec.turnsLeft : spec?.turns;
  return { kind: "fire", turnsLeft: Number.isFinite(authored) ? authored : 3, ownerId: owner };
}

// Lights `position`. Returns true when the tile was actually set alight, false when rain
// suppressed it — callers use the result to decide whether to report `createdFire`.
export function igniteFireTile(state, position, spec = null, ownerId = null) {
  if (!canIgniteFire(state)) return false;
  state.tileObjects[positionKey(position)] = makeFireTile(spec, ownerId);
  return true;
}

// Removes every burning tile. Returns the positions that were put out (empty when there
// was no fire), so the caller can emit a FIRE_EXTINGUISHED event for presentation.
export function extinguishFireTiles(state) {
  const doused = [];
  for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
    if (obj?.kind !== "fire") continue;
    const [x, y] = key.split(",").map(Number);
    doused.push({ x, y });
    delete state.tileObjects[key];
  }
  return doused;
}

// The rain pulse: doused positions when a rain weather is active, otherwise empty.
export function extinguishFireIfRaining(state) {
  return canIgniteFire(state) ? [] : extinguishFireTiles(state);
}
