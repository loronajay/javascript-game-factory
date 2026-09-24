// Browser client for cabinet ticket settlement (POST /games/:slug/results).
//
// A cabinet describes a completed result; the server decides what it pays.
// There is no amount in anything this module sends. The shared reporter
// publishes the returned balance so the session-nav ticket chip updates, and
// resolves to null on every failure (signed out, offline, refused) — a
// cabinet's end-of-match flow must never throw or wait on tickets.
//
// Ids: mint one with createGameResultId when the match STARTS and keep it on
// the match, so a retried submission carries the same id and the server
// replays its stored verdict instead of paying twice.
import { createPlatformApiClient } from "./platform-api.mjs";
import { getStoredAuthToken } from "./auth-token.mjs";
import { publishTicketBalance } from "./ticket-wallet.mjs";
/** A retry-stable result id matching the server's `[a-z0-9][a-z0-9-]{7,79}`. */
export function createGameResultId(prefix, startedAtMs = Date.now()) {
    const clean = String(prefix || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "result";
    const stamp = Math.max(0, Math.floor(Number(startedAtMs) || 0)).toString(36);
    const nonce = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, "0");
    return `${clean}-${stamp}-${nonce}`;
}
export function createGameResultReporter(options = {}) {
    const client = options.client ?? createPlatformApiClient();
    const hasToken = options.hasToken ?? (() => !!getStoredAuthToken());
    const onTicketBalance = options.onTicketBalance ?? ((balance) => { publishTicketBalance(balance); });
    return {
        /** True when a result could be attributed to an account at all. */
        canReport() {
            return client.isConfigured && hasToken();
        },
        async report(gameSlug, result) {
            const slug = encodeURIComponent(typeof gameSlug === "string" ? gameSlug.trim() : "");
            if (!slug || !this.canReport())
                return null;
            try {
                const payload = await client.post(`/games/${slug}/results`, { result });
                if (!payload || payload.ok !== true)
                    return null;
                const balance = Number(payload.tickets?.balance);
                if (Number.isSafeInteger(balance) && balance >= 0)
                    onTicketBalance(balance);
                return payload;
            }
            catch {
                return null;
            }
        },
    };
}
