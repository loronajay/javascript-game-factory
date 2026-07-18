const VALID_GAME_SLUG = /^[a-z0-9-]{1,60}$/;
const VALID_CLAIM_KINDS = new Set([
    "campaign-valor",
    "campaign-skin-choice",
    "campaign-unit-choice",
]);
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
export function isValidGameClaimKind(value) {
    return VALID_CLAIM_KINDS.has(cleanText(value, 80));
}
export async function getGameProgress(pool, playerId, gameSlug) {
    const normalizedPlayerId = cleanText(playerId, 120);
    const normalizedGameSlug = normalizeGameSlug(gameSlug);
    if (!pool || !normalizedPlayerId || !normalizedGameSlug)
        return null;
    try {
        const [profile, entitlements, campaignProgress, inventoryItems] = await Promise.all([
            pool.query(`select player_id, game_slug, valor_balance, created_at, updated_at
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
        ]);
        const row = profile.rows[0] || {};
        return {
            playerId: normalizedPlayerId,
            gameSlug: normalizedGameSlug,
            valorBalance: Number(row.valor_balance) || 0,
            entitlements: entitlements.rows.map(rowToEntitlement),
            campaignProgress: campaignProgress.rows.map(rowToCampaignProgress),
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
    const payload = normalizePayload(params.payload);
    const sourceId = cleanText(params.sourceId || payload.missionId || payload.packId || "", 200);
    if (!pool || !playerId || !gameSlug || !claimId || !VALID_CLAIM_KINDS.has(kind))
        return null;
    const client = await pool.connect();
    try {
        await client.query("begin");
        await ensureGameProgressProfile(client, playerId, gameSlug);
        const claim = await client.query(`insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`, [playerId, gameSlug, claimId, kind, sourceId, JSON.stringify(payload)]);
        const alreadyProcessed = claim.rowCount === 0;
        if (!alreadyProcessed && kind === "campaign-valor") {
            const amount = clampInt(payload.amount, { min: 0, max: 100000 });
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
        await client.query("commit");
        return {
            ok: true,
            alreadyProcessed,
            progress: await getGameProgress(pool, playerId, gameSlug),
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
