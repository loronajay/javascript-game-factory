import { normalizeProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";

interface GestureDef {
  type: string;
  label: string;
}

interface ChallengeableGame {
  slug: string;
  title: string;
}

export interface GestureAction {
  enabled: boolean;
  playerId: string;
  gestures: ReadonlyArray<GestureDef>;
  challengeableGames: ReadonlyArray<ChallengeableGame>;
  challengePickerOpen: boolean;
  flashMessage: string;
}

export interface MessageAction {
  enabled: boolean;
  playerId: string;
  profileName: string;
}

export interface FriendAction {
  enabled: boolean;
  disabled: boolean;
  mode?: string;
  label: string;
  flashMessage: string;
  playerId: string;
}

function sanitizePlayerId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const GESTURE_DEFINITIONS: ReadonlyArray<GestureDef> = Object.freeze([
  { type: "poke", label: "Poke 👈" },
  { type: "hug", label: "Hug 🤗" },
  { type: "kick", label: "Kick 👟" },
  { type: "blowkiss", label: "Blow Kiss 😋" },
  { type: "nudge", label: "Nudge 👇" },
]);

const CHALLENGEABLE_GAMES: ReadonlyArray<ChallengeableGame> = Object.freeze([
  { slug: "lovers-lost", title: "Lovers Lost" },
  { slug: "battleshits", title: "Battleshits" },
]);

function resolveRelationshipFlashMessage(flashMessage: unknown = ""): string {
  if (typeof flashMessage !== "string") return "";
  const normalized = flashMessage.trim();
  const looksLikeGenericFriendRequestError = /^Could not send request\b/i.test(normalized);
  if (!looksLikeGenericFriendRequestError) {
    return normalized;
  }

  switch (String(globalThis.__JGF_LAST_FRIEND_REQUEST_ERROR__ || "").trim().toLowerCase()) {
    case "request_already_pending":
      return "Request sent.";
    case "invalid_target":
      return "You can't send a request to this player.";
    case "not_authenticated":
      return "Sign in to add friends.";
    case "network_error":
      return "Could not reach the friend-request service.";
    default:
      return normalized;
  }
}

export function buildGestureAction(
  viewerPlayerId: unknown,
  targetPlayerId: unknown,
  isOwnerView: unknown,
  authSessionPlayerId: unknown,
  flashMessage: unknown = "",
  challengePickerOpen = false,
): GestureAction {
  const normalizedTargetPlayerId = sanitizePlayerId(targetPlayerId);
  const normalizedAuthPlayerId = sanitizePlayerId(authSessionPlayerId);
  const canRender = !isOwnerView
    && !!normalizedAuthPlayerId
    && !!normalizedTargetPlayerId
    && normalizedAuthPlayerId !== normalizedTargetPlayerId;

  return {
    enabled: canRender,
    playerId: normalizedTargetPlayerId,
    gestures: GESTURE_DEFINITIONS,
    challengeableGames: CHALLENGEABLE_GAMES,
    challengePickerOpen: canRender && !!challengePickerOpen,
    flashMessage: typeof flashMessage === "string" ? flashMessage : "",
  };
}

export function buildMessageAction(
  viewerPlayerId: unknown,
  targetPlayerId: unknown,
  targetProfileName: unknown,
  isOwnerView: unknown,
  authSessionPlayerId: unknown,
): MessageAction {
  const normalizedTargetPlayerId = sanitizePlayerId(targetPlayerId);
  const normalizedAuthPlayerId = sanitizePlayerId(authSessionPlayerId);
  const enabled = !isOwnerView
    && !!normalizedAuthPlayerId
    && !!normalizedTargetPlayerId
    && normalizedAuthPlayerId !== normalizedTargetPlayerId;
  return {
    enabled,
    playerId: normalizedTargetPlayerId,
    profileName: typeof targetProfileName === "string" ? targetProfileName : "",
  };
}

export function buildFriendAction(
  viewerPlayerId: unknown,
  targetPlayerId: unknown,
  viewerRelationshipsRecord: any,
  isOwnerView: unknown,
  flashMessage: unknown = "",
): FriendAction {
  const normalizedViewerPlayerId = sanitizePlayerId(viewerPlayerId);
  const normalizedTargetPlayerId = sanitizePlayerId(targetPlayerId);
  const canRender = !isOwnerView
    && !!normalizedViewerPlayerId
    && !!normalizedTargetPlayerId
    && normalizedViewerPlayerId !== normalizedTargetPlayerId;

  if (!canRender) {
    return {
      enabled: false,
      disabled: true,
      label: "Add Friend",
      flashMessage: "",
      playerId: normalizedTargetPlayerId,
    };
  }

  const normalizedViewerRelationships = viewerRelationshipsRecord?.playerId
    ? normalizeProfileRelationshipsRecord(viewerRelationshipsRecord)
    : normalizeProfileRelationshipsRecord({ playerId: normalizedViewerPlayerId });
  const alreadyFriends = normalizedViewerRelationships.friendPlayerIds.includes(normalizedTargetPlayerId);

  return {
    enabled: true,
    disabled: false,
    mode: alreadyFriends ? "unfriend" : "add-friend",
    label: alreadyFriends ? "Unfriend" : "Add Friend",
    flashMessage: resolveRelationshipFlashMessage(flashMessage),
    playerId: normalizedTargetPlayerId,
  };
}
