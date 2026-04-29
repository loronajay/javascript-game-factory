import { saveFactoryProfile } from "../platform/identity/factory-profile.mjs";
import {
  createFriendshipBetweenPlayers,
  loadProfileRelationshipsRecord,
  removeFriendBetweenPlayers,
} from "../platform/relationships/relationships.mjs";
import { createNotificationsApiClient } from "../platform/api/notifications-api.mjs";
import { loadThoughtFeed } from "../platform/thoughts/thoughts.mjs";

export function createPlayerHeroActions({
  authSession = null,
  authSessionPlayerId = "",
  storage,
  apiClient,
  getCurrentPageData,
  setCurrentPageData,
  loadCurrentProfile,
  renderCurrent,
  profilePanel = null,
  createNotificationsApiClientImpl = createNotificationsApiClient,
  createFriendshipBetweenPlayersImpl = createFriendshipBetweenPlayers,
  removeFriendBetweenPlayersImpl = removeFriendBetweenPlayers,
  loadProfileRelationshipsRecordImpl = loadProfileRelationshipsRecord,
  saveFactoryProfileImpl = saveFactoryProfile,
  loadThoughtFeedImpl = loadThoughtFeed,
  locationObject = globalThis.location,
} = {}) {
  let challengePickerOpen = false;

  async function renderWithCurrentState(overrides = {}) {
    await Promise.resolve(renderCurrent?.({
      challengePickerOpen,
      ...overrides,
    }));
  }

  async function handleClick(event) {
    const challengePickerToggle = event.target.closest("[data-gesture-challenge]");
    if (challengePickerToggle) {
      if (!authSession?.playerId) return true;
      challengePickerOpen = !challengePickerOpen;
      await renderWithCurrentState();
      return true;
    }

    const challengePickerCancel = event.target.closest("[data-challenge-picker-cancel]");
    if (challengePickerCancel) {
      challengePickerOpen = false;
      await renderWithCurrentState();
      return true;
    }

    const challengeGameBtn = event.target.closest("[data-challenge-game]");
    if (challengeGameBtn) {
      const gameSlug = challengeGameBtn.dataset.challengeGame;
      const gameTitle = challengeGameBtn.dataset.challengeGameTitle || gameSlug;
      const targetPlayerId = challengeGameBtn.dataset.challengeTarget;
      const currentProfile = loadCurrentProfile?.();
      if (!gameSlug || !targetPlayerId || !authSession?.playerId) return true;
      challengeGameBtn.disabled = true;
      const notifApi = createNotificationsApiClientImpl();
      const challenge = await notifApi.sendChallenge(
        targetPlayerId,
        gameSlug,
        gameTitle,
        currentProfile.profileName || "UNNAMED PILOT",
      );
      challengeGameBtn.disabled = false;
      challengePickerOpen = false;
      await renderWithCurrentState({
        gestureFlash: challenge ? `${gameTitle} challenge sent!` : "Could not send challenge — please try again.",
      });
      return true;
    }

    const gestureButton = event.target.closest("[data-gesture]");
    if (gestureButton) {
      const gestureType = gestureButton.dataset.gesture;
      const targetPlayerId = gestureButton.dataset.gestureTarget;
      const currentProfile = loadCurrentProfile?.();
      if (!gestureType || !targetPlayerId || !authSession?.playerId) return true;
      gestureButton.disabled = true;
      const notifApi = createNotificationsApiClientImpl();
      const ok = await notifApi.sendGesture(targetPlayerId, gestureType, currentProfile.profileName || "UNNAMED PILOT");
      gestureButton.disabled = false;
      await renderWithCurrentState({
        gestureFlash: ok ? "Gesture sent!" : "Could not send gesture — please try again.",
      });
      return true;
    }

    const addFriendButton = event.target.closest("[data-add-friend]");
    if (addFriendButton) {
      const targetPlayerId = addFriendButton.dataset.addFriend;
      const currentProfile = loadCurrentProfile?.();
      if (!targetPlayerId || !currentProfile.playerId || currentProfile.playerId === targetPlayerId) {
        return true;
      }

      if (authSession?.playerId) {
        addFriendButton.disabled = true;
        const notifApi = createNotificationsApiClientImpl();
        const requestResult = typeof notifApi.sendFriendRequestDetailed === "function"
          ? await notifApi.sendFriendRequestDetailed(
            targetPlayerId,
            currentProfile.profileName || "UNNAMED PILOT",
          )
          : {
            ok: !!(await notifApi.sendFriendRequest(
              targetPlayerId,
              currentProfile.profileName || "UNNAMED PILOT",
            )),
            error: "",
            request: null,
          };
        const request = requestResult.ok ? requestResult.request : null;
        const requestError = request ? "" : String(requestResult.error || "").trim().toLowerCase();
        globalThis.__JGF_LAST_FRIEND_REQUEST_ERROR__ = requestError;
        addFriendButton.disabled = false;
        profilePanel?.render?.("");
        await renderWithCurrentState({
          relationshipFlash: request ? "Friend request sent." : "Could not send request — please try again.",
        });
        return true;
      }

      const result = await createFriendshipBetweenPlayersImpl(currentProfile.playerId, targetPlayerId, {
        storage,
        apiClient: null,
      });
      const currentPageData = getCurrentPageData?.() || {};
      setCurrentPageData?.({
        ...currentPageData,
        profile: currentPageData.profile,
        thoughtFeed: currentPageData.thoughtFeed || loadThoughtFeedImpl(storage),
        metricsRecord: currentPageData.metricsRecord,
        relationshipsRecord: result.rightRecord,
        viewerRelationshipsRecord: result.leftRecord,
      });
      profilePanel?.render?.("");
      await renderWithCurrentState({
        relationshipFlash: result.awarded ? "Friend linked." : "Already linked as friends.",
      });
      return true;
    }

    const unfriendButton = event.target.closest("[data-unfriend]");
    if (unfriendButton) {
      const targetPlayerId = unfriendButton.dataset.unfriend;
      const currentProfile = loadCurrentProfile?.();
      if (!targetPlayerId || !currentProfile.playerId || currentProfile.playerId === targetPlayerId) {
        return true;
      }

      unfriendButton.disabled = true;
      await removeFriendBetweenPlayersImpl(currentProfile.playerId, targetPlayerId, { storage, apiClient });
      unfriendButton.disabled = false;

      const updatedProfile = loadCurrentProfile?.();
      const cleanedFriendsPreview = (updatedProfile.friendsPreview || []).filter(
        (friend) => friend.playerId !== targetPlayerId,
      );
      const cleanedMainSqueeze = updatedProfile.mainSqueeze?.playerId === targetPlayerId
        ? null
        : (updatedProfile.mainSqueeze || null);
      saveFactoryProfileImpl({
        ...updatedProfile,
        friendsPreview: cleanedFriendsPreview,
        mainSqueeze: cleanedMainSqueeze,
      }, storage);

      const freshViewerRel = loadProfileRelationshipsRecordImpl(currentProfile.playerId, storage);
      const currentPageData = getCurrentPageData?.() || {};
      setCurrentPageData?.({
        ...currentPageData,
        profile: currentPageData.profile,
        thoughtFeed: currentPageData.thoughtFeed || loadThoughtFeedImpl(storage),
        metricsRecord: currentPageData.metricsRecord,
        relationshipsRecord: currentPageData.relationshipsRecord,
        viewerRelationshipsRecord: freshViewerRel,
      });
      profilePanel?.render?.("");
      await renderWithCurrentState({
        relationshipFlash: "Friendship removed.",
      });
      return true;
    }

    const messageButton = event.target.closest("[data-message]");
    if (messageButton) {
      const targetPlayerId = messageButton.dataset.message;
      const targetName = messageButton.dataset.messageName || "";
      if (!targetPlayerId) return true;
      const params = new URLSearchParams({ player: targetPlayerId });
      if (targetName) params.set("name", targetName);
      locationObject.assign(`../messages/conversation/index.html?${params.toString()}`);
      return true;
    }

    return false;
  }

  return {
    handleClick,
    getChallengePickerOpen() {
      return challengePickerOpen;
    },
  };
}
