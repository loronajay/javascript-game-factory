// The workshop, server side: the only ways a plank or a piece of furniture
// enters a farm.
//
// MILLING saws logs into planks (services/farm-carpentry-catalog). It happens
// in one of two places, and the difference is money and nothing else:
//   - at the Market Square's Sawmill stall, which charges a small fee per log
//     and reads the farm as STORED (the farm is saved before the gate lets the
//     player out onto the road, the same standing a produce sale has);
//   - at the farm's own Sawmill, a ticket purchase that mills for free. Here
//     the client sends its farm as it stands, the way a harvest does, and the
//     server holds it to the save guard and checks a Sawmill really stands on it.
//
// CRAFTING is shaped like a cook (db/farm-kitchen.mts): the client sends its
// farm, names a pattern and reports how each step went; inside one locked
// transaction the server checks the pattern is taught at the STORED Carpentry
// level, a Workbench stands on the farm, the STORED planks cover it, and the
// ticket part of a fine piece is paid — then puts one piece of the stars its
// own rule gives those scores into `inventory.furniture` and pays the XP.
//
// Both are retry-safe by id: the Carpentry record remembers the latest ids,
// and a request whose id is among them does nothing and says so. The canonical
// farm comes back either way.

import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { farmingLevelForXp, farmingSummary, normalizeFarmSkillRecords, recordFarmCraft, recordFarmMill } from "../services/farm-skill-catalog.mjs";
import {
  FARM_SAWMILL_ITEM_ID,
  FARM_WORKBENCH_ITEM_ID,
  MARKET_MILL_FEE_PER_LOG,
  MILL_XP_PER_LOG,
  PLANKS_PER_LOG,
  WORKSHOP_ID,
  farmPieceKey,
  farmPieceRule,
  farmPieceStars,
  normalizeCraftScores,
  normalizeMillRequest,
} from "../services/farm-carpentry-catalog.mjs";
import { awardServerAchievementsInTransaction } from "./achievements.mjs";
import { spendTicketsInTransaction } from "./tickets.mjs";
import { lockedFarm, saveFarm, transaction, verifiedSubmittedFarm } from "./farm-economy.mjs";

const MAX_STACK = 99;

function required(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new TypeError(`${field} is required`);
  return text;
}

async function balanceOf(client: any, playerId: string): Promise<number | null> {
  const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
  return wallet.rows?.[0] ? Number(wallet.rows[0].balance) || 0 : null;
}

function standsOn(layout: any, itemId: string): boolean {
  return (layout?.decor ?? []).some((row: any) => row?.itemId === itemId);
}

function factsOf(skills: ReturnType<typeof normalizeFarmSkillRecords>) {
  return { farming: skills.farming, woodcutting: skills.woodcutting, cooking: skills.cooking, carpentry: skills.carpentry };
}

/** POST /games/farm/workshop/mills — saw `logs` of one species into planks, at the market or at home. */
export async function millFarmLogs(pool: any, input: any, now: number = Date.now()) {
  const playerId = required(input?.playerId, "playerId");
  const millId = required(input?.millId, "millId");
  if (!WORKSHOP_ID.test(millId)) throw new TypeError("invalid millId");
  const request = normalizeMillRequest(input?.speciesId, input?.logs);
  if (!request) return { ok: false, error: "invalid_mill" };
  const atHome = input?.at === "farm";
  if (atHome && (!input?.layout || typeof input.layout !== "object")) throw new TypeError("layout is required");
  return transaction(pool, async (client) => {
    let farm: { layout: any; owned: Set<string> } | null;
    if (atHome) {
      const submitted = await verifiedSubmittedFarm(client, playerId, input.layout, now);
      farm = submitted ? { layout: submitted.verified, owned: submitted.owned } : null;
    } else {
      farm = await lockedFarm(client, playerId);
      if (farm && farm.layout.onboarding?.status !== "complete") farm = null;
    }
    if (!farm) return { ok: false, error: "farm_not_initialized" };
    const { layout: verified, owned } = farm;
    // At home the submitted farm has been verified, and that is what is now true, whatever happens to the mill.
    const answer = async (result: any) => {
      if (atHome) await saveFarm(client, playerId, result.layout);
      return result;
    };
    const skills = normalizeFarmSkillRecords(verified.skills);
    const before = skills.carpentry;
    if (before.recent.includes(millId)) {
      return answer({ ok: true, duplicate: true, ...request, planks: 0, fee: 0, xp: 0, balance: await balanceOf(client, playerId), carpentry: farmingSummary(before, before.xp), achievements: [], layout: verified });
    }
    if (atHome && !standsOn(verified, FARM_SAWMILL_ITEM_ID)) return answer({ ok: false, error: "no_sawmill", layout: verified });
    const inventory = verified.agriculture.inventory;
    const logs: Record<string, number> = { ...(inventory.logs ?? {}) };
    const planks: Record<string, number> = { ...(inventory.planks ?? {}) };
    const held = Number(logs[request.speciesId]) || 0;
    if (held < request.logs) return answer({ ok: false, error: "not_enough_logs", held, layout: verified });
    const sawn = request.logs * PLANKS_PER_LOG;
    if ((Number(planks[request.speciesId]) || 0) + sawn > MAX_STACK) return answer({ ok: false, error: "planks_full", layout: verified });
    const fee = atHome ? 0 : request.logs * MARKET_MILL_FEE_PER_LOG;
    let balance: number | null = null;
    if (fee > 0) {
      const spend = await spendTicketsInTransaction(client, {
        playerId, transactionKey: `farm:mill:${millId}`, amount: fee, reason: "farm_sawmill_fee",
        metadata: { speciesId: request.speciesId, logs: request.logs },
      });
      if (!spend.ok) return answer({ ok: false, error: spend.error, balance: spend.balance, fee, layout: verified });
      balance = spend.balance;
    }
    logs[request.speciesId] = held - request.logs;
    planks[request.speciesId] = (Number(planks[request.speciesId]) || 0) + sawn;
    const xp = (MILL_XP_PER_LOG[request.speciesId] ?? 0) * request.logs;
    const carpentry = recordFarmMill(before, request.logs, xp, millId);
    const next = normalizeFarmGarage({
      ...verified,
      agriculture: { ...verified.agriculture, inventory: { ...inventory, logs, planks } },
      skills: { ...skills, carpentry },
    }, { ownedEntitlementIds: owned });
    await saveFarm(client, playerId, next);
    const achievements = await awardServerAchievementsInTransaction(client, {
      playerId, gameSlug: "farm", facts: factsOf({ ...skills, carpentry }), sourceId: `mill:${millId}`,
    });
    return {
      ok: true, duplicate: false, ...request, planks: sawn, fee, xp,
      balance: balance ?? await balanceOf(client, playerId),
      carpentry: farmingSummary(carpentry, before.xp), achievements, layout: next,
    };
  });
}

/** POST /games/farm/workshop/crafts — make one piece at the Workbench; the stars are the server's. */
export async function craftFarmPiece(pool: any, input: any, now: number = Date.now()) {
  const playerId = required(input?.playerId, "playerId");
  const craftId = required(input?.craftId, "craftId");
  if (!WORKSHOP_ID.test(craftId)) throw new TypeError("invalid craftId");
  if (!input?.layout || typeof input.layout !== "object") throw new TypeError("layout is required");
  const itemId = typeof input?.itemId === "string" ? input.itemId : "";
  const rule = farmPieceRule(itemId);
  if (!rule) return { ok: false, error: "unknown_piece" };
  const scores = normalizeCraftScores(input?.scores, rule.steps);
  if (!scores) return { ok: false, error: "invalid_craft" };
  return transaction(pool, async (client) => {
    const farm = await verifiedSubmittedFarm(client, playerId, input.layout, now);
    if (!farm) return { ok: false, error: "farm_not_initialized" };
    const { verified, owned } = farm;
    const answer = async (result: any) => {
      await saveFarm(client, playerId, result.layout);
      return result;
    };
    const skills = normalizeFarmSkillRecords(verified.skills);
    const before = skills.carpentry;
    if (before.recent.includes(craftId)) {
      return answer({ ok: true, duplicate: true, itemId, stars: 0, xp: 0, carpentry: farmingSummary(before, before.xp), achievements: [], layout: verified });
    }
    if (!standsOn(verified, FARM_WORKBENCH_ITEM_ID)) return answer({ ok: false, error: "no_workbench", layout: verified });
    const level = farmingLevelForXp(before.xp);
    if (level < rule.minLevel) return answer({ ok: false, error: "level_too_low", minLevel: rule.minLevel, level, layout: verified });
    const inventory = verified.agriculture.inventory;
    const planks: Record<string, number> = { ...(inventory.planks ?? {}) };
    for (const [speciesId, need] of Object.entries(rule.planks)) {
      const held = Number(planks[speciesId]) || 0;
      if (held < need) return answer({ ok: false, error: "not_enough_planks", speciesId, held, layout: verified });
      planks[speciesId] = held - need;
    }
    const stars = farmPieceStars(scores);
    const key = farmPieceKey(itemId, stars);
    const furniture: Record<string, number> = { ...(inventory.furniture ?? {}) };
    if ((Number(furniture[key]) || 0) >= MAX_STACK) return answer({ ok: false, error: "workshop_full", layout: verified });
    let balance: number | null = null;
    if (rule.tickets > 0) {
      const spend = await spendTicketsInTransaction(client, {
        playerId, transactionKey: `farm:craft:${craftId}`, amount: rule.tickets, reason: "farm_craft_materials",
        metadata: { itemId },
      });
      if (!spend.ok) return answer({ ok: false, error: spend.error, balance: spend.balance, tickets: rule.tickets, layout: verified });
      balance = spend.balance;
    }
    furniture[key] = (Number(furniture[key]) || 0) + 1;
    const carpentry = recordFarmCraft(before, itemId, rule.xp, stars, craftId);
    const layout = normalizeFarmGarage({
      ...verified,
      agriculture: { ...verified.agriculture, inventory: { ...inventory, planks, furniture } },
      skills: { ...skills, carpentry },
    }, { ownedEntitlementIds: owned });
    const achievements = await awardServerAchievementsInTransaction(client, {
      playerId, gameSlug: "farm", facts: factsOf({ ...skills, carpentry }), sourceId: `craft:${craftId}`,
    });
    return answer({
      ok: true, duplicate: false, itemId, stars, xp: rule.xp, tickets: rule.tickets, balance,
      carpentry: farmingSummary(carpentry, before.xp), achievements, layout,
    });
  });
}
