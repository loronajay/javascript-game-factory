// Pure lobby profile/identity shaping, split out of onlineFlow.js. The lobby exchanges
// per-client identity payloads (pilot name + optional ranked profile); these helpers own
// the cloning and per-seat shaping of those payloads and the ranked-standing -> ranked
// profile mapping. onlineFlow keeps the closure wrappers that own the actual maps and
// read live ranked state; everything here is a pure function of its arguments.

// Copy of a ranked profile with its own nested badge object, so a stored copy never aliases
// the caller's.
function cloneRankedProfile(rankedProfile) {
  if (!rankedProfile) return null;
  return { ...rankedProfile, badge: rankedProfile.badge ? { ...rankedProfile.badge } : null };
}

// Deep-ish copy of a remote profile so stored/registered copies don't alias the caller's
// object (the nested rankedProfile is cloned too). Returns null for a non-object.
export function cloneRemoteProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  return { ...profile, rankedProfile: cloneRankedProfile(profile.rankedProfile) };
}

// The other seats' profiles for the starting session, seat-stamped and cloned, excluding
// my own seat. Resolves each member first by client id, then by seat as a fallback.
export function shapeSessionProfiles({ membersAtStart, mySeat, profilesByClientId, profilesBySeat }) {
  if (!Array.isArray(membersAtStart)) return [];
  const profiles = [];
  membersAtStart.forEach((clientId, index) => {
    const seat = index + 1;
    if (seat === mySeat) return;
    const profile = profilesByClientId.get(clientId) || profilesBySeat.get(seat);
    if (profile) {
      profiles.push({ ...profile, seat, rankedProfile: cloneRankedProfile(profile.rankedProfile) });
    }
  });
  return profiles;
}

// The ranked profile stamped onto my identity while in ranked mode: the fetched standing
// profile if present, else a title/tagline built from the local ranked-name fallback.
export function resolveRankedIdentity(rankedIdentityProfile, fallbackTagline) {
  return rankedIdentityProfile || (fallbackTagline ? { title: fallbackTagline, tagline: fallbackTagline } : null);
}

// The equipped badge, reduced to what a nameplate draws. Cosmetic like the avatar, so it
// rides the identity payload rather than the hashed state, and like the avatar it is only
// as trustworthy as the client that sent it — the authoritative copy is the one the server
// puts on a profile/card read.
function nameplateBadge(badge) {
  if (!badge || typeof badge !== "object") return null;
  const badgeId = typeof badge.badgeId === "string" ? badge.badgeId.trim() : "";
  if (!badgeId) return null;
  return {
    badgeId,
    label: typeof badge.label === "string" ? badge.label : badgeId,
    description: typeof badge.description === "string" ? badge.description : "",
    art: typeof badge.art === "string" ? badge.art : "",
    icon: typeof badge.icon === "string" ? badge.icon : "",
  };
}

// Map a server ranked standing into the compact ranked profile the lobby/nameplate use.
export function rankedProfileFromStanding(standing) {
  if (!standing || typeof standing !== "object") return null;
  const title = typeof standing.title === "string" ? standing.title.trim() : "";
  const rating = Number(standing.rating);
  return {
    title,
    tagline: title,
    avatarUnit: typeof standing.avatarUnit === "string" ? standing.avatarUnit : null,
    avatarSkin: typeof standing.avatarSkin === "string" ? standing.avatarSkin : null,
    badge: nameplateBadge(standing.badge),
    tier: standing.tier && typeof standing.tier === "object" ? { ...standing.tier } : null,
    rating: Number.isFinite(rating) ? Math.round(rating) : undefined,
    wins: Number(standing.wins) || 0,
    losses: Number(standing.losses) || 0,
    draws: Number(standing.draws) || 0,
  };
}
