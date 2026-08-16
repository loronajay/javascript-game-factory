import { buildProfileModel } from "../profile/profile-model.mjs";
import { $, escapeHtml, showScreen } from "./dom.mjs";
import { playerRewardTreeMarkup } from "./reward-tree.mjs";

function stat(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

export function createProfileScreen({
  profileName,
  loadout,
  progression,
  animation,
  roomCore,
  cosmetics,
  playerRewards,
  syncClient,
  audio,
}) {
  let dirty = false;

  function readModel() {
    return buildProfileModel({
      profileName,
      loadout,
      progression,
      animation,
      roomCore,
      cosmetics,
      playerRewards,
    });
  }

  function setStatus(message, state = "") {
    const status = $("profile-sync-status");
    status.textContent = message;
    status.dataset.state = state;
  }

  function renderBowlerOptions(model) {
    $("profile-bowler-options").innerHTML = model.ownedBowlers.map((bowler) => {
      const selected = bowler.slug === model.featuredBowler.slug;
      const art = animation.getPortraitAssetPath(bowler, animation.DEFAULT_SKIN_ID);
      return `<button class="profile-bowler-option${selected ? " is-selected" : ""}" type="button" data-profile-bowler="${escapeHtml(bowler.slug)}" role="option" aria-selected="${selected}">
        <img src="${escapeHtml(art)}" alt="" loading="lazy" />
        <span>${escapeHtml(bowler.name)}</span>
      </button>`;
    }).join("");
  }

  function renderSkinOptions(model) {
    $("profile-skin-options").innerHTML = model.ownedSkins.map((skin) => {
      const selected = skin.id === model.featuredBowler.skinId;
      return `<button class="profile-skin-option${selected ? " is-selected" : ""}" type="button" data-profile-skin="${escapeHtml(skin.id)}" role="option" aria-selected="${selected}">
        <strong>${escapeHtml(skin.name)}</strong><small>${selected ? "Displayed" : "Choose outfit"}</small>
      </button>`;
    }).join("");
  }

  function renderRoomOptions(model) {
    $("profile-room-options").innerHTML = model.ownedRooms.map((room) => {
      const selected = room.slug === model.room.slug;
      return `<button class="profile-room-option${selected ? " is-selected" : ""}" type="button" data-profile-room="${escapeHtml(room.slug)}" role="option" aria-selected="${selected}">
        <img src="${escapeHtml(room.src)}" alt="" loading="lazy" />
        <span><strong>${escapeHtml(room.name)}</strong><small>${selected ? "On display" : room.tier || "Owned"}</small></span>
      </button>`;
    }).join("");
  }

  // The presentation slots the loadout owns but nothing else offers: the two
  // effects, the featured bowler's poses and card, and the profile decoration.
  // Locked options stay on screen — a reward nobody can see is a reward nobody
  // plays for — but only an owned one can be clicked.
  function renderPresentationOptions(model) {
    $("profile-presentation").innerHTML = model.presentation.map((slot) => {
      const options = slot.options.map((option) => {
        const selected = option.id === slot.equippedId;
        const crestClass = slot.type === "title" || slot.type === "badge" ? ' class="profile-reward-crest"' : "";
        const swatch = option.art
          ? `<img${crestClass} src="${escapeHtml(option.art)}" alt="" loading="lazy" />`
          : `<i class="profile-slot-swatch" style="${paletteStyle(option.palette)}"></i>`;
        return `<button class="profile-slot-option${selected ? " is-selected" : ""}${option.owned ? "" : " is-locked"}"
          type="button" role="option" aria-selected="${selected}" ${option.owned ? "" : "disabled"}
          data-slot-key="${escapeHtml(slot.key)}" data-slot-item="${escapeHtml(option.id)}">
          ${swatch}
          <span><strong>${escapeHtml(option.name)}</strong><small>${option.owned ? (selected ? "Equipped" : "Equip") : "Locked"}</small></span>
        </button>`;
      }).join("");
      return `<div class="profile-option-group">
        <p>${escapeHtml(slot.label)}</p>
        <div class="profile-slot-options" role="listbox" aria-label="Choose a ${slot.label.toLowerCase()}">${options}</div>
      </div>`;
    }).join("");
  }

  // An effect has no art, so its two colours stand in for a thumbnail.
  function paletteStyle(palette) {
    const [from, to] = Array.isArray(palette) && palette.length ? palette : ["#4a4f5e", "#2a2e3a"];
    return `background: linear-gradient(135deg, ${escapeHtml(from)}, ${escapeHtml(to || from)})`;
  }

  // The decoration slots are the only presentation the room itself draws. An
  // empty slot leaves the composition exactly as it was before frames existed.
  function renderDecoration(model) {
    for (const [key, elementId] of [["profileBackground", "profile-hero-backdrop"], ["profileFrame", "profile-frame-art"]]) {
      const slot = model.presentation.find((entry) => entry.key === key);
      const art = cosmetics?.getItem?.(slot?.equippedId)?.assets?.art || "";
      const element = $(elementId);
      element.hidden = !art;
      if (art) element.src = art;
    }
  }

  // The reward path is derived from the synced player level, so an unsynced
  // device must say so rather than presenting a cached level 1 as earned
  // progress. The ladder itself stays fully visible either way: a reward nobody
  // can see is a reward nobody plays for.
  function renderRewardTrack(model) {
    const track = model.rewardTrack;
    if (!track) return;
    $("profile-reward-tree").innerHTML = playerRewardTreeMarkup(track.nodes);
    $("profile-reward-next").textContent = track.nextReward
      ? `Level ${track.nextReward.level} - ${track.nextReward.label}`
      : "Every launch reward earned";
    const status = $("profile-reward-status");
    status.textContent = track.synced
      ? `Level ${track.currentLevel} - synced with your Factory profile`
      : "Not synced - sign in to see your earned rewards";
    status.dataset.state = track.synced ? "synced" : "stale";
    $("profile-reward-vouchers").textContent = `Skin Vouchers at level ${track.voucherLevels.join(" and ")}`;
  }

  function render() {
    const model = readModel();
    $("profile-name").textContent = model.profileName;
    $("profile-room-art").src = model.room.src;
    $("profile-room-art").alt = model.room.alt;
    $("profile-bowler-art").src = model.featuredBowler.art;
    $("profile-bowler-art").alt = `${model.featuredBowler.name} in her ${model.featuredBowler.skinName} outfit`;
    $("profile-bowler-name").textContent = model.featuredBowler.name;
    $("profile-bowler-skin").textContent = `${model.featuredBowler.skinName} outfit`;
    $("profile-title").textContent = model.title;
    $("profile-badge").textContent = model.badge;
    $("profile-player-level").textContent = model.player.level;
    $("profile-player-xp").textContent = `${model.player.xp.toLocaleString()} XP`;
    $("profile-record").textContent = `${model.career.wins}-${model.career.losses}`;
    $("profile-career-stats").innerHTML = [
      stat("Matches", model.career.matches),
      stat("Win rate", `${model.career.winRate}%`),
      stat("Strikes", model.career.strikes),
      stat("High game", model.career.highGame || "--"),
      stat("Bowlers used", progression.listBowlers().filter((entry) => entry.matches > 0).length),
    ].join("");
    $("profile-mastery-name").textContent = `${model.featuredBowler.name.split(" ")[0]} mastery`;
    $("profile-mastery-level").textContent = model.mastery.level;
    $("profile-mastery-progress").style.width = `${model.mastery.progressPercent}%`;
    $("profile-mastery-xp").textContent = model.mastery.isMaxLevel
      ? `${model.mastery.xp.toLocaleString()} XP - max level`
      : `${model.mastery.xpIntoLevel.toLocaleString()} / ${model.mastery.xpForNextLevel.toLocaleString()} XP to next level`;
    $("profile-bowler-stats").innerHTML = [
      stat("Matches", model.mastery.matches),
      stat("Wins", model.mastery.wins),
      stat("Strikes", model.mastery.strikes),
      stat("High game", model.mastery.highGame || "--"),
    ].join("");
    renderRewardTrack(model);
    renderBowlerOptions(model);
    renderSkinOptions(model);
    renderRoomOptions(model);
    renderPresentationOptions(model);
    renderDecoration(model);
    $("profile-save").disabled = syncClient.getState().status === "saving";
    return model;
  }

  async function open() {
    showScreen("profile-screen");
    setStatus("Syncing with Factory");
    const synced = await syncClient.sync();
    dirty = false;
    render();
    setStatus(synced ? "Factory profile current" : "Showing cached profile", synced ? "saved" : "error");
  }

  function leaveToTitle() {
    showScreen("title-screen");
  }

  function selectBowler(slug) {
    const current = readModel();
    if (!current.ownedBowlers.some((bowler) => bowler.slug === slug)) return;
    loadout.setFeatured(slug, loadout.getEquippedSkinId(slug));
    dirty = true;
    render();
    setStatus("Unsaved display changes");
  }

  function selectSkin(skinId) {
    const current = readModel();
    if (!current.ownedSkins.some((skin) => skin.id === skinId)) return;
    loadout.setFeatured(current.featuredBowler.slug, skinId);
    dirty = true;
    render();
    setStatus("Unsaved display changes");
  }

  function selectRoom(slug) {
    const current = readModel();
    if (!current.ownedRooms.some((room) => room.slug === slug)) return;
    loadout.setRoomSlug(slug);
    dirty = true;
    render();
    setStatus("Unsaved display changes");
  }

  // Equipment has one owner, so this writes through the loadout like every other
  // control here. An option the player does not own is refused rather than
  // trusted from the markup it was clicked in.
  function selectPresentation(key, itemId) {
    const current = readModel();
    const slot = current.presentation.find((entry) => entry.key === key);
    if (!slot?.options.some((option) => option.id === itemId && option.owned)) return;
    if (!itemId) {
      loadout.clearGlobalSlot(key);
    } else if (slot.scope === "bowler") {
      loadout.equipBowlerSlot(current.featuredBowler.slug, key, itemId);
    } else {
      loadout.equipGlobalSlot(key, itemId);
    }
    dirty = true;
    render();
    setStatus("Unsaved display changes");
  }

  async function save() {
    if (!dirty) {
      setStatus("Factory profile current", "saved");
      return true;
    }
    $("profile-save").disabled = true;
    setStatus("Saving display");
    const saved = await syncClient.save();
    dirty = !saved;
    render();
    setStatus(saved ? "Saved to Factory" : "Could not save - try again", saved ? "saved" : "error");
    if (saved) audio?.play?.("confirm");
    return saved;
  }

  function bind() {
    $("profile-bowler-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-profile-bowler]");
      if (button) selectBowler(button.dataset.profileBowler);
    });
    $("profile-skin-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-profile-skin]");
      if (button) selectSkin(button.dataset.profileSkin);
    });
    $("profile-room-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-profile-room]");
      if (button) selectRoom(button.dataset.profileRoom);
    });
    $("profile-presentation").addEventListener("click", (event) => {
      const button = event.target.closest("[data-slot-key]");
      if (button) selectPresentation(button.dataset.slotKey, button.dataset.slotItem);
    });
    $("profile-save").addEventListener("click", () => save());
  }

  return { bind, leaveToTitle, open, refresh: render, save };
}
