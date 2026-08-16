import { buildProfileModel } from "../profile/profile-model.mjs";
import { $, escapeHtml, showScreen } from "./dom.mjs";

function stat(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

export function createProfileScreen({
  profileName,
  loadout,
  progression,
  animation,
  roomCore,
  syncClient,
  audio,
}) {
  let dirty = false;

  function readModel() {
    return buildProfileModel({ profileName, loadout, progression, animation, roomCore });
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
    renderBowlerOptions(model);
    renderSkinOptions(model);
    renderRoomOptions(model);
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
    $("profile-save").addEventListener("click", () => save());
  }

  return { bind, leaveToTitle, open, refresh: render, save };
}
