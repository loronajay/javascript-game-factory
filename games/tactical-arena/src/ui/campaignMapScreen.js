// The campaign map screen: mission map render/panning, mission detail panel,
// squad building (with locked slots and per-type skins), and the one-time
// campaign reward pickers. Extracted from menuFlow.js; the menu router keeps
// navigation and dispatches this screen's data-action clicks to handleAction.

import { UNIT_TYPES } from "../core/unitCatalog.js";
import { createPortrait } from "./portraits.js";
import { UNIT_TYPE_KEYS } from "./squadModel.js";
import { getNicknamePref } from "./nicknameModel.js";
import { openChoiceModal } from "./choiceModal.js";
import { openSkinPicker } from "./skinPicker.js";
import { openRewardSkinPicker } from "./rewardSkinPicker.js";
import { getSkinPref, normalizeSkinSlug } from "./skinModel.js";
import { escapeHtml } from "./domHelpers.js";
import { MENU_TEAM_COLORS } from "./teamDisplay.js";
import { formatValor, formatValorAmount } from "../progression/marketplace.js";
import {
  HASBEEN_MYSTIC_SKIN_PACK_ID,
  getCampaignUnitRewardChoices,
  getAvailableCampaignSkinRewardChoices,
  isCampaignUnitRewardGranted,
  isCampaignSkinRewardGranted,
  selectCampaignRewardUnit,
  selectCampaignRewardSkin,
} from "../progression/unlocks.js";
import {
  enqueueDraftBattleUnlockAnnouncement,
  enqueueUnitUnlockAnnouncements,
} from "../progression/announcements.js";
import {
  CLOD_MISSION_ID,
  MAX_CAMPAIGN_SQUAD_SIZE,
  MINER_MISSION_ID,
  RONIN_MISSION_ID,
  campaignSquadSize,
  campaignSelectableUnitTypes,
  createCampaignMatchConfig,
  getCampaignMap,
} from "../campaign/campaign.js";
import {
  campaignPendingRewardActionForNode,
  campaignUnitChoiceGroups,
  campaignValorRewardForNode,
  isCampaignMapPanTarget,
  skinRewardLabel,
  unitLabel,
} from "./campaignMenuModel.js";

const CAMPAIGN_PRE_BRIEF_PICK_MISSIONS = new Set([MINER_MISSION_ID, RONIN_MISSION_ID]);
const CAMPAIGN_MAP_ASPECT = 1672 / 941;

// Per-pack framing copy for the one-time campaign skin pick. Falls back to the
// traveler wording for any pack without its own entry.
const CAMPAIGN_REWARD_COPY = {
  [HASBEEN_MYSTIC_SKIN_PACK_ID]: {
    title: "A Little Shopping",
    subtitle: "The Mystic insists on a souvenir from Highmarket. Choose one new look — this choice is final.",
    cancelLabel: "Maybe Later",
  },
};
const DEFAULT_CAMPAIGN_REWARD_COPY = {
  title: "A Traveler's Gift",
  subtitle: "The wandering party shares one costume from their packs. Choose a look — this choice is final.",
  cancelLabel: "Decide Later",
};

function emptyCampaignSquad(size = MAX_CAMPAIGN_SQUAD_SIZE) {
  return new Array(size).fill(null);
}

export function createCampaignMapScreen({
  isActive = () => false,
  onCampaignMissionSelected = null,
  onCampaignMapEntered = null,
  startCampaignMission = () => {},
} = {}) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const campaignScreen = $('[data-screen="campaign"]');
  const campaignMapHost = $("[data-campaign-map]", campaignScreen);
  const campaignDetail = $("[data-campaign-detail]", campaignScreen);
  const campaignSquadHost = $("[data-campaign-squad]", campaignScreen);
  const campaignStars = $("[data-campaign-stars]", campaignScreen);
  const campaignStartBtn = $("[data-action='startCampaignMission']", campaignScreen);

  let selectedCampaignMissionId = CLOD_MISSION_ID;
  let campaignSquad = emptyCampaignSquad();
  let campaignSquadMissionId = null;
  let campaignDynamicLockedSlots = null;
  // Skins are kept keyed by unit TYPE rather than slot index — normalizeCampaignSquad
  // dedupes/reorders types, and a per-unit skin choice should survive that untouched.
  let campaignSquadSkins = {};
  let selectedCampaignNode = null;
  let campaignMapResizeObserver = null;
  enableCampaignMapPanning(campaignMapHost);

  function campaignUnlockedTypes(missionId = selectedCampaignMissionId) {
    return campaignSelectableUnitTypes(UNIT_TYPE_KEYS, globalThis.localStorage, missionId);
  }

  // Resizes the squad slot array to the mission's slot count WITHOUT inferring
  // any pick — choosing a squad is part of the mission puzzle, so an unfilled
  // slot stays null until the player explicitly chooses a unit for it. Switching to a
  // DIFFERENT mission always starts from empty slots too — otherwise a pick made for one
  // mission (e.g. slot 0 = Archer on a 2-slot mission) silently carries over as a
  // pre-filled slot 0 on the next mission selected, masquerading as an auto-pick.
  function normalizeCampaignSquadForProgress(missionId, slotCount = 2, lockedSlots = null) {
    const unlocked = campaignUnlockedTypes();
    const carryForward = missionId === campaignSquadMissionId;
    const next = [];
    for (let i = 0; i < slotCount; i += 1) {
      // A pinned slot (e.g. the Sniper mission's Archer) always deploys its required
      // unit; the rest carry forward the player's last pick when it's still unlocked.
      if (lockedSlots && lockedSlots[i] != null) {
        next.push(lockedSlots[i]);
        continue;
      }
      const type = carryForward ? campaignSquad[i] : null;
      next.push(type && unlocked.includes(type) ? type : null);
    }
    campaignSquad = next;
    campaignSquadMissionId = missionId;
  }

  function renderCampaign() {
    const map = getCampaignMap(globalThis.localStorage);
    const playable = map.nodes.find((node) => node.status === "available" || node.status === "completed");
    if (!map.nodes.some((node) => node.id === selectedCampaignMissionId && node.status !== "locked")) {
      selectedCampaignMissionId = playable?.id ?? CLOD_MISSION_ID;
    }
    const selectedNode = map.nodes.find((node) => node.id === selectedCampaignMissionId) ?? map.nodes[0];
    selectedCampaignNode = selectedNode;
    const dynamicLockedSlots = campaignDynamicLockedSlots?.missionId === selectedCampaignMissionId
      ? campaignDynamicLockedSlots.slots
      : null;
    // A squad-locked mission (e.g. the Witch Doctor's solo Archer gauntlet) always deploys
    // its authored defaultSquad — the puzzle there is using that unit's kit, not picking it.
    if (selectedNode?.squadLocked) {
      campaignSquad = [...(selectedNode.defaultSquad ?? [])];
      campaignSquadMissionId = selectedCampaignMissionId;
    } else {
      normalizeCampaignSquadForProgress(
        selectedCampaignMissionId,
        campaignSquadSize(selectedNode),
        selectedNode?.lockedSlots ?? dynamicLockedSlots,
      );
    }
    campaignStars.textContent = `${map.totalStars} ★`;
    campaignMapHost.replaceChildren();

    // The map is a single draggable image canvas. Mission positions are authored
    // as percentages against the painted map, so tokens sit on its baked node bases.
    const canvas = document.createElement("div");
    canvas.className = "campaign-map-canvas";
    canvas.style.setProperty("--map-cols", String(map.grid?.cols ?? 7));
    canvas.style.setProperty("--map-rows", String(map.grid?.rows ?? 5));

    for (const node of map.nodes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `campaign-node is-${node.status}${node.id === selectedCampaignMissionId ? " is-selected" : ""}`;
      button.style.left = `${node.position.x}%`;
      button.style.top = `${node.position.y}%`;
      button.setAttribute("aria-pressed", node.id === selectedCampaignMissionId ? "true" : "false");
      button.dataset.action = "selectCampaignMission";
      button.dataset.missionId = node.id;
      button.disabled = node.status === "locked";
      const flag = document.createElement("span");
      flag.className = "campaign-node-flag";
      flag.textContent = node.status === "completed" ? "Cleared" : node.status === "coming-soon" ? "Soon" : node.status === "locked" ? "Locked" : "Mission";
      const icon = document.createElement("span");
      icon.className = "campaign-node-icon";
      if (node.displayType) icon.append(createPortrait(node.displayType, { variant: "is-campaign-node", eager: true }));
      else icon.textContent = "?";
      const label = document.createElement("span");
      label.className = "campaign-node-label";
      // Locked stops still name their place on the map (geography stays visible),
      // but keep the specific mission title/portrait hidden until unlocked.
      label.textContent = node.status === "locked" ? (node.locationName ?? "Unknown") : node.title;
      const stars = document.createElement("span");
      stars.className = "campaign-node-stars";
      stars.textContent = node.stars ? "★".repeat(node.stars) : `${node.requiredStars}★`;
      button.append(flag, icon, label, stars);
      canvas.append(button);
    }

    campaignMapHost.append(canvas);
    syncCampaignMapCanvas(campaignMapHost, canvas, selectedNode);
    renderCampaignDetail(selectedNode);
    renderCampaignSquad();
  }

  function sizeCampaignMapCanvas(host, canvas) {
    const hostWidth = host?.clientWidth ?? 0;
    const hostHeight = host?.clientHeight ?? 0;
    if (!hostWidth || !hostHeight) return false;
    const width = Math.max(hostWidth, hostHeight * CAMPAIGN_MAP_ASPECT);
    const height = Math.max(hostHeight, width / CAMPAIGN_MAP_ASPECT);
    canvas.style.width = `${Math.ceil(width)}px`;
    canvas.style.height = `${Math.ceil(height)}px`;
    return true;
  }

  function syncCampaignMapCanvas(host, canvas, selectedNode) {
    campaignMapResizeObserver?.disconnect();
    const sync = () => sizeCampaignMapCanvas(host, canvas);
    requestAnimationFrame(() => {
      if (sync()) scrollNodeIntoView(host, canvas, selectedNode);
    });
    if (typeof ResizeObserver === "function") {
      campaignMapResizeObserver = new ResizeObserver(sync);
      campaignMapResizeObserver.observe(host);
    }
  }

  // Pan the oversized map so the selected stop is roughly centered. Runs after
  // layout settles; a no-op when the screen isn't measured yet.
  function scrollNodeIntoView(host, canvas, node) {
    if (!node) return;
    requestAnimationFrame(() => {
      const cw = canvas.scrollWidth || canvas.offsetWidth;
      const ch = canvas.scrollHeight || canvas.offsetHeight;
      if (!cw || !ch || !host.clientWidth) return;
      host.scrollTo({
        left: (node.position.x / 100) * cw - host.clientWidth / 2,
        top: (node.position.y / 100) * ch - host.clientHeight / 2,
        behavior: "auto",
      });
    });
  }

  function enableCampaignMapPanning(host) {
    if (!host) return;
    let drag = null;
    let suppressClick = false;
    const threshold = 5;

    host.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (!isCampaignMapPanTarget(event.target, host)) return;
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollLeft: host.scrollLeft,
        scrollTop: host.scrollTop,
        moved: false,
      };
      host.setPointerCapture?.(event.pointerId);
    });

    host.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < threshold) return;
      drag.moved = true;
      host.classList.add("is-dragging");
      host.scrollLeft = drag.scrollLeft - dx;
      host.scrollTop = drag.scrollTop - dy;
      event.preventDefault();
    });

    function finishDrag(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      suppressClick = drag.moved;
      drag = null;
      host.classList.remove("is-dragging");
      window.setTimeout(() => { suppressClick = false; }, 120);
    }

    host.addEventListener("pointerup", finishDrag);
    host.addEventListener("pointercancel", finishDrag);
    host.addEventListener("lostpointercapture", finishDrag);
    host.addEventListener("click", (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function renderCampaignDetail(node) {
    const rewardAction = campaignPendingRewardActionForNode(node, globalThis.localStorage);
    campaignDetail.innerHTML =
      `<div class="campaign-detail-copy">` +
      `<div class="campaign-kicker">${escapeHtml(node?.subtitle ?? "Campaign")}</div>` +
      `<h3>${escapeHtml(node?.title ?? "Unknown Mission")}</h3>` +
      `<p>${escapeHtml(node?.description ?? "Earn more stars to reveal this stage.")}</p>` +
      `</div>` +
      `<dl class="campaign-rewards">` +
      `<dt>Requires</dt><dd>${node?.requiredStars ?? 0} ★</dd>` +
      `<dt>Best</dt><dd>${node?.stars ? `${node.stars} / 3 ★` : "No clear"}</dd>` +
      `<dt>Squad</dt><dd>${campaignSquadSize(node)} units</dd>` +
      `<dt>Reward</dt><dd>${escapeHtml((node?.rewardUnits ?? []).map(unitLabel).join(", ") || node?.rewardLabel || "TBD")}</dd>` +
      `<dt>Valor</dt><dd><span class="valor-badge valor-inline" aria-label="${escapeHtml(formatValor(campaignValorRewardForNode(node)))}"><span class="valor-icon" aria-hidden="true"></span><span class="valor-amount">${escapeHtml(formatValorAmount(campaignValorRewardForNode(node)))}</span></span></dd>` +
      `</dl>`;
    if (rewardAction) {
      const claimBtn = document.createElement("button");
      claimBtn.type = "button";
      claimBtn.className = "primary menu-btn campaign-reward-claim";
      claimBtn.dataset.action = "chooseCampaignReward";
      claimBtn.dataset.rewardKind = rewardAction.kind;
      claimBtn.dataset.packId = rewardAction.packId;
      claimBtn.textContent = rewardAction.label;
      campaignDetail.append(claimBtn);
    }
    campaignStartBtn.textContent = node?.status === "completed" ? "Replay Mission" : node?.comingSoon ? "Coming Soon" : "Start Mission";
    campaignStartBtn.dataset.missionId = node?.id ?? "";
    updateCampaignStartAvailability();
  }

  function campaignSquadReady() {
    return campaignSquad.length > 0 && campaignSquad.every((type) => typeof type === "string" && type);
  }

  function updateCampaignStartAvailability() {
    const node = selectedCampaignNode;
    const playable = node && (node.status === "available" || node.status === "completed") && !node.comingSoon;
    campaignStartBtn.disabled = !playable || !campaignSquadReady();
  }

  function renderCampaignSquad() {
    campaignSquadHost.replaceChildren();
    const squadLocked = Boolean(selectedCampaignNode?.squadLocked);
    const dynamicLockedSlots = campaignDynamicLockedSlots?.missionId === selectedCampaignMissionId
      ? campaignDynamicLockedSlots.slots
      : null;
    const lockedSlots = selectedCampaignNode?.lockedSlots ?? dynamicLockedSlots;
    campaignSquad.forEach((type, index) => {
      // A slot is locked either by a whole-squad lock or by a per-slot pin (lockedSlots).
      const locked = squadLocked || Boolean(lockedSlots && lockedSlots[index] != null);
      const wrap = document.createElement("div");
      wrap.className = `campaign-squad-slot${type ? "" : " is-empty"}${locked ? " is-locked" : ""}`;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "campaign-squad-slot-main";
      if (locked) {
        button.disabled = true;
      } else {
        button.dataset.action = "chooseCampaignUnit";
        button.dataset.slot = String(index);
      }
      const copy = document.createElement("span");
      if (type) {
        const def = UNIT_TYPES[type];
        const skin = campaignSkinForType(type);
        button.append(createPortrait(type, { variant: "is-chip", eager: true, skin }));
        copy.innerHTML = locked
          ? `<b>Slot ${index + 1}</b><i>${escapeHtml(def.name)} · Required</i>`
          : `<b>Slot ${index + 1}</b><i>${escapeHtml(def.name)}</i>`;
      } else {
        copy.innerHTML = `<b>Slot ${index + 1}</b><i>Choose a unit…</i>`;
      }
      button.append(copy);
      wrap.append(button);

      // A skin choice pins to a *chosen appearance*, not the slot lock — even a
      // locked slot's required unit can still wear any skin the player has unlocked.
      if (type) {
        const skinBtn = document.createElement("button");
        skinBtn.type = "button";
        skinBtn.className = "campaign-squad-skin-btn";
        skinBtn.dataset.action = "chooseCampaignSkin";
        skinBtn.dataset.type = type;
        skinBtn.setAttribute("aria-label", `Change ${UNIT_TYPES[type]?.name ?? type} skin`);
        skinBtn.textContent = "Skin";
        wrap.append(skinBtn);
      }
      campaignSquadHost.append(wrap);
    });
    updateCampaignStartAvailability();
  }

  async function chooseCampaignSkin(type) {
    if (!type) return;
    const result = await openSkinPicker({ type, initial: campaignSkinForType(type), accent: MENU_TEAM_COLORS[1] });
    if (!result) return;
    campaignSquadSkins = { ...campaignSquadSkins, [type]: result.skin };
    renderCampaignSquad();
  }

  function campaignSkinForType(type) {
    if (!type) return null;
    if (Object.hasOwn(campaignSquadSkins, type)) return normalizeSkinSlug(type, campaignSquadSkins[type]);
    return getSkinPref(type);
  }

  async function chooseCampaignUnit(slot) {
    const unlocked = campaignUnlockedTypes(selectedCampaignMissionId);
    const groups = campaignUnitChoiceGroups(unlocked, campaignSquad, slot);
    const choices = unlocked
      .filter((type) => !campaignSquad.includes(type) || campaignSquad[slot] === type)
      .map((type) => ({
        value: type,
        label: getNicknamePref(type) || UNIT_TYPES[type].name,
        sub: UNIT_TYPES[type].classType,
        type,
      }));
    const picked = await openChoiceModal({
      title: `Choose Slot ${slot + 1}`,
      subtitle: `This mission deploys ${campaignSquad.length} unit${campaignSquad.length === 1 ? "" : "s"}. Pick your approach.`,
      accent: MENU_TEAM_COLORS[1],
      choices,
      groups,
    });
    if (!picked) return null;
    campaignSquad[slot] = picked;
    renderCampaignSquad();
    return picked;
  }

  // A skin-reward mission (The Wandering Party, Has-Been Heroes) pays out by letting the
  // player pick ONE skin from its pack. The grant is final (selectCampaignRewardSkin rejects
  // a second pick), so the pack can't be farmed by replaying the mission. Called by the host
  // after the post-match cutscene resolves. Returns the chosen reward (or null if declined /
  // already granted) so the host can play a closing beat only on a real pick.
  async function openCampaignRewardChoice(packId) {
    if (packId && typeof packId === "object") {
      if (packId.unitPackId) return openCampaignUnitRewardChoice(packId.unitPackId);
      return openCampaignSkinRewardChoice(packId.skinPackId ?? packId.packId);
    }
    return openCampaignSkinRewardChoice(packId);
  }

  async function openCampaignSkinRewardChoice(packId) {
    const choices = getAvailableCampaignSkinRewardChoices(globalThis.localStorage, packId);
    if (!choices?.length || isCampaignSkinRewardGranted(globalThis.localStorage, packId)) return null;
    const copy = CAMPAIGN_REWARD_COPY[packId] ?? DEFAULT_CAMPAIGN_REWARD_COPY;
    const choice = await openRewardSkinPicker({
      title: copy.title,
      subtitle: copy.subtitle,
      accent: MENU_TEAM_COLORS[1],
      cancelLabel: copy.cancelLabel,
      choices: choices.map((reward) => ({
        value: reward,
        label: skinRewardLabel(reward),
        sub: `${unitLabel(reward.type)} costume`,
        type: reward.type,
        slug: reward.slug,
      })),
    });
    if (!choice) return null;
    selectCampaignRewardSkin(globalThis.localStorage, packId, choice);
    if (isActive()) renderCampaign();
    return choice;
  }

  async function openCampaignUnitRewardChoice(packId) {
    const choices = getCampaignUnitRewardChoices(packId);
    if (!choices || isCampaignUnitRewardGranted(globalThis.localStorage, packId)) return null;
    const choice = await openRewardSkinPicker({
      title: "A Brother Joins",
      subtitle: "The brothers are done fighting each other. Choose one mech to recruit; this choice is final.",
      accent: MENU_TEAM_COLORS[1],
      cancelLabel: "Decide Later",
      selectLabel: "Recruit This Unit",
      itemKind: "unit",
      choices: choices.map((type) => ({
        value: type,
        label: unitLabel(type),
        sub: `${UNIT_TYPES[type]?.classType ?? "unit"} unit`,
        type,
        slug: null,
      })),
    });
    if (!choice) return null;
    const result = selectCampaignRewardUnit(globalThis.localStorage, packId, choice);
    if (!result.accepted) return null;
    enqueueUnitUnlockAnnouncements(globalThis.localStorage, [choice]);
    enqueueDraftBattleUnlockAnnouncement(globalThis.localStorage);
    if (isActive()) renderCampaign();
    return choice;
  }

  function selectCampaignMission(actionBtn) {
    const missionId = actionBtn.dataset.missionId || CLOD_MISSION_ID;
    const previousMissionId = selectedCampaignMissionId;
    selectedCampaignMissionId = missionId;
    if (CAMPAIGN_PRE_BRIEF_PICK_MISSIONS.has(missionId) && previousMissionId === missionId) {
      renderCampaign();
      return;
    }
    if (CAMPAIGN_PRE_BRIEF_PICK_MISSIONS.has(missionId) && previousMissionId !== missionId) {
      campaignDynamicLockedSlots = null;
      const map = getCampaignMap(globalThis.localStorage);
      selectedCampaignNode = map.nodes.find((node) => node.id === missionId) ?? null;
      normalizeCampaignSquadForProgress(
        missionId,
        campaignSquadSize(selectedCampaignNode),
        selectedCampaignNode?.lockedSlots ?? null,
      );
      void (async () => {
        if (onCampaignMissionSelected) {
          await onCampaignMissionSelected(missionId, null, { phase: "preChoice" });
        }
        const picked = await chooseCampaignUnit(0);
        if (picked && campaignSquadReady() && onCampaignMissionSelected) {
          campaignDynamicLockedSlots = { missionId, slots: { 0: campaignSquad[0] } };
          await onCampaignMissionSelected(missionId, campaignSquad, { phase: "postChoice" });
        }
      })().finally(() => renderCampaign());
      return;
    }
    campaignDynamicLockedSlots = null;
    // Play the one-time overworld cutscene (if any) BEFORE revealing the mission
    // briefing, then render the detail panel once the dialogue closes.
    if (onCampaignMissionSelected) {
      void Promise.resolve(onCampaignMissionSelected(missionId)).finally(() => renderCampaign());
    } else {
      renderCampaign();
    }
  }

  // The campaign slice of the menu's delegated data-action clicks. Returns true
  // when the action belonged to this screen.
  function handleAction(actionBtn) {
    switch (actionBtn.dataset.action) {
      case "selectCampaignMission":
        selectCampaignMission(actionBtn);
        return true;
      case "chooseCampaignUnit":
        void chooseCampaignUnit(Number(actionBtn.dataset.slot) || 0);
        return true;
      case "chooseCampaignSkin":
        void chooseCampaignSkin(actionBtn.dataset.type);
        return true;
      case "chooseCampaignReward":
        if (actionBtn.dataset.rewardKind === "unit") void openCampaignUnitRewardChoice(actionBtn.dataset.packId);
        else void openCampaignSkinRewardChoice(actionBtn.dataset.packId);
        return true;
      case "startCampaignMission":
        startCampaignMission(createCampaignMatchConfig(
          actionBtn.dataset.missionId || selectedCampaignMissionId,
          campaignSquad,
          campaignSquadSkins,
        ));
        return true;
      default:
        return false;
    }
  }

  // Progress reset: forget every mission-specific squad/skin pick.
  function resetProgressState() {
    campaignSquad = emptyCampaignSquad();
    campaignSquadMissionId = null;
    campaignDynamicLockedSlots = null;
    campaignSquadSkins = {};
  }

  return {
    el: campaignScreen,
    onEnter: () => {
      renderCampaign();
      void onCampaignMapEntered?.({ openCampaignRewardChoice });
    },
    handleAction,
    renderCampaign,
    resetProgressState,
  };
}
