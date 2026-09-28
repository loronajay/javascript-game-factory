// The Barnyard Dash Grand Prix: a cup is a run of races against one CPU grid,
// scored on points, won on the table. Pure — the page drives it race by race
// and platform-api settles the prize from the summary it produces.
//
// A CUP is a list of courses. A CLASS is the CPU level the grid drives at
// (Rookie, Pro, Champion). The GRID is seven rivals drawn from the shared pool
// once per run and kept for every race of it, so a rival you beat in race one
// is the one you are chasing in race three. Points follow the placing in each
// race; a pet that fails to finish scores nothing.
//
// platform-api/src/services/barnyard-dash-cup-catalog.mts mirrors the cup
// list, the points and the prize table; a test holds the two equal.

import { pickRivals, rivalAsPet } from "../../pet-games/shared/sim/rivals.js?v=20260928-pet-online";
import { normalizeCpuLevel } from "../../pet-games/shared/sim/levels.js?v=20260928-pet-online";
import { courseOrDefault } from "./sim/courses.js?v=20260928-pet-online";

export const GRID_SIZE = 8;
export const POINTS_BY_PLACE = Object.freeze([10, 8, 6, 5, 4, 3, 2, 1]);

export const CUPS = Object.freeze([
  Object.freeze({
    id: "clover-cup",
    title: "Clover Cup",
    blurb: "Three friendly courses to learn the circuit.",
    courses: Object.freeze(["barnyard-loop", "millpond-oval", "orchard-esses"]),
  }),
  Object.freeze({
    id: "harvest-cup",
    title: "Harvest Cup",
    blurb: "Hairpins, esses and the long ridge. Bring your brakes.",
    courses: Object.freeze(["hayloft-hairpins", "orchard-esses", "thunder-ridge"]),
  }),
  Object.freeze({
    id: "blue-ribbon-cup",
    title: "Blue Ribbon Cup",
    blurb: "Every course on the circuit, back to back. The big one.",
    courses: Object.freeze(["barnyard-loop", "orchard-esses", "millpond-oval", "hayloft-hairpins", "thunder-ridge"]),
  }),
]);

/** What each class's cup is worth putting on a shelf: the trophy a win earns, by class. */
export const CUP_TROPHY_TIERS = Object.freeze({ rookie: "bronze", pro: "silver", champion: "gold" });

export function findCup(id) {
  return CUPS.find((cup) => cup.id === id) ?? null;
}

/** The farm decor item a cup win at a class earns. */
export function trophyItemId(cupId, level) {
  const tier = CUP_TROPHY_TIERS[normalizeCpuLevel(level)];
  return `decor.prop.trophy-${cupId}-${tier}`;
}

/** Start a cup run. `seed` draws this run's grid (a fresh one each run keeps the circuit fresh). */
export function createGrandPrix({ cupId, level, playerPet, seed = "cup" }) {
  const cup = findCup(cupId) ?? CUPS[0];
  const cpuLevel = normalizeCpuLevel(level);
  const rivals = pickRivals({ seed: `${cup.id}:${cpuLevel}:${seed}`, count: GRID_SIZE - 1, level: cpuLevel }).map(rivalAsPet);
  const entrants = [
    { id: "player", pet: playerPet },
    ...rivals.map((pet) => ({ id: pet.instanceId, pet, cpu: cpuLevel })),
  ];
  return {
    cupId: cup.id,
    level: cpuLevel,
    seed: String(seed),
    entrants,
    raceIndex: 0,
    results: [],
    points: Object.fromEntries(entrants.map((entrant) => [entrant.id, 0])),
  };
}

export function grandPrixCup(gp) {
  return findCup(gp.cupId) ?? CUPS[0];
}

export function grandPrixFinished(gp) {
  return gp.raceIndex >= grandPrixCup(gp).courses.length;
}

/** The next race to run: its course and field. The grid starts in reverse order of the standings. */
export function nextGrandPrixRace(gp) {
  if (grandPrixFinished(gp)) return null;
  const course = courseOrDefault(grandPrixCup(gp).courses[gp.raceIndex]);
  const order = gp.raceIndex === 0 ? gp.entrants : [...grandPrixStandings(gp)].reverse().map((row) => gp.entrants.find((entrant) => entrant.id === row.id));
  return {
    number: gp.raceIndex + 1,
    of: grandPrixCup(gp).courses.length,
    course,
    entrants: order,
    seed: `${gp.seed}:race-${gp.raceIndex + 1}`,
  };
}

/**
 * Score a finished race. `order` is the finishing order of racer ids (race.js
 * raceOrder), `finishedAt` maps id to seconds or null for a pet that did not finish.
 */
export function recordGrandPrixRace(gp, { order, finishedAt = {}, elapsed = 0 }) {
  if (grandPrixFinished(gp)) return gp;
  const points = { ...gp.points };
  const placings = order.map((id, index) => {
    const finished = Number.isFinite(finishedAt[id]);
    const scored = finished ? (POINTS_BY_PLACE[index] ?? 0) : 0;
    points[id] = (points[id] ?? 0) + scored;
    return { id, place: index + 1, time: finished ? finishedAt[id] : null, points: scored };
  });
  return {
    ...gp,
    raceIndex: gp.raceIndex + 1,
    points,
    results: [...gp.results, { courseId: grandPrixCup(gp).courses[gp.raceIndex], placings, elapsed }],
  };
}

/** The table: points, then the better best finish, then the better last race. */
export function grandPrixStandings(gp) {
  const bestPlace = (id) => Math.min(9, ...gp.results.map((result) => result.placings.find((row) => row.id === id)?.place ?? 9));
  const lastPlace = (id) => gp.results.at(-1)?.placings.find((row) => row.id === id)?.place ?? 9;
  return gp.entrants
    .map((entrant) => ({ id: entrant.id, pet: entrant.pet, player: entrant.cpu == null, points: gp.points[entrant.id] ?? 0 }))
    .sort((left, right) => right.points - left.points
      || bestPlace(left.id) - bestPlace(right.id)
      || lastPlace(left.id) - lastPlace(right.id)
      || left.id.localeCompare(right.id))
    .map((row, index) => ({ ...row, place: index + 1 }));
}

/** What the page files with platform-api when the cup is over. The server re-scores it. */
export function grandPrixSummary(gp, { runId, durationMs }) {
  const standings = grandPrixStandings(gp);
  return {
    resultId: runId,
    mode: "cup",
    cupId: gp.cupId,
    level: gp.level,
    finalPlace: standings.find((row) => row.player)?.place ?? GRID_SIZE,
    races: gp.results.map((result) => {
      const mine = result.placings.find((row) => row.id === "player");
      return {
        courseId: result.courseId,
        place: mine?.place ?? GRID_SIZE,
        finished: Number.isFinite(mine?.time),
        timeMs: Number.isFinite(mine?.time) ? Math.round(mine.time * 1000) : null,
        fieldSize: result.placings.length,
      };
    }),
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}
