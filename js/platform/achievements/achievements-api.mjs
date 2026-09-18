// Browser client for the platform achievement routes.
//
// Thin on purpose: the raw verbs on the shared platform client already own the
// bearer header, the credentials mode and the 401-drops-the-token rule, so a
// cabinet must go through here rather than hand-rolling a fetch. Every call
// resolves to null on any failure (offline, signed out, refused run) — a
// cabinet's end-of-run flow must never throw because trophies could not be
// filed.
import { createPlatformApiClient } from "../api/platform-api.mjs";
import { getStoredAuthToken } from "../api/auth-token.mjs";
function encode(value) {
    return encodeURIComponent(typeof value === "string" ? value.trim() : "");
}
export function createAchievementsApi(client = createPlatformApiClient()) {
    return {
        /** True when a run submission could be attributed to an account at all. */
        canSubmit() {
            return client.isConfigured && !!getStoredAuthToken();
        },
        /**
         * Files a completed run. Resolves to the server's verdict, or null when
         * the player is signed out, the API is unreachable, or the run was
         * refused — all of which the caller treats the same way: no toast.
         */
        async submitRun(gameSlug, run) {
            const slug = encode(gameSlug);
            if (!slug || !this.canSubmit())
                return null;
            const payload = await client.post(`/achievements/${slug}/runs`, { run });
            return payload && payload.ok === true ? payload : null;
        },
        async fetchCatalog(gameSlug) {
            const slug = encode(gameSlug);
            return slug ? client.get(`/achievements/${slug}`, "game") : null;
        },
        async fetchPlayerCollection(playerId, gameSlug = "") {
            const pid = encode(playerId);
            if (!pid)
                return null;
            const slug = encode(gameSlug);
            return client.get(`/players/${pid}/achievements${slug ? `?game=${slug}` : ""}`, "collection");
        },
    };
}
