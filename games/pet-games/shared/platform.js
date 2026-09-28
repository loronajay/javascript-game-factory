// The Pet Games' seam to the Factory: who is playing, whether they are signed
// in, filing a result (tickets, a cup's trophy) and reading a career.
//
// Every platform module is imported lazily and every failure resolves to a
// harmless answer, so an event still boots and plays when it is served on its
// own, offline, or signed out. Nothing here ever blocks a race.

const PLATFORM = "../../../js/platform";

function load(path) {
  return import(`${PLATFORM}/${path}`).catch(() => null);
}

/** The person as the lobby shows them: their factory profile name and player id. */
export async function loadIdentity() {
  const [profile, match] = await Promise.all([load("identity/factory-profile.mjs"), load("identity/match-identity.mjs")]);
  try {
    const current = profile?.loadFactoryProfile?.();
    const payload = match?.createOnlineIdentityPayload?.(current) ?? match?.createMatchIdentity?.(current);
    if (payload) return { playerId: String(payload.playerId || ""), displayName: String(payload.displayName || payload.effectiveMatchName || "Player").slice(0, 18) };
  } catch {
    /* fall through to a guest */
  }
  return { playerId: "", displayName: "Guest" };
}

/** Whether online play is open to this person, and where to sign in if not. */
export async function loadAccountGate() {
  const gate = await load("api/factory-account-gate.mjs");
  if (!gate) return { signedIn: false, message: "Online play needs the Factory.", signIn: () => {} };
  const state = gate.getOnlineAccountGate(gate.readFactoryAccountSession());
  return {
    signedIn: state.eligible,
    message: state.message || "",
    signIn: () => gate.redirectToFactoryAccountSignIn(),
  };
}

/** A retry-stable result id, minted when play starts. */
export async function newResultId(prefix) {
  const results = await load("api/game-results-api.mjs");
  if (results?.createGameResultId) return results.createGameResultId(prefix);
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0")}`;
}

/**
 * An online result's id: the same for a retry of the same match, different for
 * every match, and derived from the match seed the server chose.
 */
export function onlineResultId(prefix, seed, seatId) {
  let hash = 2166136261;
  for (const character of `${seed}:${seatId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const clean = String(seed).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "match";
  return `${prefix}-${clean}-${hash.toString(16)}`;
}

/** File a finished result. Resolves to the server's answer ({ tickets, grants }) or null. */
export async function fileResult(gameSlug, result) {
  const results = await load("api/game-results-api.mjs");
  if (!results) return null;
  try {
    const reporter = results.createGameResultReporter();
    return reporter.canReport() ? await reporter.report(gameSlug, result) : null;
  } catch {
    return null;
  }
}

/** A player's public career in one event ({ online, cpu, cups }), or null. */
export async function fetchCareer(gameSlug, playerId) {
  if (!playerId) return null;
  const api = await load("api/platform-api.mjs");
  if (!api) return null;
  try {
    const client = api.createPlatformApiClient();
    if (!client.isConfigured) return null;
    return await client.get(`/games/${encodeURIComponent(gameSlug)}/career/${encodeURIComponent(playerId)}`, "career");
  } catch {
    return null;
  }
}

/** A short line for a PvP record: "12 races · 4 wins · 7 podiums". */
export function recordLine(career, noun = "races") {
  const online = career?.online;
  if (!online?.matches) return `No online ${noun} yet`;
  return `${online.matches} ${online.matches === 1 ? noun.replace(/s$/, "") : noun} · ${online.wins} ${online.wins === 1 ? "win" : "wins"} · ${online.podiums} podium${online.podiums === 1 ? "" : "s"}`;
}
