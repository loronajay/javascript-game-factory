import { RIVAL_IDS } from '../physics/rivals.js';

export const CIRCUIT_STOPS = Object.freeze([
    { number: 1, rivalId: 'rookie', arenaId: 'hyper_arcade', name: 'Opening Night' },
    { number: 2, rivalId: 'banks', arenaId: 'park_jam', name: 'Park Money' },
    { number: 3, rivalId: 'brick', arenaId: 'garage_club', name: 'After Hours' },
    { number: 4, rivalId: 'viper', arenaId: 'hyper_arcade', name: 'Neon Rush' },
    { number: 5, rivalId: 'gambler', arenaId: 'boardwalk_bash', name: 'Boardwalk Double' },
    { number: 6, rivalId: 'cannon', arenaId: 'freight_yard', name: 'Heavy Cargo' },
    { number: 7, rivalId: 'mirror', arenaId: 'competition_circuit', name: 'The Read' },
    { number: 8, rivalId: 'switch', arenaId: 'skyline_rooftop', name: 'High Society' },
    { number: 9, rivalId: 'anchor', arenaId: 'freight_yard', name: 'Night Shift' },
    { number: 10, rivalId: 'ghost', arenaId: 'garage_club', name: 'Last Call' },
    { number: 11, rivalId: 'orbit', arenaId: 'zero_g_arena', name: 'Escape Velocity' },
    { number: 12, rivalId: 'ace', arenaId: 'zero_g_arena', name: 'Championship' },
]);

const validIds = new Set(RIVAL_IDS);

export function createCircuitProgress(value = {}) {
    const cleared = [...new Set(Array.isArray(value.cleared) ? value.cleared.filter(id => validIds.has(id)) : [])];
    const records = {};
    if (value.records && typeof value.records === 'object')
        for (const [id, record] of Object.entries(value.records))
            if (validIds.has(id)) records[id] = {
                wins: Math.max(0, Number.isInteger(record?.wins) ? record.wins : 0),
                losses: Math.max(0, Number.isInteger(record?.losses) ? record.losses : 0),
            };
    return { cleared, records, complete: CIRCUIT_STOPS.every(stop => cleared.includes(stop.rivalId)) };
}

export function stopStatus(progress, index) {
    const safe = createCircuitProgress(progress);
    const stop = CIRCUIT_STOPS[index];
    if (!stop) return 'locked';
    if (safe.cleared.includes(stop.rivalId)) return 'cleared';
    return index === 0 || CIRCUIT_STOPS.slice(0, index).every(previous => safe.cleared.includes(previous.rivalId)) ? 'current' : 'locked';
}

export function recordCircuitResult(progress, { rivalId, won }) {
    const safe = createCircuitProgress(progress);
    if (!validIds.has(rivalId)) return safe;
    const record = safe.records[rivalId] || { wins: 0, losses: 0 };
    record[won ? 'wins' : 'losses']++;
    safe.records[rivalId] = record;
    if (won && !safe.cleared.includes(rivalId)) safe.cleared.push(rivalId);
    safe.complete = CIRCUIT_STOPS.every(stop => safe.cleared.includes(stop.rivalId));
    return safe;
}

export function loadCircuitProgress(storage) {
    try { return createCircuitProgress(JSON.parse(storage?.getItem('puckdUp.circuit') || '{}')); }
    catch { return createCircuitProgress(); }
}

export function saveCircuitProgress(storage, progress) {
    try { storage?.setItem('puckdUp.circuit', JSON.stringify(createCircuitProgress(progress))); }
    catch { /* Restricted storage never blocks the tour. */ }
}
