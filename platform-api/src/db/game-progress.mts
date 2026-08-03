import { getConsumableOffer, selectRandomUnownedSkins } from "../services/consumable-catalog.mjs";
import { SKIN_CATALOG, UNIT_CATALOG } from "../services/payments.mjs";
import {
  TACTICAL_ARENA_TUTORIAL_IDS,
  validateTacticalArenaPublicClaim,
} from "../services/tactical-arena-reward-catalog.mjs";
import { getValorOffer, priceValorOffer } from "../services/valor-catalog.mjs";

const VALID_GAME_SLUG = /^[a-z0-9-]{1,60}$/;
const VALID_CLAIM_KINDS = new Set([
  "campaign-valor",
  // Mission cleared, recorded WITHOUT any Valor movement. campaign-valor already carries
  // stars, but it fires exactly once per mission (the payout is idempotent), so it cannot
  // report a later star improvement or backfill a mission cleared before progress sync
  // existed. This kind is how campaign progress alone reaches the account.
  "campaign-progress",
  "campaign-skin-choice",
  "campaign-unit-choice",
  "tutorial-complete",
  "tutorial-valor",
  "tutorial-unit-reward",
  "tutorial-skin-choice",
  "premium-skin-purchase",
  "premium-unit-purchase",
  "premium-consumable-purchase",
]);

// Premium (real-money) entitlements must never be grantable through the public
// claims route. They may only be recorded by the server-side Stripe fulfillment
// path, which calls recordGameProgressClaim with allowPremiumKinds: true after a
// verified payment. Every other caller is untrusted and is refused below.
const PREMIUM_CLAIM_KINDS = new Set([
  "premium-skin-purchase",
  "premium-unit-purchase",
  "premium-consumable-purchase",
]);

// The kinds a refund/chargeback can trace back to, so revocation can find what was granted.
const PREMIUM_GRANT_CLAIM_KINDS = [...PREMIUM_CLAIM_KINDS];

// A single purchase may never add more than this much of one consumable, whatever a
// (future) multi-quantity payload claims.
const MAX_CONSUMABLE_PURCHASE_QUANTITY = 99;

function cleanText(value: any, maxLength = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeGameSlug(value: any): string {
  const slug = cleanText(value, 60).toLowerCase();
  return VALID_GAME_SLUG.test(slug) ? slug : "";
}

function clampInt(value: any, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizePayload(value: any): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function rowToEntitlement(row: any): any {
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

function rowToCampaignProgress(row: any): any {
  return {
    missionId: row.mission_id,
    stars: Number(row.stars) || 0,
    completedAt: row.completed_at,
    valorClaimedAt: row.valor_claimed_at,
    rewardClaimedAt: row.reward_claimed_at,
  };
}

function rowToInventoryItem(row: any): any {
  return {
    itemId: row.item_id,
    quantity: Number(row.quantity) || 0,
    updatedAt: row.updated_at,
  };
}

function buildSkinEntitlement(payload: Record<string, any>): any {
  const type = cleanText(payload.type, 80);
  const slug = cleanText(payload.slug, 120);
  if (!type || !slug) return null;
  return {
    entitlementId: cleanText(payload.entitlementId, 180) || `skin:${type}:${slug}`,
    kind: "skin",
  };
}

// A skin purchase grants the skins themselves, and a PACK purchase also grants a
// `skin-pack:<packId>` marker. The marker owns no content — it is the durable record that
// the bundle was bought, which badge rules read to tell a pack buyer apart from someone
// who happened to buy the same skins individually.
function buildSkinPurchaseEntitlements(payload: Record<string, any>): any[] {
  const rawEntitlementIds = [
    payload.entitlementId,
    ...(Array.isArray(payload.entitlementIds) ? payload.entitlementIds : []),
  ];
  const entitlementIds = [...new Set(rawEntitlementIds.map((value) => cleanText(value, 180)).filter(Boolean))];
  return entitlementIds
    .map((entitlementId) => {
      if (entitlementId.startsWith("skin:")) return { entitlementId, kind: "skin" };
      if (entitlementId.startsWith("skin-pack:")) return { entitlementId, kind: "skin-pack" };
      return null;
    })
    .filter(Boolean);
}

function buildUnitPurchaseEntitlements(payload: Record<string, any>): any[] {
  const rawEntitlementIds = [
    payload.entitlementId,
    ...(Array.isArray(payload.entitlementIds) ? payload.entitlementIds : []),
  ];
  const entitlementIds = [...new Set(rawEntitlementIds.map((value) => cleanText(value, 180)).filter(Boolean))];
  return entitlementIds
    .filter((entitlementId) => entitlementId.startsWith("unit:"))
    .map((entitlementId) => ({ entitlementId, kind: "unit" }));
}

function buildUnitEntitlement(payload: Record<string, any>): any {
  const type = cleanText(payload.type, 80);
  if (!type) return null;
  return {
    entitlementId: cleanText(payload.entitlementId, 180) || `unit:${type}`,
    kind: "unit",
  };
}

async function ensureGameProgressProfile(client: any, playerId: string, gameSlug: string): Promise<void> {
  await client.query(
    `insert into game_progress_profiles (player_id, game_slug)
     values ($1, $2)
     on conflict (player_id, game_slug) do nothing`,
    [playerId, gameSlug],
  );
}

// True when a claim was built before a campaign reset this player has since performed.
// Such a claim describes a campaign the player deliberately cleared, so honoring it would
// resurrect exactly the progress the reset removed. A claim with no epoch reads as 0,
// which is also every un-reset account's epoch — so nothing existing is treated as stale.
async function isStaleCampaignClaim(client: any, playerId: string, gameSlug: string, claimEpoch: any): Promise<boolean> {
  const claimed = clampInt(claimEpoch, { min: 0, max: 1_000_000 });
  const result = await client.query(
    `select campaign_epoch from game_progress_profiles where player_id = $1 and game_slug = $2`,
    [playerId, gameSlug],
  );
  return claimed < (Number(result.rows[0]?.campaign_epoch) || 0);
}

async function markCampaignProgress(client: any, playerId: string, gameSlug: string, missionId: string, patch: any = {}): Promise<void> {
  const stars = clampInt(patch.stars, { min: 0, max: 3 });
  const valorClaimedAt = patch.valorClaimedAt || null;
  const rewardClaimedAt = patch.rewardClaimedAt || null;
  await client.query(
    `insert into game_campaign_progress
      (player_id, game_slug, mission_id, stars, completed_at, valor_claimed_at, reward_claimed_at)
     values ($1, $2, $3, $4, now(), $5, $6)
     on conflict (player_id, game_slug, mission_id) do update
       set stars = greatest(game_campaign_progress.stars, excluded.stars),
           completed_at = coalesce(game_campaign_progress.completed_at, excluded.completed_at),
           valor_claimed_at = coalesce(game_campaign_progress.valor_claimed_at, excluded.valor_claimed_at),
           reward_claimed_at = coalesce(game_campaign_progress.reward_claimed_at, excluded.reward_claimed_at),
           updated_at = now()`,
    [playerId, gameSlug, missionId, stars, valorClaimedAt, rewardClaimedAt],
  );
}

async function hasPublicClaimPrerequisite(client: any, playerId: string, gameSlug: string, prerequisite: any): Promise<boolean> {
  if (!prerequisite) return true;
  if (prerequisite.kind === "all-tutorials") {
    const result = await client.query(
      `select source_id from game_progress_claims
       where player_id = $1 and game_slug = $2 and kind = 'tutorial-complete'
         and source_id = any($3::text[])`,
      [playerId, gameSlug, TACTICAL_ARENA_TUTORIAL_IDS],
    );
    const completed = new Set(result.rows.map((row: any) => cleanText(row.source_id, 200)));
    return TACTICAL_ARENA_TUTORIAL_IDS.every((tutorialId) => completed.has(tutorialId));
  }
  if (prerequisite.kind === "campaign-mission") {
    const result = await client.query(
      `select 1 from game_campaign_progress
       where player_id = $1 and game_slug = $2 and mission_id = $3 limit 1`,
      [playerId, gameSlug, prerequisite.missionId],
    );
    return result.rows.length > 0;
  }
  return false;
}

// Valor boosts are paid consumables, so ignoring them would take away a purchased benefit.
// Their activation records already live on the server. Start pending boosts at the first
// campaign payout and price the bonus from the server catalog; the client-supplied amount is
// never trusted. Legacy activation rows without timing data are treated as pending once so
// deploying this during closed testing does not erase an already purchased boost.
async function campaignValorAmountWithServerBoosts(client: any, playerId: string, gameSlug: string, baseAmount: number): Promise<number> {
  const result = await client.query(
    `select claim_id, source_id, payload from game_progress_claims
     where player_id = $1 and game_slug = $2 and kind = 'consumable-activation'`,
    [playerId, gameSlug],
  );
  const now = new Date();
  let percentBonus = 0;
  for (const row of result.rows) {
    const input = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
    const offer = getConsumableOffer(input.itemId || row.source_id);
    if (offer?.effect?.kind !== "valor-boost") continue;
    const startsAt = cleanText(input.boostStartsAt, 80) || now.toISOString();
    const expiresAt = cleanText(input.boostExpiresAt, 80)
      || new Date(new Date(startsAt).getTime() + (Number(offer.durationHours) || 0) * 60 * 60 * 1000).toISOString();
    if (!input.boostStartsAt || !input.boostExpiresAt) {
      await client.query(
        `update game_progress_claims set payload = $4::jsonb
         where player_id = $1 and game_slug = $2 and claim_id = $3`,
        [playerId, gameSlug, row.claim_id, JSON.stringify({ ...input, itemId: offer.id, boostStartsAt: startsAt, boostExpiresAt: expiresAt })],
      );
    }
    if (Date.parse(startsAt) <= now.getTime() && Date.parse(expiresAt) > now.getTime()) {
      percentBonus += Math.max(0, Number(offer.effect.percentBonus) || 0);
    }
  }
  return baseAmount + Math.floor(baseAmount * percentBonus / 100);
}

// Normalize the inventory grants carried on a premium-consumable claim payload. Item ids are
// validated against the server catalog, so a tampered payload can never invent an item.
function buildInventoryGrants(payload: Record<string, any>): any[] {
  const rows = Array.isArray(payload.inventoryItems) ? payload.inventoryItems : [];
  const byItemId = new Map<string, number>();
  for (const row of rows) {
    const offer = getConsumableOffer(row?.itemId);
    if (!offer) continue;
    const quantity = clampInt(row?.quantity ?? 1, { min: 1, max: MAX_CONSUMABLE_PURCHASE_QUANTITY });
    byItemId.set(offer.id, Math.min(MAX_CONSUMABLE_PURCHASE_QUANTITY, (byItemId.get(offer.id) || 0) + quantity));
  }
  return [...byItemId].map(([itemId, quantity]) => ({ itemId, quantity }));
}

async function grantInventoryItem(client: any, playerId: string, gameSlug: string, itemId: string, quantity: number): Promise<void> {
  await client.query(
    `insert into game_inventory_items (player_id, game_slug, item_id, quantity)
     values ($1, $2, $3, $4)
     on conflict (player_id, game_slug, item_id) do update
       set quantity = game_inventory_items.quantity + excluded.quantity,
           updated_at = now()`,
    [playerId, gameSlug, itemId, quantity],
  );
}

// Take back consumable quantity after a refund/chargeback. Clamped at zero because the
// player may already have spent some of it — what was spent is gone, but the unspent
// remainder is removed.
async function revokeInventoryItem(client: any, playerId: string, gameSlug: string, itemId: string, quantity: number): Promise<number> {
  const res = await client.query(
    `update game_inventory_items
     set quantity = greatest(0, quantity - $4), updated_at = now()
     where player_id = $1 and game_slug = $2 and item_id = $3
     returning quantity`,
    [playerId, gameSlug, itemId, quantity],
  );
  return res.rows.length ? Number(res.rows[0].quantity) || 0 : 0;
}

// Does this player hold this exact entitlement? Used to re-validate a cosmetic pick (e.g. a
// purchased ranked avatar) server-side before storing it, the same way playerHasGameBadge
// re-validates a badge equip.
export async function playerHasGameEntitlement(pool: any, { playerId, gameSlug, entitlementId }: any): Promise<boolean> {
  if (!pool || !playerId || !gameSlug || !entitlementId) return false;
  const res = await pool.query(
    `select 1 from game_entitlements where player_id = $1 and game_slug = $2 and entitlement_id = $3 limit 1`,
    [playerId, gameSlug, entitlementId],
  );
  return res.rowCount > 0;
}

async function grantEntitlement(client: any, playerId: string, gameSlug: string, entitlement: any, source: string, sourceId: string): Promise<void> {
  await client.query(
    `insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (player_id, game_slug, entitlement_id) do update
       set quantity = greatest(game_entitlements.quantity, excluded.quantity),
           updated_at = now()`,
    [playerId, gameSlug, entitlement.entitlementId, entitlement.kind, source, sourceId],
  );
}

export function isValidGameProgressSlug(value: any): boolean {
  return Boolean(normalizeGameSlug(value));
}

export function isValidGameClaimKind(value: any): boolean {
  return VALID_CLAIM_KINDS.has(cleanText(value, 80));
}

// A claim kind that untrusted (public-route) callers are allowed to submit.
// Premium purchase kinds are excluded — those are Stripe-fulfillment only.
export function isPubliclyClaimableKind(value: any): boolean {
  const kind = cleanText(value, 80);
  return VALID_CLAIM_KINDS.has(kind) && !PREMIUM_CLAIM_KINDS.has(kind);
}

export async function getGameProgress(pool: any, playerId: any, gameSlug: any): Promise<any> {
  const normalizedPlayerId = cleanText(playerId, 120);
  const normalizedGameSlug = normalizeGameSlug(gameSlug);
  if (!pool || !normalizedPlayerId || !normalizedGameSlug) return null;

  try {
    const [profile, entitlements, campaignProgress, inventoryItems, tutorials] = await Promise.all([
      pool.query(
        `select player_id, game_slug, valor_balance, campaign_epoch, created_at, updated_at
         from game_progress_profiles
         where player_id = $1 and game_slug = $2`,
        [normalizedPlayerId, normalizedGameSlug],
      ),
      pool.query(
        `select entitlement_id, kind, source, source_id, quantity, created_at, updated_at
         from game_entitlements
         where player_id = $1 and game_slug = $2
         order by entitlement_id asc`,
        [normalizedPlayerId, normalizedGameSlug],
      ),
      pool.query(
        `select mission_id, stars, completed_at, valor_claimed_at, reward_claimed_at
         from game_campaign_progress
         where player_id = $1 and game_slug = $2
         order by mission_id asc`,
        [normalizedPlayerId, normalizedGameSlug],
      ),
      pool.query(
        `select item_id, quantity, updated_at
         from game_inventory_items
         where player_id = $1 and game_slug = $2 and quantity > 0
         order by item_id asc`,
        [normalizedPlayerId, normalizedGameSlug],
      ),
      // Tutorial completion has no table of its own — the claim row IS the record.
      // Reading it back is what lets a second device restore which tutorials are done.
      pool.query(
        `select source_id from game_progress_claims
         where player_id = $1 and game_slug = $2 and kind = 'tutorial-complete' and source_id <> ''
         order by source_id asc`,
        [normalizedPlayerId, normalizedGameSlug],
      ),
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
      completedTutorials: tutorials.rows.map((tutorialRow: any) => cleanText(tutorialRow.source_id, 200)).filter(Boolean),
      inventoryItems: inventoryItems.rows.map(rowToInventoryItem),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    };
  } catch (err) {
    process.stderr.write(`[game-progress] getGameProgress error: ${(err as any)?.message || err}\n`);
    return null;
  }
}

export async function recordGameProgressClaim(pool: any, params: any = {}): Promise<any> {
  const playerId = cleanText(params.playerId, 120);
  const gameSlug = normalizeGameSlug(params.gameSlug);
  const claimId = cleanText(params.claimId, 200);
  const kind = cleanText(params.kind, 80);
  let payload = normalizePayload(params.payload);
  let sourceId = cleanText(params.sourceId || payload.sessionId || payload.missionId || payload.packId || payload.tutorialId || "", 200);
  if (!pool || !playerId || !gameSlug || !claimId || !VALID_CLAIM_KINDS.has(kind)) return null;
  // Defense in depth: even if a premium kind reaches this layer, only the trusted
  // Stripe fulfillment path (allowPremiumKinds: true) may grant a paid entitlement.
  if (PREMIUM_CLAIM_KINDS.has(kind) && params.allowPremiumKinds !== true) {
    process.stderr.write(`[game-progress] refused premium claim kind '${kind}' from untrusted caller (player=${playerId})\n`);
    return null;
  }

  let publicClaim: any = null;
  if (!PREMIUM_CLAIM_KINDS.has(kind)) {
    publicClaim = validateTacticalArenaPublicClaim({ gameSlug, claimId, kind, sourceId, payload });
    if (!publicClaim.ok) return publicClaim;
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
    const claim = await client.query(
      `insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`,
      [playerId, gameSlug, claimId, kind, sourceId, JSON.stringify(payload)],
    );

    const alreadyProcessed = claim.rowCount === 0;
    if (!alreadyProcessed && kind === "campaign-valor") {
      const amount = await campaignValorAmountWithServerBoosts(client, playerId, gameSlug, publicClaim.valorBase);
      payload = { ...payload, amount };
      await client.query(
        `update game_progress_claims set payload = $4::jsonb
         where player_id = $1 and game_slug = $2 and claim_id = $3`,
        [playerId, gameSlug, claimId, JSON.stringify(payload)],
      );
      const missionId = cleanText(payload.missionId || sourceId, 200);
      if (amount > 0) {
        await client.query(
          `update game_progress_profiles
           set valor_balance = valor_balance + $3, updated_at = now()
           where player_id = $1 and game_slug = $2`,
          [playerId, gameSlug, amount],
        );
      }
      if (missionId) {
        await markCampaignProgress(client, playerId, gameSlug, missionId, {
          stars: payload.stars,
          valorClaimedAt: amount > 0 ? new Date().toISOString() : null,
        });
      }
    } else if (!alreadyProcessed && kind === "campaign-progress") {
      const missionId = cleanText(payload.missionId || sourceId, 200);
      // Stars only. markCampaignProgress takes greatest(existing, new), so replaying an
      // older result can never walk a player's best score backwards.
      //
      // The claim row is recorded either way — a stale device that keeps a queued claim
      // must be able to retire it — but a pre-reset claim is not allowed to write.
      const stale = await isStaleCampaignClaim(client, playerId, gameSlug, payload.campaignEpoch);
      if (missionId && !stale) await markCampaignProgress(client, playerId, gameSlug, missionId, { stars: payload.stars });
    } else if (!alreadyProcessed && kind === "campaign-skin-choice") {
      const missionId = cleanText(payload.missionId || sourceId, 200);
      const entitlement = buildSkinEntitlement(payload);
      if (entitlement) await grantEntitlement(client, playerId, gameSlug, entitlement, "campaign", sourceId || missionId);
      if (missionId) await markCampaignProgress(client, playerId, gameSlug, missionId, { stars: payload.stars, rewardClaimedAt: new Date().toISOString() });
    } else if (!alreadyProcessed && kind === "campaign-unit-choice") {
      const missionId = cleanText(payload.missionId || sourceId, 200);
      const entitlement = buildUnitEntitlement(payload);
      if (entitlement) await grantEntitlement(client, playerId, gameSlug, entitlement, "campaign", sourceId || missionId);
      if (missionId) await markCampaignProgress(client, playerId, gameSlug, missionId, { stars: payload.stars, rewardClaimedAt: new Date().toISOString() });
    } else if (!alreadyProcessed && kind === "tutorial-valor") {
      const amount = clampInt(payload.amount, { min: 0, max: 100000 });
      if (amount > 0) {
        await client.query(
          `update game_progress_profiles
           set valor_balance = valor_balance + $3, updated_at = now()
           where player_id = $1 and game_slug = $2`,
          [playerId, gameSlug, amount],
        );
      }
    } else if (!alreadyProcessed && kind === "tutorial-skin-choice") {
      const entitlement = buildSkinEntitlement(payload);
      if (entitlement) await grantEntitlement(client, playerId, gameSlug, entitlement, "tutorial", sourceId);
    } else if (!alreadyProcessed && kind === "tutorial-unit-reward") {
      const entitlement = buildUnitEntitlement(payload);
      if (entitlement) await grantEntitlement(client, playerId, gameSlug, entitlement, "tutorial", sourceId);
    } else if (!alreadyProcessed && kind === "premium-skin-purchase") {
      const entitlements = buildSkinPurchaseEntitlements(payload);
      for (const entitlement of entitlements) {
        await grantEntitlement(client, playerId, gameSlug, entitlement, "stripe", sourceId || claimId);
      }
    } else if (!alreadyProcessed && kind === "premium-unit-purchase") {
      const entitlements = buildUnitPurchaseEntitlements(payload);
      for (const entitlement of entitlements) {
        await grantEntitlement(client, playerId, gameSlug, entitlement, "stripe", sourceId || claimId);
      }
    } else if (!alreadyProcessed && kind === "premium-consumable-purchase") {
      for (const grant of buildInventoryGrants(payload)) {
        await grantInventoryItem(client, playerId, gameSlug, grant.itemId, grant.quantity);
      }
    }

    await client.query("commit");
    return {
      ok: true,
      alreadyProcessed,
      progress: await getGameProgress(pool, playerId, gameSlug),
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[game-progress] recordGameProgressClaim error: ${(err as any)?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

// Atomically spend Valor on an entitlement. The charge is computed server-side from the
// catalog (services/valor-catalog) — the client never supplies a price. The profile row is
// locked FOR UPDATE so concurrent spends cannot double-charge, and the balance check plus
// the `valor_balance >= 0` column constraint make an overspend impossible.
export async function spendValorForEntitlement(pool: any, params: any = {}): Promise<any> {
  const playerId = cleanText(params.playerId, 120);
  const gameSlug = normalizeGameSlug(params.gameSlug);
  if (!pool || !playerId || !gameSlug) return { ok: false, statusCode: 400, error: "invalid_request" };

  const resolved = getValorOffer(params.offer);
  if (!resolved.ok) return resolved;

  const client = await pool.connect();
  try {
    await client.query("begin");
    await ensureGameProgressProfile(client, playerId, gameSlug);
    const profileRes = await client.query(
      `select valor_balance from game_progress_profiles
       where player_id = $1 and game_slug = $2 for update`,
      [playerId, gameSlug],
    );
    const valorBalance = Number(profileRes.rows[0]?.valor_balance) || 0;

    const requestedIds = resolved.entitlements.map((entry: any) => entry.entitlementId);
    const ownedRes = await client.query(
      `select entitlement_id from game_entitlements
       where player_id = $1 and game_slug = $2 and entitlement_id = any($3::text[])`,
      [playerId, gameSlug, requestedIds],
    );
    const ownedIds = new Set<string>(ownedRes.rows.map((row: any) => row.entitlement_id));

    const priced = priceValorOffer(resolved, ownedIds);
    if (priced.alreadyOwned) {
      await client.query("rollback");
      return { ok: false, statusCode: 409, error: "offer_already_owned" };
    }
    if (valorBalance < priced.valorCost) {
      await client.query("rollback");
      return { ok: false, statusCode: 402, error: "insufficient_valor" };
    }

    const deductRes = await client.query(
      `update game_progress_profiles
       set valor_balance = valor_balance - $3, updated_at = now()
       where player_id = $1 and game_slug = $2 and valor_balance >= $3
       returning valor_balance`,
      [playerId, gameSlug, priced.valorCost],
    );
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
      entitlementIds: priced.grants.map((grant: any) => grant.entitlementId),
      progress: await getGameProgress(pool, playerId, gameSlug),
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[game-progress] spendValorForEntitlement error: ${(err as any)?.message || err}\n`);
    return { ok: false, statusCode: 500, error: "spend_failed" };
  } finally {
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
export async function activateInventoryItem(pool: any, params: any = {}): Promise<any> {
  const playerId = cleanText(params.playerId, 120);
  const gameSlug = normalizeGameSlug(params.gameSlug);
  const activationId = cleanText(params.activationId, 120);
  if (!pool || !playerId || !gameSlug || !activationId) {
    return { ok: false, statusCode: 400, error: "invalid_request" };
  }
  const offer = getConsumableOffer(params.itemId);
  if (!offer) return { ok: false, statusCode: 400, error: "item_not_found" };

  const claimId = `consumable-activation:${activationId}`;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await ensureGameProgressProfile(client, playerId, gameSlug);

    const claim = await client.query(
      `insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'consumable-activation', $4, '{}'::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`,
      [playerId, gameSlug, claimId, offer.id],
    );
    if (claim.rowCount === 0) {
      // Already activated under this id — replay what it granted rather than spending again.
      const previous = await client.query(
        `select payload from game_progress_claims
         where player_id = $1 and game_slug = $2 and claim_id = $3`,
        [playerId, gameSlug, claimId],
      );
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

    const spent = await client.query(
      `update game_inventory_items
       set quantity = quantity - 1, updated_at = now()
       where player_id = $1 and game_slug = $2 and item_id = $3 and quantity > 0
       returning quantity`,
      [playerId, gameSlug, offer.id],
    );
    if (!spent.rows.length) {
      await client.query("rollback");
      return { ok: false, statusCode: 409, error: "item_not_owned" };
    }

    const entitlementIds: string[] = [];
    if (offer.effect?.kind === "random-unowned-skin") {
      const ownedRes = await client.query(
        `select entitlement_id from game_entitlements
         where player_id = $1 and game_slug = $2 and kind = 'skin'`,
        [playerId, gameSlug],
      );
      const ownedEntitlementIds = new Set<string>(ownedRes.rows.map((row: any) => row.entitlement_id));
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

    await client.query(
      `update game_progress_claims set payload = $4::jsonb
       where player_id = $1 and game_slug = $2 and claim_id = $3`,
      [playerId, gameSlug, claimId, JSON.stringify({ itemId: offer.id, entitlementIds })],
    );
    await client.query("commit");
    return {
      ok: true,
      alreadyProcessed: false,
      itemId: offer.id,
      effect: offer.effect,
      entitlementIds,
      progress: await getGameProgress(pool, playerId, gameSlug),
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[game-progress] activateInventoryItem error: ${(err as any)?.message || err}\n`);
    return { ok: false, statusCode: 500, error: "activation_failed" };
  } finally {
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
export async function resetCampaignProgress(pool: any, playerId: any, gameSlug: any): Promise<any> {
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
    await client.query(
      `delete from game_campaign_progress where player_id = $1 and game_slug = $2`,
      [normalizedPlayerId, normalizedGameSlug],
    );
    // Claim rows are deliberately left alone. Deleting them would let the player re-earn
    // every mission's Valor and re-pick every reward pack; the campaign-progress claims
    // that DO need to be re-recordable get a fresh id from the new epoch instead.
    await client.query(
      `update game_progress_profiles
       set campaign_epoch = campaign_epoch + 1, updated_at = now()
       where player_id = $1 and game_slug = $2`,
      [normalizedPlayerId, normalizedGameSlug],
    );
    await client.query("commit");
    return { ok: true, progress: await getGameProgress(pool, normalizedPlayerId, normalizedGameSlug) };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[game-progress] resetCampaignProgress error: ${(err as any)?.message || err}\n`);
    return { ok: false, statusCode: 500, error: "reset_failed" };
  } finally {
    client.release();
  }
}

// One-time, per-account migration of a signed-in player's existing LOCAL ownership to the
// server, so switching to server-authoritative ownership never loses what a player already
// had. Gated by a single claim row (`migration:local-ownership-v1`) so it runs exactly once
// per account — after that, injected local entitlements can never be re-grandfathered.
// Entitlement ids are format-validated (real-shaped ids only) and capped.
const VALID_ENTITLEMENT_ID = /^(unit:[a-z0-9-]{1,60}|skin:[a-z0-9-]{1,60}:[a-z0-9-]{1,80})$/;
const VALID_BACKFILL_ENTITLEMENTS = new Set<string>([
  ...UNIT_CATALOG.map((unit: any) => `unit:${unit.type}`),
  ...SKIN_CATALOG.map((skin: any) => skin.entitlementId),
]);
const MAX_BACKFILL_ENTITLEMENTS = 2000;
const OWNERSHIP_BACKFILL_CLAIM_ID = "migration:local-ownership-v1";
// The server-authority migration was complete by this cutoff. Only accounts that existed
// before it may import legacy local ownership/Valor; newer accounts earn through canonical
// progress claims and server-side purchases, so a client backfill has no trusted history.
const LEGACY_BACKFILL_CUTOFF = Date.parse("2026-07-28T00:00:00.000Z");

export async function backfillLocalOwnership(pool: any, params: any = {}): Promise<any> {
  const playerId = cleanText(params.playerId, 120);
  const gameSlug = normalizeGameSlug(params.gameSlug);
  if (!pool || !playerId || !gameSlug) return { ok: false, statusCode: 400, error: "invalid_request" };

  const rawIds = Array.isArray(params.entitlementIds) ? params.entitlementIds : [];
  const entitlementIds = [...new Set<string>(
    rawIds.map((value: any) => cleanText(value, 160))
      .filter((id: string) => VALID_ENTITLEMENT_ID.test(id) && VALID_BACKFILL_ENTITLEMENTS.has(id)),
  )].slice(0, MAX_BACKFILL_ENTITLEMENTS);
  const valorBalance = clampInt(params.valorBalance, { min: 0, max: 100_000_000 });

  const client = await pool.connect();
  try {
    await client.query("begin");
    await ensureGameProgressProfile(client, playerId, gameSlug);
    // An empty payload has nothing to grandfather, so it must not consume the one-shot.
    // A fresh device (notably a new packaged-app install signing into an existing account)
    // legitimately backfills an empty local set; if that burned the migration, the device
    // that actually held the progress could never migrate it and the account would be
    // stuck at zero ownership forever. Report the existing migration state instead.
    if (!entitlementIds.length && valorBalance <= 0) {
      const existing = await client.query(
        `select 1 from game_progress_claims
         where player_id = $1 and game_slug = $2 and claim_id = $3 limit 1`,
        [playerId, gameSlug, OWNERSHIP_BACKFILL_CLAIM_ID],
      );
      await client.query("commit");
      return {
        ok: true,
        alreadyMigrated: (existing.rowCount ?? 0) > 0,
        progress: await getGameProgress(pool, playerId, gameSlug),
      };
    }
    const account = await client.query(
      `select created_at from accounts where player_id = $1 order by created_at asc limit 1`,
      [playerId],
    );
    const accountCreatedAt = Date.parse(account.rows[0]?.created_at || "");
    const legacyMigrationEligible = Number.isFinite(accountCreatedAt) && accountCreatedAt < LEGACY_BACKFILL_CUTOFF;
    if (!legacyMigrationEligible) {
      await client.query("commit");
      return {
        ok: true,
        alreadyMigrated: true,
        progress: await getGameProgress(pool, playerId, gameSlug),
      };
    }
    // Whether the server owns anything at all for this player. Before the empty-payload fix,
    // an old account could consume its one shot without granting anything. The dated repair
    // below remains available only to accounts that existed before that fix; newer accounts
    // cannot reopen a consumed migration merely because their server set is empty.
    const owned = await client.query(
      `select 1 from game_entitlements where player_id = $1 and game_slug = $2 limit 1`,
      [playerId, gameSlug],
    );
    const serverOwnsNothing = (owned.rows?.length ?? 0) === 0;
    const claim = await client.query(
      `insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'migration', '', '{}'::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`,
      [playerId, gameSlug, OWNERSHIP_BACKFILL_CLAIM_ID],
    );
    const strandedRepairEligible = claim.rowCount === 0 && serverOwnsNothing;
    const alreadyMigrated = claim.rowCount === 0 && !strandedRepairEligible;
    if (!alreadyMigrated) {
      for (const entitlementId of entitlementIds) {
        const kind = entitlementId.startsWith("unit:") ? "unit" : "skin";
        await grantEntitlement(client, playerId, gameSlug, { entitlementId, kind }, "migration", OWNERSHIP_BACKFILL_CLAIM_ID);
      }
      if (valorBalance > 0) {
        await client.query(
          `update game_progress_profiles
           set valor_balance = greatest(valor_balance, $3), updated_at = now()
           where player_id = $1 and game_slug = $2`,
          [playerId, gameSlug, valorBalance],
        );
      }
    }
    await client.query("commit");
    return { ok: true, alreadyMigrated, progress: await getGameProgress(pool, playerId, gameSlug) };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[game-progress] backfillLocalOwnership error: ${(err as any)?.message || err}\n`);
    return { ok: false, statusCode: 500, error: "backfill_failed" };
  } finally {
    client.release();
  }
}

// Find the premium (Stripe) grant claim behind a payment, so a later refund/dispute event
// — which only carries a payment_intent / charge, never the checkout session metadata — can
// be traced back to what was granted. Matches on the payment_intent stored in the grant
// payload, or on the checkout-session id (`stripe-checkout:<sessionId>`) as a fallback.
export async function findStripeGrant(pool: any, params: any = {}): Promise<any> {
  const paymentIntentId = cleanText(params.paymentIntentId, 200);
  const sessionId = cleanText(params.sessionId, 200);
  if (!pool || (!paymentIntentId && !sessionId)) return null;

  const conditions: string[] = [];
  const values: any[] = [];
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
    const res = await pool.query(
      `select player_id, game_slug, claim_id, payload
       from game_progress_claims
       where kind = any($${values.length}::text[])
         and (${conditions.join(" or ")})
       order by created_at asc
       limit 1`,
      values,
    );
    const row = res.rows[0];
    if (!row) return null;
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    const entitlementIds = [...new Set(
      (Array.isArray(payload.entitlementIds) ? payload.entitlementIds : [])
        .map((value: any) => cleanText(value, 180))
        .filter(Boolean),
    )];
    return {
      playerId: cleanText(row.player_id, 120),
      gameSlug: normalizeGameSlug(row.game_slug),
      sessionId: cleanText(payload.sessionId, 200) || cleanText(row.claim_id, 200).replace(/^stripe-checkout:/, ""),
      paymentIntentId: cleanText(payload.paymentIntentId, 200),
      entitlementIds,
      inventoryItems: buildInventoryGrants(payload),
    };
  } catch (err) {
    process.stderr.write(`[game-progress] findStripeGrant error: ${(err as any)?.message || err}\n`);
    return null;
  }
}

// Find which account, if any, has already been granted a given Google Play purchase.
//
// Play purchase tokens are bearer values: whoever holds one can post it. Claim rows are keyed
// per player, so without this lookup the same token replayed under a second account would open
// a second claim and grant the item twice. The token itself is never stored — only a hash — so
// this is a pure "has anyone already redeemed this?" check.
export async function findPlayPurchaseClaim(pool: any, params: any = {}): Promise<any> {
  const tokenHash = cleanText(params.purchaseTokenHash, 128);
  if (!pool || !tokenHash) return null;
  try {
    const res = await pool.query(
      `select player_id, game_slug, claim_id
       from game_progress_claims
       where kind = any($1::text[]) and payload->>'playPurchaseTokenHash' = $2
       order by created_at asc
       limit 1`,
      [PREMIUM_GRANT_CLAIM_KINDS, tokenHash],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      playerId: cleanText(row.player_id, 120),
      gameSlug: normalizeGameSlug(row.game_slug),
      claimId: cleanText(row.claim_id, 200),
    };
  } catch (err) {
    process.stderr.write(`[game-progress] findPlayPurchaseClaim error: ${(err as any)?.message || err}\n`);
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
export async function revokeGameEntitlements(pool: any, params: any = {}): Promise<any> {
  const playerId = cleanText(params.playerId, 120);
  const gameSlug = normalizeGameSlug(params.gameSlug);
  const sessionId = cleanText(params.sessionId, 200);
  const revocationId = cleanText(params.revocationId, 200);
  const reason = cleanText(params.reason, 80) || "revoked";
  const entitlementIds = [...new Set<string>(
    (Array.isArray(params.entitlementIds) ? params.entitlementIds : [])
      .map((value: any) => cleanText(value, 180))
      .filter(Boolean),
  )];
  const inventoryItems = buildInventoryGrants({ inventoryItems: params.inventoryItems });
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
    const claim = await client.query(
      `insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'premium-revocation', $4, $5::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`,
      [playerId, gameSlug, `stripe-revocation:${revocationId}`, sessionId, JSON.stringify({ reason, sessionId, entitlementIds, inventoryItems })],
    );
    const alreadyProcessed = claim.rowCount === 0;
    let revoked: string[] = [];
    const revokedItems: any[] = [];
    if (!alreadyProcessed) {
      if (entitlementIds.length) {
        const del = await client.query(
          `delete from game_entitlements
           where player_id = $1 and game_slug = $2
             and source = 'stripe'
             and entitlement_id = any($3::text[])
             ${sessionId ? "and source_id = $4" : ""}
           returning entitlement_id`,
          sessionId ? [playerId, gameSlug, entitlementIds, sessionId] : [playerId, gameSlug, entitlementIds],
        );
        revoked = del.rows.map((row: any) => row.entitlement_id);
      }
      for (const item of inventoryItems) {
        const remaining = await revokeInventoryItem(client, playerId, gameSlug, item.itemId, item.quantity);
        revokedItems.push({ itemId: item.itemId, quantity: item.quantity, remaining });
      }
      process.stderr.write(`[game-progress] revoked ${revoked.length} entitlement(s) and ${revokedItems.length} item(s) (player=${playerId} reason=${reason} revocation=${revocationId})\n`);
    }
    await client.query("commit");
    return { ok: true, alreadyProcessed, revoked, revokedItems, progress: await getGameProgress(pool, playerId, gameSlug) };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[game-progress] revokeGameEntitlements error: ${(err as any)?.message || err}\n`);
    return { ok: false, statusCode: 500, error: "revoke_failed" };
  } finally {
    client.release();
  }
}

// Re-grant premium entitlements when a dispute is resolved in the merchant's favor (won).
// Idempotent via an audit claim (`stripe-regrant:<disputeId>`). Rows are restored as
// `source='stripe'` with this purchase's session id, mirroring the original grant.
export async function regrantStripeEntitlements(pool: any, params: any = {}): Promise<any> {
  const playerId = cleanText(params.playerId, 120);
  const gameSlug = normalizeGameSlug(params.gameSlug);
  const sessionId = cleanText(params.sessionId, 200);
  const regrantId = cleanText(params.regrantId, 200);
  const entitlementIds = [...new Set<string>(
    (Array.isArray(params.entitlementIds) ? params.entitlementIds : [])
      .map((value: any) => cleanText(value, 180))
      .filter(Boolean),
  )];
  const inventoryItems = buildInventoryGrants({ inventoryItems: params.inventoryItems });
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
    const claim = await client.query(
      `insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'premium-regrant', $4, $5::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`,
      [playerId, gameSlug, `stripe-regrant:${regrantId}`, sessionId, JSON.stringify({ sessionId, entitlementIds, inventoryItems })],
    );
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
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[game-progress] regrantStripeEntitlements error: ${(err as any)?.message || err}\n`);
    return { ok: false, statusCode: 500, error: "regrant_failed" };
  } finally {
    client.release();
  }
}
