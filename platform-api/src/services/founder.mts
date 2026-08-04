// The founder friendship — every new account starts with one friend already there.
//
// Named for the pattern it copies: a brand new profile with an empty friends rail reads as
// a dead platform, so the account behind FOUNDER_EMAIL is added as a friend at sign-up.
//
// Two properties matter more than the feature itself:
//
//   * It is OPT-IN by configuration. With FOUNDER_EMAIL unset nothing happens at all. The
//     platform must not silently wire every new player to whoever happens to be first in
//     ADMIN_EMAILS — being an operator and being the face of the arcade are different jobs.
//   * It is BEST-EFFORT. A missing founder account, a database hiccup, anything — the
//     registration still succeeds. Someone who just handed over an email and a password
//     must end up with an account; a cosmetic friendship is not worth failing that over.
//
// The friendship itself goes through createFriendshipBetweenPlayers, so it is a real,
// symmetric, ledgered friendship (+100 friend points both ways, synced friends columns and
// metrics) rather than a special-cased row only this feature understands.

export interface FounderLinkResult {
  linked: boolean;
  reason?: string;
  founderPlayerId?: string;
}

export async function resolveFounderPlayerId({ founderEmail, findAccountByEmail }: any = {}): Promise<string> {
  const email = typeof founderEmail === "string" ? founderEmail.trim() : "";
  if (!email || typeof findAccountByEmail !== "function") return "";

  try {
    const account = await findAccountByEmail(email);
    return String(account?.player_id || "");
  } catch {
    return "";
  }
}

export async function linkNewAccountToFounder({
  playerId,
  founderEmail,
  findAccountByEmail,
  createFriendship,
}: any = {}): Promise<FounderLinkResult> {
  const newPlayerId = typeof playerId === "string" ? playerId.trim() : "";
  if (!newPlayerId) return { linked: false, reason: "invalid_player" };
  if (!founderEmail) return { linked: false, reason: "not_configured" };
  if (typeof createFriendship !== "function") return { linked: false, reason: "not_configured" };

  const founderPlayerId = await resolveFounderPlayerId({ founderEmail, findAccountByEmail });
  if (!founderPlayerId) return { linked: false, reason: "founder_not_found" };
  // The founder registering their own account would otherwise befriend themselves.
  if (founderPlayerId === newPlayerId) return { linked: false, reason: "self" };

  try {
    await createFriendship(newPlayerId, founderPlayerId);
    return { linked: true, founderPlayerId };
  } catch (err) {
    process.stderr.write(`[founder] linkNewAccountToFounder error: ${(err as any)?.message || err}\n`);
    return { linked: false, reason: "server_error", founderPlayerId };
  }
}
