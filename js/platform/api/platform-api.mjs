import { sanitizeProfileFriendCode } from "../profile/profile.mjs";
import { getStoredAuthToken, handleUnauthorizedResponse } from "./auth-token.mjs";
function sanitizeSingleLine(value) {
    return typeof value === "string" ? value.trim() : "";
}
function sanitizeBaseUrl(value) {
    return sanitizeSingleLine(value).replace(/\/+$/, "");
}
function isLocalHostname(value) {
    const hostname = sanitizeSingleLine(value).toLowerCase();
    return hostname === "localhost"
        || hostname === "127.0.0.1"
        || hostname === "0.0.0.0"
        || hostname === "[::1]"
        || hostname === "::1";
}
function encodePathSegment(value) {
    return encodeURIComponent(sanitizeSingleLine(value));
}
function buildThoughtListPath(viewerPlayerId = "") {
    const encodedViewerPlayerId = encodePathSegment(viewerPlayerId);
    return encodedViewerPlayerId
        ? `/thoughts?viewerPlayerId=${encodedViewerPlayerId}`
        : "/thoughts";
}
async function readJsonResponse(response) {
    try {
        return await response.json();
    }
    catch {
        return null;
    }
}
function buildAuthHeaders() {
    const token = getStoredAuthToken();
    return token ? { authorization: `Bearer ${token}` } : {};
}
async function requestJson(fetchImpl, baseUrl, path, options = {}, acceptErrorPayload = false) {
    if (typeof fetchImpl !== "function" || !baseUrl) {
        return null;
    }
    try {
        const response = await fetchImpl(`${baseUrl}${path}`, options);
        if (!response?.ok) {
            // A 401 means the stored token is dead, not that the network is. Drop it here so
            // every caller stops sending a token the server will never accept again, and so
            // "am I signed in?" starts answering no.
            if (response?.status === 401)
                handleUnauthorizedResponse();
            return acceptErrorPayload ? readJsonResponse(response) : null;
        }
        return await readJsonResponse(response);
    }
    catch {
        return null;
    }
}
function buildJsonRequestOptions(method, value, options = {}) {
    return {
        method,
        credentials: "include",
        ...options,
        headers: {
            "content-type": "application/json; charset=utf-8",
            ...buildAuthHeaders(),
            ...(options.headers || {}),
        },
        body: JSON.stringify(value ?? {}),
    };
}
export function resolvePlatformApiBaseUrl(options = {}) {
    const root = options?.root ?? globalThis.window;
    const override = sanitizeBaseUrl(options?.baseUrl
        || options?.override
        || root?.__JGF_PLATFORM_API_URL__
        || root?.JGF_PLATFORM_API_URL
        || "");
    if (override) {
        return override;
    }
    const location = options?.location || root?.location;
    if (isLocalHostname(location?.hostname)) {
        return "http://127.0.0.1:3001";
    }
    return "";
}
export function createPlatformApiClient(options = {}) {
    const fetchImpl = typeof options?.fetchImpl === "function"
        ? options.fetchImpl
        : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
    const baseUrl = resolvePlatformApiBaseUrl(options);
    async function get(path, responseKey) {
        const payload = await requestJson(fetchImpl, baseUrl, path, {
            credentials: "include",
            headers: buildAuthHeaders(),
        });
        return payload && responseKey ? (payload[responseKey] ?? null) : payload;
    }
    async function put(path, value, responseKey, options = {}) {
        const payload = await requestJson(fetchImpl, baseUrl, path, buildJsonRequestOptions("PUT", value, options));
        return payload && responseKey ? (payload[responseKey] ?? null) : payload;
    }
    async function post(path, value, responseKey, options = {}, acceptErrorPayload = false) {
        const payload = await requestJson(fetchImpl, baseUrl, path, buildJsonRequestOptions("POST", value, options), acceptErrorPayload);
        return payload && responseKey
            ? (payload[responseKey] ?? (acceptErrorPayload ? payload : null))
            : payload;
    }
    async function del(path, responseKey, options = {}) {
        const payload = await requestJson(fetchImpl, baseUrl, path, {
            method: "DELETE",
            credentials: "include",
            ...options,
            headers: buildAuthHeaders(),
        });
        return payload && responseKey ? (payload[responseKey] ?? null) : payload;
    }
    return {
        baseUrl,
        isConfigured: !!baseUrl && typeof fetchImpl === "function",
        // The raw verbs, authenticated and error-swallowing like every helper below.
        // Cabinets with their own route families (per-game garages, boards, driver
        // profiles) use these rather than growing a named method here per cabinet
        // per endpoint, and must NOT hand-roll a fetch: the bearer header, the
        // credentials mode and the 401-drops-the-token rule all live in one place
        // and a cabinet that rebuilds them will drift from it.
        get,
        put,
        post,
        del,
        /**
         * Per-game cosmetic loadouts, on the generic `game_loadouts` routes.
         *
         * The garage pair is self-only — the acting player is the token's, never a
         * body field — and the loadout pair is public but resolves to the active
         * appearance first. Named here so the privacy split is visible at the call
         * site instead of being a path string a cabinet assembled itself.
         */
        fetchGameGarage(gameSlug) {
            const gs = encodePathSegment(gameSlug);
            return gs ? get(`/games/${gs}/garage`) : Promise.resolve(null);
        },
        saveGameGarage(gameSlug, garage, options = {}) {
            const gs = encodePathSegment(gameSlug);
            return gs ? put(`/games/${gs}/garage`, { garage }, undefined, options) : Promise.resolve(null);
        },
        fetchGamePublicLoadout(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? get(`/games/${gs}/loadout/${pid}`, "loadout") : Promise.resolve(null);
        },
        fetchGamePublicLoadouts(gameSlug, playerIds) {
            const gs = encodePathSegment(gameSlug);
            return gs ? post(`/games/${gs}/loadouts`, { playerIds }, "loadouts") : Promise.resolve(null);
        },
        loadPlayerProfile(playerId) {
            const encoded = encodePathSegment(playerId);
            return encoded ? get(`/players/${encoded}/profile`, "player") : Promise.resolve(null);
        },
        loadPlayerProfileByFriendCode(friendCode) {
            const encoded = encodePathSegment(sanitizeProfileFriendCode(friendCode));
            return encoded ? get(`/players/by-friend-code/${encoded}`, "player") : Promise.resolve(null);
        },
        savePlayerProfile(playerId, patch = {}) {
            const encoded = encodePathSegment(playerId);
            return encoded ? put(`/players/${encoded}/profile`, patch, "player") : Promise.resolve(null);
        },
        loadPlayerMetrics(playerId) {
            const encoded = encodePathSegment(playerId);
            return encoded ? get(`/players/${encoded}/metrics`, "metrics") : Promise.resolve(null);
        },
        savePlayerMetrics(playerId, patch = {}) {
            const encoded = encodePathSegment(playerId);
            return encoded ? put(`/players/${encoded}/metrics`, patch, "metrics") : Promise.resolve(null);
        },
        incrementPlayerProfileView(playerId, options = {}) {
            const encoded = encodePathSegment(playerId);
            return encoded ? post(`/players/${encoded}/profile-view`, { source: options.source }, "metrics") : Promise.resolve(null);
        },
        loadPlayerRelationships(playerId) {
            const encoded = encodePathSegment(playerId);
            return encoded ? get(`/players/${encoded}/relationships`, "relationships") : Promise.resolve(null);
        },
        savePlayerRelationships(playerId, patch = {}) {
            const encoded = encodePathSegment(playerId);
            return encoded ? put(`/players/${encoded}/relationships`, patch, "relationships") : Promise.resolve(null);
        },
        createFriendshipBetweenPlayers(leftPlayerId, rightPlayerId) {
            return post("/friendships", { leftPlayerId, rightPlayerId }, "friendship");
        },
        removeFriend(viewerPlayerId, targetPlayerId) {
            const encodedViewer = encodePathSegment(viewerPlayerId);
            const encodedTarget = encodePathSegment(targetPlayerId);
            return encodedViewer && encodedTarget
                ? del(`/players/${encodedViewer}/friends/${encodedTarget}`, "removed")
                : Promise.resolve(null);
        },
        recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
            return post("/relationships/shared-session", {
                leftPlayerId,
                rightPlayerId,
                ...options,
            }, "relationshipUpdate");
        },
        recordSharedEventBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
            return post("/relationships/shared-event", {
                leftPlayerId,
                rightPlayerId,
                ...options,
            }, "relationshipUpdate");
        },
        recordDirectInteractionBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
            return post("/relationships/direct-interaction", {
                leftPlayerId,
                rightPlayerId,
                ...options,
            }, "relationshipUpdate");
        },
        searchPlayers(q = "") {
            const encoded = encodeURIComponent(q.trim());
            return encoded ? get(`/players/search?q=${encoded}`, "players") : Promise.resolve([]);
        },
        listActivityItems() {
            return get("/activity", "items");
        },
        saveActivityItem(item = {}) {
            return post("/activity", item, "item");
        },
        listThoughts(viewerPlayerId = "") {
            return get(buildThoughtListPath(viewerPlayerId), "thoughts");
        },
        listThoughtComments(thoughtId) {
            const encoded = encodePathSegment(thoughtId);
            return encoded ? get(`/thoughts/${encoded}/comments`, "comments") : Promise.resolve(null);
        },
        saveThought(thought = {}) {
            return post("/thoughts", thought, "thought");
        },
        shareThought(thoughtId, viewerPlayerId, viewerAuthorDisplayName = "", shareOptions = {}) {
            const encoded = encodePathSegment(thoughtId);
            return encoded
                ? post(`/thoughts/${encoded}/shares`, { viewerPlayerId, viewerAuthorDisplayName, ...shareOptions }, "share")
                : Promise.resolve(null);
        },
        reactToThought(thoughtId, viewerPlayerId, reactionId) {
            const encoded = encodePathSegment(thoughtId);
            return encoded
                ? post(`/thoughts/${encoded}/reactions`, { viewerPlayerId, reactionId }, "thought")
                : Promise.resolve(null);
        },
        commentOnThought(thoughtId, viewerPlayerId, viewerAuthorDisplayName = "", text = "") {
            const encoded = encodePathSegment(thoughtId);
            return encoded
                ? post(`/thoughts/${encoded}/comments`, { viewerPlayerId, viewerAuthorDisplayName, text }, "commentRecord")
                : Promise.resolve(null);
        },
        deleteThought(thoughtId) {
            const encoded = encodePathSegment(thoughtId);
            return encoded ? del(`/thoughts/${encoded}`, "deleted") : Promise.resolve(null);
        },
        // Server decides whether the caller may remove the comment (comment author or post
        // author); a rejection surfaces as a null payload here.
        deleteThoughtComment(thoughtId, commentId) {
            const encodedThoughtId = encodePathSegment(thoughtId);
            const encodedCommentId = encodePathSegment(commentId);
            return encodedThoughtId && encodedCommentId
                ? del(`/thoughts/${encodedThoughtId}/comments/${encodedCommentId}`, "deleted")
                : Promise.resolve(null);
        },
        async uploadAvatar(file) {
            if (!fetchImpl || !baseUrl || !file)
                return null;
            const formData = new FormData();
            formData.append("file", file);
            try {
                const response = await fetchImpl(`${baseUrl}/upload/avatar`, {
                    method: "POST",
                    credentials: "include",
                    headers: buildAuthHeaders(),
                    body: formData,
                });
                if (!response?.ok) {
                    const body = await readJsonResponse(response);
                    return { uploadError: body?.error || String(response.status) };
                }
                return await readJsonResponse(response);
            }
            catch {
                return null;
            }
        },
        async uploadBackground(file) {
            if (!fetchImpl || !baseUrl || !file)
                return null;
            const formData = new FormData();
            formData.append("file", file);
            try {
                const response = await fetchImpl(`${baseUrl}/upload/background`, {
                    method: "POST",
                    credentials: "include",
                    headers: buildAuthHeaders(),
                    body: formData,
                });
                if (!response?.ok) {
                    const body = await readJsonResponse(response);
                    return { uploadError: body?.error || String(response.status) };
                }
                return await readJsonResponse(response);
            }
            catch {
                return null;
            }
        },
        async uploadMusic(file) {
            if (!fetchImpl || !baseUrl || !file)
                return null;
            const formData = new FormData();
            formData.append("file", file);
            try {
                const response = await fetchImpl(`${baseUrl}/upload/music`, {
                    method: "POST",
                    credentials: "include",
                    headers: buildAuthHeaders(),
                    body: formData,
                });
                if (!response?.ok) {
                    const body = await readJsonResponse(response);
                    return { uploadError: body?.error || String(response.status) };
                }
                return await readJsonResponse(response);
            }
            catch {
                return null;
            }
        },
        async uploadPhoto(file) {
            if (!fetchImpl || !baseUrl || !file)
                return null;
            const formData = new FormData();
            formData.append("file", file);
            try {
                const response = await fetchImpl(`${baseUrl}/upload/photo`, {
                    method: "POST",
                    credentials: "include",
                    headers: buildAuthHeaders(),
                    body: formData,
                });
                if (!response?.ok)
                    return null;
                return await readJsonResponse(response);
            }
            catch {
                return null;
            }
        },
        /**
         * A picture for a poster in the player's arcade room. Its own endpoint rather than
         * `/upload/photo` so it lands in its own folder and comes back with its pixel size,
         * which is what lets the room give the frame the picture's shape before it loads.
         */
        async uploadRoomPoster(file) {
            if (!fetchImpl || !baseUrl || !file)
                return null;
            const formData = new FormData();
            formData.append("file", file);
            try {
                const response = await fetchImpl(`${baseUrl}/upload/poster`, {
                    method: "POST",
                    credentials: "include",
                    headers: buildAuthHeaders(),
                    body: formData,
                });
                if (!response?.ok) {
                    const body = await readJsonResponse(response).catch(() => null);
                    return { uploadError: body?.error || String(response?.status ?? "failed") };
                }
                return await readJsonResponse(response);
            }
            catch {
                return null;
            }
        },
        async listPlayerPhotos(playerId, { visibility } = {}) {
            if (!fetchImpl || !baseUrl || !playerId)
                return [];
            const encoded = encodePathSegment(playerId);
            if (!encoded)
                return [];
            const url = `${baseUrl}/players/${encoded}/photos${visibility ? `?visibility=${encodeURIComponent(visibility)}` : ""}`;
            try {
                const response = await fetchImpl(url, { credentials: "include", headers: buildAuthHeaders() });
                if (!response?.ok)
                    return [];
                const data = await readJsonResponse(response);
                return Array.isArray(data?.photos) ? data.photos : [];
            }
            catch {
                return [];
            }
        },
        async savePlayerPhoto(playerId, photoData) {
            if (!fetchImpl || !baseUrl || !playerId)
                return null;
            const encoded = encodePathSegment(playerId);
            if (!encoded)
                return null;
            const payload = await post(`/players/${encoded}/photos`, photoData);
            return payload?.photo ? payload : null;
        },
        async deletePlayerPhoto(playerId, photoId) {
            if (!fetchImpl || !baseUrl || !playerId || !photoId)
                return false;
            const encodedPlayer = encodePathSegment(playerId);
            const encodedPhoto = encodePathSegment(photoId);
            if (!encodedPlayer || !encodedPhoto)
                return false;
            try {
                const response = await fetchImpl(`${baseUrl}/players/${encodedPlayer}/photos/${encodedPhoto}`, {
                    method: "DELETE",
                    credentials: "include",
                    headers: buildAuthHeaders(),
                });
                return response?.ok === true;
            }
            catch {
                return false;
            }
        },
        async getPlayerPhoto(playerId, photoId) {
            if (!fetchImpl || !baseUrl || !playerId || !photoId)
                return null;
            const encodedPlayer = encodePathSegment(playerId);
            const encodedPhoto = encodePathSegment(photoId);
            if (!encodedPlayer || !encodedPhoto)
                return null;
            try {
                const response = await fetchImpl(`${baseUrl}/players/${encodedPlayer}/photos/${encodedPhoto}`, {
                    credentials: "include",
                    headers: buildAuthHeaders(),
                });
                if (!response?.ok)
                    return null;
                const data = await readJsonResponse(response);
                return data?.photo || null;
            }
            catch {
                return null;
            }
        },
        async listPhotoComments(photoId) {
            if (!fetchImpl || !baseUrl || !photoId)
                return [];
            const encoded = encodePathSegment(photoId);
            if (!encoded)
                return [];
            try {
                const response = await fetchImpl(`${baseUrl}/photos/${encoded}/comments`, {
                    credentials: "include",
                    headers: buildAuthHeaders(),
                });
                if (!response?.ok)
                    return [];
                const data = await readJsonResponse(response);
                return Array.isArray(data?.comments) ? data.comments : [];
            }
            catch {
                return [];
            }
        },
        async reactToPhoto(photoId, viewerPlayerId, reactionId) {
            if (!fetchImpl || !baseUrl || !photoId)
                return null;
            const encoded = encodePathSegment(photoId);
            if (!encoded)
                return null;
            const payload = await post(`/photos/${encoded}/reactions`, { viewerPlayerId, reactionId });
            return payload?.photo || null;
        },
        async commentOnPhoto(photoId, viewerPlayerId, viewerAuthorDisplayName, text) {
            if (!fetchImpl || !baseUrl || !photoId)
                return null;
            const encoded = encodePathSegment(photoId);
            if (!encoded)
                return null;
            const payload = await post(`/photos/${encoded}/comments`, { viewerPlayerId, viewerAuthorDisplayName, text });
            return payload?.commentRecord || null;
        },
        // Server decides whether the caller may remove the comment (comment author or photo
        // owner); a rejection surfaces as a null payload here.
        async deletePhotoComment(photoId, commentId) {
            if (!fetchImpl || !baseUrl)
                return null;
            const encodedPhotoId = encodePathSegment(photoId);
            const encodedCommentId = encodePathSegment(commentId);
            if (!encodedPhotoId || !encodedCommentId)
                return null;
            const payload = await del(`/photos/${encodedPhotoId}/comments/${encodedCommentId}`);
            return payload?.deleted ? payload : null;
        },
        fetchMyLayout() {
            return get("/profile/layout", "layout");
        },
        saveMyLayout(layout) {
            return post("/profile/layout", { layout }, "layout");
        },
        fetchPlayerLayout(playerId) {
            const encoded = encodePathSegment(playerId);
            return encoded ? get(`/players/${encoded}/layout`, "layout") : Promise.resolve(null);
        },
        // ELO/MMR. `progression` is optional and describes what was PLAYED — the mode,
        // the character, a performance count. It must never carry an XP amount: the
        // server derives every award from its own catalog, and a client that named a
        // number would be declaring its own economy.
        // `ranked` says whether the result stakes a rating. It is omitted by every
        // cabinet with only one kind of online match, and the API defaults it to
        // true, so those callers report exactly as they always have. A cabinet with a
        // casual mode sends `false` and gets the progression half without the ladder.
        updateGameRating(gameSlug, { opponentPlayerId, outcome, sessionId, progression, ranked }) {
            const encoded = encodePathSegment(gameSlug);
            return encoded
                ? post(`/ratings/${encoded}`, {
                    opponentPlayerId,
                    outcome,
                    sessionId,
                    progression,
                    ...(ranked === undefined ? {} : { ranked: ranked !== false }),
                })
                : Promise.resolve(null);
        },
        getGameRating(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? get(`/ratings/${gs}/${pid}`, "rating") : Promise.resolve(null);
        },
        // Earned advancement for one cabinet: XP totals and per-track mastery, with
        // levels already derived. Public, so a profile or a match card can show an
        // opponent's mastery.
        getGameProgression(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? get(`/progression/${gs}/${pid}`, "progression") : Promise.resolve(null);
        },
        fetchGameProgress(gameSlug) {
            const encoded = encodePathSegment(gameSlug);
            return encoded ? get(`/game-progress/${encoded}`, "progress") : Promise.resolve(null);
        },
        // Factory-wide ticket balance. Awards are deliberately absent from the browser
        // client: only server-side result validators are allowed to mint currency.
        fetchTicketWallet() {
            return get("/tickets/wallet", "wallet");
        },
        fetchTicketShop(shopSlug) {
            const encoded = encodePathSegment(shopSlug);
            return encoded ? get(`/tickets/shops/${encoded}`, "shop") : Promise.resolve(null);
        },
        purchaseTicketShopItem(shopSlug, itemId) {
            const encoded = encodePathSegment(shopSlug);
            return encoded ? post(`/tickets/shops/${encoded}/purchases`, { itemId }, "purchase", {}, true) : Promise.resolve(null);
        },
        adoptFarmPet({ speciesId, name, purchaseId }) {
            return post("/games/farm/adoptions", { speciesId, name, purchaseId }, "purchase", {}, true);
        },
        /** Pair two pets: the server checks the pair on the stored farm, takes the fee and decides what the young one inherits. */
        breedFarmPets({ motherId, fatherId, name, breedId }) {
            return post("/games/farm/pets/breedings", { motherId, fatherId, name, breedId }, "breeding", {}, true);
        },
        /** Seeds, saplings, feed, Market ingredients and recipe cards. Market purchases name the day shown at the counter. */
        purchaseFarmSupply({ itemId, quantity, purchaseId, venue, day }) {
            return post("/games/farm/supplies/purchases", { itemId, quantity, purchaseId, ...(venue === "market" ? { venue, day } : {}) }, "purchase", {}, true);
        },
        /** The server decides ripeness and yield; the client sends its farm and names the cell. */
        harvestFarmCrop({ layout, plotId, cellId }) {
            return post("/games/farm/harvests", { layout, plotId, cellId }, "harvest", {}, true);
        },
        /** Pick a fruit tree or fell a timber tree: the client sends its farm and names the Tree Plot; the server decides. */
        harvestFarmTree({ layout, plotId }) {
            return post("/games/farm/trees/harvests", { layout, plotId }, "harvest", {}, true);
        },
        /** Cook a dish at the Kitchen Range: the client sends its farm, the recipe and its step scores; the server takes the ingredients and decides the stars. */
        cookFarmDish({ layout, recipeId, scores, cookId }) {
            return post("/games/farm/kitchen/cooks", { layout, recipeId, scores, cookId }, "cook", {}, true);
        },
        /** Saw logs into planks: at the Market Square's Sawmill (`at: "market"`, a fee per log) or the farm's own (`at: "farm"`, free, with the farm as it stands). */
        millFarmLogs({ layout, speciesId, logs, at, millId }) {
            return post("/games/farm/workshop/mills", { layout, speciesId, logs, at, millId }, "mill", {}, true);
        },
        /** Make a piece at the Workbench: the client sends its farm, the pattern and its step scores; the server takes the planks and decides the stars. */
        craftFarmPiece({ layout, itemId, scores, craftId }) {
            return post("/games/farm/workshop/crafts", { layout, itemId, scores, craftId }, "craft", {}, true);
        },
        /** The Market buys produce (the Produce Merchant) and dishes (the Kitchen): item ids and counts only — the server prices the sale and pays it. */
        sellFarmProduce({ items, saleId, day }) {
            return post("/games/farm/market/sales", { items, saleId, ...(Number.isSafeInteger(day) ? { day } : {}) }, "sale", {}, true);
        },
        /** The Exchange Board: everyone else's open listings, this player's own, and what today's caps leave them. */
        fetchFarmListings() {
            return get("/games/farm/market/listings", "board");
        },
        /** Put goods up on the Exchange Board: they leave the farm into escrow. The server checks the price band. */
        createFarmListing({ listingId, stack, itemId, quantity, unitPrice }) {
            return post("/games/farm/market/listings", { listingId, stack, itemId, quantity, unitPrice }, "result", {}, true);
        },
        /** Buy some of a listing: the server moves the tickets and the goods together, once per purchase id. */
        buyFarmListing({ listingId, quantity, purchaseId }) {
            return post(`/games/farm/market/listings/${encodeURIComponent(listingId)}/purchases`, { quantity, purchaseId }, "result", {}, true);
        },
        /** Take a listing down (open or expired): what is left goes back to the farm. */
        withdrawFarmListing({ listingId }) {
            return post(`/games/farm/market/listings/${encodeURIComponent(listingId)}/withdrawal`, {}, "result", {}, true);
        },
        /** The Cove's shadows swimming now and next: where and how big, never what they are. Public. */
        fetchFarmFishShadows() {
            return get("/games/farm/fishing/shadows", "shadows");
        },
        /** The Cove Records board: the heaviest of every fish, today and ever. Public. */
        fetchFarmFishRecords() {
            return get("/games/farm/fishing/records", "records");
        },
        /** My tackle, Fishing level, creel and Fishdex. */
        fetchFarmFishing() {
            return get("/games/farm/fishing", "fishing");
        },
        /** Put a line in the water. The server decides the water, the bite and when it comes. */
        castFarmLine({ castId, point, shadowId, rodId, bait }) {
            return post("/games/farm/fishing/casts", { castId, point, shadowId, rodId, bait }, "result", {}, true);
        },
        /** How a cast ended: landed (with its grade), escaped, snapped or missed. */
        landFarmCast({ castId, outcome, grade }) {
            return post(`/games/farm/fishing/casts/${encodeURIComponent(castId)}/landing`, { outcome, grade }, "result", {}, true);
        },
        sellFarmFish({ saleId, fishIds }) {
            return post("/games/farm/fishing/sales", { saleId, fishIds }, "result", {}, true);
        },
        releaseFarmFish({ fishIds }) {
            return post("/games/farm/fishing/releases", { fishIds }, "result", {}, true);
        },
        lockFarmFish({ fishId, locked }) {
            return post("/games/farm/fishing/locks", { fishId, locked }, "result", {}, true);
        },
        buyFarmTackle({ purchaseId, itemId, quantity }) {
            return post("/games/farm/fishing/tackle", { purchaseId, itemId, quantity }, "result", {}, true);
        },
        /** Fish by id, for anyone: a trading partner's offer, the fish on a Trophy Mount. Public. */
        fetchFarmFishDetails(ids) {
            return get(`/games/farm/fishing/fish?ids=${encodeURIComponent(ids.join(","))}`, "details");
        },
        /** A farm's herd: every head of livestock alive on it. Public. */
        fetchFarmLivestock(playerId) {
            return get(`/games/farm/livestock/${encodeURIComponent(playerId)}`, "herd");
        },
        /** Living animals by id as public cards (a trading table's other side). */
        fetchFarmLivestockCards(ids) {
            return get(`/games/farm/livestock/cards?ids=${encodeURIComponent(ids.join(","))}`);
        },
        /** The Livestock Dealer: a young one for tickets, into a home with room. */
        buyFarmLivestock({ purchaseId, speciesId, homeId, name }) {
            return post("/games/farm/livestock/purchases", { purchaseId, speciesId, homeId, name }, "result", {}, true);
        },
        /** One of Hollis's horses for today (FARM_RIDING_PLAN.md): the server rolls it from the day's seed and stables it. */
        buyFarmHorse({ day, slot, name }) {
            return post("/games/farm/horses/purchases", { day, slot, name }, "result", {}, true);
        },
        /** A finished Windrush Downs course run: the server rides it again from its reins and pays Riding XP and training for what really happened. */
        submitFarmRidingRun(run) {
            return post("/games/farm/riding/runs", run, "result", {}, true);
        },
        /** The Downs race board: live races (and a signed-in rider's seat), plus the last hour's results. */
        fetchFarmRaces() {
            return get("/games/farm/downs/races");
        },
        postFarmRace(race) {
            return post("/games/farm/downs/races", race, "result", {}, true);
        },
        /** Enter, leave, start (the poster), bet on, or settle (with the race room's signed result) one race. */
        farmRaceAction(raceId, action, body = {}) {
            return post(`/games/farm/downs/races/${encodeURIComponent(raceId)}/${action}`, body, "result", {}, true);
        },
        /** Lead an animal to another home (null: out onto the field). */
        moveFarmLivestock({ animalId, homeId }) {
            return post("/games/farm/livestock/moves", { animalId, homeId }, "result", {}, true);
        },
        renameFarmLivestock({ animalId, name }) {
            return post("/games/farm/livestock/names", { animalId, name }, "result", {}, true);
        },
        /** Livestock care at the farm's verified clock: a checkup, a feed or a collection. Sends the farm like a harvest. */
        careFarmLivestock({ layout, action, animalId, itemId, mateId }) {
            return post("/games/farm/livestock/care", { layout, action, animalId, itemId, mateId }, "result", {}, true);
        },
        /** The Market's Butcher: a grown animal leaves the farm for meat in the basket (at the farm's stored clock). */
        butcherFarmLivestock({ animalId }) {
            return post("/games/farm/livestock/butcher", { animalId }, "result", {}, true);
        },
        /** Mount a fish from the creel (Old Pike's fee), or take one down back into the creel. */
        mountFarmFish({ fishId, mounted, purchaseId }) {
            return post("/games/farm/fishing/mounts", { fishId, mounted, purchaseId }, "result", {}, true);
        },
        /** Today's Market prices (every produce grade), which way each moved, and the Seed Merchant's specials. Public. */
        fetchFarmMarketPrices() {
            return get("/games/farm/market/prices", "market");
        },
        /** Today's Order Board with this player's ticks, Farming level and basket (self only). */
        fetchFarmOrders() {
            return get("/games/farm/market/orders", "board");
        },
        /** Fill one order by id: what it asks for and what it pays are the server's. */
        fillFarmOrder({ orderId }) {
            return post("/games/farm/market/orders/fulfillments", { orderId }, "fill", {}, true);
        },
        /** Invite another farmer to a trading table (self only; the server checks both farms and both trade slots). */
        inviteFarmTrade({ partnerId }) {
            return post("/games/farm/trades", { partnerId }, "result", {}, true);
        },
        /** The table this player is at, an invitation to them included: `{ trade }` with `trade` null when there is none. */
        fetchCurrentFarmTrade() {
            return get("/games/farm/trades/current");
        },
        /** One table followed to its end; a completed one brings this player's farm as it now stands. */
        fetchFarmTrade(tradeId) {
            const encoded = encodePathSegment(tradeId);
            return encoded ? get(`/games/farm/trades/${encoded}`, "result") : Promise.resolve(null);
        },
        /** One move on a table: accept, decline, cancel, offer, lock, unlock or confirm. The server decides whether it is allowed. */
        actOnFarmTrade(tradeId, action) {
            const encoded = encodePathSegment(tradeId);
            return encoded ? post(`/games/farm/trades/${encoded}/actions`, action, "result", {}, true) : Promise.resolve(null);
        },
        recordGameProgressClaim(gameSlug, claim = {}) {
            const encoded = encodePathSegment(gameSlug);
            return encoded ? post(`/game-progress/${encoded}/claims`, claim) : Promise.resolve(null);
        },
        // Server-authoritative Valor spend: the server prices the offer and deducts+grants
        // atomically. The client only names the offer; it must never send a price.
        spendGameValor(gameSlug, offer) {
            const encoded = encodePathSegment(gameSlug);
            return encoded ? post(`/game-progress/${encoded}/spend`, { offer }) : Promise.resolve(null);
        },
        // Server-authoritative consumable use: the server spends the item and rolls/grants
        // whatever it awards in one transaction. `activationId` makes a retry replay the same
        // result instead of spending a second item.
        activateGameConsumable(gameSlug, { itemId, activationId }) {
            const encoded = encodePathSegment(gameSlug);
            return encoded
                ? post(`/game-progress/${encoded}/consumables/activate`, { itemId, activationId })
                : Promise.resolve(null);
        },
        redeemGameSkinVoucher(gameSlug, { entitlementId, redemptionId }) {
            const encoded = encodePathSegment(gameSlug);
            return encoded
                ? post(`/game-progress/${encoded}/vouchers/redeem`, { entitlementId, redemptionId }).then((result) => (result ? { ...result, gameProgress: result.progress || null } : null))
                : Promise.resolve(null);
        },
        redeemGameEmoteVoucher(gameSlug, { entitlementId, redemptionId }) {
            const encoded = encodePathSegment(gameSlug);
            return encoded
                ? post(`/game-progress/${encoded}/emote-vouchers/redeem`, { entitlementId, redemptionId }).then((result) => (result ? { ...result, gameProgress: result.progress || null } : null))
                : Promise.resolve(null);
        },
        // --- Yam Bowling 2027 calendar (physical preorder) ------------------------------
        // The client sends a quantity and nothing else. Price, bonus size and the once-per-
        // account rule are all server-side; a tampered request can only ask for more calendars.
        fetchCalendarOffer() {
            return get("/calendar/offer");
        },
        createCalendarCheckoutSession({ quantity } = {}) {
            return post("/calendar/checkout-sessions", { quantity });
        },
        // Settle the buyer's return from Stripe. The webhook is the authority; this converges on
        // the same order row and the same promotion-scoped bonus claim.
        fulfillCalendarCheckout({ sessionId } = {}) {
            return post("/calendar/checkout-sessions/fulfill", { sessionId });
        },
        listCalendarOrders() {
            return get("/calendar/orders");
        },
        fetchGameTournament(gameSlug) {
            const encoded = encodePathSegment(gameSlug);
            return encoded ? get(`/game-progress/${encoded}/tournaments/current`) : Promise.resolve(null);
        },
        claimGameTournamentRound(gameSlug, { eventId, roundIndex, bowlerSlug }) {
            const encoded = encodePathSegment(gameSlug);
            const round = Number(roundIndex);
            return encoded && Number.isInteger(round) && round >= 0
                ? post(`/game-progress/${encoded}/tournaments/rounds/${round}`, { eventId, bowlerSlug })
                : Promise.resolve(null);
        },
        // Reset campaign mission progress only (Valor / unlocks / skins preserved server-side).
        resetGameCampaign(gameSlug) {
            const encoded = encodePathSegment(gameSlug);
            return encoded ? post(`/game-progress/${encoded}/reset`, {}) : Promise.resolve(null);
        },
        // One-time migration of existing local ownership to the server (server-idempotent).
        backfillGameOwnership(gameSlug, payload) {
            const encoded = encodePathSegment(gameSlug);
            return encoded ? post(`/game-progress/${encoded}/backfill`, payload) : Promise.resolve(null);
        },
        // Platform ladders — public cross-game standings. Which games have a ladder is
        // server-registry data (services/ladder-catalog), so a new cabinet appears here
        // with no client change.
        fetchLadders() {
            return get("/ladders", "ladders");
        },
        fetchLadder(gameSlug, { limit } = {}) {
            const gs = encodePathSegment(gameSlug);
            if (!gs)
                return Promise.resolve(null);
            const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
            return get(`/ladders/${gs}${query}`, "ladder");
        },
        fetchPlayerLadderPlacements(playerId, { limit } = {}) {
            const pid = encodePathSegment(playerId);
            if (!pid)
                return Promise.resolve(null);
            const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
            return get(`/players/${pid}/ladders${query}`, "placements");
        },
        enqueueRankedMatch(gameSlug) {
            const gs = encodePathSegment(gameSlug);
            return gs ? post(`/ranked/${gs}/queue`, {}) : Promise.resolve(null);
        },
        pollRankedMatch(gameSlug) {
            const gs = encodePathSegment(gameSlug);
            return gs ? get(`/ranked/${gs}/queue`) : Promise.resolve(null);
        },
        cancelRankedMatch(gameSlug, options = {}) {
            const gs = encodePathSegment(gameSlug);
            return gs ? del(`/ranked/${gs}/queue`, undefined, options) : Promise.resolve(null);
        },
        startRankedMatch(gameSlug, { matchId } = {}) {
            const gs = encodePathSegment(gameSlug);
            return gs ? post(`/ranked/${gs}/start`, { matchId }) : Promise.resolve(null);
        },
        reportRankedResult(gameSlug, { matchId, outcome, squad, unitResults } = {}, options = {}) {
            const gs = encodePathSegment(gameSlug);
            return gs ? post(`/ranked/${gs}/report`, { matchId, outcome, squad, unitResults }, undefined, options) : Promise.resolve(null);
        },
        // Presence only — "I am still connected". The server decides what a silent
        // opponent means; the client never claims anything about them.
        sendRankedHeartbeat(gameSlug, { matchId } = {}, options = {}) {
            const gs = encodePathSegment(gameSlug);
            return gs ? post(`/ranked/${gs}/heartbeat`, { matchId }, undefined, options) : Promise.resolve(null);
        },
        setRankedLobby(gameSlug, { matchId, lobbyCode } = {}) {
            const gs = encodePathSegment(gameSlug);
            return gs ? post(`/ranked/${gs}/lobby`, { matchId, lobbyCode }) : Promise.resolve(null);
        },
        fetchRankedStanding(gameSlug) {
            const gs = encodePathSegment(gameSlug);
            return gs ? get(`/ranked/${gs}/standing`, "standing") : Promise.resolve(null);
        },
        saveRankedProfile(gameSlug, patch = {}) {
            const gs = encodePathSegment(gameSlug);
            return gs ? put(`/ranked/${gs}/profile`, patch, "profile") : Promise.resolve(null);
        },
        fetchRankedCard(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? get(`/ranked/${gs}/card/${pid}`, "card") : Promise.resolve(null);
        },
        fetchRankedUnitStats(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? get(`/ranked/${gs}/units/${pid}`, "unitStats") : Promise.resolve(null);
        },
        fetchRankedMatches(gameSlug, playerId, limit) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            if (!gs || !pid)
                return Promise.resolve(null);
            const query = Number.isFinite(Number(limit)) ? `?limit=${encodeURIComponent(String(limit))}` : "";
            return get(`/ranked/${gs}/matches/${pid}${query}`, "matches");
        },
        // One finished match in full. `perspective` shapes the detail from that player's
        // side; omit it to use the signed-in caller's.
        fetchRankedMatchDetail(gameSlug, matchId, { perspective } = {}) {
            const gs = encodePathSegment(gameSlug);
            const mid = encodePathSegment(matchId);
            if (!gs || !mid)
                return Promise.resolve(null);
            const who = encodePathSegment(perspective);
            const query = who ? `?perspective=${who}` : "";
            return get(`/ranked/${gs}/match/${mid}${query}`, "match");
        },
        fetchRankedLeaderboard(gameSlug, limit) {
            const gs = encodePathSegment(gameSlug);
            if (!gs)
                return Promise.resolve(null);
            const query = Number.isFinite(Number(limit)) ? `?limit=${encodeURIComponent(String(limit))}` : "";
            return get(`/ranked/${gs}/leaderboard${query}`, "leaderboard");
        },
        // ── Per-game social graph ────────────────────────────────────────────────
        // Friends scoped to ONE cabinet, deliberately separate from the factory-wide
        // friends graph above (createFriendshipBetweenPlayers and friends). A player can
        // be a Tactical Arena friend without being a factory friend. The acting player is
        // always the token's, so none of these take a "me" argument.
        fetchGameFriends(gameSlug) {
            const gs = encodePathSegment(gameSlug);
            return gs ? get(`/games/${gs}/social/friends`, "friends") : Promise.resolve(null);
        },
        removeGameFriend(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? del(`/games/${gs}/social/friends/${pid}`) : Promise.resolve(null);
        },
        fetchGameFriendRequests(gameSlug) {
            const gs = encodePathSegment(gameSlug);
            return gs ? get(`/games/${gs}/social/requests`, "requests") : Promise.resolve(null);
        },
        sendGameFriendRequest(gameSlug, recipientPlayerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = typeof recipientPlayerId === "string" ? recipientPlayerId.trim() : "";
            return gs && pid ? post(`/games/${gs}/social/requests`, { recipientPlayerId: pid }) : Promise.resolve(null);
        },
        acceptGameFriendRequest(gameSlug, requestId) {
            const gs = encodePathSegment(gameSlug);
            const rid = encodePathSegment(requestId);
            return gs && rid ? post(`/games/${gs}/social/requests/${rid}/accept`, {}) : Promise.resolve(null);
        },
        declineGameFriendRequest(gameSlug, requestId) {
            const gs = encodePathSegment(gameSlug);
            const rid = encodePathSegment(requestId);
            return gs && rid ? post(`/games/${gs}/social/requests/${rid}/decline`, {}) : Promise.resolve(null);
        },
        cancelGameFriendRequest(gameSlug, requestId) {
            const gs = encodePathSegment(gameSlug);
            const rid = encodePathSegment(requestId);
            return gs && rid ? del(`/games/${gs}/social/requests/${rid}`) : Promise.resolve(null);
        },
        fetchGameBlocks(gameSlug) {
            const gs = encodePathSegment(gameSlug);
            return gs ? get(`/games/${gs}/social/blocks`, "blocks") : Promise.resolve(null);
        },
        blockGamePlayer(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? post(`/games/${gs}/social/blocks/${pid}`, {}) : Promise.resolve(null);
        },
        unblockGamePlayer(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? del(`/games/${gs}/social/blocks/${pid}`) : Promise.resolve(null);
        },
        searchGamePlayers(gameSlug, query, limit) {
            const gs = encodePathSegment(gameSlug);
            const q = typeof query === "string" ? query.trim() : "";
            if (!gs || !q)
                return Promise.resolve(null);
            const cap = Number.isFinite(Number(limit)) ? `&limit=${encodeURIComponent(String(limit))}` : "";
            return get(`/games/${gs}/social/search?q=${encodeURIComponent(q)}${cap}`, "search");
        },
        fetchGamePlayerRelationship(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? get(`/games/${gs}/social/relationship/${pid}`, "relationship") : Promise.resolve(null);
        },
        fetchGamePlayerBadges(gameSlug, playerId) {
            const gs = encodePathSegment(gameSlug);
            const pid = encodePathSegment(playerId);
            return gs && pid ? get(`/games/${gs}/social/badges/${pid}`, "badges") : Promise.resolve(null);
        },
    };
}
