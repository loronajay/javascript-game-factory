// Ranked standing nameplate rendering, split out of rankedProfile.js. The standing
// section builds an empty nameplate; this module fills its avatar/name/tagline nodes
// from the current identity, so both the initial render and later live edits (after the
// player saves a new tagline/avatar) reuse the exact same fill path.

import { el } from "./domHelpers.js";
import { createPortrait, hasPortrait } from "./portraits.js";
import { createRankedAvatarIcon, hasRankedAvatar } from "./rankedAvatars.js";

export function renderNameplateAvatar(avatar, { pilot = "", avatarUnit = null, avatarSkin = null } = {}) {
  avatar.replaceChildren();
  if (hasRankedAvatar(avatarUnit)) {
    avatar.appendChild(createRankedAvatarIcon(avatarUnit, { className: "is-profile-avatar" }));
  } else if (avatarUnit && hasPortrait(avatarUnit)) {
    avatar.appendChild(createPortrait(avatarUnit, { variant: "is-profile-avatar", skin: avatarSkin, eager: true }));
  } else {
    avatar.appendChild(el("span", "ranked-profile-avatar-initial", (pilot || "C").slice(0, 1).toUpperCase()));
  }
}

export function syncRankedStandingNameplate(section, { pilot = "", tagline = "", avatarUnit = null, avatarSkin = null } = {}) {
  const name = section?.querySelector?.(".ranked-profile-nameplate-name");
  if (name) name.textContent = pilot || "Commander";
  const taglineNode = section?.querySelector?.(".ranked-profile-nameplate-tagline");
  if (taglineNode) taglineNode.textContent = tagline || "No tagline set";
  const avatar = section?.querySelector?.(".ranked-profile-nameplate-avatar");
  if (avatar) renderNameplateAvatar(avatar, { pilot, avatarUnit, avatarSkin });
}
