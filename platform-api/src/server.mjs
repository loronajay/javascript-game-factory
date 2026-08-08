import { createServer } from "node:http";
import pg from "pg";
import { createApp } from "./app.mjs";
import { createUploadService } from "./services/upload.mjs";
import { listActivityItems, saveActivityItem } from "./db/activity.mjs";
import { readConfig } from "./config.mjs";
import { incrementPlayerProfileView, loadPlayerMetrics, savePlayerMetrics } from "./db/metrics.mjs";
import { applyMigrations } from "./db/migrations.mjs";
import { getGarage, saveGarage, getPublicLoadout, getPublicLoadouts } from "./db/game-loadouts.mjs";
import { activateInventoryItem, backfillLocalOwnership, findPlayPurchaseClaim, findStripeGrant, getGameProgress, recordGameProgressClaim, regrantStripeEntitlements, resetCampaignProgress, revokeGameEntitlements, spendValorForEntitlement } from "./db/game-progress.mjs";
import { loadPlayerLayout, loadPlayerProfile, loadPlayerProfileByFriendCode, savePlayerLayout, savePlayerProfile, searchPlayers } from "./db/profiles.mjs";
import { getGameRating, recordMatchRating } from "./db/ratings.mjs";
import { getLadderStandings, getPlayerLadderPlacements } from "./db/ladders.mjs";
import { getBoardStandings, getPlayerRunRecords, recordRun } from "./db/run-records.mjs";
import { getAccountSuspension, isAdminPlayer, listAdmins, listAuditLog, seedAdminsFromEmails, setAdminFlag, writeAuditLog, } from "./db/admin.mjs";
import { claimBulletinAnnouncement, createBulletin, deleteBulletin, getPublicBulletinBySlug, listAllBulletins, listPublicBulletins, updateBulletin, } from "./db/bulletins.mjs";
import { announceBulletinService, announceEventService } from "./services/content-announce.mjs";
import { claimEventAnnouncement, createEvent, deleteEvent, getPublicEventBySlug, listAllEvents, listPublicEvents, updateEvent, } from "./db/arcade-events.mjs";
import { deleteCabinetOverride, listCabinetOverrides, listSiteSettings, saveCabinetOverride, saveSiteSetting, } from "./db/site-settings.mjs";
import { fileReport, liftSuspension, listReports, listSuspendedAccounts, removeContentAsAdmin, resolveReport, suspendAccount, } from "./db/moderation.mjs";
import { cancelRanked, enqueueRanked, getPublicRankedCard, getRankedLeaderboard, getRankedMatchDetail, getRankedMatches, getRankedStanding, getRankedUnitStats, pollRanked, recordRankedHeartbeat, reportRankedResult, saveRankedProfile, setRankedLobbyCode, startRankedMatch, } from "./db/ranked.mjs";
import { blockGamePlayer, cancelGameFriendRequest, getGamePlayerBadges, getGamePlayerRelationship, listGameBlocks, listGameFriendRequests, listGameFriends, removeGameFriend, respondToGameFriendRequest, searchGamePlayers, sendGameFriendRequest, unblockGamePlayer, } from "./db/game-social.mjs";
import { createFriendshipBetweenPlayers, loadPlayerRelationships, recordDirectInteractionBetweenPlayers, recordSharedEventBetweenPlayers, recordSharedSessionBetweenPlayers, removeFriendBetweenPlayers, savePlayerRelationships, } from "./db/relationships.mjs";
import { commentOnThought, deleteThought, deleteThoughtComment, listThoughtComments, listThoughts, reactToThought, saveThought, shareThought, } from "./db/thoughts.mjs";
import { deleteAccountService, loginAccountService, logoutAccountService, registerAccountService, requestPasswordResetService, resetPasswordService, verifyAccountSessionService, } from "./services/auth.mjs";
import { createTacticalArenaCheckoutSession, fulfillPremiumCheckoutSessionFromReturn, fulfillStripeWebhook, } from "./services/payments.mjs";
import { createPlayAccessTokenProvider, fulfillPlayPurchase } from "./services/play-billing.mjs";
import { createEmailSender } from "./email.mjs";
import { broadcastNotification, createNotification, deleteNotificationsByPayloadRef, listNotifications, markAllNotificationsRead, } from "./db/notifications.mjs";
import { createFriendRequest, getFriendRequest, acceptFriendRequest, rejectFriendRequest, } from "./db/friend-requests.mjs";
import { createChallenge, getChallenge, acceptChallenge, declineChallenge, } from "./db/challenges.mjs";
import { findOrCreateConversation, findConversationBetween, listConversations, getConversation, listMessages, createMessage, markConversationRead, } from "./db/messages.mjs";
import { savePlayerPhoto, listPlayerPhotos, getPlayerPhoto, deletePlayerPhoto, reactToPhoto, commentOnPhoto, listPhotoComments, deletePhotoComment, } from "./db/photos.mjs";
const { Pool } = pg;
function createDatabaseCheck(pool) {
    if (!pool) {
        return async () => false;
    }
    return async function checkDatabase() {
        try {
            await pool.query("select 1");
            return true;
        }
        catch {
            return false;
        }
    };
}
async function closePool(pool) {
    if (!pool)
        return;
    try {
        await pool.end();
    }
    catch {
        // Shutdown should stay best-effort for the first scaffold.
    }
}
async function bootstrap() {
    const config = readConfig();
    const pool = config.hasDatabaseUrl ? new Pool({ connectionString: config.databaseUrl }) : null;
    if (pool) {
        await applyMigrations(pool);
        // Bootstrap admin access. Runs after migrations so the column exists, and only ever
        // grants — see seedAdminsFromEmails for why removing an address here does not demote
        // anyone. An account must already exist for its email to be promoted, so the normal
        // first-run order is: sign up through the site, set ADMIN_EMAILS, redeploy.
        const promoted = await seedAdminsFromEmails(pool, process.env.ADMIN_EMAILS);
        if (promoted.length) {
            process.stdout.write(`[admin] granted admin to ${promoted.length} account(s) from ADMIN_EMAILS\n`);
        }
    }
    const emailSender = createEmailSender({
        apiKey: config.resendApiKey,
        fromEmail: config.fromEmail,
    });
    const uploadService = createUploadService({
        cloudinaryCloudName: config.cloudinaryCloudName,
        cloudinaryApiKey: config.cloudinaryApiKey,
        cloudinaryApiSecret: config.cloudinaryApiSecret,
    });
    // One provider for the process: it caches the androidpublisher access token, so every
    // purchase verification after the first reuses it instead of re-signing a JWT.
    const getPlayAccessToken = createPlayAccessTokenProvider({
        serviceAccountKey: config.playServiceAccountKey,
    });
    function avatarUrlResolver(assetId) {
        if (!assetId)
            return "";
        return `https://res.cloudinary.com/${config.cloudinaryCloudName}/image/upload/${assetId}`;
    }
    const app = createApp({
        config,
        uploadService,
        avatarUrlResolver,
        checkDatabase: createDatabaseCheck(pool),
        searchPlayers: (q) => searchPlayers(pool, q),
        // Every new account is befriended with the FOUNDER_EMAIL account, if one is configured.
        // The friendship goes through the same ledgered path a player-initiated one does.
        registerAccount: (params) => registerAccountService(pool, params, {
            founderEmail: config.founderEmail,
            createFriendship: (leftPlayerId, rightPlayerId) => createFriendshipBetweenPlayers(pool, leftPlayerId, rightPlayerId),
        }),
        loginAccount: (params) => loginAccountService(pool, params),
        verifyAccountSession: (playerId, sessionId) => verifyAccountSessionService(pool, playerId, sessionId),
        logoutAccount: (playerId, sessionId) => logoutAccountService(pool, playerId, sessionId),
        requestPasswordReset: ({ email }) => requestPasswordResetService(pool, emailSender, { email, appBaseUrl: config.appBaseUrl }),
        resetPassword: (params) => resetPasswordService(pool, params),
        deleteAccount: (playerId) => deleteAccountService(pool, playerId),
        jwtSecret: config.jwtSecret,
        isProduction: config.isProduction,
        // Admin console. `isAdminPlayer` is the authority check the /admin/ gate calls on
        // every request; the rest are the console's reads and writes.
        isAdminPlayer: (playerId) => isAdminPlayer(pool, playerId),
        getAccountSuspension: (playerId) => getAccountSuspension(pool, playerId),
        listAdmins: () => listAdmins(pool),
        setAdminFlag: (playerId, isAdmin) => setAdminFlag(pool, playerId, isAdmin === true),
        writeAuditLog: (entry) => writeAuditLog(pool, entry),
        listAuditLog: (options) => listAuditLog(pool, options),
        listPublicBulletins: (options) => listPublicBulletins(pool, options),
        listAllBulletins: () => listAllBulletins(pool),
        getPublicBulletinBySlug: (slug) => getPublicBulletinBySlug(pool, slug),
        createBulletin: (input, createdBy) => createBulletin(pool, input, createdBy),
        updateBulletin: (id, input) => updateBulletin(pool, id, input),
        // Removing an announcement takes its notifications with it, so nobody is left with a
        // "New bulletin" alert pointing at something that no longer exists.
        deleteBulletin: async (id) => {
            const result = await deleteBulletin(pool, id);
            if (result?.ok)
                await deleteNotificationsByPayloadRef(pool, "contentId", id);
            return result;
        },
        announceBulletin: (bulletin, actorPlayerId) => announceBulletinService({
            bulletin,
            actorPlayerId,
            claimAnnouncement: (id) => claimBulletinAnnouncement(pool, id),
            broadcast: (params) => broadcastNotification(pool, params),
        }),
        listPublicEvents: (options) => listPublicEvents(pool, options),
        listAllEvents: () => listAllEvents(pool),
        getPublicEventBySlug: (slug) => getPublicEventBySlug(pool, slug),
        createEvent: (input, createdBy) => createEvent(pool, input, createdBy),
        updateEvent: (id, input) => updateEvent(pool, id, input),
        deleteEvent: async (id) => {
            const result = await deleteEvent(pool, id);
            if (result?.ok)
                await deleteNotificationsByPayloadRef(pool, "contentId", id);
            return result;
        },
        announceEvent: (event, actorPlayerId) => announceEventService({
            event,
            actorPlayerId,
            claimAnnouncement: (id) => claimEventAnnouncement(pool, id),
            broadcast: (params) => broadcastNotification(pool, params),
        }),
        listCabinetOverrides: () => listCabinetOverrides(pool),
        saveCabinetOverride: (slug, input, updatedBy) => saveCabinetOverride(pool, slug, input, updatedBy),
        deleteCabinetOverride: (slug) => deleteCabinetOverride(pool, slug),
        listSiteSettings: () => listSiteSettings(pool),
        saveSiteSetting: (key, value, updatedBy) => saveSiteSetting(pool, key, value, updatedBy),
        fileReport: (input) => fileReport(pool, input),
        listReports: (options) => listReports(pool, options),
        resolveReport: (id, status, adminPlayerId) => resolveReport(pool, id, status, adminPlayerId),
        removeContentAsAdmin: (targetType, targetId) => removeContentAsAdmin(pool, targetType, targetId),
        listSuspendedAccounts: () => listSuspendedAccounts(pool),
        suspendAccount: (playerId, options) => suspendAccount(pool, playerId, options),
        liftSuspension: (playerId) => liftSuspension(pool, playerId),
        loadPlayerLayout: (playerId) => loadPlayerLayout(pool, playerId),
        savePlayerLayout: (playerId, layout) => savePlayerLayout(pool, playerId, layout),
        loadPlayerProfile: (playerId) => loadPlayerProfile(pool, playerId),
        loadPlayerProfileByFriendCode: (friendCode) => loadPlayerProfileByFriendCode(pool, friendCode),
        savePlayerProfile: (playerId, patch) => savePlayerProfile(pool, playerId, patch),
        loadPlayerMetrics: (playerId) => loadPlayerMetrics(pool, playerId),
        savePlayerMetrics: (playerId, patch) => savePlayerMetrics(pool, playerId, patch),
        incrementPlayerProfileView: (playerId, options) => incrementPlayerProfileView(pool, playerId, options),
        loadPlayerRelationships: (playerId) => loadPlayerRelationships(pool, playerId),
        createFriendshipBetweenPlayers: (leftPlayerId, rightPlayerId, options) => createFriendshipBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
        removeFriendBetweenPlayers: (leftPlayerId, rightPlayerId) => removeFriendBetweenPlayers(pool, leftPlayerId, rightPlayerId),
        recordSharedSessionBetweenPlayers: (leftPlayerId, rightPlayerId, options) => recordSharedSessionBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
        recordSharedEventBetweenPlayers: (leftPlayerId, rightPlayerId, options) => recordSharedEventBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
        recordDirectInteractionBetweenPlayers: (leftPlayerId, rightPlayerId, options) => recordDirectInteractionBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
        savePlayerRelationships: (playerId, patch) => savePlayerRelationships(pool, playerId, patch),
        listActivityItems: () => listActivityItems(pool),
        saveActivityItem: (item) => saveActivityItem(pool, item),
        listThoughts: (options) => listThoughts(pool, options),
        listThoughtComments: (thoughtId, options) => listThoughtComments(pool, thoughtId, options),
        saveThought: (thought) => saveThought(pool, thought),
        shareThought: (thoughtId, viewerPlayerId, viewerAuthorDisplayName, options) => shareThought(pool, thoughtId, viewerPlayerId, viewerAuthorDisplayName, options),
        commentOnThought: (thoughtId, viewerPlayerId, viewerAuthorDisplayName, text) => commentOnThought(pool, thoughtId, viewerPlayerId, viewerAuthorDisplayName, text),
        reactToThought: (thoughtId, viewerPlayerId, reactionId) => reactToThought(pool, thoughtId, viewerPlayerId, reactionId),
        deleteThought: (thoughtId, requesterPlayerId) => deleteThought(pool, thoughtId, requesterPlayerId),
        deleteThoughtComment: (thoughtId, commentId, requesterPlayerId) => deleteThoughtComment(pool, thoughtId, commentId, requesterPlayerId),
        createNotification: (params) => createNotification(pool, params),
        deleteNotificationsByPayloadRef: (payloadKey, payloadValue) => deleteNotificationsByPayloadRef(pool, payloadKey, payloadValue),
        listNotifications: (recipientPlayerId) => listNotifications(pool, recipientPlayerId),
        markAllNotificationsRead: (recipientPlayerId) => markAllNotificationsRead(pool, recipientPlayerId),
        createFriendRequest: (params) => createFriendRequest(pool, params),
        getFriendRequest: (id) => getFriendRequest(pool, id),
        acceptFriendRequest: (id) => acceptFriendRequest(pool, id),
        rejectFriendRequest: (id) => rejectFriendRequest(pool, id),
        createChallenge: (params) => createChallenge(pool, params),
        getChallenge: (id) => getChallenge(pool, id),
        acceptChallenge: (id) => acceptChallenge(pool, id),
        declineChallenge: (id) => declineChallenge(pool, id),
        findOrCreateConversation: (p1, p2) => findOrCreateConversation(pool, p1, p2),
        findConversationBetween: (p1, p2) => findConversationBetween(pool, p1, p2),
        listConversations: (playerId) => listConversations(pool, playerId),
        getConversation: (convId) => getConversation(pool, convId),
        listMessages: (convId) => listMessages(pool, convId),
        createMessage: (params) => createMessage(pool, params),
        markConversationRead: (convId, playerId) => markConversationRead(pool, convId, playerId),
        getGameRating: (gameSlug, playerId) => getGameRating(pool, playerId, gameSlug),
        recordMatchRating: (gameSlug, params) => recordMatchRating(pool, { ...params, gameSlug }),
        enqueueRanked: (gameSlug, params) => enqueueRanked(pool, { ...params, gameSlug }),
        pollRanked: (gameSlug, params) => pollRanked(pool, { ...params, gameSlug }),
        cancelRanked: (gameSlug, params) => cancelRanked(pool, { ...params, gameSlug }),
        startRankedMatch: (gameSlug, params) => startRankedMatch(pool, { ...params, gameSlug }),
        reportRankedResult: (gameSlug, params) => reportRankedResult(pool, { ...params, gameSlug }),
        recordRankedHeartbeat: (gameSlug, params) => recordRankedHeartbeat(pool, { ...params, gameSlug }),
        getRankedStanding: (gameSlug, params) => getRankedStanding(pool, { ...params, gameSlug }),
        setRankedLobby: (gameSlug, params) => setRankedLobbyCode(pool, { ...params, gameSlug }),
        saveRankedProfile: (gameSlug, params) => saveRankedProfile(pool, { ...params, gameSlug }),
        getRankedCard: (gameSlug, params) => getPublicRankedCard(pool, { ...params, gameSlug }),
        getRankedUnitStats: (gameSlug, params) => getRankedUnitStats(pool, { ...params, gameSlug }),
        getRankedMatches: (gameSlug, params) => getRankedMatches(pool, { ...params, gameSlug }),
        getRankedMatchDetail: (gameSlug, params) => getRankedMatchDetail(pool, { ...params, gameSlug }),
        getRankedLeaderboard: (gameSlug, params) => getRankedLeaderboard(pool, { ...params, gameSlug }),
        listGameFriends: (gameSlug, params) => listGameFriends(pool, { ...params, gameSlug }),
        removeGameFriend: (gameSlug, params) => removeGameFriend(pool, { ...params, gameSlug }),
        listGameFriendRequests: (gameSlug, params) => listGameFriendRequests(pool, { ...params, gameSlug }),
        sendGameFriendRequest: (gameSlug, params) => sendGameFriendRequest(pool, { ...params, gameSlug }),
        respondToGameFriendRequest: (gameSlug, params) => respondToGameFriendRequest(pool, { ...params, gameSlug }),
        cancelGameFriendRequest: (gameSlug, params) => cancelGameFriendRequest(pool, { ...params, gameSlug }),
        listGameBlocks: (gameSlug, params) => listGameBlocks(pool, { ...params, gameSlug }),
        blockGamePlayer: (gameSlug, params) => blockGamePlayer(pool, { ...params, gameSlug }),
        unblockGamePlayer: (gameSlug, params) => unblockGamePlayer(pool, { ...params, gameSlug }),
        searchGamePlayers: (gameSlug, params) => searchGamePlayers(pool, { ...params, gameSlug }),
        getGamePlayerRelationship: (gameSlug, params) => getGamePlayerRelationship(pool, { ...params, gameSlug }),
        getGamePlayerBadges: (gameSlug, params) => getGamePlayerBadges(pool, { ...params, gameSlug }),
        getLadderStandings: (gameSlug, params) => getLadderStandings(pool, { ...params, gameSlug }),
        getPlayerLadderPlacements: (playerId, params) => getPlayerLadderPlacements(pool, { ...params, playerId }),
        getGameProgress: (playerId, gameSlug) => getGameProgress(pool, playerId, gameSlug),
        getGarage: (params) => getGarage(pool, params),
        saveGarage: (params) => saveGarage(pool, params),
        getPublicLoadout: (params) => getPublicLoadout(pool, params),
        getPublicLoadouts: (params) => getPublicLoadouts(pool, params),
        getBoardStandings: (params) => getBoardStandings(pool, params),
        getPlayerRunRecords: (params) => getPlayerRunRecords(pool, params),
        recordRun: (params) => recordRun(pool, params),
        recordGameProgressClaim: (params) => recordGameProgressClaim(pool, params),
        spendValor: (params) => spendValorForEntitlement(pool, params),
        resetCampaign: (params) => resetCampaignProgress(pool, params.playerId, params.gameSlug),
        backfillOwnership: (params) => backfillLocalOwnership(pool, params),
        activateConsumable: (params) => activateInventoryItem(pool, params),
        createPremiumCheckoutSession: (params) => createTacticalArenaCheckoutSession({
            ...params,
            stripeApiKey: config.stripeApiKey,
            stripePublishableKey: config.stripePublishableKey,
            appBaseUrl: config.appBaseUrl,
            getGameProgress: (playerId, gameSlug) => getGameProgress(pool, playerId, gameSlug),
        }),
        fulfillPremiumCheckoutSession: (params) => fulfillPremiumCheckoutSessionFromReturn({
            ...params,
            stripeApiKey: config.stripeApiKey,
            getGameProgress: (playerId, gameSlug) => getGameProgress(pool, playerId, gameSlug),
            recordGameProgressClaim: (claim) => recordGameProgressClaim(pool, { ...claim, allowPremiumKinds: true }),
        }),
        fulfillStripeWebhook: (params) => fulfillStripeWebhook({
            ...params,
            stripeWebhookSecret: config.stripeWebhookSecret,
            stripeApiKey: config.stripeApiKey,
            getGameProgress: (playerId, gameSlug) => getGameProgress(pool, playerId, gameSlug),
            recordGameProgressClaim: (claim) => recordGameProgressClaim(pool, { ...claim, allowPremiumKinds: true }),
            findStripeGrant: (lookup) => findStripeGrant(pool, lookup),
            revokeGameEntitlements: (revocation) => revokeGameEntitlements(pool, revocation),
            regrantStripeEntitlements: (regrant) => regrantStripeEntitlements(pool, regrant),
        }),
        fulfillPlayPurchase: config.hasPlayBilling
            ? (params) => fulfillPlayPurchase({
                ...params,
                packageName: config.playPackageName,
                getAccessToken: getPlayAccessToken,
                getGameProgress: (playerId, gameSlug) => getGameProgress(pool, playerId, gameSlug),
                recordGameProgressClaim: (claim) => recordGameProgressClaim(pool, { ...claim, allowPremiumKinds: true }),
                findPlayPurchaseClaim: (lookup) => findPlayPurchaseClaim(pool, lookup),
            })
            : null,
        savePlayerPhoto: (params) => savePlayerPhoto(pool, params),
        listPlayerPhotos: (playerId, opts) => listPlayerPhotos(pool, playerId, opts),
        getPlayerPhoto: (photoId, opts) => getPlayerPhoto(pool, photoId, opts),
        deletePlayerPhoto: (photoId, playerId) => deletePlayerPhoto(pool, photoId, playerId),
        reactToPhoto: (photoId, viewerPlayerId, reactionId) => reactToPhoto(pool, photoId, viewerPlayerId, reactionId),
        commentOnPhoto: (photoId, viewerPlayerId, displayName, text) => commentOnPhoto(pool, photoId, viewerPlayerId, displayName, text),
        listPhotoComments: (photoId) => listPhotoComments(pool, photoId),
        deletePhotoComment: (photoId, commentId, requesterPlayerId) => deletePhotoComment(pool, photoId, commentId, requesterPlayerId),
    });
    const server = createServer(app);
    async function shutdown(signal) {
        server.close(async () => {
            await closePool(pool);
            process.exit(0);
        });
        setTimeout(async () => {
            await closePool(pool);
            process.exit(1);
        }, 5000).unref();
        if (signal) {
            process.stdout.write(`[platform-api] received ${signal}, shutting down\n`);
        }
    }
    server.listen(config.port, () => {
        process.stdout.write(`[platform-api] listening on port ${config.port}\n`);
    });
    process.on("SIGINT", () => {
        shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
        shutdown("SIGTERM");
    });
}
await bootstrap();
