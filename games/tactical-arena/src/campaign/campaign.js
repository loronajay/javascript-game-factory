import { getUnitType } from "../core/unitCatalog.js";
import { createUnit, findUnit } from "../core/state.js";
import { isNegativeStatus } from "../rules/statuses.js";
import { ORTHOGONAL_DIRECTIONS, positionKey } from "../rules/movement.js";
import { DEFAULT_SQUAD, UNIT_TYPE_KEYS } from "../ui/squadModel.js";
import { readUnlockProgress, writeUnlockProgress } from "../progression/unlocks.js";
import { enqueueUnitUnlockAnnouncements } from "../progression/announcements.js";
import { computeCampaignGeometry, computeRegionBoxes } from "./campaignMap.js";

export const CAMPAIGN_PROGRESS_KEY = "tacticalArenaCampaignProgressV1";
export const CLOD_MISSION_ID = "clod-trial";
export const NECROMANCER_MISSION_ID = "necromancer-rise";
export const WITCH_DOCTOR_MISSION_ID = "witch-doctor-swamp";
// A spread 3×3 Ghoul lattice (spacing 2, not contiguous) fits with exactly 1 tile of
// clearance from the board edge on every side, so none of its own orthogonal fire gets
// clipped off-board. A separate fire border runs along the true map edge itself (all four
// sides, minus the spawn tile), closing the gap between the lattice's own fire and the
// board boundary so there's no ring left to walk around the whole thing on.
export const WITCH_DOCTOR_BOARD_SIZE = 9;
// Rain Dance may only be cast this many times over the whole mission. Without a cap,
// the Witch Doctor's 30 MP pool lets the CPU stall on Rain Dance every turn while the
// player is still crossing the Ghoul lattice (1 HP the first cast, then +1 more per cast
// once Rain Stance is active), fully undoing any ranged chip damage landed during the
// approach and turning the final 1v1 into a full-HP boss against a unit worn down by
// fire/Ghoul Bite — the opposite of the intended "race the heal" read. Capping casts at
// 3 (a 1+2+2 = 5 HP ceiling) keeps the heal-before-you-arrive telegraph (see
// witchDoctorFireWarningScript) without letting it fully negate approach damage.
export const WITCH_DOCTOR_HEAL_CAST_CAP = 3;
export const MIN_CAMPAIGN_SQUAD_SIZE = 1;
export const MAX_CAMPAIGN_SQUAD_SIZE = 4;
// The campaign map is capped for now so the whole journey stays surveyable at once;
// authored missions fill placeholder stops one at a time up to this count.
export const MAX_CAMPAIGN_MISSIONS = 20;

// Fully-authored, playable missions. Everything OTHER than the map graph lives here
// (squads, lesson copy, rewards); the mission's cell + trail wiring comes from
// CAMPAIGN_TRAIL below so this object never carries hand-placed map coordinates.
const AUTHORED_MISSIONS = Object.freeze({
  [CLOD_MISSION_ID]: {
    id: CLOD_MISSION_ID,
    title: "Clod on the Ridge",
    subtitle: "Lesson: armor, magic, and RAGE spacing",
    description: "Take two units into a half-HP duel against Clod and a Juggernaut. Magic damage cuts through defense; loose spacing keeps Thunderous Charge from ending the run.",
    unitType: "clod",
    requiredStars: 0,
    rewardUnits: Object.freeze(["clod"]),
    playerSlots: 2,
    defaultSquad: Object.freeze(["mystic", "magician"]),
    enemySquad: Object.freeze(["clod", "juggernaut"]),
    size: 11,
  },
  [NECROMANCER_MISSION_ID]: {
    id: NECROMANCER_MISSION_ID,
    title: "Necromancer's Gate",
    subtitle: "Lesson: status pressure and cleansing",
    description: "Two units against a Necromancer and a Virus at the old gate. Physical damage slips past Dead Zone, spacing starves Spread, and a cure keeps permanent poison from becoming a losing clock.",
    unitType: "necromancer",
    requiredStars: 2,
    rewardUnits: Object.freeze(["necromancer"]),
    playerSlots: 2,
    enemySquad: Object.freeze(["necromancer", "virus"]),
    size: 13,
  },
  [WITCH_DOCTOR_MISSION_ID]: {
    id: WITCH_DOCTOR_MISSION_ID,
    title: "Cursed Swamp of the Witch Doctor",
    subtitle: "Lesson: body-blocks, fire lanes, and Volley Shot",
    description: "Send the Archer alone into a solid Ghoul block pinned in the swamp's far corner. Orthogonal fire marks the only tiles that don't bite twice, Volley Shot reaches through blockers, and speed denies Black Death Dance.",
    unitType: "witch-doctor",
    requiredStars: 4,
    rewardUnits: Object.freeze(["witch-doctor"]),
    playerSlots: 1,
    // This mission's puzzle is specifically "use the Archer's Volley Shot to break a
    // body-blocked line," not "figure out which unit to bring" — squadLocked pins the
    // squad to the Archer so the mission always tests that exact lesson.
    defaultSquad: Object.freeze(["archer"]),
    squadLocked: true,
    enemySquad: Object.freeze(["witch-doctor"]),
    size: WITCH_DOCTOR_BOARD_SIZE,
  },
});

// The overworld trail: index = traversal order, each entry pins a mission's grid
// cell {col,row} on the CAMPAIGN_GRID. The two authored missions lead; the rest are
// charted-but-unbuilt placeholder stops so the entire 20-mission map is visible
// (as "coming soon" / "?" nodes) from day one. Cells wind across the grid so the
// path reads like a real map. Promoting a placeholder to a real mission is purely
// additive: give its id an AUTHORED_MISSIONS entry — the cell + trails already exist.
// The map's geography: named biome regions the trail passes through, in paint order
// (earlier = drawn first / underneath). Each region auto-sizes to the missions
// assigned to it, so the terrain is data-driven — no hand-placed landmark coords.
// `biome` keys the CSS terrain styling; `label` is the on-map place name.
export const CAMPAIGN_REGIONS = Object.freeze([
  Object.freeze({ id: "ridge", biome: "rock", label: "Stoneback Ridge" }),
  Object.freeze({ id: "barrow", biome: "burial", label: "The Old Gate" }),
  Object.freeze({ id: "mire", biome: "swamp", label: "Mirefen Swamp" }),
  Object.freeze({ id: "coast", biome: "water", label: "Tidewatch Coast" }),
  Object.freeze({ id: "ashfall", biome: "volcanic", label: "Ashfall Caldera" }),
  Object.freeze({ id: "wood", biome: "forest", label: "Whisperwood" }),
  Object.freeze({ id: "frost", biome: "snow", label: "Frostcrown Peaks" }),
  Object.freeze({ id: "waste", biome: "ruins", label: "The Shattered Waste" }),
]);

// The overworld trail: index = traversal order. Each stop pins a grid cell, the
// region it sits in, and its own place name (`locationName`) shown on the map even
// while the mission itself is still gated. `blurb` seeds the placeholder's flavor +
// a hint at the challenge a real mission there might explore (a mission-idea backlog).
const CAMPAIGN_TRAIL = [
  { id: CLOD_MISSION_ID, cell: { col: 0, row: 4 }, point: { x: 9.5, y: 86.4 }, region: "ridge", locationName: "Stoneback Ridge" },
  { id: NECROMANCER_MISSION_ID, cell: { col: 1, row: 4 }, point: { x: 19.0, y: 76.5 }, region: "barrow", locationName: "The Old Gate" },
  { id: WITCH_DOCTOR_MISSION_ID, cell: { col: 2, row: 4 }, point: { x: 31.4, y: 86.2 }, region: "mire", locationName: "Mirefen Shallows",
    blurb: "Foul water swallows the causeway. Something chants in the reeds — a witch doctor's dance, they say, that turns your own curses against you." },
  { id: "uncharted-04", cell: { col: 3, row: 4 }, point: { x: 21.3, y: 48.4 }, region: "mire", locationName: "Witch's Hollow",
    blurb: "Deeper in the mire, stilt-huts hang with charms. Fire won't take here, and the fog rots armor and resolve alike." },
  { id: "uncharted-05", cell: { col: 4, row: 4 }, point: { x: 11.4, y: 44.7 }, region: "mire", locationName: "Gravemarsh",
    blurb: "Where the swamp drains to the sea, the drowned don't stay drowned. Footing is everything." },
  { id: "uncharted-06", cell: { col: 5, row: 4 }, point: { x: 29.1, y: 34.2 }, region: "coast", locationName: "Tidewatch Harbor",
    blurb: "Salt wind and long sightlines. Whoever commands the piers commands the range." },
  { id: "uncharted-07", cell: { col: 6, row: 4 }, point: { x: 21.3, y: 20.5 }, region: "coast", locationName: "Saltbreak Pier",
    blurb: "Narrow jetties over deep water. Get shoved off and the sea keeps you." },
  { id: "uncharted-08", cell: { col: 6, row: 3 }, point: { x: 46.2, y: 31.1 }, region: "coast", locationName: "Wreckers' Cliffs",
    blurb: "Cliffside wreckers lure ships to the rocks. High ground and hard falls decide this one." },
  { id: "uncharted-09", cell: { col: 5, row: 3 }, point: { x: 51.9, y: 18.7 }, region: "ashfall", locationName: "Ashfall Flats",
    blurb: "The land turns black and warm. Cinders drift; a stone sentinel stirs in the heat haze." },
  { id: "uncharted-10", cell: { col: 4, row: 3 }, point: { x: 63.3, y: 24.3 }, region: "ashfall", locationName: "The Caldera",
    blurb: "The mountain's open mouth. Lava seams split the field — fire immunity is worth more than armor here." },
  { id: "uncharted-11", cell: { col: 3, row: 3 }, point: { x: 67.3, y: 37.0 }, region: "ashfall", locationName: "Cinderwood",
    blurb: "A forest burned to charcoal spires. Everything here is kindling, including the plans." },
  { id: "uncharted-12", cell: { col: 2, row: 3 }, point: { x: 56.2, y: 47.3 }, region: "wood", locationName: "Whisperwood Eaves",
    blurb: "Living green at last. The canopy blocks arrows and hides watchers with longbows." },
  { id: "uncharted-13", cell: { col: 1, row: 3 }, point: { x: 50.2, y: 58.2 }, region: "wood", locationName: "Elderroot",
    blurb: "An old grove said to shelter a blindfolded, winged archer whose arrows never truly miss." },
  { id: "uncharted-14", cell: { col: 0, row: 3 }, point: { x: 57.9, y: 72.5 }, region: "wood", locationName: "Thornhollow",
    blurb: "Bramble walls and blind corners. Line of sight is a luxury you'll have to earn." },
  { id: "uncharted-15", cell: { col: 0, row: 2 }, point: { x: 71.2, y: 78.9 }, region: "frost", locationName: "Frostcrown Foothills",
    blurb: "The climb begins. Cold slows the blood and the boots — every step of movement counts double." },
  { id: "uncharted-16", cell: { col: 1, row: 2 }, point: { x: 84.5, y: 86.4 }, region: "frost", locationName: "Rimefang Pass",
    blurb: "A knife-edge pass walled by ice. Cover shatters; nowhere stays safe for long." },
  { id: "uncharted-17", cell: { col: 2, row: 2 }, point: { x: 74.9, y: 62.1 }, region: "frost", locationName: "The White Summit",
    blurb: "Above the clouds, a frostguard holds the peak. Bring warmth, or bring numbers." },
  { id: "uncharted-18", cell: { col: 3, row: 2 }, point: { x: 80.0, y: 47.2 }, region: "waste", locationName: "The Shattered Waste",
    blurb: "Beyond the peaks, a broken country of fallen towers where time itself runs strange." },
  { id: "uncharted-19", cell: { col: 4, row: 2 }, point: { x: 82.9, y: 30.3 }, region: "waste", locationName: "Ruins of Vael",
    blurb: "A dead capital picked clean by mages. A caster here bends magic and the years to spite you." },
  { id: "uncharted-20", cell: { col: 5, row: 2 }, point: { x: 86.8, y: 16.8 }, region: "waste", locationName: "The Iron Citadel",
    blurb: "The last gate. A crowned commander waits on the throne — end the campaign or serve it." },
];

// Extra visual branches on top of the linear spine, so the map reads as a network
// with forks rather than one snaking line. Purely cosmetic — unlock stays star-gated.
const CAMPAIGN_FORKS = [
  [WITCH_DOCTOR_MISSION_ID, "uncharted-12"],
  ["uncharted-06", "uncharted-09"],
  ["uncharted-11", "uncharted-18"],
];

function placeholderMission(stop, trailIndex) {
  // requiredStars climbs with distance along the trail so nearer stops reveal first
  // as the player banks stars; distant ones stay "?" until the map fills out.
  return {
    id: stop.id,
    title: stop.locationName,
    subtitle: "Campaign · coming soon",
    description: stop.blurb ?? "This stretch of the war map hasn't been charted yet. New campaigns are on the way.",
    comingSoon: true,
    requiredStars: 4 + (trailIndex - 2) * 2,
    rewardUnits: Object.freeze([]),
    playerSlots: 2,
    enemySquad: Object.freeze([]),
  };
}

function buildCampaignMissions() {
  const byId = new Map();
  CAMPAIGN_TRAIL.forEach((stop, index) => {
    const base = AUTHORED_MISSIONS[stop.id] ?? placeholderMission(stop, index);
    byId.set(stop.id, {
      ...base,
      id: stop.id,
      cell: { ...stop.cell },
      point: stop.point ? { ...stop.point } : null,
      connections: [],
      region: stop.region,
      locationName: stop.locationName,
    });
  });
  // Spine: every stop trails to the next one in traversal order.
  for (let i = 0; i < CAMPAIGN_TRAIL.length - 1; i += 1) {
    byId.get(CAMPAIGN_TRAIL[i].id).connections.push(CAMPAIGN_TRAIL[i + 1].id);
  }
  // Forks: extra branch trails.
  for (const [from, to] of CAMPAIGN_FORKS) {
    if (byId.has(from) && byId.has(to)) byId.get(from).connections.push(to);
  }
  return CAMPAIGN_TRAIL.map((stop) => {
    const mission = byId.get(stop.id);
    return Object.freeze({
      ...mission,
      cell: Object.freeze(mission.cell),
      point: mission.point ? Object.freeze(mission.point) : null,
      connections: Object.freeze(mission.connections),
    });
  });
}

export const CAMPAIGN_MISSIONS = Object.freeze(buildCampaignMissions().slice(0, MAX_CAMPAIGN_MISSIONS));

// Node positions, trail path geometry, and terrain region boxes are derived once
// from the mission graph + region metadata.
const CAMPAIGN_GEOMETRY = computeCampaignGeometry(CAMPAIGN_MISSIONS);
const CAMPAIGN_REGION_BOXES = computeRegionBoxes(CAMPAIGN_MISSIONS, CAMPAIGN_REGIONS);
const REGION_BIOME_BY_ID = new Map(CAMPAIGN_REGIONS.map((region) => [region.id, region.biome]));

function defaultStorage() {
  return globalThis.localStorage;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value))];
}

function progressFallback() {
  return {
    completedMissions: [],
    missionStars: {},
  };
}

export function normalizeCampaignProgress(value = {}) {
  const missionIds = new Set(CAMPAIGN_MISSIONS.map((mission) => mission.id));
  const completedMissions = uniqueStrings(value.completedMissions).filter((id) => missionIds.has(id));
  const missionStars = {};
  for (const mission of CAMPAIGN_MISSIONS) {
    const stars = Math.max(0, Math.min(3, Math.floor(Number(value.missionStars?.[mission.id]) || 0)));
    if (stars > 0) missionStars[mission.id] = stars;
  }
  for (const id of completedMissions) {
    missionStars[id] = Math.max(1, missionStars[id] ?? 0);
  }
  return { completedMissions, missionStars };
}

export function readCampaignProgress(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(CAMPAIGN_PROGRESS_KEY);
    if (!raw) return progressFallback();
    return normalizeCampaignProgress(JSON.parse(raw));
  } catch {
    return progressFallback();
  }
}

export function writeCampaignProgress(storage, progress) {
  const normalized = normalizeCampaignProgress(progress);
  try {
    storage?.setItem?.(CAMPAIGN_PROGRESS_KEY, JSON.stringify(normalized));
  } catch {
    // Campaign progress is a convenience layer; storage failures should not break play.
  }
  return normalized;
}

export function resetCampaignProgress(storage = defaultStorage()) {
  try {
    storage?.removeItem?.(CAMPAIGN_PROGRESS_KEY);
  } catch {
    // Best-effort reset.
  }
  return progressFallback();
}

export function totalCampaignStars(progress) {
  return Object.values(progress?.missionStars ?? {}).reduce((sum, stars) => sum + Math.max(0, Number(stars) || 0), 0);
}

export function getCampaignMission(missionId) {
  return CAMPAIGN_MISSIONS.find((mission) => mission.id === missionId) ?? null;
}

export function campaignSquadSize(mission) {
  return Math.max(
    MIN_CAMPAIGN_SQUAD_SIZE,
    Math.min(MAX_CAMPAIGN_SQUAD_SIZE, Math.floor(Number(mission?.playerSlots) || MAX_CAMPAIGN_SQUAD_SIZE))
  );
}

export function normalizeCampaignSquad(selectedSquad = DEFAULT_SQUAD, missionOrSize = MAX_CAMPAIGN_SQUAD_SIZE) {
  const size = typeof missionOrSize === "number" ? missionOrSize : campaignSquadSize(missionOrSize);
  const targetSize = Math.max(MIN_CAMPAIGN_SQUAD_SIZE, Math.min(MAX_CAMPAIGN_SQUAD_SIZE, size));
  const out = [];
  for (const type of Array.isArray(selectedSquad) ? selectedSquad : []) {
    if (UNIT_TYPE_KEYS.includes(type) && !out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  for (const type of DEFAULT_SQUAD) {
    if (!out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  for (const type of UNIT_TYPE_KEYS) {
    if (!out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  return out;
}

export function getCampaignMap(storage = defaultStorage()) {
  const progress = readCampaignProgress(storage);
  const totalStars = totalCampaignStars(progress);
  const completed = new Set(progress.completedMissions);
  const nodes = CAMPAIGN_MISSIONS.map((mission) => {
    const stars = progress.missionStars[mission.id] ?? 0;
    const unlocked = totalStars >= mission.requiredStars;
    const complete = completed.has(mission.id);
    const status = !unlocked
      ? "locked"
      : mission.comingSoon
        ? "coming-soon"
        : complete
          ? "completed"
          : "available";
    const point = CAMPAIGN_GEOMETRY.positions[mission.id] ?? { x: 50, y: 50 };
    return {
      ...mission,
      stars,
      complete,
      locked: !unlocked,
      status,
      displayType: unlocked ? mission.unitType ?? null : null,
      biome: REGION_BIOME_BY_ID.get(mission.region) ?? null,
      // Position is a percent of the map canvas, derived from the mission's grid cell.
      position: { x: point.x, y: point.y },
    };
  });

  // A trail reads as "open" only when both of its endpoints are revealed, so locked
  // stretches of the map draw dim/dashed and the charted route glows.
  const statusById = new Map(nodes.map((node) => [node.id, node.status]));
  const edges = CAMPAIGN_GEOMETRY.edges.map((edge) => ({
    ...edge,
    status:
      statusById.get(edge.from) !== "locked" && statusById.get(edge.to) !== "locked"
        ? "open"
        : "locked",
  }));

  return {
    totalStars,
    progress,
    grid: CAMPAIGN_GEOMETRY.grid,
    nodes,
    edges,
    regions: CAMPAIGN_REGION_BOXES,
  };
}

export function createCampaignMatchConfig(missionId = CLOD_MISSION_ID, selectedSquad = null) {
  const mission = getCampaignMission(missionId);
  if (!mission || mission.comingSoon) throw new Error(`Campaign mission is not playable: ${missionId}`);
  // squadLocked missions test a specific unit's kit, not squad choice — the authored
  // defaultSquad always wins, even if a caller (or a stale UI selection) passes something
  // else in.
  const playerSquad = mission.squadLocked
    ? normalizeCampaignSquad(mission.defaultSquad ?? DEFAULT_SQUAD, mission)
    : normalizeCampaignSquad(selectedSquad ?? mission.defaultSquad ?? DEFAULT_SQUAD, mission);
  return {
    mode: "campaign",
    campaignMissionId: mission.id,
    difficulty: "normal",
    size: mission.size ?? 11,
    playerCount: 2,
    squads: {
      1: playerSquad,
      2: [...mission.enemySquad],
    },
    teamNames: {
      1: "Player Vanguard",
      2: mission.id === WITCH_DOCTOR_MISSION_ID
        ? "Swamp Coven"
        : mission.id === NECROMANCER_MISSION_ID
          ? "Gatekeepers"
          : "Ridge Guard",
    },
  };
}

// The swamp lattice: a SPREAD 3×3 Ghoul grid, spacing 2 (x,y each in {2,4,6}) — close enough
// that every gap between Ghouls is covered by either a Ghoul's orthogonal fire or another
// Ghoul's diagonal Bite range (Chebyshev 1), so nothing inside the lattice's own footprint is
// free to walk except a Ghoul's own tile once it's dead. Spacing 2 (not the old spacing-4
// lattice) is what closes the "avenue" loophole those wider gaps used to leave open. The
// lattice's own top-right slot is left empty for the Witch Doctor rather than a ninth Ghoul.
const WITCH_DOCTOR_LATTICE_VALUES = Object.freeze([2, 4, 6]);
const WITCH_DOCTOR_SLOT = Object.freeze({ x: 6, y: 2 }); // top-right of the lattice
const WITCH_DOCTOR_SPAWN = Object.freeze({ x: 0, y: WITCH_DOCTOR_BOARD_SIZE - 1 });
const WITCH_DOCTOR_GHOUL_POSITIONS = Object.freeze(
  WITCH_DOCTOR_LATTICE_VALUES.flatMap((y) => WITCH_DOCTOR_LATTICE_VALUES.map((x) => ({ x, y })))
    .filter((p) => !(p.x === WITCH_DOCTOR_SLOT.x && p.y === WITCH_DOCTOR_SLOT.y))
    .map((p) => Object.freeze(p))
);
const WITCH_DOCTOR_GHOUL_POSITION_KEYS = new Set(WITCH_DOCTOR_GHOUL_POSITIONS.map(positionKey));

// Fire has two unioned sources:
// 1. Each Ghoul's four ORTHOGONAL neighbours, clipped to the board and excluding any tile
//    that's itself a Ghoul position (spacing 2 means that never actually happens here, but
//    the guard stays cheap insurance against a future spacing change). This lattice fire only
//    reaches 1 tile past the outermost Ghouls, so on its own it leaves the true board edge
//    open — a gap the old spacing-4 layout let a player walk clean around.
// 2. A full 1-tile fire border along the true edges of the map itself (all four sides),
//    minus the player's spawn tile. This is what actually stops the edge-creep: the lattice
//    is positioned with exactly 1 tile of clearance from the board edge, so its own outward
//    fire sits immediately adjacent to this border with no safe ring left between them.
function ghoulOrthogonalFireKeys() {
  const keys = new Set();
  for (const ghoul of WITCH_DOCTOR_GHOUL_POSITIONS) {
    for (const dir of ORTHOGONAL_DIRECTIONS) {
      const p = { x: ghoul.x + dir.x, y: ghoul.y + dir.y };
      if (p.x < 0 || p.y < 0 || p.x >= WITCH_DOCTOR_BOARD_SIZE || p.y >= WITCH_DOCTOR_BOARD_SIZE) continue;
      if (WITCH_DOCTOR_GHOUL_POSITION_KEYS.has(positionKey(p))) continue;
      keys.add(positionKey(p));
    }
  }
  return keys;
}

function mapBorderFireKeys() {
  const keys = new Set();
  const max = WITCH_DOCTOR_BOARD_SIZE - 1;
  const spawnKey = positionKey(WITCH_DOCTOR_SPAWN);
  for (let x = 0; x <= max; x += 1) {
    for (const y of [0, max]) {
      const key = positionKey({ x, y });
      if (key !== spawnKey) keys.add(key);
    }
  }
  for (let y = 0; y <= max; y += 1) {
    for (const x of [0, max]) {
      const key = positionKey({ x, y });
      if (key !== spawnKey) keys.add(key);
    }
  }
  return keys;
}

const WITCH_DOCTOR_FIRE_POSITIONS = Object.freeze(
  [...new Set([...ghoulOrthogonalFireKeys(), ...mapBorderFireKeys()])].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return Object.freeze({ x, y });
  })
);

function createCampaignGhoul(index, position) {
  return {
    ...createUnit({
      id: `p2-swamp-ghoul-${index}`,
      player: 2,
      team: 2,
      type: "ghoul",
      x: position.x,
      y: position.y,
      hp: 5,
      mp: 0,
    }),
    spent: true,
    summonerId: null,
  };
}

// Each campaign mission owns a spawn layout: hardcoded coordinates for the fixed
// enemy pieces (their ids are deterministic), plus a slot-index fallback that places
// whatever units the player drafted (the squad is player-chosen, so player ids are not
// known ahead of time). Keyed by mission id so a new mission only adds a table entry.
const CAMPAIGN_LAYOUTS = Object.freeze({
  [CLOD_MISSION_ID]: {
    positions: {
      "p1-0-mystic": { x: 2, y: 6 },
      "p1-1-magician": { x: 2, y: 4 },
      "p2-0-clod": { x: 7, y: 5 },
      "p2-1-juggernaut": { x: 8, y: 7 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? (unit.id.includes("-0-") ? { x: 2, y: 6 } : { x: 2, y: 4 })
        : (unit.id.includes("-0-") ? { x: 7, y: 5 } : { x: 8, y: 7 }),
  },
  // Necromancer's Gate (13×13): the Necromancer holds the backline; the Virus sits
  // forward enough to threaten but stays focusable; the player's two units spawn in the
  // opposite corner, spread one tile apart with a clean approach outside turn-one Cough
  // range (Virus range 5, opening distance 6).
  [NECROMANCER_MISSION_ID]: {
    positions: {
      "p2-0-necromancer": { x: 10, y: 2 },
      "p2-1-virus": { x: 8, y: 5 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? (unit.id.includes("-0-") ? { x: 2, y: 10 } : { x: 4, y: 9 })
        : (unit.id.includes("-0-") ? { x: 10, y: 2 } : { x: 8, y: 5 }),
  },
  // Cursed Swamp (9x9): the Archer starts in the bottom-left corner, boxed in by the map-edge
  // fire border on two sides, and pushes toward the Witch Doctor standing in the spread
  // lattice's own vacated top-right slot (see WITCH_DOCTOR_GHOUL_POSITIONS + the fire-source
  // comment above it).
  [WITCH_DOCTOR_MISSION_ID]: {
    positions: {
      "p2-0-witch-doctor": { ...WITCH_DOCTOR_SLOT },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { ...WITCH_DOCTOR_SPAWN }
        : { ...WITCH_DOCTOR_SLOT },
    extraUnits: () => WITCH_DOCTOR_GHOUL_POSITIONS.map((position, index) => createCampaignGhoul(index, position)),
    tileObjects: () => Object.fromEntries(
      WITCH_DOCTOR_FIRE_POSITIONS.map((position) => [positionKey(position), { kind: "fire", permanent: true }])
    ),
  },
});

export function prepareCampaignMatchState(match, missionId = CLOD_MISSION_ID) {
  const layout = CAMPAIGN_LAYOUTS[missionId];
  if (!layout) return match;
  const tileObjects = {
    ...(match.tileObjects ?? {}),
    ...(layout.tileObjects?.() ?? {}),
  };
  const units = match.units.map((unit) => {
    const definition = getUnitType(unit.type);
    return {
      ...unit,
      position: { ...(layout.positions[unit.id] ?? layout.fallback(unit)) },
      hp: Math.ceil(definition.stats.maxHp / 2),
      mp: definition.stats.maxMp,
      spent: false,
      defending: false,
    };
  });
  return {
    ...match,
    currentPlayer: 1,
    activation: null,
    tileObjects,
    units: [...units, ...(layout.extraUnits?.(match) ?? [])],
  };
}

export function evaluateCampaignMission(missionId, state, meta = {}) {
  const mission = getCampaignMission(missionId);
  const victory = state?.winner === 1;
  const playerUnits = (state?.units ?? []).filter((unit) => unit.player === 1);
  const enemyUnits = (state?.units ?? []).filter((unit) => unit.player === 2);
  const survivingPlayerUnits = playerUnits.filter((unit) => unit.hp > 0).length;
  const allSurvived = victory && survivingPlayerUnits === playerUnits.length;

  // Base objectives shared by every mission; the third star + the bonus are the
  // mission's signature lesson. Only two missions exist, so branch rather than build a
  // premature objective DSL (see MISSION_2 plan's implementation notes).
  const complete = { id: "complete", label: "Complete the mission", earned: victory };
  const survive = { id: "survive", label: "Keep both chosen units alive", earned: allSurvived };

  let objectives;
  let bonusObjectives;
  let extra;
  if (missionId === NECROMANCER_MISSION_ID) {
    const cleanseUsed = Boolean(meta.cleanseUsed);
    const spreadHitCount = Math.max(0, Math.floor(Number(meta.spreadHitCount) || 0));
    objectives = [
      complete,
      survive,
      { id: "cleansed", label: "Win after curing a status with a cleanse", earned: victory && cleanseUsed },
    ];
    bonusObjectives = [
      { id: "spread", label: "Bonus: never let a status spread between your units", earned: victory && spreadHitCount === 0 },
    ];
    extra = {
      cleanseUsed,
      spreadHitCount,
      necromancerDefeated: Boolean((enemyUnits.find((unit) => unit.type === "necromancer") ?? { hp: 0 }).hp <= 0),
    };
  } else if (missionId === WITCH_DOCTOR_MISSION_ID) {
    const ghoulsDefeatedCount = Math.max(0, Math.floor(Number(meta.ghoulsDefeatedCount) || 0));
    const fireDamageTakenCount = Math.max(0, Math.floor(Number(meta.fireDamageTakenCount) || 0));
    const ghoulBiteTakenCount = Math.max(0, Math.floor(Number(meta.ghoulBiteTakenCount) || 0));
    const blackDeathDanceUsed = Boolean(meta.blackDeathDanceUsed);
    const witchDoctor = enemyUnits.find((unit) => unit.type === "witch-doctor") ?? null;
    objectives = [
      complete,
      { id: "ghoulCleared", label: "Defeat at least one Ghoul", earned: victory && ghoulsDefeatedCount >= 1 },
      { id: "unscathed", label: "Avoid fire damage and Ghoul Bite hits", earned: victory && fireDamageTakenCount === 0 && ghoulBiteTakenCount === 0 },
    ];
    bonusObjectives = [
      { id: "noBlackDeath", label: "Bonus: win before Black Death Dance resolves", earned: victory && !blackDeathDanceUsed },
    ];
    extra = {
      witchDoctorDefeated: Boolean(witchDoctor && witchDoctor.hp <= 0),
      ghoulsDefeatedCount,
      fireDamageTakenCount,
      ghoulBiteTakenCount,
      blackDeathDanceUsed,
    };
  } else {
    const clodChargeHitCount = Math.max(0, Math.floor(Number(meta.clodChargeHitCount) || 0));
    const chargeDefended = Boolean(meta.chargeDefended);
    const clod = enemyUnits.find((unit) => unit.type === "clod") ?? null;
    objectives = [
      complete,
      survive,
      { id: "spacing", label: "Have Clod only hit one unit with Thunderous Charge", earned: victory && clodChargeHitCount <= 1 },
    ];
    bonusObjectives = [
      { id: "brace", label: "Bonus: defend against Thunderous Charge", earned: victory && chargeDefended },
    ];
    extra = {
      clodDefeated: Boolean(clod && clod.hp <= 0),
      clodChargeHitCount,
      chargeDefended,
    };
  }

  const earnedObjectiveStars = objectives.filter((objective) => objective.earned).length;
  const earnedBonusStars = bonusObjectives.filter((objective) => objective.earned).length;
  const stars = Math.min(3, earnedObjectiveStars + earnedBonusStars);
  return {
    missionId,
    missionTitle: mission?.title ?? "Campaign Mission",
    victory,
    stars,
    grade: stars === 3 ? "S" : stars === 2 ? "A" : stars === 1 ? "B" : "C",
    objectives,
    bonusObjectives,
    earnedBonusStars,
    rewardUnits: victory ? [...(mission?.rewardUnits ?? [])] : [],
    survivingPlayerUnits,
    totalPlayerUnits: playerUnits.length,
    playerHpRemaining: playerUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    enemyHpRemaining: enemyUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    ...extra,
  };
}

export function completeCampaignMission(storage = defaultStorage(), missionId, state, meta = {}) {
  const evaluation = evaluateCampaignMission(missionId, state, meta);
  const current = readCampaignProgress(storage);
  if (!evaluation.victory) {
    return { ...evaluation, progress: current, newRewardUnits: [] };
  }

  const completedMissions = new Set(current.completedMissions);
  completedMissions.add(missionId);
  const previousStars = current.missionStars[missionId] ?? 0;
  const progress = writeCampaignProgress(storage, {
    ...current,
    completedMissions: [...completedMissions],
    missionStars: {
      ...current.missionStars,
      [missionId]: Math.max(previousStars, evaluation.stars),
    },
  });

  const unlockProgress = readUnlockProgress(storage);
  const existing = new Set(unlockProgress.unlockedUnits);
  const newRewardUnits = evaluation.rewardUnits.filter((type) => !existing.has(type));
  writeUnlockProgress(storage, {
    ...unlockProgress,
    unlockedUnits: [...existing, ...evaluation.rewardUnits],
  });
  enqueueUnitUnlockAnnouncements(storage, newRewardUnits);

  return { ...evaluation, progress, newRewardUnits };
}

export function clodMissionOpeningScript(state) {
  const speaker = (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0);
  const clod = findUnit(state, "p2-0-clod");
  if (!speaker) return [];
  return [
    {
      speakerId: clod?.id,
      text: "This ridge belongs to Clod. Step closer, and the stones will remember you.",
    },
    {
      speakerId: speaker.id,
      text: "Big words for a pile of rocks. We came for the ridge, and we are not leaving empty-handed.",
    },
    {
      speaker: "swordsman",
      text: "Stay spread out. If Clod drops into RAGE, Thunderous Charge punishes anyone standing shoulder to shoulder.",
    },
  ];
}

export function shouldShowClodRageWarning(state, { warningShown = false, chargeUsed = false } = {}) {
  if (warningShown || chargeUsed || state?.phase !== "playing") return false;
  const clod = findUnit(state, "p2-0-clod");
  return Boolean(clod && clod.hp > 0 && clod.hp <= 5);
}

export function clodRageWarningScript(state) {
  const speaker = (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0);
  if (!speaker) return [];
  const clod = findUnit(state, "p2-0-clod");
  return [
    {
      speakerId: speaker.id,
      text: "Spread out. Clod is in RAGE now, and that charge is coming.",
    },
    {
      speakerId: clod?.id,
      text: "The ridge shakes under Clod's feet. Thunderous Charge is online.",
    },
  ];
}

// --- Mission 2: Necromancer's Gate dialogue -----------------------------------
// The hints let a player derive "physical + spacing + a cure" without naming the
// intended Mystic + Swordsman pairing outright.

function firstLivingPlayerUnit(state) {
  return (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0) ?? null;
}

export function necromancerMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const necromancer = findUnit(state, "p2-0-necromancer");
  const virus = findUnit(state, "p2-1-virus");
  return [
    {
      speakerId: necromancer?.id,
      text: "The gate drinks magic before it ever lands. Bring spells if you like — they will die quietly at my wall.",
    },
    {
      speakerId: virus?.id,
      text: "And keep your friends close together. Whatever I give one of you, I will happily share with the rest.",
    },
    {
      speakerId: speaker.id,
      text: "Something here punishes crowding, and a curse could hurt worse than any blade. Steel over sorcery — and whatever can lift a curse may matter more than raw damage this time.",
    },
  ];
}

export function shouldShowNecromancerStatusWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
}

export function necromancerStatusWarningScript(state) {
  const afflicted = (state?.units ?? []).find((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
  const speaker = afflicted ?? firstLivingPlayerUnit(state);
  const virus = findUnit(state, "p2-1-virus");
  if (!speaker) return [];
  return [
    {
      speakerId: virus?.id,
      text: "It takes hold. Stand shoulder to shoulder and it will leap to whoever is nearest.",
    },
    {
      speakerId: speaker.id,
      text: "Break apart so it can't jump, and cure it before it stacks. Left alone, this rot only gets worse.",
    },
  ];
}

export function shouldShowNecromancerSummonWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 2 && unit.hp > 0 && Boolean(unit.summonerId));
}

export function necromancerSummonWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const ghoul = (state?.units ?? []).find((unit) => unit.player === 2 && unit.hp > 0 && Boolean(unit.summonerId));
  if (!speaker) return [];
  return [
    {
      speakerId: ghoul?.id,
      text: "A ghoul claws its way up from the stones.",
    },
    {
      speakerId: speaker.id,
      text: "The ghoul isn't the win — the caster is. But it'll gnaw at anyone who lingers beside it, so don't camp next to it.",
    },
  ];
}

export function shouldShowNecromancerRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const necromancer = findUnit(state, "p2-0-necromancer");
  return Boolean(necromancer && necromancer.hp > 0 && necromancer.hp <= 5);
}

export function necromancerRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const necromancer = findUnit(state, "p2-0-necromancer");
  return [
    {
      speakerId: necromancer?.id,
      text: "Cornered, am I? Then the gate's shadow spreads — and my bomb reaches farther than it did.",
    },
    {
      speakerId: speaker.id,
      text: "Its aura just widened and Dark Bomb will catch more ground now. Don't dawdle in the dark — finish it.",
    },
  ];
}

// --- Mission 3: Cursed Swamp dialogue ----------------------------------------
// These hints point at the level's actual lesson: body-blocked physical shots,
// fire lanes, Ghoul proximity, and the Witch Doctor's RAGE dance.

export function witchDoctorMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  return [
    {
      speakerId: witchDoctor?.id,
      text: "Careful where you step. The flame and I go way back, and the swamp remembers its friends.",
    },
    {
      speakerId: speaker.id,
      text: "Those things are standing shoulder to shoulder. A straight shot will not always find a straight line.",
    },
  ];
}

export function shouldShowWitchDoctorFireWarning(state, { warningShown = false, fireDamageTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(fireDamageTakenCount) || 0)) > 0;
}

export function witchDoctorFireWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "The swamp burns anyone careless, but he barely flinches. The fire is not hurting both sides equally.",
    },
    {
      speakerId: witchDoctor?.id,
      text: "Old friends do not bite.",
    },
  ];
}

export function shouldShowWitchDoctorBlockedShotWarning(state, { warningShown = false, blockedShotQueued = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Boolean(blockedShotQueued);
}

export function witchDoctorBlockedShotWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "An arrow does not turn corners. A wider spread might not care what is standing in the way.",
    },
  ];
}

export function shouldShowWitchDoctorGhoulWarning(state, { warningShown = false, ghoulBiteTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(ghoulBiteTakenCount) || 0)) > 0;
}

export function witchDoctorGhoulWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "They get meaner up close. Keep distance unless you are ready to pay for the tile.",
    },
  ];
}

export function shouldShowWitchDoctorRageWarning(state, { warningShown = false, blackDeathDanceUsed = false } = {}) {
  if (warningShown || blackDeathDanceUsed || state?.phase !== "playing") return false;
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  return Boolean(witchDoctor && witchDoctor.hp > 0 && witchDoctor.hp <= 5);
}

export function witchDoctorRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  if (!speaker) return [];
  return [
    {
      speakerId: witchDoctor?.id,
      text: "Now the swamp dances with me. One more step and everything goes dark.",
    },
    {
      speakerId: speaker.id,
      text: "Black Death is coming if this drags on. Finish the duel before he gets another dance.",
    },
  ];
}

// Dispatcher so the match seam can ask for a mission's opening without a per-mission
// branch of its own.
export function campaignOpeningScript(missionId, state) {
  if (missionId === WITCH_DOCTOR_MISSION_ID) return witchDoctorMissionOpeningScript(state);
  if (missionId === NECROMANCER_MISSION_ID) return necromancerMissionOpeningScript(state);
  if (missionId === CLOD_MISSION_ID) return clodMissionOpeningScript(state);
  return [];
}
