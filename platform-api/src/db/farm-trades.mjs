// Player trading, server side: the only way goods move from one farm to another.
//
// A trade is one `farm_trades` row. Its columns are what the database needs to
// find it (who, status, when); its `state` is the whole table as the pure rules
// in services/farm-trade-policy.mts describe it — offers, locks, confirmations,
// revision and an audit trail of every move. Every move is one transaction that
// locks the row, lets the policy decide, and writes back what it says.
//
// The move that completes a trade — the second confirmation — also runs the
// exchange inside the same transaction: both farms are locked (in player-id
// order, so two exchanges can never wait on each other), both offers are checked
// against the STORED inventories (furniture against the shelf), the goods cross
// over, and both farms are saved. If anything is no longer true, nothing moves
// and the table goes back to open with the reason. Tickets are never touched.
//
// Clients poll: `current` finds the one trade a player is in, `get` follows it
// to its end (and hands back the farm as it stands once it completed).
import { randomUUID } from "node:crypto";
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { DAILY_TRADE_LIMIT, TRADE_ID, TRADE_INVITES_PER_WINDOW, TRADE_INVITE_WINDOW_MS, TRADE_PLAYER_ID, applyTradeAction, completeFarmTrade, expireFarmTrade, farmTradeView, isActiveTrade, newFarmTrade, normalizeTradeAction, normalizeTradeState, reopenFarmTrade, settleFarmTrade, tradeDayStart, tradeShortfall, tradeableStock, } from "../services/farm-trade-policy.mjs";
import { lockedFarm, saveFarm, transaction } from "./farm-economy.mjs";
import { lockedCreel } from "./farm-fishing.mjs";
import { CREEL_CAPACITY } from "../services/farm-fish-catalog.mjs";
/** The fish ids a player could put on a table: in their creel, not locked. */
async function tradeableFishIds(client, playerId) {
    const result = await client.query(`select fish_id from farm_fish where player_id = $1 and state = 'creel' and locked = false`, [playerId]);
    return (result.rows ?? []).map((row) => String(row.fish_id));
}
function required(value, field) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text)
        throw new TypeError(`${field} is required`);
    return text;
}
async function writeTrade(client, state) {
    await client.query(`update farm_trades set status = $2, state = $3::jsonb, updated_at = $4, completed_at = $5 where id = $1`, [state.id, state.status, JSON.stringify(state), new Date(state.updatedAt), state.completedAt ? new Date(state.completedAt) : null]);
}
/** Every trade row a player is in that is still invited or open, expired in memory where time has run out. */
async function activeTradesOf(client, playerId, now) {
    const result = await client.query(`select state from farm_trades where status in ('invited', 'open') and (initiator_id = $1 or partner_id = $1)`, [playerId]);
    const trades = [];
    for (const row of result.rows ?? []) {
        const stored = normalizeTradeState(row.state);
        if (!stored)
            continue;
        const state = expireFarmTrade(stored, now);
        trades.push({ state, stale: state !== stored });
    }
    return trades;
}
async function storedFarm(client, playerId) {
    const result = await client.query(`select garage from game_loadouts where player_id = $1 and game_slug = 'farm'`, [playerId]);
    const row = result.rows?.[0];
    if (!row)
        return null;
    const layout = normalizeFarmGarage(row.garage);
    return layout.onboarding?.status === "complete" ? layout : null;
}
async function completedToday(client, playerId, now) {
    const result = await client.query(`select count(*)::int as count from farm_trades where status = 'completed' and completed_at >= $2 and (initiator_id = $1 or partner_id = $1)`, [playerId, new Date(tradeDayStart(now))]);
    return Number(result.rows?.[0]?.count) || 0;
}
async function profileNames(client, playerIds) {
    const result = await client.query(`select player_id, profile_name from player_profiles where player_id = any($1::text[])`, [playerIds]);
    return new Map((result.rows ?? []).map((row) => [String(row.player_id), String(row.profile_name ?? "")]));
}
/** POST /games/farm/trades — invite another farmer to the table. */
export async function inviteFarmTrade(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const partnerId = typeof input?.partnerId === "string" ? input.partnerId.trim() : "";
    if (!TRADE_PLAYER_ID.test(partnerId))
        return { ok: false, error: "partner_unavailable" };
    if (partnerId === playerId)
        return { ok: false, error: "self_trade" };
    return transaction(pool, async (client) => {
        // Both players' trade slots are decided under one lock each, taken in a fixed order,
        // so two farmers inviting each other at the same instant cannot both open a table.
        for (const id of [playerId, partnerId].sort())
            await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`farm-trade:${id}`]);
        for (const id of [playerId, partnerId]) {
            for (const { state, stale } of await activeTradesOf(client, id, now)) {
                if (stale) {
                    await writeTrade(client, state);
                    continue;
                }
                return { ok: false, error: id === playerId ? "already_trading" : "partner_busy" };
            }
        }
        const recent = await client.query(`select count(*)::int as count from farm_trades where initiator_id = $1 and created_at > $2`, [playerId, new Date(now - TRADE_INVITE_WINDOW_MS)]);
        if ((Number(recent.rows?.[0]?.count) || 0) >= TRADE_INVITES_PER_WINDOW)
            return { ok: false, error: "too_many_invites" };
        if (!await storedFarm(client, playerId))
            return { ok: false, error: "farm_not_initialized" };
        if (!await storedFarm(client, partnerId))
            return { ok: false, error: "partner_unavailable" };
        if (await completedToday(client, playerId, now) >= DAILY_TRADE_LIMIT)
            return { ok: false, error: "daily_limit" };
        const names = await profileNames(client, [playerId, partnerId]);
        const state = newFarmTrade({
            id: `trade-${randomUUID()}`,
            a: { playerId, name: names.get(playerId) || "A farmer" },
            b: { playerId: partnerId, name: names.get(partnerId) || "A farmer" },
            now,
        });
        await client.query(`insert into farm_trades (id, initiator_id, partner_id, status, state, created_at, updated_at) values ($1, $2, $3, $4, $5::jsonb, $6, $6)`, [state.id, playerId, partnerId, state.status, JSON.stringify(state), new Date(now)]);
        return { ok: true, trade: farmTradeView(state, playerId) };
    });
}
/** GET /games/farm/trades/current — the one table this player is at (an invitation to them included), or null. */
export async function getCurrentFarmTrade(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const live = (await activeTradesOf(pool, playerId, now)).filter(({ state }) => isActiveTrade(state));
    live.sort((left, right) => right.state.createdAt - left.state.createdAt);
    return { trade: live[0] ? farmTradeView(live[0].state, playerId) : null };
}
/** GET /games/farm/trades/:id — one trade followed to its end; a completed one brings this player's farm as it now stands. */
export async function getFarmTrade(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const tradeId = typeof input?.tradeId === "string" ? input.tradeId : "";
    if (!TRADE_ID.test(tradeId))
        return { ok: false, error: "not_found" };
    const result = await pool.query(`select state from farm_trades where id = $1`, [tradeId]);
    const stored = normalizeTradeState(result.rows?.[0]?.state);
    const state = stored ? expireFarmTrade(stored, now) : null;
    const view = state ? farmTradeView(state, playerId) : null;
    if (!view)
        return { ok: false, error: "not_found" };
    const layout = state.status === "completed" ? await storedFarm(pool, playerId) : null;
    return { ok: true, trade: view, ...(layout ? { layout } : {}) };
}
/**
 * POST /games/farm/trades/:id/actions — one move on the table: accept, decline,
 * cancel, offer, lock, unlock or confirm. An offer is checked against the
 * player's STORED stock when it is made (so nobody locks a table with goods
 * they do not have); the confirm that completes the trade runs the exchange.
 */
export async function actOnFarmTrade(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const tradeId = typeof input?.tradeId === "string" ? input.tradeId : "";
    if (!TRADE_ID.test(tradeId))
        return { ok: false, error: "not_found" };
    const action = normalizeTradeAction(input?.action);
    if (!action)
        return { ok: false, error: "invalid_action" };
    return transaction(pool, async (client) => {
        const result = await client.query(`select state from farm_trades where id = $1 for update`, [tradeId]);
        const stored = normalizeTradeState(result.rows?.[0]?.state);
        if (!stored || !farmTradeView(stored, playerId))
            return { ok: false, error: "not_found" };
        const current = expireFarmTrade(stored, now);
        if (current !== stored) {
            await writeTrade(client, current);
            return { ok: false, error: "trade_expired", trade: farmTradeView(current, playerId) };
        }
        const refuse = (error, extra = {}) => ({ ok: false, error, ...extra, trade: farmTradeView(current, playerId) });
        if (action.type === "offer") {
            const farm = await storedFarm(client, playerId);
            if (!farm)
                return refuse("farm_not_initialized");
            const short = tradeShortfall(action.offer, tradeableStock(farm, await tradeableFishIds(client, playerId)));
            if (short)
                return refuse("not_enough", { stack: short.stack, itemId: short.id, held: short.held });
        }
        const step = applyTradeAction(current, playerId, action, now);
        if (!step.ok)
            return refuse(step.error);
        if (action.type === "accept" && !step.duplicate) {
            // Accepting takes the invitee's one trade slot: they may not already be at another table.
            await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`farm-trade:${playerId}`]);
            const elsewhere = (await activeTradesOf(client, playerId, now)).some(({ state }) => state.id !== current.id && isActiveTrade(state));
            if (elsewhere)
                return refuse("already_trading");
        }
        if (step.duplicate) {
            const layout = current.status === "completed" ? await storedFarm(client, playerId) : null;
            return { ok: true, duplicate: true, trade: farmTradeView(current, playerId), ...(layout ? { layout } : {}) };
        }
        if (!step.settle) {
            await writeTrade(client, step.state);
            return { ok: true, duplicate: false, trade: farmTradeView(step.state, playerId) };
        }
        const settled = await settle(client, step.state, now);
        await writeTrade(client, settled.state);
        const mine = settled.layouts?.get(playerId);
        const view = farmTradeView(settled.state, playerId);
        return {
            ok: settled.state.status === "completed",
            // A notice about one side is worded from the caller's side, as the view words it.
            ...(settled.state.status === "completed" ? { duplicate: false } : { error: view.notice }),
            trade: view,
            ...(mine ? { layout: mine } : {}),
        };
    });
}
/** The exchange, inside the confirming move's transaction. */
async function settle(client, state, now) {
    for (const id of [state.a.playerId, state.b.playerId]) {
        if (await completedToday(client, id, now) >= DAILY_TRADE_LIMIT)
            return { state: reopenFarmTrade(state, "daily_limit", now) };
    }
    const farms = new Map();
    for (const id of [state.a.playerId, state.b.playerId].sort()) {
        const farm = await lockedFarm(client, id);
        if (!farm || farm.layout.onboarding?.status !== "complete")
            return { state: reopenFarmTrade(state, "farm_not_initialized", now) };
        farms.set(id, farm);
    }
    const farmA = farms.get(state.a.playerId);
    const farmB = farms.get(state.b.playerId);
    // The creels are locked in the same order as the farms, and only unlocked fish can cross.
    const creels = new Map();
    for (const id of [state.a.playerId, state.b.playerId].sort())
        creels.set(id, await lockedCreel(client, id));
    const unlocked = (id) => (creels.get(id) ?? []).filter((row) => !row.locked).map((row) => String(row.fish_id));
    const exchange = settleFarmTrade(farmA.layout, farmB.layout, state.a.offer, state.b.offer, unlocked(state.a.playerId), unlocked(state.b.playerId));
    if (!exchange.ok)
        return { state: reopenFarmTrade(state, exchange.error === "offer_gone" ? `offer_gone_${exchange.side}` : `inventory_full_${exchange.side}`, now) };
    const fishA = Object.keys(state.a.offer.fish ?? {});
    const fishB = Object.keys(state.b.offer.fish ?? {});
    // Nobody's creel may overflow with what they are handed.
    for (const [side, id, incoming, outgoing] of [["a", state.a.playerId, fishB.length, fishA.length], ["b", state.b.playerId, fishA.length, fishB.length]]) {
        if ((creels.get(id)?.length ?? 0) - outgoing + incoming > CREEL_CAPACITY)
            return { state: reopenFarmTrade(state, `creel_full_${side}`, now) };
    }
    // A fish changes hands as the same row. It drops the shadow it came from: that
    // link only stops its catcher landing one shadow twice, and the new owner may have landed it too.
    for (const [ids, to] of [[fishA, state.b.playerId], [fishB, state.a.playerId]]) {
        if (!ids.length)
            continue;
        await client.query(`update farm_fish set player_id = $2, locked = false, shadow_id = null where fish_id = any($1::text[]) and state = 'creel'`, [ids, to]);
    }
    const layouts = new Map();
    for (const [id, farm, inventory] of [[state.a.playerId, farmA, exchange.a], [state.b.playerId, farmB, exchange.b]]) {
        const next = normalizeFarmGarage({
            ...farm.layout,
            agriculture: { ...farm.layout.agriculture, inventory },
        }, { ownedEntitlementIds: farm.owned });
        await saveFarm(client, id, next);
        layouts.set(id, next);
    }
    return { state: completeFarmTrade(state, now), layouts };
}
