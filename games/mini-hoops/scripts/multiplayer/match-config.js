import { BALLS } from "../assets/ball-catalog.js";
import { LOCATIONS } from "../assets/location-catalog.js";
import { ROUND_DURATIONS } from "../sim/constants.js";
import { HOOP_MODES } from "../sim/hoop.js";

const MODE_IDS = new Set(HOOP_MODES.map(({ id }) => id));
const BALL_IDS = new Set(BALLS.map(({ id }) => id));
const LOCATION_IDS = new Set(LOCATIONS.map(({ id }) => id));
const DURATIONS = new Set(ROUND_DURATIONS);

export const MINI_HOOPS_PROTOCOL_VERSION = 1;

export const DEFAULT_MATCH_CONFIG = Object.freeze({
  modeId: "still",
  duration: 30,
  locationId: "bedroom",
  ballId: "basketball",
});

export function normalizeMatchConfig(value = {}) {
  const duration = Number(value.duration);
  return {
    modeId: MODE_IDS.has(value.modeId) ? value.modeId : DEFAULT_MATCH_CONFIG.modeId,
    duration: DURATIONS.has(duration) ? duration : DEFAULT_MATCH_CONFIG.duration,
    locationId: LOCATION_IDS.has(value.locationId) ? value.locationId : DEFAULT_MATCH_CONFIG.locationId,
    ballId: BALL_IDS.has(value.ballId) ? value.ballId : DEFAULT_MATCH_CONFIG.ballId,
  };
}

export function matchConfigSettings(value = {}) {
  return { ...normalizeMatchConfig(value), protocolVersion: MINI_HOOPS_PROTOCOL_VERSION };
}

export function sameMatchConfig(left, right) {
  const a = normalizeMatchConfig(left);
  const b = normalizeMatchConfig(right);
  return Object.keys(DEFAULT_MATCH_CONFIG).every((key) => a[key] === b[key]);
}
