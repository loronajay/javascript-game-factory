import { getValorOffer, priceValorOffer } from "../services/valor-catalog.mjs";

const VALID_GAME_SLUG = /^[a-z0-9-]{1,60}$/;
const VALID_CLAIM_KINDS = new Set([
  "campaign-valor",
  "campaign-skin-choice",
  "campaign-unit-choice",
  "tutorial-complete",
  "tutorial-valor",
  "tutorial-unit-reward",
  "tutorial-skin-choice",
  "premium-skin-purchase",
  "premium-unit-purchase",
]);

// Premium (real-money) entitlements must never be grantable through the public
// claims route. They may only be recorded by the server-side Stripe fulfillment
// path, which calls recordGameProgressClaim with allowPremiumKinds: true after a
// verified payment. Every other caller is untrusted and is refused below.
const PREMIUM_CLAIM_KINDS = new Set([
  "premium-skin-purchase",
  "premium-unit-purchase",
]);

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

function buildSkinPurchaseEntitlements(payload: Record<string, any>): any[] {
  const rawEntitlementIds = [
    payload.entitlementId,
    ...(Array.isArray(payload.entitlementIds) ? payload.entitlementIds : []),
  ];
  const entitlementIds = [...new Set(rawEntitlementIds.map((value) => cleanText(value, 180)).filter(Boolean))];
  return entitlementIds
    .filter((entitlementId) => entitlementId.startsWith("skin:"))
    .map((entitlementId) => ({ entitlementId, kind: "skin" }));
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
    const [profile, entitlements, campaignProgress, inventoryItems] = await Promise.all([
      pool.query(
        `select player_id, game_slug, valor_balance, created_at, updated_at
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
  const payload = normalizePayload(params.payload);
  const sourceId = cleanText(params.sourceId || payload.sessionId || payload.missionId || payload.packId || payload.tutorialId || "", 200);
  if (!pool || !playerId || !gameSlug || !claimId || !VALID_CLAIM_KINDS.has(kind)) return null;
  // Defense in depth: even if a premium kind reaches this layer, only the trusted
  // Stripe fulfillment path (allowPremiumKinds: true) may grant a paid entitlement.
  if (PREMIUM_CLAIM_KINDS.has(kind) && params.allowPremiumKinds !== true) {
    process.stderr.write(`[game-progress] refused premium claim kind '${kind}' from untrusted caller (player=${playerId})\n`);
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await ensureGameProgressProfile(client, playerId, gameSlug);
    const claim = await client.query(
      `insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`,
      [playerId, gameSlug, claimId, kind, sourceId, JSON.stringify(payload)],
    );

    const alreadyProcessed = claim.rowCount === 0;
    if (!alreadyProcessed && kind === "campaign-valor") {
      const amount = clampInt(payload.amount, { min: 0, max: 100000 });
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
    const ownedIds = new Set(ownedRes.rows.map((row: any) => row.entitlement_id));

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

// Reset campaign mission progress ONLY. Per the in-game Reset Progress contract, Valor,
// unit/skin entitlements, and tutorial progress are intentionally preserved — this only
// clears game_campaign_progress rows so the player can replay missions.
export async function resetCampaignProgress(pool: any, playerId: any, gameSlug: any): Promise<any> {
  const normalizedPlayerId = cleanText(playerId, 120);
  const normalizedGameSlug = normalizeGameSlug(gameSlug);
  if (!pool || !normalizedPlayerId || !normalizedGameSlug) {
    return { ok: false, statusCode: 400, error: "invalid_request" };
  }
  try {
    await pool.query(
      `delete from game_campaign_progress where player_id = $1 and game_slug = $2`,
      [normalizedPlayerId, normalizedGameSlug],
    );
    return { ok: true, progress: await getGameProgress(pool, normalizedPlayerId, normalizedGameSlug) };
  } catch (err) {
    process.stderr.write(`[game-progress] resetCampaignProgress error: ${(err as any)?.message || err}\n`);
    return { ok: false, statusCode: 500, error: "reset_failed" };
  }
}

// One-time, per-account migration of a signed-in player's existing LOCAL ownership to the
// server, so switching to server-authoritative ownership never loses what a player already
// had. Gated by a single claim row (`migration:local-ownership-v1`) so it runs exactly once
// per account — after that, injected local entitlements can never be re-grandfathered.
// Entitlement ids are format-validated (real-shaped ids only) and capped.
const VALID_ENTITLEMENT_ID = /^(unit:[a-z0-9-]{1,60}|skin:[a-z0-9-]{1,60}:[a-z0-9-]{1,80})$/;
const MAX_BACKFILL_ENTITLEMENTS = 2000;
const OWNERSHIP_BACKFILL_CLAIM_ID = "migration:local-ownership-v1";

export async function backfillLocalOwnership(pool: any, params: any = {}): Promise<any> {
  const playerId = cleanText(params.playerId, 120);
  const gameSlug = normalizeGameSlug(params.gameSlug);
  if (!pool || !playerId || !gameSlug) return { ok: false, statusCode: 400, error: "invalid_request" };

  const rawIds = Array.isArray(params.entitlementIds) ? params.entitlementIds : [];
  const entitlementIds = [...new Set(
    rawIds.map((value: any) => cleanText(value, 160)).filter((id: string) => VALID_ENTITLEMENT_ID.test(id)),
  )].slice(0, MAX_BACKFILL_ENTITLEMENTS);
  const valorBalance = clampInt(params.valorBalance, { min: 0, max: 100_000_000 });

  const client = await pool.connect();
  try {
    await client.query("begin");
    await ensureGameProgressProfile(client, playerId, gameSlug);
    const claim = await client.query(
      `insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'migration', '', '{}'::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`,
      [playerId, gameSlug, OWNERSHIP_BACKFILL_CLAIM_ID],
    );
    const alreadyMigrated = claim.rowCount === 0;
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
    const res = await pool.query(
      `select player_id, game_slug, claim_id, payload
       from game_progress_claims
       where kind in ('premium-skin-purchase', 'premium-unit-purchase')
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
    };
  } catch (err) {
    process.stderr.write(`[game-progress] findStripeGrant error: ${(err as any)?.message || err}\n`);
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
  const entitlementIds = [...new Set(
    (Array.isArray(params.entitlementIds) ? params.entitlementIds : [])
      .map((value: any) => cleanText(value, 180))
      .filter(Boolean),
  )];
  if (!pool || !playerId || !gameSlug || !revocationId) {
    return { ok: false, statusCode: 400, error: "invalid_request" };
  }
  if (!entitlementIds.length) return { ok: true, alreadyProcessed: false, revoked: [] };

  const client = await pool.connect();
  try {
    await client.query("begin");
    await ensureGameProgressProfile(client, playerId, gameSlug);
    const claim = await client.query(
      `insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'premium-revocation', $4, $5::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`,
      [playerId, gameSlug, `stripe-revocation:${revocationId}`, sessionId, JSON.stringify({ reason, sessionId, entitlementIds })],
    );
    const alreadyProcessed = claim.rowCount === 0;
    let revoked: string[] = [];
    if (!alreadyProcessed) {
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
      process.stderr.write(`[game-progress] revoked ${revoked.length} entitlement(s) (player=${playerId} reason=${reason} revocation=${revocationId})\n`);
    }
    await client.query("commit");
    return { ok: true, alreadyProcessed, revoked, progress: await getGameProgress(pool, playerId, gameSlug) };
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
  const entitlementIds = [...new Set(
    (Array.isArray(params.entitlementIds) ? params.entitlementIds : [])
      .map((value: any) => cleanText(value, 180))
      .filter(Boolean),
  )];
  if (!pool || !playerId || !gameSlug || !regrantId) {
    return { ok: false, statusCode: 400, error: "invalid_request" };
  }
  if (!entitlementIds.length) return { ok: true, alreadyProcessed: false, regranted: [] };

  const client = await pool.connect();
  try {
    await client.query("begin");
    await ensureGameProgressProfile(client, playerId, gameSlug);
    const claim = await client.query(
      `insert into game_progress_claims (player_id, game_slug, claim_id, kind, source_id, payload)
       values ($1, $2, $3, 'premium-regrant', $4, $5::jsonb)
       on conflict (player_id, game_slug, claim_id) do nothing`,
      [playerId, gameSlug, `stripe-regrant:${regrantId}`, sessionId, JSON.stringify({ sessionId, entitlementIds })],
    );
    const alreadyProcessed = claim.rowCount === 0;
    if (!alreadyProcessed) {
      for (const entitlementId of entitlementIds) {
        const kind = entitlementId.startsWith("unit:") ? "unit" : "skin";
        await grantEntitlement(client, playerId, gameSlug, { entitlementId, kind }, "stripe", sessionId || `stripe-regrant:${regrantId}`);
      }
    }
    await client.query("commit");
    return { ok: true, alreadyProcessed, regranted: alreadyProcessed ? [] : entitlementIds, progress: await getGameProgress(pool, playerId, gameSlug) };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[game-progress] regrantStripeEntitlements error: ${(err as any)?.message || err}\n`);
    return { ok: false, statusCode: 500, error: "regrant_failed" };
  } finally {
    client.release();
  }
}
