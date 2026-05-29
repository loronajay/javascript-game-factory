import { saveFactoryProfile } from "../platform/identity/factory-profile.mjs";
import {
  createFriendshipBetweenPlayers,
  loadProfileRelationshipsRecord,
  removeFriendBetweenPlayers,
} from "../platform/relationships/relationships.mjs";
import { createNotificationsApiClient } from "../platform/api/notifications-api.mjs";
import { loadThoughtFeed } from "../platform/thoughts/thoughts.mjs";
import type { PlatformApiClient } from "../platform/api/platform-api.mjs";
import type { StorageLike } from "../platform/storage/storage.mjs";

interface PlayerHeroActionsOptions {
  authSession?: any;
  authSessionPlayerId?: string;
  storage?: StorageLike | null;
  apiClient?: PlatformApiClient;
  getCurrentPageData?: () => any;
  setCurrentPageData?: (value: any) => void;
  loadCurrentProfile?: () => any;
  renderCurrent?: (overrides?: any) => unknown;
  profilePanel?: { render?: (arg: string) => void } | null;
  createNotificationsApiClientImpl?: typeof createNotificationsApiClient;
  createFriendshipBetweenPlayersImpl?: typeof createFriendshipBetweenPlayers;
  removeFriendBetweenPlayersImpl?: typeof removeFriendBetweenPlayers;
  loadProfileRelationshipsRecordImpl?: typeof loadProfileRelationshipsRecord;
  saveFactoryProfileImpl?: typeof saveFactoryProfile;
  loadThoughtFeedImpl?: typeof loadThoughtFeed;
  locationObject?: Pick<Location, "assign">;
}

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
}: PlayerHeroActionsOptions = {}) {
  let challengePickerOpen = false;

  async function renderWithCurrentState(overrides: any = {}) {
    await Promise.resolve(renderCurrent?.({
      challengePickerOpen,
      ...overrides,
    }));
  }

  async function handleClick(event: Event): Promise<boolean> {
    const target = event.target as Element | null;

    const challengePickerToggle = target?.closest<HTMLElement>("[data-gesture-challenge]");
    if (challengePickerToggle) {
      if (!authSession?.playerId) return true;
      challengePickerOpen = !challengePickerOpen;
      await renderWithCurrentState();
      return true;
    }

    const challengePickerCancel = target?.closest<HTMLElement>("[data-challenge-picker-cancel]");
    if (challengePickerCancel) {
      challengePickerOpen = false;
      await renderWithCurrentState();
      return true;
    }

    const challengeGameBtn = target?.closest<HTMLButtonElement>("[data-challenge-game]");
    if (challengeGameBtn) {
      const gameSlug = challengeGameBtn.dataset.challengeGame;
      const gameTitle = challengeGameBtn.dataset.challengeGameTitle || gameSlug;
      const targetPlayerId = challengeGameBtn.dataset.challengeTarget;
      const currentProfile = loadCurrentProfile?.();
      if (!gameSlug || !targetPlayerId || !authSession?.playerId) return true;
      challengeGameBtn.disabled = true;
      let challenge = false;
      try {
        const notifApi = createNotificationsApiClientImpl();
        challenge = !!(await notifApi.sendChallenge(
          targetPlayerId,
          gameSlug,
          gameTitle || gameSlug,
          currentProfile.profileName || "UNNAMED PILOT",
        ));
      } catch (_error) {
        challenge = false;
      }
      challengePickerOpen = false;
      await renderWithCurrentState({
        gestureFlash: challenge ? `${gameTitle} challenge sent!` : "Could not send challenge — please try again.",
      });
      return true;
    }

    const gestureButton = target?.closest<HTMLButtonElement>("[data-gesture]");
    if (gestureButton) {
      const gestureType = gestureButton.dataset.gesture;
      const targetPlayerId = gestureButton.dataset.gestureTarget;
      const currentProfile = loadCurrentProfile?.();
      if (!gestureType || !targetPlayerId || !authSession?.playerId) return true;
      gestureButton.disabled = true;
      let ok = false;
      try {
        const notifApi = createNotificationsApiClientImpl();
        ok = !!(await notifApi.sendGesture(targetPlayerId, gestureType, currentProfile.profileName || "UNNAMED PILOT"));
      } catch (_error) {
        ok = false;
      }
      await renderWithCurrentState({
        gestureFlash: ok ? "Gesture sent!" : "Could not send gesture — please try again.",
      });
      return true;
    }

    const addFriendButton = target?.closest<HTMLButtonElement>("[data-add-friend]");
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

    const unfriendButton = target?.closest<HTMLButtonElement>("[data-unfriend]");
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
        (friend: any) => friend.playerId !== targetPlayerId,
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

    const messageButton = target?.closest<HTMLElement>("[data-message]");
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
