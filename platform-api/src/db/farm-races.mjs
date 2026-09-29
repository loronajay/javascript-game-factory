// Races at Windrush Downs on the database (migration 059;
// services/farm-race-policy.mts; planning-docs/FARM_RIDING_PLAN.md).
//
// Every move on a race — post, enter, leave, start, bet, settle — happens under
// the race row's lock, with the tickets it moves in the same transaction. The
// horse each rider brings is read from their stored farm and turned into its
// ride profile HERE, so the race room runs on the API's numbers. Statuses move
// on lazily: whoever next reads or touches a race carries it forward (a closing
// race whose start has come is running; an open race nobody started, or a
// running race nobody settled, is taken down and every ticket goes back).
import { randomUUID } from "node:crypto";
import { awardTicketsInTransaction, spendTicketsInTransaction } from "./tickets.mjs";
import { lockedFarm, saveFarm, transaction } from "./farm-economy.mjs";
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { normalizeFarmSkillRecords } from "../services/farm-skill-catalog.mjs";
import { ridingLevelOf, serverRideProfile, storedHorse } from "../services/farm-horse-ride.mjs";
import { raceXp } from "../riding-sim/farm-riding-skill.mjs";
import { COUNTDOWN_LEAD_SECONDS, GATE_SECONDS, MAX_OPEN_RACES, OPEN_RACE_MINUTES, RACE_BETS_PER_PLAYER, RACE_BET_MAX, RACE_BET_MIN, RACE_DAILY_EARN_LIMIT, RACE_DAILY_SPEND_LIMIT, RACE_DEADLINE_MINUTES, RACE_MAX_RIDERS, RACE_MIN_RIDERS, RACE_STAKE_MAX, impliedOdds, isRaceCourse, normalizeRaceResult, raceRefunds, raceSeatPayload, raceSettlement, raceTicketPayload, signRacePayload, verifyRacePayload, } from "../services/farm-race-policy.mjs";
const RACE_ID = /^race-[A-Za-z0-9-]{8,64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const COLUMNS = "id, poster_id, course_id, stake, max_riders, status, state, created_at, gate_closes_at, starts_at, deadline_at, settled_at";
function required(value, field) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text)
        throw new TypeError(`${field} is required`);
    return text;
}
function cleanName(value, fallback) {
    if (typeof value !== "string")
        return fallback;
    // eslint-disable-next-line no-control-regex
    return value.replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 24) || fallback;
}
const time = (value) => (value ? new Date(value).getTime() : null);
function fromRow(row) {
    const state = row.state && typeof row.state === "object" ? row.state : {};
    return {
        id: String(row.id),
        posterId: String(row.poster_id),
        courseId: String(row.course_id),
        stake: Number(row.stake) || 0,
        maxRiders: Number(row.max_riders) || RACE_MAX_RIDERS,
        status: String(row.status),
        entries: Array.isArray(state.entries) ? state.entries : [],
        bets: Array.isArray(state.bets) ? state.bets : [],
        result: state.result ?? null,
        payouts: Array.isArray(state.payouts) ? state.payouts : [],
        xp: state.xp && typeof state.xp === "object" ? state.xp : {},
        createdAt: time(row.created_at) ?? 0,
        gateClosesAt: time(row.gate_closes_at),
        startsAt: time(row.starts_at),
        deadlineAt: time(row.deadline_at),
    };
}
async function saveRace(client, race, extra = {}) {
    await client.query(`update farm_races set status = $2, state = $3::jsonb, gate_closes_at = $4, starts_at = $5, deadline_at = $6${extra.settled ? ", settled_at = now()" : ""} where id = $1`, [race.id, race.status, JSON.stringify({ entries: race.entries, bets: race.bets, result: race.result, payouts: race.payouts, xp: race.xp }),
        race.gateClosesAt ? new Date(race.gateClosesAt) : null, race.startsAt ? new Date(race.startsAt) : null, race.deadlineAt ? new Date(race.deadlineAt) : null]);
}
async function lockedRace(client, raceId) {
    const result = await client.query(`select ${COLUMNS} from farm_races where id = $1 for update`, [raceId]);
    return result.rows?.[0] ? fromRow(result.rows[0]) : null;
}
/** What races have taken from and paid to a player since the UTC day began. */
async function dailyTotals(client, playerId, now) {
    const since = new Date(Math.floor(now / DAY_MS) * DAY_MS);
    const result = await client.query(`select coalesce(sum(case when amount < 0 then -amount else 0 end), 0)::int as spent,
            coalesce(sum(case when amount > 0 and kind in ('win', 'bet') then amount else 0 end), 0)::int as earned
     from farm_race_ledger where player_id = $1 and created_at >= $2`, [playerId, since]);
    return { spent: Number(result.rows?.[0]?.spent) || 0, earned: Number(result.rows?.[0]?.earned) || 0 };
}
async function ledger(client, raceId, playerId, kind, amount) {
    await client.query(`insert into farm_race_ledger (race_id, player_id, kind, amount) values ($1, $2, $3, $4)`, [raceId, playerId, kind, amount]);
}
async function take(client, race, playerId, kind, amount, key) {
    if (amount <= 0)
        return { ok: true, balance: -1 };
    const spend = await spendTicketsInTransaction(client, { playerId, transactionKey: key, amount, reason: `farm_race_${kind}`, metadata: { raceId: race.id } });
    if (!spend.ok)
        return { ok: false, error: spend.error ?? "insufficient_tickets", balance: spend.balance };
    if (!spend.duplicate)
        await ledger(client, race.id, playerId, kind, -amount);
    return { ok: true, balance: spend.balance };
}
async function pay(client, raceId, payout, now) {
    let amount = payout.amount;
    if (payout.kind !== "refund") {
        // Winnings count against the day's earn limit; what is over it is burned (the laundering fence).
        const totals = await dailyTotals(client, payout.playerId, now);
        amount = Math.max(0, Math.min(amount, RACE_DAILY_EARN_LIMIT - totals.earned));
    }
    if (amount <= 0)
        return 0;
    const award = await awardTicketsInTransaction(client, {
        playerId: payout.playerId, transactionKey: `farm:race:${payout.kind}:${raceId}:${payout.playerId}`, amount, reason: `farm_race_${payout.kind}`, metadata: { raceId },
    });
    if (award.awarded)
        await ledger(client, raceId, payout.playerId, payout.kind, amount);
    return award.awarded ?? 0;
}
/** Take a race down and give every ticket back. */
async function refundRace(client, race, now) {
    const payouts = raceRefunds(race.entries, race.bets);
    for (const payout of payouts)
        await pay(client, race.id, payout, now);
    race.status = "cancelled";
    race.payouts = payouts;
    await saveRace(client, race, { settled: true });
}
/** Carry a locked race forward to now. */
async function advance(client, race, now) {
    if (race.status === "open" && now - race.createdAt > OPEN_RACE_MINUTES * 60_000)
        await refundRace(client, race, now);
    else if (race.status === "closing" && race.startsAt && now >= race.startsAt) {
        race.status = "running";
        await saveRace(client, race);
    }
    if (race.status === "running" && race.deadlineAt && now > race.deadlineAt)
        await refundRace(client, race, now);
    return race;
}
/** Close the gate: bets and entries stop in `GATE_SECONDS`, the countdown begins `COUNTDOWN_LEAD_SECONDS` after. */
function closeGate(race, now) {
    race.status = "closing";
    race.gateClosesAt = now + GATE_SECONDS * 1000;
    race.startsAt = race.gateClosesAt + COUNTDOWN_LEAD_SECONDS * 1000;
    race.deadlineAt = race.startsAt + RACE_DEADLINE_MINUTES * 60_000;
}
const bettingOpen = (race, now) => race.status === "open" || (race.status === "closing" && race.gateClosesAt !== null && now < race.gateClosesAt);
function view(race, viewerId, secret, now) {
    const mine = race.bets.filter((bet) => bet.playerId === viewerId);
    const byRider = {};
    for (const bet of race.bets)
        byRider[bet.riderId] = (byRider[bet.riderId] ?? 0) + bet.amount;
    const live = race.status === "closing" || race.status === "running";
    const ticketPayload = live && race.startsAt && race.deadlineAt ? raceTicketPayload({ id: race.id, courseId: race.courseId, startsAt: race.startsAt, deadlineAt: race.deadlineAt, entries: race.entries }) : null;
    const riding = race.entries.some((entry) => entry.playerId === viewerId);
    return {
        id: race.id,
        posterId: race.posterId,
        courseId: race.courseId,
        stake: race.stake,
        maxRiders: race.maxRiders,
        status: race.status,
        createdAt: race.createdAt,
        gateClosesAt: race.gateClosesAt,
        startsAt: race.startsAt,
        deadlineAt: race.deadlineAt,
        bettingOpen: bettingOpen(race, now),
        entries: race.entries.map((entry) => ({ playerId: entry.playerId, name: entry.name, horseName: entry.horseName, paletteId: entry.paletteId, size: entry.size })),
        pool: race.bets.reduce((sum, bet) => sum + bet.amount, 0),
        byRider,
        odds: impliedOdds(race.entries, race.bets),
        myBets: mine.map((bet) => ({ riderId: bet.riderId, amount: bet.amount })),
        result: race.result,
        myPayouts: race.payouts.filter((payout) => payout.playerId === viewerId),
        myXp: race.xp[viewerId] ?? 0,
        ...(ticketPayload && secret ? { ticket: { payload: ticketPayload, signature: signRacePayload(secret, "ticket", ticketPayload) } } : {}),
        ...(live && riding && secret ? { seat: signRacePayload(secret, "seat", raceSeatPayload(race.id, viewerId)) } : {}),
    };
}
// ---------------------------------------------------------------- reads
export async function listFarmRaces(pool, input, now = Date.now(), secret = "") {
    const viewerId = typeof input?.playerId === "string" ? input.playerId : "";
    return transaction(pool, async (client) => {
        const live = await client.query(`select ${COLUMNS} from farm_races where status in ('open', 'closing', 'running') order by created_at desc limit 40 for update`);
        const races = [];
        for (const row of live.rows ?? [])
            races.push(await advance(client, fromRow(row), now));
        const recent = await client.query(`select ${COLUMNS} from farm_races where status in ('settled', 'cancelled') and created_at > $1 order by created_at desc limit 8`, [new Date(now - 60 * 60_000)]);
        for (const row of recent.rows ?? [])
            races.push(fromRow(row));
        return { races: races.map((race) => view(race, viewerId, secret, now)), limits: { stakeMax: RACE_STAKE_MAX, betMin: RACE_BET_MIN, betMax: RACE_BET_MAX, maxRiders: RACE_MAX_RIDERS } };
    });
}
// ---------------------------------------------------------------- writes
async function horseEntry(client, playerId, name, horseId, stake, now) {
    const farm = await lockedFarm(client, playerId);
    if (!farm || farm.layout.onboarding?.status !== "complete")
        return { ok: false, error: "farm_not_initialized" };
    const horse = storedHorse(farm.layout, horseId);
    if (!horse)
        return { ok: false, error: "no_horse" };
    return {
        ok: true,
        entry: {
            playerId,
            name: cleanName(name, "Rider"),
            horseId: horse.instanceId,
            horseName: cleanName(horse.name, "Horse"),
            paletteId: String(horse.profile.paletteId ?? "standard"),
            size: Number(horse.profile.size?.current) || 1,
            profile: serverRideProfile(horse, ridingLevelOf(farm.layout)),
            stake,
            at: now,
        },
    };
}
async function inLiveRace(client, playerId) {
    const result = await client.query(`select state from farm_races where status in ('open', 'closing', 'running')`);
    return (result.rows ?? []).some((row) => (row.state?.entries ?? []).some((entry) => entry?.playerId === playerId));
}
export async function postFarmRace(pool, input, now = Date.now(), secret = "") {
    const playerId = required(input?.playerId, "playerId");
    if (!secret)
        return { ok: false, error: "races_unavailable" };
    if (!isRaceCourse(input?.courseId))
        return { ok: false, error: "unknown_course" };
    const maxRiders = Number(input?.maxRiders);
    const stake = Number(input?.stake ?? 0);
    if (!Number.isSafeInteger(maxRiders) || maxRiders < RACE_MIN_RIDERS || maxRiders > RACE_MAX_RIDERS)
        return { ok: false, error: "invalid_field" };
    if (!Number.isSafeInteger(stake) || stake < 0 || stake > RACE_STAKE_MAX)
        return { ok: false, error: "invalid_stake" };
    return transaction(pool, async (client) => {
        const open = await client.query(`select count(*)::int as count from farm_races where status in ('open', 'closing', 'running')`);
        if ((Number(open.rows?.[0]?.count) || 0) >= MAX_OPEN_RACES)
            return { ok: false, error: "too_many_races" };
        if (await inLiveRace(client, playerId))
            return { ok: false, error: "already_racing" };
        const totals = await dailyTotals(client, playerId, now);
        if (totals.spent + stake > RACE_DAILY_SPEND_LIMIT)
            return { ok: false, error: "daily_spend_limit" };
        const entry = await horseEntry(client, playerId, input?.name, input?.horseId, stake, now);
        if (!entry.ok)
            return entry;
        const race = {
            id: `race-${randomUUID()}`, posterId: playerId, courseId: input.courseId, stake, maxRiders, status: "open",
            entries: [entry.entry], bets: [], result: null, payouts: [], xp: {}, createdAt: now, gateClosesAt: null, startsAt: null, deadlineAt: null,
        };
        await client.query(`insert into farm_races (id, poster_id, course_id, stake, max_riders, status, state, created_at) values ($1, $2, $3, $4, $5, 'open', $6::jsonb, $7)`, [race.id, playerId, race.courseId, stake, maxRiders, JSON.stringify({ entries: race.entries, bets: [], result: null, payouts: [] }), new Date(now)]);
        const paid = await take(client, race, playerId, "stake", stake, `farm:race:stake:${race.id}:${playerId}:${now}`);
        if (!paid.ok)
            throw Object.assign(new Error("stake"), { refusal: paid });
        return { ok: true, race: view(race, playerId, secret, now), ...(paid.balance >= 0 ? { balance: paid.balance } : {}) };
    }).catch((error) => (error?.refusal ? { ok: false, ...error.refusal } : Promise.reject(error)));
}
export async function enterFarmRace(pool, input, now = Date.now(), secret = "") {
    const playerId = required(input?.playerId, "playerId");
    const raceId = required(input?.raceId, "raceId");
    if (!RACE_ID.test(raceId))
        return { ok: false, error: "not_found" };
    return transaction(pool, async (client) => {
        const race = await lockedRace(client, raceId);
        if (!race)
            return { ok: false, error: "not_found" };
        await advance(client, race, now);
        if (!bettingOpen(race, now))
            return { ok: false, error: "gate_closed" };
        if (race.entries.some((entry) => entry.playerId === playerId))
            return { ok: true, duplicate: true, race: view(race, playerId, secret, now) };
        if (race.entries.length >= race.maxRiders)
            return { ok: false, error: "race_full" };
        if (race.bets.some((bet) => bet.playerId === playerId))
            return { ok: false, error: "backed_this_race" };
        if (await inLiveRace(client, playerId))
            return { ok: false, error: "already_racing" };
        const totals = await dailyTotals(client, playerId, now);
        if (totals.spent + race.stake > RACE_DAILY_SPEND_LIMIT)
            return { ok: false, error: "daily_spend_limit" };
        const entry = await horseEntry(client, playerId, input?.name, input?.horseId, race.stake, now);
        if (!entry.ok)
            return entry;
        const paid = await take(client, race, playerId, "stake", race.stake, `farm:race:stake:${race.id}:${playerId}:${now}`);
        if (!paid.ok)
            return paid;
        race.entries = [...race.entries, entry.entry];
        // A full field closes the gate by itself.
        if (race.status === "open" && race.entries.length >= race.maxRiders)
            closeGate(race, now);
        await saveRace(client, race);
        return { ok: true, race: view(race, playerId, secret, now), ...(paid.balance >= 0 ? { balance: paid.balance } : {}) };
    });
}
export async function leaveFarmRace(pool, input, now = Date.now(), secret = "") {
    const playerId = required(input?.playerId, "playerId");
    const raceId = required(input?.raceId, "raceId");
    if (!RACE_ID.test(raceId))
        return { ok: false, error: "not_found" };
    return transaction(pool, async (client) => {
        const race = await lockedRace(client, raceId);
        if (!race)
            return { ok: false, error: "not_found" };
        await advance(client, race, now);
        if (race.status !== "open")
            return { ok: false, error: "gate_closed" };
        const entry = race.entries.find((candidate) => candidate.playerId === playerId);
        if (!entry)
            return { ok: false, error: "not_entered" };
        // The poster leaving takes the race down.
        if (playerId === race.posterId) {
            await refundRace(client, race, now);
            return { ok: true, race: view(race, playerId, secret, now) };
        }
        if (entry.stake > 0) {
            // Keyed by the entry, so a rider who leaves and comes back is refunded each time exactly once.
            const award = await awardTicketsInTransaction(client, { playerId, transactionKey: `farm:race:leave:${race.id}:${playerId}:${entry.at}`, amount: entry.stake, reason: "farm_race_refund", metadata: { raceId: race.id } });
            if (award.awarded)
                await ledger(client, race.id, playerId, "refund", entry.stake);
        }
        race.entries = race.entries.filter((candidate) => candidate.playerId !== playerId);
        await saveRace(client, race);
        return { ok: true, race: view(race, playerId, secret, now) };
    });
}
export async function startFarmRace(pool, input, now = Date.now(), secret = "") {
    const playerId = required(input?.playerId, "playerId");
    const raceId = required(input?.raceId, "raceId");
    if (!RACE_ID.test(raceId))
        return { ok: false, error: "not_found" };
    return transaction(pool, async (client) => {
        const race = await lockedRace(client, raceId);
        if (!race)
            return { ok: false, error: "not_found" };
        await advance(client, race, now);
        if (race.posterId !== playerId)
            return { ok: false, error: "not_poster" };
        if (race.status !== "open")
            return { ok: false, error: "gate_closed" };
        if (race.entries.length < RACE_MIN_RIDERS)
            return { ok: false, error: "too_few_riders" };
        closeGate(race, now);
        await saveRace(client, race);
        return { ok: true, race: view(race, playerId, secret, now) };
    });
}
export async function betFarmRace(pool, input, now = Date.now(), secret = "") {
    const playerId = required(input?.playerId, "playerId");
    const raceId = required(input?.raceId, "raceId");
    const amount = Number(input?.amount);
    if (!RACE_ID.test(raceId))
        return { ok: false, error: "not_found" };
    if (!Number.isSafeInteger(amount) || amount < RACE_BET_MIN || amount > RACE_BET_MAX)
        return { ok: false, error: "invalid_bet" };
    return transaction(pool, async (client) => {
        const race = await lockedRace(client, raceId);
        if (!race)
            return { ok: false, error: "not_found" };
        await advance(client, race, now);
        if (!bettingOpen(race, now))
            return { ok: false, error: "betting_closed" };
        if (race.entries.length < RACE_MIN_RIDERS)
            return { ok: false, error: "too_few_riders" };
        if (race.entries.some((entry) => entry.playerId === playerId))
            return { ok: false, error: "riding_this_race" };
        if (!race.entries.some((entry) => entry.playerId === input?.riderId))
            return { ok: false, error: "unknown_rider" };
        const mine = race.bets.filter((bet) => bet.playerId === playerId);
        if (mine.length >= RACE_BETS_PER_PLAYER)
            return { ok: false, error: "too_many_bets" };
        const totals = await dailyTotals(client, playerId, now);
        if (totals.spent + amount > RACE_DAILY_SPEND_LIMIT)
            return { ok: false, error: "daily_spend_limit" };
        const paid = await take(client, race, playerId, "bet", amount, `farm:race:bet:${race.id}:${playerId}:${mine.length + 1}`);
        if (!paid.ok)
            return paid;
        race.bets = [...race.bets, { playerId, name: cleanName(input?.name, "Punter"), riderId: String(input.riderId), amount, at: now }];
        await saveRace(client, race);
        return { ok: true, race: view(race, playerId, secret, now), ...(paid.balance >= 0 ? { balance: paid.balance } : {}) };
    });
}
/**
 * The race room's signed finish order, handed in by any rider. It must verify
 * against the shared secret and name only this race's riders. Pays the pot and
 * the pool, and each rider's Riding XP; idempotent (a settled race answers as
 * settled, and every payout's ledger key is the race's).
 */
export async function settleFarmRace(pool, input, now = Date.now(), secret = "") {
    const raceId = required(input?.raceId, "raceId");
    const result = normalizeRaceResult(input?.result);
    if (!result || result.raceId !== raceId)
        return { ok: false, error: "invalid_result" };
    if (!verifyRacePayload(secret, "result", result, input?.signature))
        return { ok: false, error: "invalid_signature" };
    return transaction(pool, async (client) => {
        const race = await lockedRace(client, raceId);
        if (!race)
            return { ok: false, error: "not_found" };
        if (race.status === "settled")
            return { ok: true, duplicate: true, race: view(race, String(input?.playerId ?? ""), secret, now) };
        if (race.status !== "running" && race.status !== "closing")
            return { ok: false, error: "not_running" };
        const riders = new Set(race.entries.map((entry) => entry.playerId));
        if (![...result.order, ...result.dnf].every((id) => riders.has(id)))
            return { ok: false, error: "invalid_result" };
        const { payouts } = raceSettlement(race.entries, race.bets, result.order);
        const paid = [];
        for (const payout of payouts) {
            const amount = await pay(client, race.id, payout, now);
            if (amount > 0)
                paid.push({ ...payout, amount });
        }
        const xpPaid = {};
        // Riding XP for every rider, locking their farms in id order.
        for (const playerId of [...riders].sort()) {
            const farm = await lockedFarm(client, playerId);
            if (!farm)
                continue;
            const skills = normalizeFarmSkillRecords(farm.layout.skills);
            const place = result.order.indexOf(playerId) + 1;
            const xp = raceXp(place, race.entries.length);
            const riding = { ...skills.riding, xp: skills.riding.xp + xp, races: skills.riding.races + 1, wins: skills.riding.wins + (place === 1 ? 1 : 0) };
            const next = normalizeFarmGarage({ ...farm.layout, skills: { ...skills, riding } }, { ownedEntitlementIds: farm.owned });
            await saveFarm(client, playerId, next);
            xpPaid[playerId] = xp;
        }
        race.status = "settled";
        race.result = result;
        race.payouts = paid;
        race.xp = xpPaid;
        await saveRace(client, race, { settled: true });
        return { ok: true, race: view(race, String(input?.playerId ?? ""), secret, now) };
    });
}
