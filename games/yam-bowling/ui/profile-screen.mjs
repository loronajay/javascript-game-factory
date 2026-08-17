import { buildProfileModel } from "../profile/profile-model.mjs";
import { $, escapeHtml, showScreen } from "./dom.mjs";
import { playerRewardTreeMarkup } from "./reward-tree.mjs";
import { buildVoucherChoices } from "../profile/voucher-client.mjs";
import { buildEmoteVoucherChoices } from "../profile/emote-voucher-client.mjs";

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
  voucherClient = null,
  emoteCore = null,
  emoteVoucherClient = null,
  audio,
}) {
  let dirty = false;
  let syncing = false;

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
      return `<button class="profile-bowler-option${selected ? " is-selected" : ""}" type="button" data-profile-bowler="${escapeHtml(bowler.slug)}" role="option" aria-selected="${selected}"${syncing ? " disabled" : ""}>
        <img src="${escapeHtml(art)}" alt="" loading="lazy" />
        <span>${escapeHtml(bowler.name)}</span>
      </button>`;
    }).join("");
  }

  function renderSkinOptions(model) {
    $("profile-skin-options").innerHTML = model.ownedSkins.map((skin) => {
      const selected = skin.id === model.featuredBowler.skinId;
      return `<button class="profile-skin-option${selected ? " is-selected" : ""}" type="button" data-profile-skin="${escapeHtml(skin.id)}" role="option" aria-selected="${selected}"${syncing ? " disabled" : ""}>
        <strong>${escapeHtml(skin.name)}</strong><small>${selected ? "Displayed" : "Choose outfit"}</small>
      </button>`;
    }).join("");
  }

  function renderRoomOptions(model) {
    $("profile-room-options").innerHTML = model.ownedRooms.map((room) => {
      const selected = room.slug === model.room.slug;
      return `<button class="profile-room-option${selected ? " is-selected" : ""}" type="button" data-profile-room="${escapeHtml(room.slug)}" role="option" aria-selected="${selected}"${syncing ? " disabled" : ""}>
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
        const disabled = syncing || !option.owned;
        const crestClass = slot.type === "title" || slot.type === "badge" ? ' class="profile-reward-crest"' : "";
        const swatch = option.art
          ? `<img${crestClass} src="${escapeHtml(option.art)}" alt="" loading="lazy" />`
          : `<i class="profile-slot-swatch" style="${paletteStyle(option.palette)}"></i>`;
        return `<button class="profile-slot-option${selected ? " is-selected" : ""}${option.owned ? "" : " is-locked"}"
          type="button" role="option" aria-selected="${selected}" ${disabled ? "disabled" : ""}
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
  }

  function voucherChoices(model) {
    return buildVoucherChoices({
      ownedBowlers: model.ownedBowlers,
      availableSkins: animation.AVAILABLE_SKINS,
      owns: (itemId) => loadout.owns(itemId),
    });
  }

  function renderVoucherPicker(model) {
    const state = voucherClient?.getState?.() || { balance: 0, status: "idle" };
    $("profile-reward-vouchers").textContent = `${state.balance} Skin Voucher${state.balance === 1 ? "" : "s"}`;
    const button = $("profile-voucher-button");
    button.disabled = syncing || state.balance < 1 || state.status === "redeeming" || voucherChoices(model).length === 0;
    $("voucher-choice-grid").innerHTML = voucherChoices(model).map((choice) => {
      const bowler = animation.CANON_BOWLERS.find((entry) => entry.slug === choice.bowlerSlug);
      const art = animation.getPortraitAssetPath(bowler, choice.skinId);
      return `<button class="voucher-choice" type="button" role="listitem" data-voucher-entitlement="${escapeHtml(choice.entitlementId)}"${syncing ? " disabled" : ""}>
        <img src="${escapeHtml(art)}" alt="" loading="lazy" />
        <span><strong>${escapeHtml(choice.bowlerName)}</strong><small>${escapeHtml(choice.skinName)}</small></span>
      </button>`;
    }).join("") || `<p class="voucher-choice-empty">Every voucher skin for your owned bowlers is already unlocked.</p>`;
  }

  function emoteVoucherChoices() {
    return buildEmoteVoucherChoices({
      emotes: emoteCore?.EMOTES || [],
      owns: (itemId) => loadout.owns(itemId),
    });
  }

  function renderEmoteVoucherPicker() {
    const state = emoteVoucherClient?.getState?.() || { balance: 0, status: "idle" };
    $("profile-emote-reward-vouchers").textContent = `${state.balance} Emote Voucher${state.balance === 1 ? "" : "s"}`;
    const button = $("profile-emote-voucher-button");
    button.disabled = syncing || state.balance < 1 || state.status === "redeeming" || emoteVoucherChoices().length === 0;
    $("emote-voucher-choice-grid").innerHTML = emoteVoucherChoices().map((choice) => `
      <button class="voucher-choice" type="button" role="listitem" data-emote-voucher-entitlement="${escapeHtml(choice.entitlementId)}"${syncing ? " disabled" : ""}>
        <img src="${escapeHtml(choice.art)}" alt="" loading="lazy" />
        <span><strong>${escapeHtml(choice.name)}</strong><small>${escapeHtml(choice.description)}</small></span>
      </button>`).join("") || `<p class="voucher-choice-empty">Every voucher emote is already unlocked.</p>`;
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
    renderVoucherPicker(model);
    renderEmoteVoucherPicker();
    renderBowlerOptions(model);
    renderSkinOptions(model);
    renderRoomOptions(model);
    renderPresentationOptions(model);
    renderDecoration(model);
    $("profile-save").disabled = syncing || syncClient.getState().status === "saving";
    return model;
  }

  async function open() {
    showScreen("profile-screen");
    syncing = true;
    setStatus("Syncing with Factory");
    render();
    let synced = false;
    try {
      synced = await syncClient.sync();
    } catch {
      synced = false;
    }
    syncing = false;
    dirty = false;
    render();
    setStatus(synced ? "Factory profile current" : "Showing cached profile", synced ? "saved" : "error");
  }

  function leaveToTitle() {
    showScreen("title-screen");
  }

  function selectBowler(slug) {
    if (syncing) return;
    const current = readModel();
    if (!current.ownedBowlers.some((bowler) => bowler.slug === slug)) return;
    loadout.setFeatured(slug, loadout.getEquippedSkinId(slug));
    dirty = true;
    render();
    setStatus("Unsaved display changes");
  }

  function selectSkin(skinId) {
    if (syncing) return;
    const current = readModel();
    if (!current.ownedSkins.some((skin) => skin.id === skinId)) return;
    loadout.setFeatured(current.featuredBowler.slug, skinId);
    dirty = true;
    render();
    setStatus("Unsaved display changes");
  }

  function selectRoom(slug) {
    if (syncing) return;
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
    if (syncing) return;
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
    if (syncing) return false;
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

  function openVoucherPicker() {
    if (syncing) return;
    const model = render();
    if ((voucherClient?.getState?.().balance || 0) < 1 || voucherChoices(model).length === 0) return;
    $("voucher-status").textContent = "";
    armedVoucherChoice = null;
    $("voucher-dialog").showModal();
  }

  // Spending is irreversible, so a single click must not do it. The first click
  // on a tile arms it and the second confirms; clicking a different tile re-arms
  // rather than spending, and closing the dialog forgets the armed choice. This
  // is the one guard between a mis-click and a voucher the player cannot get
  // back -- the dialog's own copy has always said "cannot be undone".
  let armedVoucherChoice = null;
  let armedEmoteVoucherChoice = null;

  async function redeemVoucher(entitlementId) {
    if (syncing) return false;
    if (armedVoucherChoice !== entitlementId) {
      armedVoucherChoice = entitlementId;
      const choice = voucherChoices(render()).find((entry) => entry.entitlementId === entitlementId);
      $("voucher-status").textContent = choice
        ? `Spend your voucher on ${choice.bowlerName}'s ${choice.skinName}? Choose it again to confirm.`
        : "Choose it again to confirm.";
      return false;
    }
    armedVoucherChoice = null;
    $("voucher-status").textContent = "Redeeming with Factory…";
    render();
    const redeemed = await voucherClient?.redeem?.(entitlementId);
    render();
    $("voucher-status").textContent = redeemed ? "Outfit unlocked." : "Could not redeem that voucher.";
    if (redeemed) {
      audio?.play?.("confirm");
      if ((voucherClient.getState().balance || 0) < 1) $("voucher-dialog").close();
    }
    return Boolean(redeemed);
  }

  function openEmoteVoucherPicker() {
    if (syncing || (emoteVoucherClient?.getState?.().balance || 0) < 1 || emoteVoucherChoices().length === 0) return;
    $("emote-voucher-status").textContent = "";
    armedEmoteVoucherChoice = null;
    $("emote-voucher-dialog").showModal();
  }

  async function redeemEmoteVoucher(entitlementId) {
    if (syncing) return false;
    if (armedEmoteVoucherChoice !== entitlementId) {
      armedEmoteVoucherChoice = entitlementId;
      const choice = emoteVoucherChoices().find((entry) => entry.entitlementId === entitlementId);
      $("emote-voucher-status").textContent = choice
        ? `Spend your voucher on ${choice.name}? Choose it again to confirm.`
        : "Choose it again to confirm.";
      return false;
    }
    armedEmoteVoucherChoice = null;
    $("emote-voucher-status").textContent = "Redeeming with Factory…";
    render();
    const redeemed = await emoteVoucherClient?.redeem?.(entitlementId);
    render();
    $("emote-voucher-status").textContent = redeemed ? "Emote unlocked." : "Could not redeem that voucher.";
    if (redeemed) {
      audio?.play?.("confirm");
      if ((emoteVoucherClient.getState().balance || 0) < 1) $("emote-voucher-dialog").close();
    }
    return Boolean(redeemed);
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
    $("profile-voucher-button").addEventListener("click", openVoucherPicker);
    $("profile-emote-voucher-button").addEventListener("click", openEmoteVoucherPicker);
    $("voucher-close").addEventListener("click", () => {
      armedVoucherChoice = null;
      $("voucher-dialog").close();
    });
    // Escape closes a <dialog> without firing the close button, so the armed
    // choice has to be forgotten here too or it would still be armed on reopen.
    $("voucher-dialog").addEventListener("close", () => { armedVoucherChoice = null; });
    $("voucher-choice-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-voucher-entitlement]");
      if (button) redeemVoucher(button.dataset.voucherEntitlement);
    });
    $("emote-voucher-close").addEventListener("click", () => {
      armedEmoteVoucherChoice = null;
      $("emote-voucher-dialog").close();
    });
    $("emote-voucher-dialog").addEventListener("close", () => { armedEmoteVoucherChoice = null; });
    $("emote-voucher-choice-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-emote-voucher-entitlement]");
      if (button) return redeemEmoteVoucher(button.dataset.emoteVoucherEntitlement);
      return false;
    });
  }

  return { bind, leaveToTitle, open, refresh: render, save };
}
