// The badge picker in the ranked identity editor: choose which earned badge rides on your
// nameplate. Split out of rankedProfileIdentity.js so that file stays the tagline/avatar
// editor and this owns the one field with an async source of options.
//
// Only badges the player has EARNED are offered, and the list comes from the server, not
// from local state — the same read that any other player's profile uses. Equipping is
// re-validated server-side anyway, so this list is a convenience, not the gate.

import { el } from "./domHelpers.js";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { badgeTooltip, createBadgeIcon, findBadgeById, normalizeBadges } from "./playerBadges.js";

const NO_BADGE_ID = "";

/**
 * Render the field into `section`.
 *
 * `state` is the caller-owned identity ({ badgeId, badge, ... }); this updates both on
 * selection and calls `save({ badgeId })` to persist, then `onBadgeChanged()` so the
 * nameplate redraws. `loadBadges` is injected for tests; production omits it and the
 * field reads through `apiClient`.
 */
export function renderBadgePickerField(section, {
  state,
  apiClient,
  playerId = "",
  save,
  onBadgeChanged = () => {},
  loadBadges = null,
} = {}) {
  const field = el("div", "ranked-profile-badgefield");
  field.appendChild(el("label", "ranked-profile-label", "Profile badge"));
  const status = el("p", "ranked-profile-badge-status", "Loading badges…");
  field.append(status);
  section.appendChild(field);

  const read = loadBadges
    || (() => (playerId && typeof apiClient?.fetchGamePlayerBadges === "function"
      ? apiClient.fetchGamePlayerBadges(TACTICAL_ARENA_GAME_SLUG, playerId)
      : Promise.resolve(null)));

  Promise.resolve()
    .then(read)
    .then((res) => {
      const badges = normalizeBadges(res?.badges);
      // An equipped badge that isn't in the earned list would be a server bug; drop it from
      // the UI rather than offering an option that can't be re-selected.
      state.badge = findBadgeById(badges, state.badgeId);
      if (!state.badge) state.badgeId = null;
      if (!badges.length) {
        status.textContent = "No badges yet — earn one on the ranked ladder, in the campaign, or in the shop.";
        return;
      }
      status.remove();
      field.appendChild(buildPicker({ badges, state, save, onBadgeChanged }));
    })
    .catch(() => {
      status.textContent = "Couldn't load your badges. Try reopening this screen.";
      status.dataset.state = "err";
    });

  return field;
}

function buildPicker({ badges, state, save, onBadgeChanged }) {
  const dropdown = el("div", "ranked-profile-badge-dropdown");
  const toggle = el("button", "ranked-profile-badge-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-haspopup", "listbox");
  toggle.setAttribute("aria-expanded", "false");

  const selectedIcon = el("span", "ranked-profile-badge-selected-icon");
  const selectedLabel = el("span", "ranked-profile-badge-selected-label", "");
  toggle.append(selectedIcon, selectedLabel, el("span", "ranked-profile-avatar-caret", "v"));

  const menu = el("div", "ranked-profile-badge-menu");
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Profile badges");
  dropdown.append(toggle, menu);

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };

  const select = (badgeId) => {
    const next = badgeId || null;
    if ((state.badgeId || null) === next) {
      closeMenu();
      return;
    }
    state.badgeId = next;
    state.badge = next ? findBadgeById(badges, next) : null;
    // Persist the id; the server is the one that decides whether it sticks.
    save({ badgeId: next });
    sync();
    onBadgeChanged(state);
    closeMenu();
  };

  const renderSelected = () => {
    selectedIcon.replaceChildren();
    const equipped = state.badgeId ? findBadgeById(badges, state.badgeId) : null;
    if (equipped) {
      const icon = createBadgeIcon(equipped, { variant: "is-menu" });
      if (icon) selectedIcon.appendChild(icon);
      selectedLabel.textContent = equipped.label;
      toggle.title = badgeTooltip(equipped);
    } else {
      selectedLabel.textContent = "No badge";
      toggle.title = "No badge on your nameplate.";
    }
  };

  const renderOption = (badge) => {
    const badgeId = badge?.badgeId || NO_BADGE_ID;
    const selected = (state.badgeId || NO_BADGE_ID) === badgeId;
    const option = el("button", `ranked-profile-badge-option${selected ? " is-selected" : ""}`);
    option.type = "button";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(selected));
    if (badge) {
      const icon = createBadgeIcon(badge, { variant: "is-menu" });
      if (icon) option.appendChild(icon);
      option.append(
        el("span", "ranked-profile-badge-option-text", badge.label),
        el("span", "ranked-profile-badge-option-sub", badge.description || ""),
      );
      option.title = badgeTooltip(badge);
    } else {
      option.append(
        el("span", "ranked-profile-badge-option-none", "—"),
        el("span", "ranked-profile-badge-option-text", "No badge"),
        el("span", "ranked-profile-badge-option-sub", "Leave the nameplate clean"),
      );
    }
    option.addEventListener("click", () => select(badgeId));
    menu.appendChild(option);
  };

  const renderMenu = () => {
    menu.replaceChildren();
    renderOption(null);
    for (const badge of badges) renderOption(badge);
  };

  function sync() {
    renderSelected();
    renderMenu();
  }

  toggle.addEventListener("click", () => {
    const isOpening = menu.hidden;
    menu.hidden = !isOpening;
    toggle.setAttribute("aria-expanded", String(isOpening));
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeMenu();
      toggle.focus();
    }
  });
  sync();
  return dropdown;
}
