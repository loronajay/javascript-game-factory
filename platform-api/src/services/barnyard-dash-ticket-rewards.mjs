// Barnyard Dash results: the normalizer and the pure payout formula.
//
// Three kinds of result are filed:
//   - cpu:    a quick race against a CPU field at a level;
//   - cup:    a whole Grand Prix — every race's placing and the final table
//             place; a cup WON also puts that cup's trophy on the farm
//             (services/game-result-grants);
//   - online: a race against other people on factory-network-server. Only
//             these count toward the public PvP record (db/pet-game-career).
//
// Evidence standing: a plausibility gate, not proof. Every race is held to the
// fastest its course can be run (services/pet-games-prize-catalog), a cup's
// final place to what its own points allow, and the settlement's time-budget
// fence bounds the rest. Online races are decided by the network server, but
// it does not attest to the platform yet, so an online result is still the
// client's claim about what the server said.
import { namesClientAmount, readChoice, readDurationMs, readInt, readResultId, readResultSource, refuse, } from "./game-result-shared.mjs";
import { BARNYARD_COURSES, BARNYARD_CUPS, BARNYARD_GRID_SIZE, BARNYARD_POINTS_BY_PLACE, PET_CPU_LEVELS, cupPlacePlausible, } from "./pet-games-prize-catalog.mjs";
const MODES = ["cpu", "cup", "online"];
export const BARNYARD_TICKET_MAX_PER_RESULT = 160;
// Every payout sits under the ceiling of one ticket per 7 s of claimed play (a
// CPU result can be forged, so it must cost real time) — completion is earned
// slowly by time so that the placing, and the class it was won at, is what
// separates a good result from a finished one.
const MS_PER_TICKET_CEILING = 7_000;
const CPU_COMPLETION_MS_PER_TICKET = 30_000;
const CPU_WIN_BONUS = { rookie: 2, pro: 4, champion: 6 };
const CUP_PODIUM_BONUS = {
    rookie: [8, 5, 3],
    pro: [14, 9, 5],
    champion: [22, 14, 8],
};
const ONLINE_COMPLETION_MS_PER_TICKET = 10_000;
const ONLINE_COMPLETION_CAP = 15;
const ONLINE_PODIUM = [8, 5, 3];
function readRace(raw) {
    const source = readResultSource(raw);
    if (!source)
        return null;
    const courseId = typeof source.courseId === "string" ? source.courseId : "";
    const course = BARNYARD_COURSES[courseId];
    if (!course)
        return null;
    const fieldSize = readInt(source.fieldSize, 2, BARNYARD_GRID_SIZE);
    const place = readInt(source.place, 1, BARNYARD_GRID_SIZE);
    if (fieldSize === null || place === null || place > fieldSize)
        return null;
    const finished = source.finished === true;
    let timeMs = null;
    if (finished) {
        timeMs = readDurationMs(source.timeMs);
        if (timeMs === null || timeMs < course.minRaceMs)
            return null;
    }
    return { courseId, place, fieldSize, finished, timeMs };
}
export function normalizeBarnyardDashResult(raw) {
    const source = readResultSource(raw);
    if (!source)
        return refuse("invalid_result");
    if (namesClientAmount(source))
        return refuse("client_amount_refused");
    const resultId = readResultId(source.resultId);
    if (!resultId)
        return refuse("invalid_result_id");
    const mode = readChoice(source.mode, MODES);
    if (!mode)
        return refuse("invalid_mode");
    const durationMs = readDurationMs(source.durationMs);
    if (durationMs === null)
        return refuse("invalid_duration");
    const level = mode === "online" ? null : readChoice(source.level, PET_CPU_LEVELS);
    if (mode !== "online" && !level)
        return refuse("invalid_level");
    const rawRaces = Array.isArray(source.races) ? source.races : [];
    const races = rawRaces.map(readRace);
    if (!races.length || races.some((race) => race === null))
        return refuse("invalid_race");
    const clean = races;
    let cupId = null;
    let finalPlace = clean[0].place;
    let points = 0;
    if (mode === "cup") {
        cupId = typeof source.cupId === "string" && BARNYARD_CUPS[source.cupId] ? source.cupId : null;
        if (!cupId)
            return refuse("invalid_cup");
        const courses = BARNYARD_CUPS[cupId];
        if (clean.length !== courses.length || clean.some((race, index) => race.courseId !== courses[index] || race.fieldSize !== BARNYARD_GRID_SIZE)) {
            return refuse("invalid_cup");
        }
        points = clean.reduce((sum, race) => sum + (race.finished ? BARNYARD_POINTS_BY_PLACE[race.place - 1] : 0), 0);
        const claimed = readInt(source.finalPlace, 1, BARNYARD_GRID_SIZE);
        if (claimed === null || !cupPlacePlausible(clean.length, points, claimed))
            return refuse("implausible_standings");
        finalPlace = claimed;
    }
    else if (clean.length !== 1) {
        return refuse("invalid_race");
    }
    const humans = mode === "online" ? readInt(source.humans, 2, clean[0].fieldSize) : 1;
    if (humans === null)
        return refuse("invalid_field");
    const raced = clean.reduce((sum, race) => sum + (race.timeMs ?? BARNYARD_COURSES[race.courseId].minRaceMs), 0);
    if (durationMs < raced)
        return refuse("implausible_duration");
    return { result: { resultId, mode, level, cupId, races: clean, finalPlace, humans, points, durationMs } };
}
export function calculateBarnyardDashTicketReward({ result }) {
    let completion;
    let placing = 0;
    if (result.mode === "cpu") {
        completion = Math.floor(result.durationMs / CPU_COMPLETION_MS_PER_TICKET);
        if (result.finalPlace === 1 && result.races[0].finished)
            placing = CPU_WIN_BONUS[result.level ?? "rookie"];
    }
    else if (result.mode === "cup") {
        completion = Math.floor(result.durationMs / CPU_COMPLETION_MS_PER_TICKET);
        const podium = CUP_PODIUM_BONUS[result.level ?? "rookie"];
        // The Blue Ribbon's five races are worth more than a three-race cup.
        placing = Math.round((podium[result.finalPlace - 1] ?? 0) * (result.races.length / 3));
    }
    else {
        completion = Math.min(ONLINE_COMPLETION_CAP, Math.floor(result.durationMs / ONLINE_COMPLETION_MS_PER_TICKET));
        if (result.races[0].finished)
            placing = (ONLINE_PODIUM[result.finalPlace - 1] ?? 0) + (result.finalPlace === 1 ? result.humans - 2 : 0);
    }
    const ceiling = Math.floor(result.durationMs / MS_PER_TICKET_CEILING);
    const total = Math.max(0, Math.min(BARNYARD_TICKET_MAX_PER_RESULT, ceiling, completion + placing));
    return { repeatable: { completion, placing, total }, achievements: [], achievementTotal: 0, total };
}
