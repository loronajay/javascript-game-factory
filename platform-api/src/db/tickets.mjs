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
