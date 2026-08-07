import {
  extractTokenFromRequest,
  verifyToken,
} from "./auth-helpers.mjs";
import { readJsonBody, readMultipartFile, applyCorsHeaders, writeJson } from "./http-utils.mjs";
import { clientIp, createRateLimiter } from "./rate-limit.mjs";
import { handleAuthRoute } from "./routes/auth-routes.mjs";
import { handleMessageRoute } from "./routes/message-routes.mjs";
import { handleNotificationRoute } from "./routes/notification-routes.mjs";
import { handleLayoutRoute } from "./routes/layout-routes.mjs";
import { handleRatingRoute } from "./routes/rating-routes.mjs";
import { handleRankedRoute } from "./routes/ranked-routes.mjs";
import { handleGameSocialRoute } from "./routes/game-social-routes.mjs";
import { handleLoadoutRoute } from "./routes/loadout-routes.mjs";
import { handleLadderRoute } from "./routes/ladder-routes.mjs";
import { handleGameProgressRoute } from "./routes/game-progress-routes.mjs";
import { handlePaymentRoute } from "./routes/payment-routes.mjs";
import { handlePlayerRoute } from "./routes/player-routes.mjs";
import { handleThoughtRoute } from "./routes/thought-routes.mjs";
import { handlePhotoRoute } from "./routes/photo-routes.mjs";
import { handleAdminRoute } from "./routes/admin-routes.mjs";
import { handleContentRoute } from "./routes/content-routes.mjs";

function resolveProfileAvatarUrl(profile: any, resolver: any): any {
  if (!profile || !resolver) return profile;

  const resolveFriendAvatar = (entry: any) => {
    if (!entry) return entry;
    const resolvedAvatarUrl = entry.avatarAssetId
      ? resolver(entry.avatarAssetId)
      : (entry.avatarUrl || "");
    return {
      ...entry,
      avatarUrl: resolvedAvatarUrl || "",
    };
  };

  return {
    ...profile,
    avatarUrl: profile.avatarAssetId ? resolver(profile.avatarAssetId) : (profile.avatarUrl || ""),
    friendsPreview: Array.isArray(profile.friendsPreview)
      ? profile.friendsPreview.map(resolveFriendAvatar)
      : profile.friendsPreview,
    mainSqueeze: resolveFriendAvatar(profile.mainSqueeze),
  };
}

function buildTimestamp(now: any): string {
  if (typeof now === "function") {
    const value = now();
    return typeof value === "string" && value.trim() ? value : new Date().toISOString();
  }

  return new Date().toISOString();
}

const VALID_GESTURE_TYPES = new Set(["poke", "hug", "kick", "blowkiss", "nudge"]);

export function createApp(options: any = {}) {
  const config = options?.config && typeof options.config === "object"
    ? options.config
    : { hasDatabaseUrl: false };
  const checkDatabase = typeof options?.checkDatabase === "function"
    ? options.checkDatabase
    : async () => false;
  const searchPlayers = typeof options?.searchPlayers === "function"
    ? options.searchPlayers
    : async () => [];
  const loadPlayerProfile = typeof options?.loadPlayerProfile === "function"
    ? options.loadPlayerProfile
    : async () => null;
  const loadPlayerProfileByFriendCode = typeof options?.loadPlayerProfileByFriendCode === "function"
    ? options.loadPlayerProfileByFriendCode
    : async () => null;
  const savePlayerProfile = typeof options?.savePlayerProfile === "function"
    ? options.savePlayerProfile
    : async () => null;
  const loadPlayerMetrics = typeof options?.loadPlayerMetrics === "function"
    ? options.loadPlayerMetrics
    : async () => null;
  const savePlayerMetrics = typeof options?.savePlayerMetrics === "function"
    ? options.savePlayerMetrics
    : async () => null;
  const incrementPlayerProfileView = typeof options?.incrementPlayerProfileView === "function"
    ? options.incrementPlayerProfileView
    : async () => null;
  const loadPlayerRelationships = typeof options?.loadPlayerRelationships === "function"
    ? options.loadPlayerRelationships
    : async () => null;
  const createFriendshipBetweenPlayers = typeof options?.createFriendshipBetweenPlayers === "function"
    ? options.createFriendshipBetweenPlayers
    : async () => null;
  const removeFriendBetweenPlayers = typeof options?.removeFriendBetweenPlayers === "function"
    ? options.removeFriendBetweenPlayers
    : async () => null;
  const recordSharedSessionBetweenPlayers = typeof options?.recordSharedSessionBetweenPlayers === "function"
    ? options.recordSharedSessionBetweenPlayers
    : async () => null;
  const recordSharedEventBetweenPlayers = typeof options?.recordSharedEventBetweenPlayers === "function"
    ? options.recordSharedEventBetweenPlayers
    : async () => null;
  const recordDirectInteractionBetweenPlayers = typeof options?.recordDirectInteractionBetweenPlayers === "function"
    ? options.recordDirectInteractionBetweenPlayers
    : async () => null;
  const savePlayerRelationships = typeof options?.savePlayerRelationships === "function"
    ? options.savePlayerRelationships
    : async () => null;
  const listActivityItems = typeof options?.listActivityItems === "function"
    ? options.listActivityItems
    : async () => [];
  const saveActivityItem = typeof options?.saveActivityItem === "function"
    ? options.saveActivityItem
    : async () => null;
  const listThoughts = typeof options?.listThoughts === "function"
    ? options.listThoughts
    : async () => [];
  const listThoughtComments = typeof options?.listThoughtComments === "function"
    ? options.listThoughtComments
    : async () => [];
  const saveThought = typeof options?.saveThought === "function"
    ? options.saveThought
    : async () => null;
  const shareThought = typeof options?.shareThought === "function"
    ? options.shareThought
    : async () => null;
  const commentOnThought = typeof options?.commentOnThought === "function"
    ? options.commentOnThought
    : async () => null;
  const reactToThought = typeof options?.reactToThought === "function"
    ? options.reactToThought
    : async () => null;
  const deleteThought = typeof options?.deleteThought === "function"
    ? options.deleteThought
    : async () => ({ ok: false, reason: "not_found" });
  const deleteThoughtComment = typeof options?.deleteThoughtComment === "function"
    ? options.deleteThoughtComment
    : async () => ({ ok: false, reason: "not_found" });
  const createNotification = typeof options?.createNotification === "function"
    ? options.createNotification
    : async () => null;
  const deleteNotificationsByPayloadRef = typeof options?.deleteNotificationsByPayloadRef === "function"
    ? options.deleteNotificationsByPayloadRef
    : async () => 0;
  const listNotifications = typeof options?.listNotifications === "function"
    ? options.listNotifications
    : async () => ({ notifications: [], unreadCount: 0 });
  const markAllNotificationsRead = typeof options?.markAllNotificationsRead === "function"
    ? options.markAllNotificationsRead
    : async () => {};
  const createFriendRequest = typeof options?.createFriendRequest === "function"
    ? options.createFriendRequest
    : async () => null;
  const getFriendRequest = typeof options?.getFriendRequest === "function"
    ? options.getFriendRequest
    : async () => null;
  const acceptFriendRequest = typeof options?.acceptFriendRequest === "function"
    ? options.acceptFriendRequest
    : async () => null;
  const rejectFriendRequest = typeof options?.rejectFriendRequest === "function"
    ? options.rejectFriendRequest
    : async () => null;
  const createChallenge = typeof options?.createChallenge === "function"
    ? options.createChallenge
    : async () => null;
  const getChallenge = typeof options?.getChallenge === "function"
    ? options.getChallenge
    : async () => null;
  const acceptChallenge = typeof options?.acceptChallenge === "function"
    ? options.acceptChallenge
    : async () => null;
  const declineChallenge = typeof options?.declineChallenge === "function"
    ? options.declineChallenge
    : async () => null;
  const findOrCreateConversation = typeof options?.findOrCreateConversation === "function"
    ? options.findOrCreateConversation
    : async () => null;
  const findConversationBetween = typeof options?.findConversationBetween === "function"
    ? options.findConversationBetween
    : async () => null;
  const listConversations = typeof options?.listConversations === "function"
    ? options.listConversations
    : async () => [];
  const getConversation = typeof options?.getConversation === "function"
    ? options.getConversation
    : async () => null;
  const listMessages = typeof options?.listMessages === "function"
    ? options.listMessages
    : async () => [];
  const createMessage = typeof options?.createMessage === "function"
    ? options.createMessage
    : async () => null;
  const markConversationRead = typeof options?.markConversationRead === "function"
    ? options.markConversationRead
    : async () => {};
  const loadPlayerLayout = typeof options?.loadPlayerLayout === "function"
    ? options.loadPlayerLayout
    : async () => null;
  const savePlayerLayout = typeof options?.savePlayerLayout === "function"
    ? options.savePlayerLayout
    : async () => null;
  const getGameRating = typeof options?.getGameRating === "function"
    ? options.getGameRating
    : async () => null;
  const recordMatchRating = typeof options?.recordMatchRating === "function"
    ? options.recordMatchRating
    : async () => null;
  const enqueueRanked = typeof options?.enqueueRanked === "function"
    ? options.enqueueRanked
    : async () => null;
  const pollRanked = typeof options?.pollRanked === "function"
    ? options.pollRanked
    : async () => null;
  const cancelRanked = typeof options?.cancelRanked === "function"
    ? options.cancelRanked
    : async () => null;
  const startRankedMatch = typeof options?.startRankedMatch === "function"
    ? options.startRankedMatch
    : async () => null;
  const reportRankedResult = typeof options?.reportRankedResult === "function"
    ? options.reportRankedResult
    : async () => null;
  const recordRankedHeartbeat = typeof options?.recordRankedHeartbeat === "function"
    ? options.recordRankedHeartbeat
    : async () => null;
  const getRankedStanding = typeof options?.getRankedStanding === "function"
    ? options.getRankedStanding
    : async () => null;
  const setRankedLobby = typeof options?.setRankedLobby === "function"
    ? options.setRankedLobby
    : async () => null;
  const saveRankedProfile = typeof options?.saveRankedProfile === "function"
    ? options.saveRankedProfile
    : async () => null;
  const getRankedCard = typeof options?.getRankedCard === "function"
    ? options.getRankedCard
    : async () => null;
  const getRankedUnitStats = typeof options?.getRankedUnitStats === "function"
    ? options.getRankedUnitStats
    : async () => null;
  const getRankedMatches = typeof options?.getRankedMatches === "function"
    ? options.getRankedMatches
    : async () => null;
  const getRankedMatchDetail = typeof options?.getRankedMatchDetail === "function"
    ? options.getRankedMatchDetail
    : async () => null;
  const getRankedLeaderboard = typeof options?.getRankedLeaderboard === "function"
    ? options.getRankedLeaderboard
    : async () => null;
  const listGameFriends = typeof options?.listGameFriends === "function"
    ? options.listGameFriends
    : async () => null;
  const removeGameFriend = typeof options?.removeGameFriend === "function"
    ? options.removeGameFriend
    : async () => null;
  const listGameFriendRequests = typeof options?.listGameFriendRequests === "function"
    ? options.listGameFriendRequests
    : async () => null;
  const sendGameFriendRequest = typeof options?.sendGameFriendRequest === "function"
    ? options.sendGameFriendRequest
    : async () => null;
  const respondToGameFriendRequest = typeof options?.respondToGameFriendRequest === "function"
    ? options.respondToGameFriendRequest
    : async () => null;
  const cancelGameFriendRequest = typeof options?.cancelGameFriendRequest === "function"
    ? options.cancelGameFriendRequest
    : async () => null;
  const listGameBlocks = typeof options?.listGameBlocks === "function"
    ? options.listGameBlocks
    : async () => null;
  const blockGamePlayer = typeof options?.blockGamePlayer === "function"
    ? options.blockGamePlayer
    : async () => null;
  const unblockGamePlayer = typeof options?.unblockGamePlayer === "function"
    ? options.unblockGamePlayer
    : async () => null;
  const searchGamePlayers = typeof options?.searchGamePlayers === "function"
    ? options.searchGamePlayers
    : async () => null;
  const getGamePlayerRelationship = typeof options?.getGamePlayerRelationship === "function"
    ? options.getGamePlayerRelationship
    : async () => null;
  const getGamePlayerBadges = typeof options?.getGamePlayerBadges === "function"
    ? options.getGamePlayerBadges
    : async () => null;
  const getLadderStandings = typeof options?.getLadderStandings === "function"
    ? options.getLadderStandings
    : async () => null;
  const getPlayerLadderPlacements = typeof options?.getPlayerLadderPlacements === "function"
    ? options.getPlayerLadderPlacements
    : async () => null;
  const getGameProgress = typeof options?.getGameProgress === "function"
    ? options.getGameProgress
    : async () => null;
  // Cosmetic loadouts. Injected the same way as everything else so the route
  // family is testable without a database.
  const getGarage = typeof options?.getGarage === "function" ? options.getGarage : null;
  const saveGarage = typeof options?.saveGarage === "function" ? options.saveGarage : null;
  const getPublicLoadout = typeof options?.getPublicLoadout === "function" ? options.getPublicLoadout : null;
  const getPublicLoadouts = typeof options?.getPublicLoadouts === "function" ? options.getPublicLoadouts : null;
  const recordGameProgressClaim = typeof options?.recordGameProgressClaim === "function"
    ? options.recordGameProgressClaim
    : async () => null;
  const spendValor = typeof options?.spendValor === "function"
    ? options.spendValor
    : null;
  const resetCampaign = typeof options?.resetCampaign === "function"
    ? options.resetCampaign
    : null;
  const backfillOwnership = typeof options?.backfillOwnership === "function"
    ? options.backfillOwnership
    : null;
  const activateConsumable = typeof options?.activateConsumable === "function"
    ? options.activateConsumable
    : null;
  // Admin console services. `isAdminPlayer` defaults to denying: an app constructed
  // without it (every existing test) must have no admins rather than no gate.
  const isAdminPlayer = typeof options?.isAdminPlayer === "function"
    ? options.isAdminPlayer
    : async () => false;
  const getAccountSuspension = typeof options?.getAccountSuspension === "function"
    ? options.getAccountSuspension
    : async () => null;
  const listAdmins = typeof options?.listAdmins === "function" ? options.listAdmins : async () => [];
  const setAdminFlag = typeof options?.setAdminFlag === "function"
    ? options.setAdminFlag
    : async () => ({ ok: false, error: "database_unavailable" });
  const writeAuditLog = typeof options?.writeAuditLog === "function" ? options.writeAuditLog : async () => {};
  const listAuditLog = typeof options?.listAuditLog === "function" ? options.listAuditLog : async () => [];
  const listPublicBulletins = typeof options?.listPublicBulletins === "function" ? options.listPublicBulletins : async () => [];
  const listAllBulletins = typeof options?.listAllBulletins === "function" ? options.listAllBulletins : async () => [];
  const getPublicBulletinBySlug = typeof options?.getPublicBulletinBySlug === "function"
    ? options.getPublicBulletinBySlug
    : async () => null;
  const createBulletin = typeof options?.createBulletin === "function"
    ? options.createBulletin
    : async () => ({ ok: false, error: "database_unavailable" });
  const updateBulletin = typeof options?.updateBulletin === "function"
    ? options.updateBulletin
    : async () => ({ ok: false, error: "database_unavailable" });
  // Without a database there is nobody to notify, so the default is a no-op rather than an
  // error: a publish that cannot fan out is still a successful publish.
  const announceBulletin = typeof options?.announceBulletin === "function"
    ? options.announceBulletin
    : async () => ({ announced: false, reason: "not_configured" });
  const announceEvent = typeof options?.announceEvent === "function"
    ? options.announceEvent
    : async () => ({ announced: false, reason: "not_configured" });
  const deleteBulletin = typeof options?.deleteBulletin === "function"
    ? options.deleteBulletin
    : async () => ({ ok: false, error: "database_unavailable" });
  const listPublicEvents = typeof options?.listPublicEvents === "function" ? options.listPublicEvents : async () => [];
  const listAllEvents = typeof options?.listAllEvents === "function" ? options.listAllEvents : async () => [];
  const getPublicEventBySlug = typeof options?.getPublicEventBySlug === "function"
    ? options.getPublicEventBySlug
    : async () => null;
  const createEvent = typeof options?.createEvent === "function"
    ? options.createEvent
    : async () => ({ ok: false, error: "database_unavailable" });
  const updateEvent = typeof options?.updateEvent === "function"
    ? options.updateEvent
    : async () => ({ ok: false, error: "database_unavailable" });
  const deleteEvent = typeof options?.deleteEvent === "function"
    ? options.deleteEvent
    : async () => ({ ok: false, error: "database_unavailable" });
  const listCabinetOverrides = typeof options?.listCabinetOverrides === "function" ? options.listCabinetOverrides : async () => [];
  const saveCabinetOverride = typeof options?.saveCabinetOverride === "function"
    ? options.saveCabinetOverride
    : async () => ({ ok: false, error: "database_unavailable" });
  const deleteCabinetOverride = typeof options?.deleteCabinetOverride === "function"
    ? options.deleteCabinetOverride
    : async () => ({ ok: false, error: "database_unavailable" });
  const listSiteSettings = typeof options?.listSiteSettings === "function" ? options.listSiteSettings : async () => ({});
  const saveSiteSetting = typeof options?.saveSiteSetting === "function"
    ? options.saveSiteSetting
    : async () => ({ ok: false, error: "database_unavailable" });
  const fileReport = typeof options?.fileReport === "function"
    ? options.fileReport
    : async () => ({ ok: false, error: "database_unavailable" });
  const listReports = typeof options?.listReports === "function" ? options.listReports : async () => [];
  const resolveReport = typeof options?.resolveReport === "function"
    ? options.resolveReport
    : async () => ({ ok: false, error: "database_unavailable" });
  const removeContentAsAdmin = typeof options?.removeContentAsAdmin === "function"
    ? options.removeContentAsAdmin
    : async () => ({ ok: false, error: "database_unavailable" });
  const listSuspendedAccounts = typeof options?.listSuspendedAccounts === "function" ? options.listSuspendedAccounts : async () => [];
  const suspendAccount = typeof options?.suspendAccount === "function"
    ? options.suspendAccount
    : async () => ({ ok: false, error: "database_unavailable" });
  const liftSuspension = typeof options?.liftSuspension === "function"
    ? options.liftSuspension
    : async () => ({ ok: false, error: "database_unavailable" });
  const createPremiumCheckoutSession = typeof options?.createPremiumCheckoutSession === "function"
    ? options.createPremiumCheckoutSession
    : null;
  const fulfillStripeWebhook = typeof options?.fulfillStripeWebhook === "function"
    ? options.fulfillStripeWebhook
    : null;
  const fulfillPremiumCheckoutSession = typeof options?.fulfillPremiumCheckoutSession === "function"
    ? options.fulfillPremiumCheckoutSession
    : null;
  const fulfillPlayPurchase = typeof options?.fulfillPlayPurchase === "function"
    ? options.fulfillPlayPurchase
    : null;
  const savePlayerPhoto = typeof options?.savePlayerPhoto === "function"
    ? options.savePlayerPhoto
    : async () => null;
  const listPlayerPhotos = typeof options?.listPlayerPhotos === "function"
    ? options.listPlayerPhotos
    : async () => [];
  const getPlayerPhoto = typeof options?.getPlayerPhoto === "function"
    ? options.getPlayerPhoto
    : async () => null;
  const deletePlayerPhoto = typeof options?.deletePlayerPhoto === "function"
    ? options.deletePlayerPhoto
    : async () => false;
  const reactToPhoto = typeof options?.reactToPhoto === "function"
    ? options.reactToPhoto
    : async () => null;
  const commentOnPhoto = typeof options?.commentOnPhoto === "function"
    ? options.commentOnPhoto
    : async () => null;
  const listPhotoComments = typeof options?.listPhotoComments === "function"
    ? options.listPhotoComments
    : async () => [];
  const deletePhotoComment = typeof options?.deletePhotoComment === "function"
    ? options.deletePhotoComment
    : async () => ({ ok: false, reason: "not_found" });
  const registerAccount = typeof options?.registerAccount === "function"
    ? options.registerAccount
    : async () => ({ error: "not_configured" });
  const loginAccount = typeof options?.loginAccount === "function"
    ? options.loginAccount
    : async () => ({ error: "not_configured" });
  const verifyAccountSession = typeof options?.verifyAccountSession === "function"
    ? options.verifyAccountSession
    : null;
  const logoutAccount = typeof options?.logoutAccount === "function"
    ? options.logoutAccount
    : async () => ({ ok: true });
  const requestPasswordReset = typeof options?.requestPasswordReset === "function"
    ? options.requestPasswordReset
    : async () => ({ ok: true });
  const resetPassword = typeof options?.resetPassword === "function"
    ? options.resetPassword
    : async () => ({ error: "not_configured" });
  const deleteAccount = typeof options?.deleteAccount === "function"
    ? options.deleteAccount
    : async () => ({ error: "not_configured" });
  const uploadService = options?.uploadService && typeof options.uploadService.uploadImage === "function"
    ? options.uploadService
    : null;
  const avatarUrlResolver = typeof options?.avatarUrlResolver === "function"
    ? options.avatarUrlResolver
    : null;
  const jwtSecret = typeof options?.jwtSecret === "string" ? options.jwtSecret : "";
  const isProduction = Boolean(options?.isProduction);
  const now = options?.now;
  const authServices = {
    registerAccount,
    loginAccount,
    logoutAccount,
    requestPasswordReset,
    resetPassword,
    deleteAccount,
    // Login / session responses carry the display name so shell-less clients (the
    // packaged app) can show who is signed in.
    loadPlayerProfile,
    // /auth/me reports these so the shell can show an Admin link and a suspension
    // notice. Both are display hints; enforcement lives in the /admin/ gate and the
    // suspension check on the request path, neither of which trusts the client.
    isAdminPlayer,
    getAccountSuspension,
    jwtSecret,
    isProduction,
  };
  const messageServices = {
    listConversations,
    findConversationBetween,
    findOrCreateConversation,
    getConversation,
    listMessages,
    createMessage,
    markConversationRead,
    loadPlayerProfile,
    createNotification,
  };
  const thoughtServices = {
    listThoughts,
    listThoughtComments,
    saveThought,
    shareThought,
    commentOnThought,
    reactToThought,
    deleteThought,
    deleteThoughtComment,
    createNotification,
    deleteNotificationsByPayloadRef,
  };
  const photoServices = {
    savePlayerPhoto,
    listPlayerPhotos,
    getPlayerPhoto,
    deletePlayerPhoto,
    reactToPhoto,
    commentOnPhoto,
    listPhotoComments,
    deletePhotoComment,
    loadPlayerProfile,
    saveThought,
    createNotification,
    deleteNotificationsByPayloadRef,
  };
  const playerServices = {
    searchPlayers,
    loadPlayerProfile,
    loadPlayerProfileByFriendCode,
    savePlayerProfile,
    loadPlayerMetrics,
    savePlayerMetrics,
    incrementPlayerProfileView,
    loadPlayerRelationships,
    savePlayerRelationships,
    createFriendshipBetweenPlayers,
    removeFriendBetweenPlayers,
    recordSharedSessionBetweenPlayers,
    recordSharedEventBetweenPlayers,
    recordDirectInteractionBetweenPlayers,
  };
  const layoutServices = {
    loadPlayerLayout,
    savePlayerLayout,
  };
  const ratingServices = {
    getGameRating,
    recordMatchRating,
  };
  const rankedServices = {
    enqueueRanked,
    pollRanked,
    cancelRanked,
    startRankedMatch,
    reportRankedResult,
    recordRankedHeartbeat,
    getRankedStanding,
    setRankedLobby,
    saveRankedProfile,
    getRankedCard,
    getRankedUnitStats,
    getRankedMatches,
    getRankedMatchDetail,
    getRankedLeaderboard,
  };
  const gameSocialServices = {
    listGameFriends,
    removeGameFriend,
    listGameFriendRequests,
    sendGameFriendRequest,
    respondToGameFriendRequest,
    cancelGameFriendRequest,
    listGameBlocks,
    blockGamePlayer,
    unblockGamePlayer,
    searchGamePlayers,
    getGamePlayerRelationship,
    getGamePlayerBadges,
  };
  const ladderServices = {
    getLadderStandings,
    getPlayerLadderPlacements,
  };
  const loadoutServices = {
    getGarage,
    saveGarage,
    getPublicLoadout,
    getPublicLoadouts,
  };
  const gameProgressServices = {
    getGameProgress,
    recordGameProgressClaim,
    spendValor,
    resetCampaign,
    backfillOwnership,
    activateConsumable,
  };
  const paymentServices = {
    createPremiumCheckoutSession,
    fulfillPremiumCheckoutSession,
    fulfillStripeWebhook,
    fulfillPlayPurchase,
  };
  const notificationServices = {
    listNotifications,
    markAllNotificationsRead,
  };
  // One bundle for the whole /admin/ family: the gate in admin-routes.mts and both
  // sub-handlers read from it, so there is a single list of what the console can reach.
  const adminServices = {
    isAdminPlayer,
    listAdmins,
    setAdminFlag,
    writeAuditLog,
    listAuditLog,
    listAllBulletins,
    createBulletin,
    updateBulletin,
    deleteBulletin,
    announceBulletin,
    listAllEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    announceEvent,
    listCabinetOverrides,
    saveCabinetOverride,
    deleteCabinetOverride,
    listSiteSettings,
    saveSiteSetting,
    listReports,
    resolveReport,
    removeContentAsAdmin,
    listSuspendedAccounts,
    suspendAccount,
    liftSuspension,
  };
  const contentServices = {
    listPublicBulletins,
    getPublicBulletinBySlug,
    listPublicEvents,
    getPublicEventBySlug,
    listCabinetOverrides,
    listSiteSettings,
    fileReport,
  };

  // Coarse per-IP abuse guards. Auth endpoints resist credential brute-force + reset/email
  // spam; checkout-session creation resists Stripe-session spam (which costs real money). The
  // Stripe webhook is intentionally NOT limited (Stripe retries and is signature-verified).
  const rateLimiter = createRateLimiter();
  const MINUTE_MS = 60 * 1000;
  const rateLimitRules = [
    {
      match: (p: string) => p === "/auth/login" || p === "/auth/register"
        || p === "/auth/forgot-password" || p === "/auth/reset-password",
      bucket: "auth",
      limit: 15,
      windowMs: 15 * MINUTE_MS,
    },
    {
      match: (p: string) => p === "/payments/tactical-arena/checkout-sessions",
      bucket: "checkout",
      limit: 30,
      windowMs: 60 * MINUTE_MS,
    },
    {
      // Play purchase tokens are opaque, so the only way to probe them is to guess in bulk.
      // The ceiling is well above a real player's traffic: boot recovery resubmits at most a
      // handful of pending purchases, and buying is rate-limited by Play's own checkout.
      match: (p: string) => p === "/payments/tactical-arena/play-purchases",
      bucket: "play-purchase",
      limit: 60,
      windowMs: 60 * MINUTE_MS,
    },
  ];
  let rateLimitSweepCounter = 0;

  return async function app(req: any, res: any) {
    const requestOrigin = req?.headers?.origin || "";
    const timestamp = buildTimestamp(now);
    try {
      const method = typeof req?.method === "string" ? req.method.toUpperCase() : "GET";
      const requestUrl = new URL(req?.url || "/", "http://localhost");
      const pathname = requestUrl.pathname;

      const rawToken = extractTokenFromRequest(req);
      const verifiedAuthClaims = rawToken && jwtSecret ? verifyToken(rawToken, jwtSecret) : null;
      const authClaims = verifiedAuthClaims?.playerId && verifyAccountSession
        ? (await verifyAccountSession(verifiedAuthClaims.playerId, verifiedAuthClaims.sessionId)
          ? verifiedAuthClaims
          : null)
        : verifiedAuthClaims;

      const playerGestureMatch = pathname.match(/^\/players\/([^/]+)\/gesture$/);
      const friendRequestActionMatch = pathname.match(/^\/friend-requests\/([^/]+)\/(accept|reject)$/);
      const challengeActionMatch = pathname.match(/^\/challenges\/([^/]+)\/(accept|decline)$/);
    if (method === "OPTIONS") {
      res.statusCode = 204;
      applyCorsHeaders(res, requestOrigin);
      res.end("");
      return;
    }

    if (method === "GET" && pathname === "/health") {
      writeJson(res, 200, {
        status: "ok",
        service: "platform-api",
        databaseConfigured: Boolean(config.hasDatabaseUrl),
        timestamp,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && pathname === "/ready") {
      if (!config.hasDatabaseUrl) {
        writeJson(res, 503, {
          status: "error",
          service: "platform-api",
          database: "missing_configuration",
          timestamp,
        }, requestOrigin);
        return;
      }

      const isDatabaseReady = await checkDatabase();
      writeJson(res, isDatabaseReady ? 200 : 503, {
        status: isDatabaseReady ? "ok" : "error",
        service: "platform-api",
        database: isDatabaseReady ? "up" : "down",
        timestamp,
      }, requestOrigin);
      return;
    }

    // Coarse rate limiting on sensitive POST endpoints (health/ready/OPTIONS above are exempt).
    if (method === "POST") {
      const rule = rateLimitRules.find((entry) => entry.match(pathname));
      if (rule) {
        rateLimitSweepCounter = (rateLimitSweepCounter + 1) % 500;
        if (rateLimitSweepCounter === 0) rateLimiter.sweep();
        const result = rateLimiter.check(`${rule.bucket}:${clientIp(req)}`, rule);
        if (!result.allowed) {
          res.setHeader("retry-after", String(Math.ceil(result.retryAfterMs / 1000)));
          writeJson(res, 429, { status: "error", error: "rate_limited", timestamp }, requestOrigin);
          return;
        }
      }
    }

    // Suspension gate. A suspended account keeps READ access — it can still sign in, see
    // its own profile, and read the board, which is what makes the suspension notice
    // visible in the first place — but every state-changing call is refused.
    //
    // The /auth/ family is exempt so a suspended player can still log out and reset their
    // password; suspension is not an account lockout. Games are affected on purpose: a
    // suspended player should not be posting scores or queueing for ranked either.
    if (authClaims?.playerId && method !== "GET" && method !== "HEAD" && !pathname.startsWith("/auth/")) {
      const suspension = await getAccountSuspension(authClaims.playerId);
      if (suspension) {
        writeJson(res, 403, {
          status: "error",
          error: "account_suspended",
          suspendedUntil: suspension.until,
          reason: suspension.reason,
          timestamp,
        }, requestOrigin);
        return;
      }
    }

    // Upload routes
    if (method === "POST" && (pathname === "/upload/avatar" || pathname === "/upload/photo" || pathname === "/upload/background" || pathname === "/upload/music")) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return;
      }

      if (!uploadService) {
        writeJson(res, 503, { status: "error", error: "upload_not_configured", timestamp }, requestOrigin);
        return;
      }

      const multipart = await readMultipartFile(req);
      if (!multipart.ok) {
        const statusCode = multipart.error === "file_too_large" ? 413 : 400;
        writeJson(res, statusCode, { status: "error", error: multipart.error, timestamp }, requestOrigin);
        return;
      }

      if (pathname === "/upload/music") {
        const result = await uploadService.uploadAudio(multipart.buffer, { mimeType: multipart.mimeType });
        if (!result.ok) {
          const statusCode = result.error === "unsupported_file_type" ? 415 : result.error === "file_too_large" ? 413 : 500;
          writeJson(res, statusCode, { status: "error", error: result.error, timestamp }, requestOrigin);
          return;
        }
        writeJson(res, 200, { url: result.url }, requestOrigin);
        return;
      }

      const isAvatar = pathname === "/upload/avatar";
      const isBackground = pathname === "/upload/background";
      const folder = isAvatar ? "uploads/avatars" : isBackground ? "uploads/backgrounds" : "uploads/player-photos";
      const maxWidth = isAvatar ? 800 : isBackground ? 1920 : 1200;

      const result = await uploadService.uploadImage(multipart.buffer, {
        folder,
        maxWidth,
        mimeType: multipart.mimeType,
      });

      if (!result.ok) {
        const statusCode = result.error === "unsupported_file_type" ? 415 : 500;
        writeJson(res, statusCode, { status: "error", error: result.error, timestamp }, requestOrigin);
        return;
      }

      writeJson(res, 200, { assetId: result.assetId, url: result.url }, requestOrigin);
      return;
    }

    // Auth routes
    if (await handleAuthRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: authServices,
    })) {
      return;
    }

    // Admin console. Dispatched early and matched on the whole /admin/ prefix so no
    // later handler can claim an admin path and bypass the gate inside this one.
    if (await handleAdminRoute({
      req,
      res,
      method,
      pathname,
      requestUrl,
      authClaims,
      requestOrigin,
      timestamp,
      services: adminServices,
    })) {
      return;
    }

    // Public bulletins/events/site-config reads, plus report filing.
    if (await handleContentRoute({
      req,
      res,
      method,
      pathname,
      requestUrl,
      authClaims,
      requestOrigin,
      timestamp,
      services: contentServices,
    })) {
      return;
    }

    if (await handleMessageRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: messageServices,
    })) {
      return;
    }

    if (await handleThoughtRoute({
      req,
      res,
      method,
      pathname,
      requestUrl,
      authClaims,
      requestOrigin,
      timestamp,
      services: thoughtServices,
    })) {
      return;
    }

    if (await handlePhotoRoute({
      req,
      res,
      method,
      pathname,
      requestUrl,
      authClaims,
      requestOrigin,
      timestamp,
      services: photoServices,
    })) {
      return;
    }

    if (await handleLayoutRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: layoutServices,
    })) {
      return;
    }

    if (await handleRatingRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: ratingServices,
    })) {
      return;
    }

    if (await handleRankedRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: rankedServices,
    })) {
      return;
    }

    if (await handleGameProgressRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: gameProgressServices,
    })) {
      return;
    }

    if (await handleGameSocialRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: gameSocialServices,
    })) {
      return;
    }

    if (await handleLoadoutRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: loadoutServices,
    })) {
      return;
    }

    if (await handlePaymentRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: paymentServices,
    })) {
      return;
    }

    // Before the player family: /players/:id/ladders must not be swallowed by a
    // broader /players route.
    if (await handleLadderRoute({
      req,
      res,
      method,
      pathname,
      requestOrigin,
      timestamp,
      services: ladderServices,
    })) {
      return;
    }

    if (await handlePlayerRoute({
      req,
      res,
      method,
      pathname,
      requestUrl,
      authClaims,
      requestOrigin,
      timestamp,
      avatarUrlResolver,
      services: playerServices,
    })) {
      return;
    }

    if (await handleNotificationRoute({
      req,
      res,
      method,
      pathname,
      authClaims,
      requestOrigin,
      timestamp,
      services: notificationServices,
    })) {
      return;
    }

    if (method === "GET" && pathname === "/activity") {
      const items = await listActivityItems();
      writeJson(res, 200, { items }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/activity") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const submitted = body.value && typeof body.value === "object" ? body.value : {};
      // Force the server-verified actor so a client can't post activity as someone else.
      const item = await saveActivityItem({ ...submitted, actorPlayerId: authClaims.playerId });
      writeJson(res, 200, { item }, requestOrigin);
      return;
    }

    // Friend request routes (auth required)
    if (method === "POST" && pathname === "/friend-requests") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }
      const { toPlayerId, fromDisplayName } = body.value || {};
      const fromPlayerId = authClaims.playerId;
      if (!toPlayerId || toPlayerId === fromPlayerId) {
        writeJson(res, 400, { status: "error", error: "invalid_target", timestamp }, requestOrigin);
        return;
      }
      // create request first so we have the ID for the notification payload
      const request = await createFriendRequest({
        fromPlayerId,
        toPlayerId,
        fromDisplayName: String(fromDisplayName || ""),
      });
      if (!request) {
        writeJson(res, 409, { status: "error", error: "request_already_pending", timestamp }, requestOrigin);
        return;
      }
      void createNotification({
        recipientPlayerId: toPlayerId,
        actorPlayerId: fromPlayerId,
        actorDisplayName: String(fromDisplayName || ""),
        type: "friend_request",
        payload: { requestId: request.id },
      });
      writeJson(res, 201, { request }, requestOrigin);
      return;
    }

    if (method === "POST" && friendRequestActionMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const requestId = decodeURIComponent(friendRequestActionMatch[1]);
      const action = friendRequestActionMatch[2];
      const friendRequest = await getFriendRequest(requestId);
      if (!friendRequest) {
        writeJson(res, 404, { status: "error", error: "request_not_found", timestamp }, requestOrigin);
        return;
      }
      if (friendRequest.toPlayerId !== authClaims.playerId) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }
      if (action === "accept") {
        const acceptBody: any = await readJsonBody(req).catch(() => ({ ok: false }));
        const acceptorDisplayName = String(acceptBody?.value?.acceptorDisplayName || "");
        const accepted = await acceptFriendRequest(requestId);
        if (!accepted) {
          writeJson(res, 409, { status: "error", error: "request_not_pending", timestamp }, requestOrigin);
          return;
        }
        // create actual friendship — awaited so failures surface rather than being silently swallowed
        try {
          await createFriendshipBetweenPlayers(accepted.fromPlayerId, accepted.toPlayerId, {});
        } catch (err) {
          process.stderr.write(`[accept-friend-request] createFriendshipBetweenPlayers failed: ${(err as any)?.message || err}\n`);
        }
        // notify the sender — prefer name from body, then profile lookup, then generic fallback
        const resolvedAcceptorName = acceptorDisplayName
          || (await loadPlayerProfile(accepted.toPlayerId).catch(() => null))?.profileName
          || "A player";
        void createNotification({
          recipientPlayerId: accepted.fromPlayerId,
          actorPlayerId: accepted.toPlayerId,
          actorDisplayName: resolvedAcceptorName,
          type: "friend_accept",
          payload: { requestId },
        });
        writeJson(res, 200, { ok: true, request: accepted }, requestOrigin);
      } else {
        const rejected = await rejectFriendRequest(requestId);
        if (!rejected) {
          writeJson(res, 409, { status: "error", error: "request_not_pending", timestamp }, requestOrigin);
          return;
        }
        writeJson(res, 200, { ok: true, request: rejected }, requestOrigin);
      }
      return;
    }

    // Challenge routes (auth required)
    const VALID_GAME_SLUGS = new Set(["lovers-lost", "battleshits"]);
    if (method === "POST" && pathname === "/challenges") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }
      const { toPlayerId, gameSlug, gameTitle, fromDisplayName } = body.value || {};
      const fromPlayerId = authClaims.playerId;
      if (!toPlayerId || toPlayerId === fromPlayerId) {
        writeJson(res, 400, { status: "error", error: "invalid_target", timestamp }, requestOrigin);
        return;
      }
      if (!gameSlug || !VALID_GAME_SLUGS.has(gameSlug)) {
        writeJson(res, 400, { status: "error", error: "invalid_game", timestamp }, requestOrigin);
        return;
      }
      const actorProfile = await loadPlayerProfile(fromPlayerId).catch(() => null);
      const actorDisplayName = actorProfile?.profileName || String(fromDisplayName || "");
      const challenge = await createChallenge({
        fromPlayerId,
        toPlayerId,
        fromDisplayName: actorDisplayName,
        gameSlug,
        gameTitle: String(gameTitle || gameSlug),
      });
      if (!challenge) {
        writeJson(res, 500, { status: "error", error: "create_failed", timestamp }, requestOrigin);
        return;
      }
      void createNotification({
        recipientPlayerId: toPlayerId,
        actorPlayerId: fromPlayerId,
        actorDisplayName,
        type: "player_challenge",
        payload: { challengeId: challenge.id, gameSlug, gameTitle: String(gameTitle || gameSlug) },
      });
      writeJson(res, 201, { challenge }, requestOrigin);
      return;
    }

    if (method === "POST" && challengeActionMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const challengeId = decodeURIComponent(challengeActionMatch[1]);
      const action = challengeActionMatch[2];
      const challenge = await getChallenge(challengeId);
      if (!challenge) {
        writeJson(res, 404, { status: "error", error: "challenge_not_found", timestamp }, requestOrigin);
        return;
      }
      if (challenge.toPlayerId !== authClaims.playerId) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }
      if (action === "accept") {
        const accepted = await acceptChallenge(challengeId);
        if (!accepted) {
          writeJson(res, 409, { status: "error", error: "challenge_not_pending", timestamp }, requestOrigin);
          return;
        }
        const acceptorProfile = await loadPlayerProfile(authClaims.playerId).catch(() => null);
        const acceptorName = acceptorProfile?.profileName || "A player";
        void createNotification({
          recipientPlayerId: accepted.fromPlayerId,
          actorPlayerId: authClaims.playerId,
          actorDisplayName: acceptorName,
          type: "challenge_accepted",
          payload: { challengeId, gameSlug: accepted.gameSlug, gameTitle: accepted.gameTitle },
        });
        writeJson(res, 200, { ok: true, challenge: accepted }, requestOrigin);
      } else {
        const declined = await declineChallenge(challengeId);
        if (!declined) {
          writeJson(res, 409, { status: "error", error: "challenge_not_pending", timestamp }, requestOrigin);
          return;
        }
        const declinerProfile = await loadPlayerProfile(authClaims.playerId).catch(() => null);
        const declinerName = declinerProfile?.profileName || "A player";
        void createNotification({
          recipientPlayerId: declined.fromPlayerId,
          actorPlayerId: authClaims.playerId,
          actorDisplayName: declinerName,
          type: "challenge_declined",
          payload: { challengeId, gameSlug: declined.gameSlug, gameTitle: declined.gameTitle },
        });
        writeJson(res, 200, { ok: true, challenge: declined }, requestOrigin);
      }
      return;
    }

    // Gesture routes (auth required)
    if (method === "POST" && playerGestureMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const toPlayerId = decodeURIComponent(playerGestureMatch[1]);
      const actorPlayerId = authClaims.playerId;
      if (toPlayerId === actorPlayerId) {
        writeJson(res, 400, { status: "error", error: "invalid_target", timestamp }, requestOrigin);
        return;
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }
      const gestureType = String(body.value?.gestureType || "").toLowerCase();
      if (!VALID_GESTURE_TYPES.has(gestureType)) {
        writeJson(res, 400, { status: "error", error: "invalid_gesture_type", timestamp }, requestOrigin);
        return;
      }
      const actorProfile = await loadPlayerProfile(actorPlayerId).catch(() => null);
      const actorDisplayName = actorProfile?.profileName || String(body.value?.fromDisplayName || "");
      void createNotification({
        recipientPlayerId: toPlayerId,
        actorPlayerId,
        actorDisplayName,
        type: "player_gesture",
        payload: { gestureType },
      });
      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

      writeJson(res, 404, {
        status: "error",
        service: "platform-api",
        error: "not_found",
        timestamp,
      }, requestOrigin);
    } catch (error) {
      process.stderr.write(`[platform-api] unhandled request error: ${(error as any)?.stack || (error as any)?.message || error}\n`);
      writeJson(res, 500, {
        status: "error",
        service: "platform-api",
        error: "internal_error",
        timestamp,
      }, requestOrigin);
    }
  };
}
