import { findTicketShop } from "../services/ticket-shop-registry.mjs";
const WELCOME_TICKETS = 5000;
function requiredText(value, field) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized)
        throw new TypeError(`${field} is required`);
    return normalized;
}
function presentWallet(row) {
    return {
        balance: Math.max(0, Number(row?.balance) || 0),
        ...(row?.created_at ? { createdAt: row.created_at } : {}),
        ...(row?.updated_at ? { updatedAt: row.updated_at } : {}),
    };
}
async function ensureTicketWallet(client, playerId) {
    const inserted = await client.query(`insert into ticket_wallets (player_id, balance)
     values ($1, $2)
     on conflict (player_id) do nothing
     returning player_id`, [playerId, WELCOME_TICKETS]);
    if (!inserted.rows?.length)
        return;
    await client.query(`insert into ticket_transactions
       (player_id, transaction_key, amount, reason, metadata)
     values ($1, 'welcome', $2, 'welcome_grant', '{}'::jsonb)
     on conflict (player_id, transaction_key) do nothing
     returning amount`, [playerId, WELCOME_TICKETS]);
}
export async function getTicketWalletInTransaction(client, rawPlayerId) {
    const playerId = requiredText(rawPlayerId, "playerId");
    await ensureTicketWallet(client, playerId);
    const result = await client.query(`select balance, created_at, updated_at
     from ticket_wallets
     where player_id = $1`, [playerId]);
    return result.rows?.[0] ? presentWallet(result.rows[0]) : null;
}
async function inTransaction(pool, work) {
    const client = await pool.connect();
    try {
        await client.query("begin");
        const result = await work(client);
        await client.query("commit");
        return result;
    }
    catch (error) {
        await client.query("rollback");
        throw error;
    }
    finally {
        client.release();
    }
}
export async function getTicketWallet(pool, rawPlayerId) {
    const playerId = requiredText(rawPlayerId, "playerId");
    return inTransaction(pool, (client) => getTicketWalletInTransaction(client, playerId));
}
export async function awardTicketsInTransaction(client, input) {
    const playerId = requiredText(input?.playerId, "playerId");
    const transactionKey = requiredText(input?.transactionKey, "transactionKey");
    const reason = requiredText(input?.reason, "reason");
    const amount = Number(input?.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new TypeError("amount must be a positive integer");
    }
    const metadata = input?.metadata && typeof input.metadata === "object" ? input.metadata : {};
    await ensureTicketWallet(client, playerId);
    const inserted = await client.query(`insert into ticket_transactions
         (player_id, transaction_key, amount, reason, metadata)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (player_id, transaction_key) do nothing
       returning amount`, [playerId, transactionKey, amount, reason, JSON.stringify(metadata)]);
    if (inserted.rows?.length) {
        const updated = await client.query(`update ticket_wallets
         set balance = balance + $2, updated_at = now()
         where player_id = $1
         returning balance, updated_at`, [playerId, amount]);
        return {
            awarded: amount,
            balance: Number(updated.rows[0]?.balance) || 0,
            duplicate: false,
        };
    }
    const existing = await client.query(`select balance, created_at, updated_at
       from ticket_wallets
       where player_id = $1`, [playerId]);
    return {
        awarded: 0,
        balance: presentWallet(existing.rows[0]).balance,
        duplicate: true,
    };
}
export async function awardTickets(pool, input) {
    // Validate before acquiring a connection so malformed internal calls do not
    // even open a transaction. The in-transaction function validates again to
    // remain safe when result settlement calls it directly.
    requiredText(input?.playerId, "playerId");
    requiredText(input?.transactionKey, "transactionKey");
    requiredText(input?.reason, "reason");
    const amount = Number(input?.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new TypeError("amount must be a positive integer");
    }
    return inTransaction(pool, (client) => awardTicketsInTransaction(client, input));
}
/** Shared atomic debit primitive for every ticket-funded domain action. */
export async function spendTicketsInTransaction(client, input) {
    const playerId = requiredText(input?.playerId, "playerId");
    const transactionKey = requiredText(input?.transactionKey, "transactionKey");
    const reason = requiredText(input?.reason, "reason");
    const amount = Number(input?.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0)
        throw new TypeError("amount must be a positive integer");
    const metadata = input?.metadata && typeof input.metadata === "object" ? input.metadata : {};
    await ensureTicketWallet(client, playerId);
    const locked = await client.query(`select balance from ticket_wallets where player_id = $1 for update`, [playerId]);
    const balance = presentWallet(locked.rows[0]).balance;
    const existing = await client.query(`select amount from ticket_transactions where player_id = $1 and transaction_key = $2`, [playerId, transactionKey]);
    if (existing.rows?.length)
        return { ok: true, duplicate: true, spent: 0, balance };
    const debited = await client.query(`update ticket_wallets set balance = balance - $2, updated_at = now()
     where player_id = $1 and balance >= $2 returning balance, updated_at`, [playerId, amount]);
    if (!debited.rows?.length)
        return { ok: false, error: "insufficient_tickets", duplicate: false, spent: 0, balance };
    await client.query(`insert into ticket_transactions (player_id, transaction_key, amount, reason, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`, [playerId, transactionKey, -amount, reason, JSON.stringify(metadata)]);
    return { ok: true, duplicate: false, spent: amount, balance: Number(debited.rows[0].balance) || 0 };
}
/** Read one registered shop with this player's wallet and durable ownership. */
export async function getTicketShop(pool, input) {
    const playerId = requiredText(input?.playerId, "playerId");
    const shop = findTicketShop(input?.shopSlug);
    if (!shop)
        throw new TypeError("unknown ticket shop");
    return inTransaction(pool, async (client) => {
        const wallet = await getTicketWalletInTransaction(client, playerId);
        const owned = await client.query(`select entitlement_id from game_entitlements
       where player_id = $1 and game_slug = $2`, [playerId, shop.entitlementGameSlug]);
        return {
            shopSlug: shop.slug,
            balance: wallet?.balance ?? 0,
            ownedIds: owned.rows.map((row) => String(row.entitlement_id)),
            items: shop.items,
        };
    });
}
/**
 * Spend shared tickets and grant one permanent catalog entitlement atomically.
 * The caller names only a shop and item; the registered server catalog owns price.
 */
export async function purchaseTicketShopItem(pool, input) {
    const playerId = requiredText(input?.playerId, "playerId");
    const shop = findTicketShop(input?.shopSlug);
    if (!shop)
        throw new TypeError("unknown ticket shop");
    const item = shop.findItem(input?.itemId);
    if (!item)
        throw new TypeError("unknown ticket shop item");
    return inTransaction(pool, async (client) => {
        await ensureTicketWallet(client, playerId);
        const locked = await client.query(`select balance from ticket_wallets where player_id = $1 for update`, [playerId]);
        const balance = presentWallet(locked.rows[0]).balance;
        const existing = await client.query(`select entitlement_id from game_entitlements
       where player_id = $1 and game_slug = $2 and entitlement_id = $3`, [playerId, shop.entitlementGameSlug, item.id]);
        if (existing.rows?.length) {
            return { ok: true, itemId: item.id, price: 0, balance, alreadyOwned: true };
        }
        const spend = await spendTicketsInTransaction(client, {
            playerId, transactionKey: `purchase:${shop.slug}:${item.id}`, amount: item.price,
            reason: "catalog_purchase", metadata: { shopSlug: shop.slug, itemId: item.id },
        });
        if (!spend.ok) {
            return { ok: false, error: "insufficient_tickets", itemId: item.id, price: item.price, balance };
        }
        await client.query(`insert into game_entitlements
         (player_id, game_slug, entitlement_id, kind, source, source_id)
       values ($1, $2, $3, 'catalog-item', 'ticket-shop', $4)
       on conflict (player_id, game_slug, entitlement_id) do nothing
       returning entitlement_id`, [playerId, shop.entitlementGameSlug, item.id, shop.slug]);
        return {
            ok: true,
            itemId: item.id,
            price: item.price,
            balance: spend.balance,
            alreadyOwned: false,
        };
    });
}
