import { buildBowlerConfigurationModel, buildProfileModel } from "../profile/profile-model.mjs";
import { $, escapeHtml, showScreen } from "./dom.mjs";
import { playerRewardTreeMarkup } from "./reward-tree.mjs";
import { buildVoucherChoices } from "../profile/voucher-client.mjs";
import { buildEmoteVoucherChoices } from "../profile/emote-voucher-client.mjs";
import { buildCompactIdentityModel } from "../profile/public-profile-model.mjs";
import { buildMatchPresentation } from "../online/match-presentation.mjs";
import { compactIdentityCardMarkup } from "./compact-identity-card.mjs";

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
  let configuredBowlerSlug = null;

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
      return `<article class="profile-bowler-choice${selected ? " is-selected" : ""}">
        <button class="profile-bowler-option" type="button" data-profile-bowler="${escapeHtml(bowler.slug)}" role="option" aria-selected="${selected}"${syncing ? " disabled" : ""}>
          <img src="${escapeHtml(art)}" alt="" loading="lazy" />
          <span>${escapeHtml(bowler.name)}</span>
        </button>
        <button class="profile-bowler-configure" type="button" data-configure-bowler="${escapeHtml(bowler.slug)}"${syncing ? " disabled" : ""}>Customize</button>
      </article>`;
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

  // One renderer serves both clearly separated scopes. The data attributes are
  // different so a delegated click can never equip a bowler item globally (or
  // a room item onto one bowler) by accident.
  function presentationMarkup(slots, { bowler = false } = {}) {
    return slots.map((slot) => {
      const options = slot.options.map((option) => {
        const selected = option.id === slot.equippedId;
        const disabled = syncing || !option.owned;
        const crestClass = slot.type === "title" || slot.type === "badge" ? ' class="profile-reward-crest"' : "";
        const swatch = option.art
          ? `<img${crestClass} src="${escapeHtml(option.art)}" alt="" loading="lazy" />`
          : `<i class="profile-slot-swatch" style="${paletteStyle(option.palette)}"></i>`;
        const status = option.owned
          ? (selected ? (slot.inheritGlobal && !option.id ? "Inheriting" : "Equipped") : "Equip")
          : "Locked";
        const keyAttribute = bowler ? "data-bowler-slot-key" : "data-slot-key";
        const itemAttribute = bowler ? "data-bowler-slot-item" : "data-slot-item";
        return `<button class="profile-slot-option${selected ? " is-selected" : ""}${option.owned ? "" : " is-locked"}"
          type="button" role="option" aria-selected="${selected}" ${disabled ? "disabled" : ""}
          ${keyAttribute}="${escapeHtml(slot.key)}" ${itemAttribute}="${escapeHtml(option.id)}">
          ${swatch}
          <span><strong>${escapeHtml(option.name)}</strong><small>${status}</small></span>
        </button>`;
      }).join("");
      return `<div class="profile-option-group">
        <p>${escapeHtml(slot.label)}</p>
        <div class="profile-slot-options" role="listbox" aria-label="Choose a ${slot.label.toLowerCase()}">${options}</div>
      </div>`;
    }).join("");
  }

  function renderPresentationOptions(model) {
    $("profile-presentation").innerHTML = presentationMarkup(model.playerPresentation);
  }

  function readBowlerModel(slug = configuredBowlerSlug) {
    return buildBowlerConfigurationModel({
      bowlerSlug: slug,
      loadout,
      progression,
      animation,
      cosmetics,
    });
  }

  function renderBowlerConfiguration(profileModel = readModel()) {
    if (!configuredBowlerSlug) return null;
    const model = readBowlerModel();
    $("bowler-config-title").textContent = `Configure ${model.bowler.name}`;
    $("bowler-config-copy").textContent = `These choices apply only when you bowl as ${model.bowler.name}.`;
    $("bowler-config-skins").innerHTML = model.ownedSkins.map((skin) => {
      const selected = skin.id === model.bowler.skinId;
      const art = animation.getPortraitAssetPath(model.bowler, skin.id);
      return `<button class="bowler-config-skin${selected ? " is-selected" : ""}" type="button" data-bowler-skin="${escapeHtml(skin.id)}" aria-selected="${selected}"${syncing ? " disabled" : ""}>
        <img src="${escapeHtml(art)}" alt="" loading="lazy" />
        <span><strong>${escapeHtml(skin.name)}</strong><small>${selected ? "Equipped" : "Equip outfit"}</small></span>
      </button>`;
    }).join("");
    $("bowler-config-presentation").innerHTML = presentationMarkup(model.presentation, { bowler: true });

    const matchPresentation = buildMatchPresentation({ characterSlug: model.bowler.slug, loadout });
    const cardModel = buildCompactIdentityModel({
      profile: {
        profileName: profileModel.profileName,
        player: profileModel.player,
        title: profileModel.title,
        badge: profileModel.badge,
        masteryByBowler: { [model.bowler.slug]: model.mastery },
      },
      matchPlayer: {
        name: profileModel.profileName,
        characterSlug: model.bowler.slug,
        skinId: model.bowler.skinId,
        presentation: matchPresentation,
      },
      animation,
      cosmetics,
    });
    $("bowler-config-card-preview").innerHTML = compactIdentityCardMarkup(cardModel, { local: true });
    $("bowler-config-save").disabled = syncing || syncClient.getState().status === "saving";
    return model;
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
      const slot = model.playerPresentation.find((entry) => entry.key === key);
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

  function setBowlerStatus(message, state = "") {
    const status = $("bowler-config-status");
    status.textContent = message;
    status.dataset.state = state;
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
    if (configuredBowlerSlug) renderBowlerConfiguration(model);
    $("profile-save").disabled = syncing || syncClient.getState().status === "saving";
    $("profile-preview-card").disabled = syncing;
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
    const slot = current.playerPresentation.find((entry) => entry.key === key);
    if (!slot?.options.some((option) => option.id === itemId && option.owned)) return;
    if (!itemId) {
      loadout.clearGlobalSlot(key);
    } else {
      loadout.equipGlobalSlot(key, itemId);
    }
    dirty = true;
    render();
    setStatus("Unsaved display changes");
  }

  function openBowlerConfiguration(slug) {
    if (syncing) return;
    const profileModel = readModel();
    if (!profileModel.ownedBowlers.some((bowler) => bowler.slug === slug)) return;
    configuredBowlerSlug = slug;
    renderBowlerConfiguration(profileModel);
    setBowlerStatus(dirty ? "Unsaved profile changes" : "Changes save with your Factory profile");
    $("bowler-config-dialog").showModal();
  }

  function closeBowlerConfiguration() {
    $("bowler-config-dialog").close();
  }

  function selectBowlerSkin(skinId) {
    if (syncing || !configuredBowlerSlug) return;
    const model = readBowlerModel();
    if (!model.ownedSkins.some((skin) => skin.id === skinId)) return;
    loadout.equipSkin(configuredBowlerSlug, skinId);
    dirty = true;
    render();
    setStatus("Unsaved bowler changes");
    setBowlerStatus("Unsaved bowler changes");
  }

  function selectBowlerPresentation(key, itemId) {
    if (syncing || !configuredBowlerSlug) return;
    const model = readBowlerModel();
    const slot = model.presentation.find((entry) => entry.key === key);
    if (!slot?.options.some((option) => option.id === itemId && option.owned)) return;
    if (!itemId) loadout.clearBowlerSlot(configuredBowlerSlug, key);
    else loadout.equipBowlerSlot(configuredBowlerSlug, key, itemId);
    dirty = true;
    render();
    setStatus("Unsaved bowler changes");
    setBowlerStatus("Unsaved bowler changes");
  }

  async function save() {
    if (syncing) return false;
    if (!dirty) {
      setStatus("Factory profile current", "saved");
      if (configuredBowlerSlug) setBowlerStatus("Factory profile current", "saved");
      return true;
    }
    $("profile-save").disabled = true;
    setStatus("Saving display");
    if (configuredBowlerSlug) setBowlerStatus("Saving bowler configuration");
    const saved = await syncClient.save();
    dirty = !saved;
    render();
    setStatus(saved ? "Saved to Factory" : "Could not save - try again", saved ? "saved" : "error");
    if (configuredBowlerSlug) {
      setBowlerStatus(saved ? "Saved to Factory" : "Could not save - try again", saved ? "saved" : "error");
    }
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
      const configure = event.target.closest("[data-configure-bowler]");
      if (configure) {
        openBowlerConfiguration(configure.dataset.configureBowler);
        return;
      }
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
    $("profile-preview-card").addEventListener("click", () => {
      openBowlerConfiguration(readModel().featuredBowler.slug);
    });
    $("bowler-config-skins").addEventListener("click", (event) => {
      const button = event.target.closest("[data-bowler-skin]");
      if (button) selectBowlerSkin(button.dataset.bowlerSkin);
    });
    $("bowler-config-presentation").addEventListener("click", (event) => {
      const button = event.target.closest("[data-bowler-slot-key]");
      if (button) selectBowlerPresentation(button.dataset.bowlerSlotKey, button.dataset.bowlerSlotItem);
    });
    $("bowler-config-close").addEventListener("click", closeBowlerConfiguration);
    $("bowler-config-dialog").addEventListener("close", () => { configuredBowlerSlug = null; });
    $("bowler-config-save").addEventListener("click", () => save());
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
