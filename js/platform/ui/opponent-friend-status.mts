// Shared "is this opponent already my friend?" verdict for online results screens.
//
// Battleshits and Lovers Lost both put the opponent's name on the results screen
// with an Add Friend link beside it. Each used to render that link whenever the
// viewer was signed in, so a player who had already befriended their opponent was
// still invited to add them again. The truth lives in the viewer's own factory
// relationships record (`friendPlayerIds`) — the same list the /player page reads
// to decide between "Add Friend" and "Unfriend" — so this module reads it once and
// hands a cabinet a verdict rather than letting each cabinet grow its own copy of
// the rule. Cabinets keep their own markup; only the decision is shared.

import { normalizeProfileRelationshipsRecord, sanitizePlayerId } from "../relationships/relationships-normalize.mjs";

export interface OpponentFriendStatus {
  /** The viewer holds a real signed-in factory session. */
  signedIn: boolean;
  viewerPlayerId: string;
  opponentPlayerId: string;
  /** The opponent is already on the viewer's factory friends list. */
  alreadyFriends: boolean;
}

export type OpponentFriendActionKind = "none" | "friends" | "add";

export interface OpponentFriendAction {
  kind: OpponentFriendActionKind;
  label: string;
}

interface SessionLike {
  ok?: unknown;
  playerId?: unknown;
}

interface RelationshipsApiClient {
  loadPlayerRelationships?: (playerId: string) => Promise<unknown>;
}

interface AuthApiClient {
  getSession?: () => Promise<unknown>;
}

export function resolveOpponentFriendStatus(options: {
  session?: SessionLike | null;
  viewerRelationships?: unknown;
  opponentPlayerId?: unknown;
} = {}): OpponentFriendStatus {
  const session = options.session && typeof options.session === "object" ? options.session : null;
  const viewerPlayerId = sanitizePlayerId(session?.playerId);
  const opponentPlayerId = sanitizePlayerId(options.opponentPlayerId);
  const signedIn = Boolean(session?.ok) && Boolean(viewerPlayerId);
  if (!signedIn || !opponentPlayerId) {
    return { signedIn, viewerPlayerId, opponentPlayerId, alreadyFriends: false };
  }
  // A relationships record for someone other than the viewer proves nothing about
  // the viewer, so it is treated as no record rather than trusted.
  const source = options.viewerRelationships && typeof options.viewerRelationships === "object"
    ? (options.viewerRelationships as Record<string, unknown>)
    : null;
  const record = sanitizePlayerId(source?.playerId) === viewerPlayerId
    ? normalizeProfileRelationshipsRecord(source)
    : normalizeProfileRelationshipsRecord({ playerId: viewerPlayerId });
  return {
    signedIn,
    viewerPlayerId,
    opponentPlayerId,
    alreadyFriends: record.friendPlayerIds.includes(opponentPlayerId),
  };
}

// What the results screen should put beside the opponent's name. "none" covers a
// signed-out viewer and a player who somehow ended up facing themselves; both
// already had no link and keep having none.
export function describeOpponentFriendAction(status: OpponentFriendStatus): OpponentFriendAction {
  if (!status.signedIn || !status.opponentPlayerId || status.viewerPlayerId === status.opponentPlayerId) {
    return { kind: "none", label: "" };
  }
  if (status.alreadyFriends) return { kind: "friends", label: "Friends ✓" };
  return { kind: "add", label: "Add Friend ›" };
}

// The network half: the session and the viewer's relationships, resolved into the
// same verdict. A failed relationships read degrades to "not friends" so the link
// still appears — offering a friend you already have is the lesser wrong versus
// hiding the link from a player who genuinely wants to add someone.
export async function loadOpponentFriendStatus(options: {
  apiClient?: RelationshipsApiClient | null;
  authClient?: AuthApiClient | null;
  opponentPlayerId?: unknown;
  session?: SessionLike | null;
}): Promise<OpponentFriendStatus> {
  const session = options.session !== undefined
    ? options.session
    : await Promise.resolve(options.authClient?.getSession?.()).catch(() => null) as SessionLike | null;
  const viewerPlayerId = sanitizePlayerId((session as SessionLike | null)?.playerId);
  const canRead = Boolean((session as SessionLike | null)?.ok)
    && Boolean(viewerPlayerId)
    && typeof options.apiClient?.loadPlayerRelationships === "function";
  const viewerRelationships = canRead
    ? await Promise.resolve(options.apiClient!.loadPlayerRelationships!(viewerPlayerId)).catch(() => null)
    : null;
  return resolveOpponentFriendStatus({
    session: session as SessionLike | null,
    viewerRelationships,
    opponentPlayerId: options.opponentPlayerId,
  });
}
