import { getConsumableOffer, selectRandomUnownedSkins } from "../services/consumable-catalog.mjs";
import { normalizeInventoryGrants } from "../services/game-inventory-catalog.mjs";
import { SKIN_CATALOG } from "../services/payments.mjs";
import { TACTICAL_ARENA_TUTORIAL_IDS, } from "../services/tactical-arena-reward-catalog.mjs";
import { isPremiumGameClaimKind, isPublicGameClaimKind, isRegisteredGameClaimKind, validatePublicGameClaim, } from "../services/game-progress-claim-catalog.mjs";
import { getValorOffer, priceValorOffer } from "../services/valor-catalog.mjs";
import { awardCampaignXp, getGameXpProgress } from "./game-xp.mjs";
import { isYamBowlingStarterBowler, validateYamBowlingSkinVoucherTarget, validateYamBowlingEmoteVoucherTarget, } from "../services/yam-bowling-reward-catalog.mjs";
import { getYamBowlingTournamentEvent, selectYamBowlingTournamentPrize, YAM_BOWLING_TOURNAMENT_KIND, YAM_BOWLING_TOURNAMENT_TITLE, } from "../services/yam-bowling-tournament-catalog.mjs";
const VALID_GAME_SLUG = /^[a-z0-9-]{1,60}$/;
// The kinds a refund/chargeback can trace back to through findStripeGrant, so generic
// revocation can find what was granted.
//
// The calendar preorder bonus is deliberately NOT here. Its claim is scoped to the promotion
// rather than to one purchase, so the payment intent recorded on it belongs to whichever
// order happened to trigger it first. Matching refunds against that claim would let a
// generic revocation and the calendar's own revocation both fire on the same grant, and
// would attribute the bonus to the wrong order once a player buys twice. calendar_orders
// records which order actually paid the bonus, so the calendar path revokes from there.
const PREMIUM_GRANT_CLAIM_KINDS = [
    "premium-skin-purchase",
    "premium-unit-purchase",
    "premium-consumable-purchase",
];
// The kinds whose payload carries inventory quantity rather than entitlements. Listed once
// so a new paid item grant is a row here, not a fourth branch that forgets to be revocable.
const INVENTORY_GRANT_CLAIM_KINDS = [
    "premium-consumable-purchase",
    "premium-calendar-preorder",
];
// A single purchase may never add more than this much of one consumable, whatever a
// (future) multi-quantity payload claims.
const MAX_CONSUMABLE_PURCHASE_QUANTITY = 99;
function cleanText(value, maxLength = 200) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function normalizeGameSlug(value) {
    const slug = cleanText(value, 60).toLowerCase();
    return VALID_GAME_SLUG.test(slug) ? slug : "";
}
function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number))
        return min;
    return Math.max(min, Math.min(max, number));
}
function normalizePayload(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}
function rowToEntitlement(row) {
    return {
        entitlementId: row.entitlement_id,
        kind: row.kind,
        source: row.source,
        sourceId: row.source_id || "",
        quantity: Number(row.quantity) || 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function rowToCampaignProgress(row) {
    return {
        missionId: row.mission_id,
        stars: Number(row.stars) || 0,
        completedAt: row.completed_at,
        valorClaimedAt: row.valor_claimed_at,
        rewardClaimedAt: row.reward_claimed_at,
    };
}
function rowToInventoryItem(row) {
    return {
        itemId: row.item_id,
        quantity: Number(row.quantity) || 0,
        updatedAt: row.updated_at,
    };
}
function buildSkinEntitlement(payload) {
    const type = cleanText(payload.type, 80);
    const slug = cleanText(payload.slug, 120);
    if (!type || !slug)
        return null;
    return {
        entitlementId: cleanText(payload.entitlementId, 180) || `skin:${type}:${slug}`,
        kind: "skin",
    };
}
// A skin purchase grants the skins themselves, and a PACK purchase also grants a
// `skin-pack:<packId>` marker. The marker owns no content — it is the durable record that
// the bundle was bought, which badge rules read to tell a pack buyer apart from someone
// who happened to buy the same skins individually.
function buildSkinPurchaseEntitlements(payload) {
    const rawEntitlementIds = [
        payload.entitlementId,
        ...(Array.isArray(payload.entitlementIds) ? payload.entitlementIds : []),
    ];
    const entitlementIds = [...new Set(rawEntitlementIds.map((value) => cleanText(value, 180)).filter(Boolean))];
    return entitlementIds
        .map((entitlementId) => {
        if (entitlementId.startsWith("skin:"))
            return { entitlementId, kind: "skin" };
        if (entitlementId.startsWith("skin-pack:"))
            return { entitlementId, kind: "skin-pack" };
        return null;
    })
        .filter(Boolean);
}
function buildUnitPurchaseEntitlements(payload) {
    const rawEntitlementIds = [
        payload.entitlementId,
        ...(Array.isArray(payload.entitlementIds) ? payload.entitlementIds : []),
    ];
    const entitlementIds = [...new Set(rawEntitlementIds.map((value) => cleanText(value, 180)).filter(Boolean))];
    return entitlementIds
        .filter((entitlementId) => entitlementId.startsWith("unit:"))
        .map((entitlementId) => ({ entitlementId, kind: "unit" }));
}
function buildUnitEntitlement(payload) {
    const type = cleanText(payload.type, 80);
    if (!type)
        return null;
    return {
        entitlementId: cleanText(payload.entitlementId, 180) || `unit:${type}`,
        kind: "unit",
    };
}
async function ensureGameProgressProfile(client, playerId, gameSlug) {
    await client.query(`insert into game_progress_profiles (player_id, game_slug)
     values ($1, $2)
     on conflict (player_id, game_slug) do nothing`, [playerId, gameSlug]);
}
// True when a claim was built before a campaign reset this player has since performed.
// Such a claim describes a campaign the player deliberately cleared, so honoring it would
// resurrect exactly the progress the reset removed. A claim with no epoch reads as 0,
// which is also every un-reset account's epoch — so nothing existing is treated as stale.
async function isStaleCampaignClaim(client, playerId, gameSlug, claimEpoch) {
    const claimed = clampInt(claimEpoch, { min: 0, max: 1_000_000 });
    const result = await client.query(`select campaign_epoch from game_progress_profiles where player_id = $1 and game_slug = $2`, [playerId, gameSlug]);
    return claimed < (Number(result.rows[0]?.campaign_epoch) || 0);
}
async function markCampaignProgress(client, playerId, gameSlug, missionId, patch = {}) {
    const stars = clampInt(patch.stars, { min: 0, max: 3 });
    const valorClaimedAt = patch.valorClaimedAt || null;
    const rewardClaimedAt = patch.rewardClaimedAt || null;
    await client.query(`insert into game_campaign_progress
      (player_id, game_slug, mission_id, stars, completed_at, valor_claimed_at, reward_claimed_at)
     values ($1, $2, $3, $4, now(), $5, $6)
     on conflict (player_id, game_slug, mission_id) do update
       set stars = greatest(game_campaign_progress.stars, excluded.stars),
           completed_at = coalesce(game_campaign_progress.completed_at, excluded.completed_at),
           valor_claimed_at = coalesce(game_campaign_progress.valor_claimed_at, excluded.valor_claimed_at),
           reward_claimed_at = coalesce(game_campaign_progress.reward_claimed_at, excluded.reward_claimed_at),
           updated_at = now()`, [playerId, gameSlug, missionId, stars, valorClaimedAt, rewardClaimedAt]);
}
async function hasPublicClaimPrerequisite(client, playerId, gameSlug, prerequisite) {
    if (!prerequisite)
        return true;
    if (prerequisite.kind === "all-tutorials") {
        const result = await client.query(`select source_id from game_progress_claims
       where player_id = $1 and game_slug = $2 and kind = 'tutorial-complete'
         and source_id = any($3::text[])`, [playerId, gameSlug, TACTICAL_ARENA_TUTORIAL_IDS]);
        const completed = new Set(result.rows.map((row) => cleanText(row.source_id, 200)));
        return TACTICAL_ARENA_TUTORIAL_IDS.every((tutorialId) => completed.has(tutorialId));
    }
    if (prerequisite.kind === "campaign-mission") {
        const result = await client.query(`select 1 from game_campaign_progress
       where player_id = $1 and game_slug = $2 and mission_id = $3 limit 1`, [playerId, gameSlug, prerequisite.missionId]);
        return result.rows.length > 0;
    }
    return false;
}
// Valor boosts are paid consumables, so ignoring them would take away a purchased benefit.
// Their activation records already live on the server. Start pending boosts at the first
// campaign payout and price the bonus from the server catalog; the client-supplied amount is
// never trusted. Legacy activation rows without timing data are treated as pending once so
// deploying this during closed testing does not erase an already purchased boost.
async function campaignValorAmountWithServerBoosts(client, playerId, gameSlug, baseAmount) {
    const result = await client.query(`select claim_id, source_id, payload from game_progress_claims
     where player_id = $1 and game_slug = $2 and kind = 'consumable-activation'`, [playerId, gameSlug]);
    const now = new Date();
    let percentBonus = 0;
    for (const row of result.rows) {
        const input = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
        const offer = getConsumableOffer(input.itemId || row.source_id);
        if (offer?.effect?.kind !== "valor-boost")
            continue;
        const startsAt = cleanText(input.boostStartsAt, 80) || now.toISOString();
        const expiresAt = cleanText(input.boostExpiresAt, 80)
            || new Date(new Date(startsAt).getTime() + (Number(offer.durationHours) || 0) * 60 * 60 * 1000).toISOString();
        if (!input.boostStartsAt || !input.boostExpiresAt) {
            await client.query(`update game_progress_claims set payload = $4::jsonb
         where player_id = $1 and game_slug = $2 and claim_id = $3`, [playerId, gameSlug, row.claim_id, JSON.stringify({ ...input, itemId: offer.id, boostStartsAt: startsAt, boostExpiresAt: expiresAt })]);
        }
        if (Date.parse(startsAt) <= now.getTime() && Date.parse(expiresAt) > now.getTime()) {
            percentBonus += Math.max(0, Number(offer.effect.percentBonus) || 0);
        }
    }
    return baseAmount + Math.floor(baseAmount * percentBonus / 100);
}
// Normalize the inventory grants carried on a paid claim payload. Item ids are validated
// against the *game's own* grantable-item policy, so a tampered payload can never invent an
// item or borrow another cabinet's. Validating against one cabinet's catalog used to drop a
// second cabinet's item silently, which paid the money and granted nothing.
function buildInventoryGrants(gameSlug, payload) {
    return normalizeInventoryGrants(gameSlug, payload?.inventoryItems);
}
async function grantInventoryItem(client, playerId, gameSlug, itemId, quantity) {
    await client.query(`insert into game_inventory_items (player_id, game_slug, item_id, quantity)
     values ($1, $2, $3, $4)
     on conflict (player_id, game_slug, item_id) do update
       set quantity = game_inventory_items.quantity + excluded.quantity,
           updated_at = now()`, [playerId, gameSlug, itemId, quantity]);
}
// Take back consumable quantity after a refund/chargeback. Clamped at zero because the
// player may already have spent some of it — what was spent is gone, but the unspent
// remainder is removed.
async function revokeInventoryItem(client, playerId, gameSlug, itemId, quantity) {
    const res = await client.query(`update game_inventory_items
     set quantity = greatest(0, quantity - $4), updated_at = now()
     where player_id = $1 and game_slug = $2 and item_id = $3
     returning quantity`, [playerId, gameSlug, itemId, quantity]);
    return res.rows.length ? Number(res.rows[0].quantity) || 0 : 0;
}
// Does this player hold this exact entitlement? Used to re-validate a cosmetic pick (e.g. a
// purchased ranked avatar) server-side before storing it, the same way playerHasGameBadge
// re-validates a badge equip.
export async function playerHasGameEntitlement(pool, { playerId, gameSlug, entitlementId }) {
    if (!pool || !playerId || !gameSlug || !entitlementId)
        return false;
    const res = await pool.query(`select 1 from game_entitlements where player_id = $1 and game_slug = $2 and entitlement_id = $3 limit 1`, [playerId, gameSlug, entitlementId]);
    return res.rowCount > 0;
}
async function grantEntitlement(client, playerId, gameSlug, entitlement, source, sourceId) {
    await client.query(`insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (player_id, game_slug, entitlement_id) do update
       set quantity = greatest(game_entitlements.quantity, excluded.quantity),
           updated_at = now()`, [playerId, gameSlug, entitlement.entitlementId, entitlement.kind, source, sourceId]);
}
export function isValidGameProgressSlug(value) {
    return Boolean(normalizeGameSlug(value));
}
export function isValidGameClaimKind(gameSlug, value) {
    return isRegisteredGameClaimKind(normalizeGameSlug(gameSlug), value);
}
// A claim kind that untrusted (public-route) callers are allowed to submit.
// Premium purchase kinds are excluded — those are Stripe-fulfillment only.
export function isPubliclyClaimableKind(gameSlug, value) {
    return isPublicGameClaimKind(normalizeGameSlug(gameSlug), value);
}
export async function getGameProgress(pool, playerId, gameSlug) {
    const normalizedPlayerId = cleanText(playerId, 120);
    const normalizedGameSlug = normalizeGameSlug(gameSlug);
    if (!pool || !normalizedPlayerId || !normalizedGameSlug)
        return null;
    try {
        const [profile, entitlements, campaignProgress, inventoryItems, tutorials] = await Promise.all([
            pool.query(`select player_id, game_slug, valor_balance, campaign_epoch, created_at, updated_at
         from game_progress_profiles
         where player_id = $1 and game_slug = $2`, [normalizedPlayerId, normalizedGameSlug]),
            pool.query(`select entitlement_id, kind, source, source_id, quantity, created_at, updated_at
         from game_entitlements
         where player_id = $1 and game_slug = $2
         order by entitlement_id asc`, [normalizedPlayerId, normalizedGameSlug]),
            pool.query(`select mission_id, stars, completed_at, valor_claimed_at, reward_claimed_at
         from game_campaign_progress
         where player_id = $1 and game_slug = $2
         order by mission_id asc`, [normalizedPlayerId, normalizedGameSlug]),
            pool.query(`select item_id, quantity, updated_at
         from game_inventory_items
         where player_id = $1 and game_slug = $2 and quantity > 0
         order by item_id asc`, [normalizedPlayerId, normalizedGameSlug]),
            // Tutorial completion has no table of its own — the claim row IS the record.
            // Reading it back is what lets a second device restore which tutorials are done.
            pool.query(`select source_id from game_progress_claims
         where player_id = $1 and game_slug = $2 and kind = 'tutorial-complete' and source_id <> ''
         order by source_id asc`, [normalizedPlayerId, normalizedGameSlug]),
        ]);
        const row = profile.rows[0] || {};
        return {
            playerId: normalizedPlayerId,
            gameSlug: normalizedGameSlug,
            valorBalance: Number(row.valor_balance) || 0,
            // How many times this player's campaign has been reset. Clients compare it against
            // the epoch they last saw to tell a reset apart from ordinary missing progress.
            campaignEpoch: Number(row.campaign_epoch) || 0,
            entitlements: entitlements.rows.map(rowToEntitlement),
            campaignProgress: campaignProgress.rows.map(rowToCampaignProgress),
            completedTutorials: tutorials.rows.map((tutorialRow) => cleanText(tutorialRow.source_id, 200)).filter(Boolean),
            inventoryItems: inventoryItems.rows.map(rowToInventoryItem),
            createdAt: row.created_at || null,
            updatedAt: row.updated_at || null,
        };
    }
    catch (err) {
        process.stderr.write(`[game-progress] getGameProgress error: ${err?.message || err}\n`);
        return null;
    }
}
export async function recordGameProgressClaim(pool, params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const gameSlug = normalizeGameSlug(params.gameSlug);
    const claimId = cleanText(params.claimId, 200);
    const kind = cleanText(params.kind, 80);
    let payload = normalizePayload(params.payload);
    let sourceId = cleanText(params.sourceId || payload.sessionId || payload.missionId || payload.packId || payload.tutorialId || "", 200);
    if (!pool || !playerId || !gameSlug || !claimId || !isRegisteredGameClaimKind(gameSlug, kind))
        return null;
    // Defense in depth: even if a premium kind reaches this layer, only the trusted
    // Stripe fulfillment path (allowPremiumKinds: true) may grant a paid entitlement.
    const premiumKind = isPremiumGameClaimKind(gameSlug, kind);
    if (premiumKind && params.allowPremiumKinds !== true) {
        process.stderr.write(`[game-progress] refused premium claim kind '${kind}' from untrusted caller (player=${playerId})\n`);
        return null;
    }
    let publicClaim = null;
    if (!premiumKind) {
        publicClaim = validatePublicGameClaim({ gameSlug, claimId, kind, sourceId, payload });
        if (!publicClaim.ok)
            return publicClaim;
        payload = publicClaim.payload;
        sourceId = publicClaim.sourceId;
    }
    const client = await pool.connect();
    try {
        await client.query("begin");
        await ensureGameProgressProfile(client, playerId, gameSlug);
        if (!await hasPublicClaimPrerequisite(client, playerId, gameSlug, publicClaim?.prerequisite)) {
            await client.query("rollback");
            return { ok: false, statusCode: 409, error: "claim_prerequisite_missing" };
        }
        if (publicClaim?.campaignXp && !isYamBowlingStarterBowler(publicClaim.campaignXp.trackId)) {
            const ownedBowler = await playerHasGameEntitlement(client, {
                playerId,
                gameSlug,
                entitlementId: `bowler:${publicClaim.campaignXp.trackId}`,
            });
            if (!ownedBowler) {
                await client.query("rollback");
                return { ok: false, statusCode: 409, error: "active_bowler_not_owned" };
            }
        }
        const claim = await client.query(`insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`, [playerId, gameSlug, claimId, kind, sourceId, JSON.stringify(payload)]);
        const alreadyProcessed = claim.rowCount === 0;
        if (!alreadyProcessed && Array.isArray(publicClaim?.entitlementGrants)) {
            for (const entitlement of publicClaim.entitlementGrants) {
                await grantEntitlement(client, playerId, gameSlug, entitlement, kind === "match-achievement" ? "achievement" : "campaign", sourceId || claimId);
            }
        }
        if (!alreadyProcessed && publicClaim?.campaignProgress) {
            await markCampaignProgress(client, playerId, gameSlug, publicClaim.campaignProgress.missionId, {
                stars: publicClaim.campaignProgress.stars,
                rewardClaimedAt: Array.isArray(publicClaim.entitlementGrants) && publicClaim.entitlementGrants.length
                    ? new Date().toISOString()
                    : null,
            });
        }
        if (!alreadyProcessed && publicClaim?.campaignXp) {
            const xpAward = await awardCampaignXp(client, {
                playerId,
                gameSlug,
                grantId: claimId,
                trackId: publicClaim.campaignXp.trackId,
                kind: publicClaim.campaignXp.kind,
                firstClear: true,
                source: "campaign-clear",
            });
            if (!xpAward.awarded && xpAward.reason !== "already-granted") {
                throw new Error(`campaign XP refused: ${xpAward.reason}`);
            }
        }
        if (!alreadyProcessed && kind === "campaign-valor") {
            const amount = await campaignValorAmountWithServerBoosts(client, playerId, gameSlug, publicClaim.valorBase);
            payload = { ...payload, amount };
            await client.query(`update game_progress_claims set payload = $4::jsonb
         where player_id = $1 and game_slug = $2 and claim_id = $3`, [playerId, gameSlug, claimId, JSON.stringify(payload)]);
            const missionId = cleanText(payload.missionId || sourceId, 200);
            if (amount > 0) {
                await client.query(`update game_progress_profiles
           set valor_balance = valor_balance + $3, updated_at = now()
           where player_id = $1 and game_slug = $2`, [playerId, gameSlug, amount]);
            }
            if (missionId) {
                await markCampaignProgress(client, playerId, gameSlug, missionId, {
                    stars: payload.stars,
                    valorClaimedAt: amount > 0 ? new Date().toISOString() : null,
                });
            }
        }
        else if (!alreadyProcessed && kind === "campaign-progress") {
            const missionId = cleanText(payload.missionId || sourceId, 200);
            // Stars only. markCampaignProgress takes greatest(existing, new), so replaying an
            // older result can never walk a player's best score backwards.
            //
            // The claim row is recorded either way — a stale device that keeps a queued claim
            // must be able to retire it — but a pre-reset claim is not allowed to write.
            const stale = await isStaleCampaignClaim(client, playerId, gameSlug, payload.campaignEpoch);
            if (missionId && !stale)
                await markCampaignProgress(client, playerId, gameSlug, missionId, { stars: payload.stars });
        }
        else if (!alreadyProcessed && kind === "campaign-skin-choice") {
            const missionId = cleanText(payload.missionId || sourceId, 200);
            const entitlement = buildSkinEntitlement(payload);
            if (entitlement)
                await grantEntitlement(client, playerId, gameSlug, entitlement, "campaign", sourceId || missionId);
            if (missionId)
                await markCampaignProgress(client, playerId, gameSlug, missionId, { stars: payload.stars, rewardClaimedAt: new Date().toISOString() });
        }
        else if (!alreadyProcessed && kind === "campaign-unit-choice") {
            const missionId = cleanText(payload.missionId || sourceId, 200);
            const entitlement = buildUnitEntitlement(payload);
            if (entitlement)
                await grantEntitlement(client, playerId, gameSlug, entitlement, "campaign", sourceId || missionId);
            if (missionId)
                await markCampaignProgress(client, playerId, gameSlug, missionId, { stars: payload.stars, rewardClaimedAt: new Date().toISOString() });
        }
        else if (!alreadyProcessed && kind === "tutorial-valor") {
            const amount = clampInt(payload.amount, { min: 0, max: 100000 });
            if (amount > 0) {
                await client.query(`update game_progress_profiles
           set valor_balance = valor_balance + $3, updated_at = now()
           where player_id = $1 and game_slug = $2`, [playerId, gameSlug, amount]);
            }
        }
        else if (!alreadyProcessed && kind === "tutorial-skin-choice") {
            const entitlement = buildSkinEntitlement(payload);
            if (entitlement)
                await grantEntitlement(client, playerId, gameSlug, entitlement, "tutorial", sourceId);
        }
        else if (!alreadyProcessed && kind === "tutorial-unit-reward") {
            const entitlement = buildUnitEntitlement(payload);
            if (entitlement)
                await grantEntitlement(client, playerId, gameSlug, entitlement, "tutorial", sourceId);
        }
        else if (!alreadyProcessed && kind === "premium-skin-purchase") {
            const entitlements = buildSkinPurchaseEntitlements(payload);
            for (const entitlement of entitlements) {
                await grantEntitlement(client, playerId, gameSlug, entitlement, "stripe", sourceId || claimId);
            }
        }
        else if (!alreadyProcessed && kind === "premium-unit-purchase") {
            const entitlements = buildUnitPurchaseEntitlements(payload);
            for (const entitlement of entitlements) {
                await grantEntitlement(client, playerId, gameSlug, entitlement, "stripe", sourceId || claimId);
            }
        }
        else if (!alreadyProcessed && INVENTORY_GRANT_CLAIM_KINDS.includes(kind)) {
            for (const grant of buildInventoryGrants(gameSlug, payload)) {
                await grantInventoryItem(client, playerId, gameSlug, grant.itemId, grant.quantity);
            }
        }
        await client.query("commit");
        const progression = publicClaim?.campaignXp
            ? await getGameXpProgress(pool, playerId, gameSlug)
            : undefined;
        return {
            ok: true,
            alreadyProcessed,
            progress: await getGameProgress(pool, playerId, gameSlug),
            entitlementIds: alreadyProcessed
                ? []
                : (publicClaim?.entitlementGrants || []).map((entry) => entry.entitlementId),
            ...(progression ? { progression } : {}),
        };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[game-progress] recordGameProgressClaim error: ${err?.message || err}\n`);
        return null;
    }
    finally {
        client.release();
    }
}
// Atomically spend Valor on an entitlement. The charge is computed server-side from the
// catalog (services/valor-catalog) — the client never supplies a price. The profile row is
// locked FOR UPDATE so concurrent spends cannot double-charge, and the balance check plus
// the `valor_balance >= 0` column constraint make an overspend impossible.
export async function spendValorForEntitlement(pool, params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const gameSlug = normalizeGameSlug(params.gameSlug);
    if (!pool || !playerId || !gameSlug)
        return { ok: false, statusCode: 400, error: "invalid_request" };
    const resolved = getValorOffer(params.offer);
    if (!resolved.ok)
        return resolved;
    const client = await pool.connect();
    try {
        await client.query("begin");
        await ensureGameProgressProfile(client, playerId, gameSlug);
        const profileRes = await client.query(`select valor_balance from game_progress_profiles
       where player_id = $1 and game_slug = $2 for update`, [playerId, gameSlug]);
        const valorBalance = Number(profileRes.rows[0]?.valor_balance) || 0;
        const requestedIds = resolved.entitlements.map((entry) => entry.entitlementId);
        const ownedRes = await client.query(`select entitlement_id from game_entitlements
       where player_id = $1 and game_slug = $2 and entitlement_id = any($3::text[])`, [playerId, gameSlug, requestedIds]);
        const ownedIds = new Set(ownedRes.rows.map((row) => row.entitlement_id));
        const priced = priceValorOffer(resolved, ownedIds);
        if (priced.alreadyOwned) {
            await client.query("rollback");
            return { ok: false, statusCode: 409, error: "offer_already_owned" };
        }
        if (valorBalance < priced.valorCost) {
            await client.query("rollback");
            return { ok: false, statusCode: 402, error: "insufficient_valor" };
        }
        const deductRes = await client.query(`update game_progress_profiles
       set valor_balance = valor_balance - $3, updated_at = now()
       where player_id = $1 and game_slug = $2 and valor_balance >= $3
       returning valor_balance`, [playerId, gameSlug, priced.valorCost]);
        if (!deductRes.rows.length) {
            await client.query("rollback");
            return { ok: false, statusCode: 402, error: "insufficient_valor" };
        }
        for (const grant of priced.grants) {
            await grantEntitlement(client, playerId, gameSlug, grant, "valor", `valor:${grant.entitlementId}`);
        }
        await client.query("commit");
        return {
            ok: true,
            valorSpent: priced.valorCost,
            entitlementIds: priced.grants.map((grant) => grant.entitlementId),
            progress: await getGameProgress(pool, playerId, gameSlug),
        };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[game-progress] spendValorForEntitlement error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "spend_failed" };
    }
    finally {
        client.release();
    }
}
// Spend one consumable from the player's inventory and apply its effect, atomically.
//
// The item is decremented and anything it grants is written in the SAME transaction, so a
// crash can never leave a spent item with no reward (or a reward with no spend). Random skin
// grants roll HERE — the client only names the item, never the skin it wants. The whole
// activation is idempotent on the caller's `activationId`: a retried request replays the
// stored result instead of spending a second item.
export async function activateInventoryItem(pool, params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const gameSlug = normalizeGameSlug(params.gameSlug);
    const activationId = cleanText(params.activationId, 120);
    if (!pool || !playerId || !gameSlug || !activationId) {
        return { ok: false, statusCode: 400, error: "invalid_request" };
    }
    const offer = getConsumableOffer(params.itemId);
    if (!offer)
        return { ok: false, statusCode: 400, error: "item_not_found" };
    const claimId = `consumable-activation:${activationId}`;
    const client = await pool.connect();
    try {
        await client.query("begin");
        await ensureGameProgressProfile(client, playerId, gameSlug);
        const claim = await client.query(`insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'consumable-activation', $4, '{}'::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`, [playerId, gameSlug, claimId, offer.id]);
        if (claim.rowCount === 0) {
            // Already activated under this id — replay what it granted rather than spending again.
            const previous = await client.query(`select payload from game_progress_claims
         where player_id = $1 and game_slug = $2 and claim_id = $3`, [playerId, gameSlug, claimId]);
            await client.query("commit");
            const payload = previous.rows[0]?.payload && typeof previous.rows[0].payload === "object"
                ? previous.rows[0].payload
                : {};
            return {
                ok: true,
                alreadyProcessed: true,
                itemId: cleanText(payload.itemId, 120) || offer.id,
                effect: offer.effect,
                entitlementIds: Array.isArray(payload.entitlementIds) ? payload.entitlementIds : [],
                progress: await getGameProgress(pool, playerId, gameSlug),
            };
        }
        const spent = await client.query(`update game_inventory_items
       set quantity = quantity - 1, updated_at = now()
       where player_id = $1 and game_slug = $2 and item_id = $3 and quantity > 0
       returning quantity`, [playerId, gameSlug, offer.id]);
        if (!spent.rows.length) {
            await client.query("rollback");
            return { ok: false, statusCode: 409, error: "item_not_owned" };
        }
        const entitlementIds = [];
        if (offer.effect?.kind === "random-unowned-skin") {
            const ownedRes = await client.query(`select entitlement_id from game_entitlements
         where player_id = $1 and game_slug = $2 and kind = 'skin'`, [playerId, gameSlug]);
            const ownedEntitlementIds = new Set(ownedRes.rows.map((row) => row.entitlement_id));
            const picks = selectRandomUnownedSkins(SKIN_CATALOG, {
                rarity: offer.effect.rarity,
                count: offer.effect.count,
                ownedEntitlementIds,
                ...(typeof params.randomIndex === "function" ? { randomIndex: params.randomIndex } : {}),
            });
            if (!picks.length) {
                // Nothing left to win at this rarity — refuse rather than burn the item for nothing.
                await client.query("rollback");
                return { ok: false, statusCode: 409, error: "no_unowned_skins" };
            }
            for (const skin of picks) {
                await grantEntitlement(client, playerId, gameSlug, { entitlementId: skin.entitlementId, kind: "skin" }, "consumable", claimId);
                entitlementIds.push(skin.entitlementId);
            }
        }
        await client.query(`update game_progress_claims set payload = $4::jsonb
       where player_id = $1 and game_slug = $2 and claim_id = $3`, [playerId, gameSlug, claimId, JSON.stringify({ itemId: offer.id, entitlementIds })]);
        await client.query("commit");
        return {
            ok: true,
            alreadyProcessed: false,
            itemId: offer.id,
            effect: offer.effect,
            entitlementIds,
            progress: await getGameProgress(pool, playerId, gameSlug),
        };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[game-progress] activateInventoryItem error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "activation_failed" };
    }
    finally {
        client.release();
    }
}
export async function getYamBowlingTournamentState(pool, params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const gameSlug = normalizeGameSlug(params.gameSlug);
    if (!pool || !playerId || gameSlug !== "yam-bowling") {
        return { ok: false, statusCode: 400, error: "invalid_request" };
    }
    const availability = getYamBowlingTournamentEvent(params.now);
    if (availability.status !== "open") {
        return { ok: true, ...availability, completedRoundIndexes: [], champion: false, prize: null };
    }
    try {
        const result = await pool.query(`select payload from game_progress_claims
       where player_id = $1 and game_slug = $2 and kind = 'yam-tournament-round' and source_id = $3`, [playerId, gameSlug, availability.event.id]);
        const payloads = result.rows
            .map((row) => normalizePayload(row.payload))
            .filter((payload) => payload.eventId === availability.event.id);
        const completedRoundIndexes = [...new Set(payloads
                .map((payload) => clampInt(payload.roundIndex, { min: 0, max: availability.event.rounds.length - 1 })))]
            .sort((left, right) => left - right);
        const finalPayload = payloads.find((payload) => payload.roundIndex === availability.event.rounds.length - 1);
        return {
            ok: true,
            ...availability,
            completedRoundIndexes,
            champion: Boolean(finalPayload),
            prize: finalPayload?.prize || null,
        };
    }
    catch (err) {
        process.stderr.write(`[game-progress] getYamBowlingTournamentState error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "tournament_unavailable" };
    }
}
export async function recordYamBowlingTournamentRound(pool, params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const gameSlug = normalizeGameSlug(params.gameSlug);
    const eventId = cleanText(params.eventId, 120);
    const bowlerSlug = cleanText(params.bowlerSlug, 120);
    const roundIndex = Number(params.roundIndex);
    if (!pool || !playerId || gameSlug !== "yam-bowling" || !eventId || !bowlerSlug) {
        return { ok: false, statusCode: 400, error: "invalid_request" };
    }
    const availability = getYamBowlingTournamentEvent(params.now);
    if (availability.status !== "open")
        return { ok: false, statusCode: 409, error: "tournament_closed" };
    if (availability.event.id !== eventId)
        return { ok: false, statusCode: 409, error: "event_not_active" };
    const round = availability.event.rounds.find((entry) => entry.index === roundIndex);
    if (!round || !Number.isInteger(roundIndex))
        return { ok: false, statusCode: 400, error: "invalid_round" };
    const claimId = `tournament-round:${eventId}:${roundIndex}`;
    const client = await pool.connect();
    try {
        await client.query("begin");
        await ensureGameProgressProfile(client, playerId, gameSlug);
        if (!isYamBowlingStarterBowler(bowlerSlug)) {
            const bowler = await client.query(`select 1 from game_entitlements
         where player_id = $1 and game_slug = $2 and entitlement_id = $3 limit 1`, [playerId, gameSlug, `bowler:${bowlerSlug}`]);
            if (!bowler.rows.length) {
                await client.query("rollback");
                return { ok: false, statusCode: 409, error: "active_bowler_not_owned" };
            }
        }
        if (roundIndex > 0) {
            const prerequisite = await client.query(`select 1 from game_progress_claims
         where player_id = $1 and game_slug = $2 and claim_id = $3 limit 1`, [playerId, gameSlug, `tournament-round:${eventId}:${roundIndex - 1}`]);
            if (!prerequisite.rows.length) {
                await client.query("rollback");
                return { ok: false, statusCode: 409, error: "previous_round_incomplete" };
            }
        }
        const initialPayload = { eventId, roundIndex, bowlerSlug };
        const claim = await client.query(`insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`, [playerId, gameSlug, claimId, YAM_BOWLING_TOURNAMENT_KIND, eventId, JSON.stringify(initialPayload)]);
        if (claim.rowCount === 0) {
            const previous = await client.query(`select payload from game_progress_claims
         where player_id = $1 and game_slug = $2 and claim_id = $3`, [playerId, gameSlug, claimId]);
            const payload = normalizePayload(previous.rows[0]?.payload);
            await client.query("commit");
            return {
                ok: true,
                alreadyProcessed: true,
                prize: payload.prize || null,
                entitlementIds: Array.isArray(payload.entitlementIds) ? payload.entitlementIds : [],
                tournament: await getYamBowlingTournamentState(pool, params),
                progress: await getGameProgress(pool, playerId, gameSlug),
            };
        }
        let prize = null;
        const entitlementIds = [];
        if (roundIndex === availability.event.rounds.length - 1) {
            const owned = await client.query(`select entitlement_id from game_entitlements where player_id = $1 and game_slug = $2`, [playerId, gameSlug]);
            prize = selectYamBowlingTournamentPrize({
                playerId,
                eventId,
                ownedEntitlementIds: owned.rows.map((row) => row.entitlement_id),
                ...(Number.isFinite(Number(params.prizeRoll)) ? { roll: Number(params.prizeRoll) } : {}),
            });
            await grantEntitlement(client, playerId, gameSlug, YAM_BOWLING_TOURNAMENT_TITLE, "tournament", eventId);
            entitlementIds.push(YAM_BOWLING_TOURNAMENT_TITLE.entitlementId);
            if (prize.kind === "entitlement") {
                await grantEntitlement(client, playerId, gameSlug, {
                    entitlementId: prize.entitlementId,
                    kind: prize.entitlementId.split(":")[0],
                }, "tournament", eventId);
                entitlementIds.push(prize.entitlementId);
            }
            else {
                await grantInventoryItem(client, playerId, gameSlug, prize.itemId, prize.quantity);
            }
            await client.query(`update game_progress_claims set payload = $4::jsonb
         where player_id = $1 and game_slug = $2 and claim_id = $3`, [playerId, gameSlug, claimId, JSON.stringify({ ...initialPayload, prize, entitlementIds })]);
        }
        await client.query("commit");
        return {
            ok: true,
            alreadyProcessed: false,
            prize,
            entitlementIds,
            tournament: await getYamBowlingTournamentState(pool, params),
            progress: await getGameProgress(pool, playerId, gameSlug),
        };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[game-progress] recordYamBowlingTournamentRound error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "tournament_claim_failed" };
    }
    finally {
        client.release();
    }
}
// Redeem exactly one Yam Bowling voucher for one named cosmetic.
//
// Both currencies run through here. They differ only in what the voucher is
// called, what a valid target looks like, and whether the target has a
// prerequisite -- so those three are the config below and the transaction
// itself exists once. Spending is the part that must not be duplicated: the
// decrement and the grant share a transaction, and a caller-generated
// redemption id makes a lost response safe to retry without spending twice.
const VOUCHER_KINDS = {
    skin: {
        itemId: "skin-voucher",
        claimKind: "skin-voucher-redemption",
        grantKind: "skin",
        invalidTargetError: "invalid_skin_target",
        ownedError: "skin_already_owned",
        validateTarget: validateYamBowlingSkinVoucherTarget,
        // A skin is a bowler's, so the bowler has to be owned first. An emote
        // belongs to nobody, which is why it has no prerequisite.
        prerequisite: async (client, playerId, gameSlug, target) => {
            if (isYamBowlingStarterBowler(target.bowlerSlug))
                return null;
            const bowler = await client.query(`select 1 from game_entitlements
         where player_id = $1 and game_slug = $2 and entitlement_id = $3 limit 1`, [playerId, gameSlug, `bowler:${target.bowlerSlug}`]);
            return bowler.rows.length ? null : "bowler_not_owned";
        },
    },
    emote: {
        itemId: "emote-voucher",
        claimKind: "emote-voucher-redemption",
        grantKind: "emote",
        invalidTargetError: "invalid_emote_target",
        ownedError: "emote_already_owned",
        validateTarget: validateYamBowlingEmoteVoucherTarget,
        prerequisite: async () => null,
    },
};
// The shipped name for the skin currency. Kept as a thin alias rather than
// renamed at every call site: the generalisation above is an internal change
// and must not become a breaking one for callers.
export function redeemYamBowlingSkinVoucher(pool, params = {}) {
    return redeemYamBowlingVoucher(pool, { ...params, voucherKind: "skin" });
}
export function redeemYamBowlingEmoteVoucher(pool, params = {}) {
    return redeemYamBowlingVoucher(pool, { ...params, voucherKind: "emote" });
}
export async function redeemYamBowlingVoucher(pool, params = {}) {
    const kind = VOUCHER_KINDS[String(params.voucherKind || "skin")];
    if (!kind)
        return { ok: false, statusCode: 400, error: "invalid_request" };
    const playerId = cleanText(params.playerId, 120);
    const gameSlug = normalizeGameSlug(params.gameSlug);
    const redemptionId = cleanText(params.redemptionId, 120);
    const target = kind.validateTarget(gameSlug, cleanText(params.entitlementId, 180));
    if (!pool || !playerId || !redemptionId) {
        return { ok: false, statusCode: 400, error: "invalid_request" };
    }
    if (!target)
        return { ok: false, statusCode: 400, error: kind.invalidTargetError };
    const claimId = `${kind.claimKind}:${redemptionId}`;
    const client = await pool.connect();
    try {
        await client.query("begin");
        await ensureGameProgressProfile(client, playerId, gameSlug);
        const claim = await client.query(`insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'skin-voucher-redemption', $4, '{}'::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`, [playerId, gameSlug, claimId, target.entitlementId]);
        if (claim.rowCount === 0) {
            const previous = await client.query(`select payload from game_progress_claims
         where player_id = $1 and game_slug = $2 and claim_id = $3`, [playerId, gameSlug, claimId]);
            const payload = normalizePayload(previous.rows[0]?.payload);
            if (payload.entitlementId !== target.entitlementId) {
                await client.query("rollback");
                return { ok: false, statusCode: 409, error: "redemption_id_conflict" };
            }
            await client.query("commit");
            return {
                ok: true,
                alreadyProcessed: true,
                entitlementId: target.entitlementId,
                progress: await getGameProgress(pool, playerId, gameSlug),
            };
        }
        const blocked = await kind.prerequisite(client, playerId, gameSlug, target);
        if (blocked) {
            await client.query("rollback");
            return { ok: false, statusCode: 409, error: blocked };
        }
        const owned = await client.query(`select 1 from game_entitlements
       where player_id = $1 and game_slug = $2 and entitlement_id = $3 limit 1`, [playerId, gameSlug, target.entitlementId]);
        if (owned.rows.length) {
            await client.query("rollback");
            return { ok: false, statusCode: 409, error: kind.ownedError };
        }
        const spent = await client.query(`update game_inventory_items
       set quantity = quantity - 1, updated_at = now()
       where player_id = $1 and game_slug = $2 and item_id = $3 and quantity > 0
       returning quantity`, [playerId, gameSlug, kind.itemId]);
        if (!spent.rows.length) {
            await client.query("rollback");
            return { ok: false, statusCode: 409, error: "voucher_not_owned" };
        }
        await grantEntitlement(client, playerId, gameSlug, { entitlementId: target.entitlementId, kind: kind.grantKind }, kind.itemId, redemptionId);
        await client.query(`update game_progress_claims set payload = $4::jsonb
       where player_id = $1 and game_slug = $2 and claim_id = $3`, [playerId, gameSlug, claimId, JSON.stringify({ entitlementId: target.entitlementId })]);
        await client.query("commit");
        return {
            ok: true,
            alreadyProcessed: false,
            entitlementId: target.entitlementId,
            progress: await getGameProgress(pool, playerId, gameSlug),
        };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[game-progress] redeemYamBowlingVoucher error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "redemption_failed" };
    }
    finally {
        client.release();
    }
}
// Reset campaign mission progress ONLY. Per the in-game Reset Progress contract, Valor,
// unit/skin entitlements, and tutorial progress are intentionally preserved — this only
// clears game_campaign_progress rows so the player can replay missions.
//
// Also bumps campaign_epoch. That is what makes the reset stick across devices: a client
// still holding the old campaign sees an epoch ahead of its own and replaces its state
// instead of unioning the cleared missions back in, and any claim built under the old
// epoch is fenced off by isStaleCampaignClaim.
export async function resetCampaignProgress(pool, playerId, gameSlug) {
    const normalizedPlayerId = cleanText(playerId, 120);
    const normalizedGameSlug = normalizeGameSlug(gameSlug);
    if (!pool || !normalizedPlayerId || !normalizedGameSlug) {
        return { ok: false, statusCode: 400, error: "invalid_request" };
    }
    const client = await pool.connect();
    try {
        // The delete and the epoch bump have to land together: an epoch that advanced without
        // the rows going (or rows going without the epoch advancing) is exactly the split-brain
        // this column exists to prevent.
        await client.query("begin");
        await ensureGameProgressProfile(client, normalizedPlayerId, normalizedGameSlug);
        await client.query(`delete from game_campaign_progress where player_id = $1 and game_slug = $2`, [normalizedPlayerId, normalizedGameSlug]);
        // Claim rows are deliberately left alone. Deleting them would let the player re-earn
        // every mission's Valor and re-pick every reward pack; the campaign-progress claims
        // that DO need to be re-recordable get a fresh id from the new epoch instead.
        await client.query(`update game_progress_profiles
       set campaign_epoch = campaign_epoch + 1, updated_at = now()
       where player_id = $1 and game_slug = $2`, [normalizedPlayerId, normalizedGameSlug]);
        await client.query("commit");
        return { ok: true, progress: await getGameProgress(pool, normalizedPlayerId, normalizedGameSlug) };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[game-progress] resetCampaignProgress error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "reset_failed" };
    }
    finally {
        client.release();
    }
}
// One-time, per-account migration of a signed-in player's existing LOCAL ownership to the
// server, so switching to server-authoritative ownership never loses what a player already
// had. Gated by a single claim row (`migration:local-ownership-v1`) so it runs exactly once
// per account — after that, injected local entitlements can never be re-grandfathered.
// Entitlement ids are format-validated (real-shaped ids only) and capped.
/**
 * The one-time local-ownership grandfather. **CLOSED as of 2026-08-13 — it grants nothing.**
 *
 * When Tactical Arena moved to server-authoritative ownership, each player's locally-stored
 * units, skins and Valor had to be imported once so the switch lost no purchases. That import
 * was, unavoidably, the single place a client could assert ownership it had never paid for. It
 * was fenced in hard — a one-shot claim row, a catalog whitelist, a 2000-item cap, and an
 * account-age cutoff — but it existed, and the last opening (a pre-cutoff account with an empty
 * server set could re-run its consumed migration once) was a live injection path for anyone
 * holding an old, empty account.
 *
 * Every legitimate account has now migrated, so the whole path is retired: no entitlement and no
 * Valor can be created here for any account, of any age, in any server state.
 *
 * The endpoint deliberately REMAINS and still answers ok. The client's boot sync only switches
 * to server authority — the reconcile that filters injected local ownership back out — once this
 * call has confirmed (`OWNERSHIP_BACKFILL_FLAG` in bootProgressSync.js). Removing the route, or
 * making it fail, would leave every client permanently in additive mode, so injected ownership
 * would never be reconciled away. Answering "already migrated" is what closes that loop.
 *
 * Guarded by `tests/ownership-backfill-security.test.mjs`.
 */
export async function backfillLocalOwnership(pool, params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const gameSlug = normalizeGameSlug(params.gameSlug);
    if (!pool || !playerId || !gameSlug)
        return { ok: false, statusCode: 400, error: "invalid_request" };
    const client = await pool.connect();
    try {
        await client.query("begin");
        // Still ensures the profile row exists: this is often the first server contact a signed-in
        // client makes, and the snapshot below (and later Valor spends) need somewhere to read from.
        await ensureGameProgressProfile(client, playerId, gameSlug);
        await client.query("commit");
        // `alreadyMigrated: true` unconditionally — the migration is over for everyone.
        return { ok: true, alreadyMigrated: true, progress: await getGameProgress(pool, playerId, gameSlug) };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[game-progress] backfillLocalOwnership error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "backfill_failed" };
    }
    finally {
        client.release();
    }
}
// Find the premium (Stripe) grant claim behind a payment, so a later refund/dispute event
// — which only carries a payment_intent / charge, never the checkout session metadata — can
// be traced back to what was granted. Matches on the payment_intent stored in the grant
// payload, or on the checkout-session id (`stripe-checkout:<sessionId>`) as a fallback.
export async function findStripeGrant(pool, params = {}) {
    const paymentIntentId = cleanText(params.paymentIntentId, 200);
    const sessionId = cleanText(params.sessionId, 200);
    if (!pool || (!paymentIntentId && !sessionId))
        return null;
    const conditions = [];
    const values = [];
    if (paymentIntentId) {
        values.push(paymentIntentId);
        conditions.push(`payload->>'paymentIntentId' = $${values.length}`);
    }
    if (sessionId) {
        values.push(`stripe-checkout:${sessionId}`);
        conditions.push(`claim_id = $${values.length}`);
    }
    try {
        values.push(PREMIUM_GRANT_CLAIM_KINDS);
        const res = await pool.query(`select player_id, game_slug, claim_id, payload
       from game_progress_claims
       where kind = any($${values.length}::text[])
         and (${conditions.join(" or ")})
       order by created_at asc
       limit 1`, values);
        const row = res.rows[0];
        if (!row)
            return null;
        const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
        const entitlementIds = [...new Set((Array.isArray(payload.entitlementIds) ? payload.entitlementIds : [])
                .map((value) => cleanText(value, 180))
                .filter(Boolean))];
        return {
            playerId: cleanText(row.player_id, 120),
            gameSlug: normalizeGameSlug(row.game_slug),
            sessionId: cleanText(payload.sessionId, 200) || cleanText(row.claim_id, 200).replace(/^stripe-checkout:/, ""),
            paymentIntentId: cleanText(payload.paymentIntentId, 200),
            entitlementIds,
            inventoryItems: buildInventoryGrants(normalizeGameSlug(row.game_slug), payload),
        };
    }
    catch (err) {
        process.stderr.write(`[game-progress] findStripeGrant error: ${err?.message || err}\n`);
        return null;
    }
}
// Find which account, if any, has already been granted a given Google Play purchase.
//
// Play purchase tokens are bearer values: whoever holds one can post it. Claim rows are keyed
// per player, so without this lookup the same token replayed under a second account would open
// a second claim and grant the item twice. The token itself is never stored — only a hash — so
// this is a pure "has anyone already redeemed this?" check.
export async function findPlayPurchaseClaim(pool, params = {}) {
    const tokenHash = cleanText(params.purchaseTokenHash, 128);
    if (!pool || !tokenHash)
        return null;
    try {
        const res = await pool.query(`select player_id, game_slug, claim_id
       from game_progress_claims
       where kind = any($1::text[]) and payload->>'playPurchaseTokenHash' = $2
       order by created_at asc
       limit 1`, [PREMIUM_GRANT_CLAIM_KINDS, tokenHash]);
        const row = res.rows[0];
        if (!row)
            return null;
        return {
            playerId: cleanText(row.player_id, 120),
            gameSlug: normalizeGameSlug(row.game_slug),
            claimId: cleanText(row.claim_id, 200),
        };
    }
    catch (err) {
        process.stderr.write(`[game-progress] findPlayPurchaseClaim error: ${err?.message || err}\n`);
        return null;
    }
}
// Revoke premium entitlements after a refund or chargeback. Idempotent via an audit claim
// (`stripe-revocation:<disputeOrChargeId>`) so duplicate webhook deliveries are safe. The
// delete is scoped to rows that are still `source='stripe'` AND carry this exact purchase's
// `source_id` (the checkout session id), so an entitlement the player also owns through a
// different path is never yanked out from under them. Because ownership is server-authoritative
// and self-heals on boot, deleting the server row is enough — the item disappears on the
// player's next online boot with no client change.
export async function revokeGameEntitlements(pool, params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const gameSlug = normalizeGameSlug(params.gameSlug);
    const sessionId = cleanText(params.sessionId, 200);
    const revocationId = cleanText(params.revocationId, 200);
    const reason = cleanText(params.reason, 80) || "revoked";
    const entitlementIds = [...new Set((Array.isArray(params.entitlementIds) ? params.entitlementIds : [])
            .map((value) => cleanText(value, 180))
            .filter(Boolean))];
    const inventoryItems = buildInventoryGrants(gameSlug, { inventoryItems: params.inventoryItems });
    if (!pool || !playerId || !gameSlug || !revocationId) {
        return { ok: false, statusCode: 400, error: "invalid_request" };
    }
    if (!entitlementIds.length && !inventoryItems.length) {
        return { ok: true, alreadyProcessed: false, revoked: [], revokedItems: [] };
    }
    const client = await pool.connect();
    try {
        await client.query("begin");
        await ensureGameProgressProfile(client, playerId, gameSlug);
        const claim = await client.query(`insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'premium-revocation', $4, $5::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`, [playerId, gameSlug, `stripe-revocation:${revocationId}`, sessionId, JSON.stringify({ reason, sessionId, entitlementIds, inventoryItems })]);
        const alreadyProcessed = claim.rowCount === 0;
        let revoked = [];
        const revokedItems = [];
        if (!alreadyProcessed) {
            if (entitlementIds.length) {
                const del = await client.query(`delete from game_entitlements
           where player_id = $1 and game_slug = $2
             and source = 'stripe'
             and entitlement_id = any($3::text[])
             ${sessionId ? "and source_id = $4" : ""}
           returning entitlement_id`, sessionId ? [playerId, gameSlug, entitlementIds, sessionId] : [playerId, gameSlug, entitlementIds]);
                revoked = del.rows.map((row) => row.entitlement_id);
            }
            for (const item of inventoryItems) {
                const remaining = await revokeInventoryItem(client, playerId, gameSlug, item.itemId, item.quantity);
                revokedItems.push({ itemId: item.itemId, quantity: item.quantity, remaining });
            }
            process.stderr.write(`[game-progress] revoked ${revoked.length} entitlement(s) and ${revokedItems.length} item(s) (player=${playerId} reason=${reason} revocation=${revocationId})\n`);
        }
        await client.query("commit");
        return { ok: true, alreadyProcessed, revoked, revokedItems, progress: await getGameProgress(pool, playerId, gameSlug) };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[game-progress] revokeGameEntitlements error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "revoke_failed" };
    }
    finally {
        client.release();
    }
}
// Re-grant premium entitlements when a dispute is resolved in the merchant's favor (won).
// Idempotent via an audit claim (`stripe-regrant:<disputeId>`). Rows are restored as
// `source='stripe'` with this purchase's session id, mirroring the original grant.
export async function regrantStripeEntitlements(pool, params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const gameSlug = normalizeGameSlug(params.gameSlug);
    const sessionId = cleanText(params.sessionId, 200);
    const regrantId = cleanText(params.regrantId, 200);
    const entitlementIds = [...new Set((Array.isArray(params.entitlementIds) ? params.entitlementIds : [])
            .map((value) => cleanText(value, 180))
            .filter(Boolean))];
    const inventoryItems = buildInventoryGrants(gameSlug, { inventoryItems: params.inventoryItems });
    if (!pool || !playerId || !gameSlug || !regrantId) {
        return { ok: false, statusCode: 400, error: "invalid_request" };
    }
    if (!entitlementIds.length && !inventoryItems.length) {
        return { ok: true, alreadyProcessed: false, regranted: [], regrantedItems: [] };
    }
    const client = await pool.connect();
    try {
        await client.query("begin");
        await ensureGameProgressProfile(client, playerId, gameSlug);
        const claim = await client.query(`insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'premium-regrant', $4, $5::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`, [playerId, gameSlug, `stripe-regrant:${regrantId}`, sessionId, JSON.stringify({ sessionId, entitlementIds, inventoryItems })]);
        const alreadyProcessed = claim.rowCount === 0;
        if (!alreadyProcessed) {
            for (const entitlementId of entitlementIds) {
                const kind = entitlementId.startsWith("unit:") ? "unit" : "skin";
                await grantEntitlement(client, playerId, gameSlug, { entitlementId, kind }, "stripe", sessionId || `stripe-regrant:${regrantId}`);
            }
            for (const item of inventoryItems) {
                await grantInventoryItem(client, playerId, gameSlug, item.itemId, item.quantity);
            }
        }
        await client.query("commit");
        return {
            ok: true,
            alreadyProcessed,
            regranted: alreadyProcessed ? [] : entitlementIds,
            regrantedItems: alreadyProcessed ? [] : inventoryItems,
            progress: await getGameProgress(pool, playerId, gameSlug),
        };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[game-progress] regrantStripeEntitlements error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "regrant_failed" };
    }
    finally {
        client.release();
    }
}
