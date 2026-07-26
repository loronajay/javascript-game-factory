// Ranked standing nameplate rendering, split out of rankedProfile.js. The standing
// section builds an empty nameplate; this module fills its avatar/name/tagline/badge nodes
// from the current identity, so both the initial render and later live edits (after the
// player saves a new tagline/avatar/badge) reuse the exact same fill path.

import { el } from "./domHelpers.js";
import { createPortrait, hasPortrait } from "./portraits.js";
import { createRankedAvatarIcon, hasRankedAvatar } from "./rankedAvatars.js";
import { badgeTooltip, createBadgeIcon } from "./playerBadges.js";

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

/**
 * Fill (or clear) the badge slot on a nameplate.
 *
 * The slot is a node the nameplate always owns, so equipping and unequipping are the same
 * operation and neither reflows the plate — an empty slot collapses to nothing rather than
 * leaving a gap the layout has to account for.
 */
export function renderNameplateBadge(slot, badge) {
  if (!slot) return;
  slot.replaceChildren();
  const icon = createBadgeIcon(badge, { variant: "is-plate", decorative: false });
  slot.hidden = !icon;
  if (!icon) {
    slot.title = "";
    return;
  }
  slot.title = badgeTooltip(badge);
  slot.appendChild(icon);
}

export function syncRankedStandingNameplate(section, { pilot = "", tagline = "", avatarUnit = null, avatarSkin = null, badge = null } = {}) {
  const name = section?.querySelector?.(".ranked-profile-nameplate-name");
  if (name) name.textContent = pilot || "Commander";
  const taglineNode = section?.querySelector?.(".ranked-profile-nameplate-tagline");
  if (taglineNode) taglineNode.textContent = tagline || "No tagline set";
  const avatar = section?.querySelector?.(".ranked-profile-nameplate-avatar");
  if (avatar) renderNameplateAvatar(avatar, { pilot, avatarUnit, avatarSkin });
  renderNameplateBadge(section?.querySelector?.(".ranked-profile-nameplate-badge"), badge);
}
