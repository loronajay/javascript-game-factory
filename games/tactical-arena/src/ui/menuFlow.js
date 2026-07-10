// Menu / screen flow — owns the title → main menu → hot-seat setup → match →
// results loop and the Settings overlay. Kept out of main.js (which owns the
// match itself) so neither file becomes a mixed-purpose controller. Ported in
// spirit from Mini-Tactics' screen system, trimmed to the modes Tactical Arena
// currently supports (hot-seat 1v1/4-player); the other menu options are present but
// flagged "Soon" until their units/CPU/online land.
import { ScreenManager } from "./screenManager.js";
import { createSquadPicker, DEFAULT_SQUAD } from "./squadPicker.js";
import { createOnlineFlow } from "./onlineFlow.js";
import { THEMES, applyTheme, loadSavedThemeId, saveThemeId } from "./themes.js";
import { openSkinGallery } from "./skinGallery.js";
import { openSkinPicker } from "./skinPicker.js";
import { normalizeSkinSlug } from "./skinModel.js";
import { openChoiceModal } from "./choiceModal.js";
import {
  HASBEEN_MYSTIC_SKIN_PACK_ID,
  getCampaignSkinRewardChoices,
  isCampaignSkinRewardGranted,
  resetUnlockProgress,
  selectCampaignRewardSkin,
  selectTutorialRewardSkin,
} from "../progression/unlocks.js";
import {
  resetProgressionAnnouncements,
  syncMissingUnitUnlockAnnouncements
} from "../progression/announcements.js";
import { showPendingProgressionAnnouncements } from "./progressionAnnouncements.js";
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { createPortrait } from "./portraits.js";
import { UNIT_TYPE_KEYS, groupedUnitTypes, isUnitUnlocked } from "./squadModel.js";
import {
  CLOD_MISSION_ID,
  MAX_CAMPAIGN_SQUAD_SIZE,
  MINER_MISSION_ID,
  WANDERING_PARTY_MISSION_ID,
  campaignSquadSize,
  createCampaignMatchConfig,
  getCampaignMap,
  resetCampaignProgress
} from "../campaign/campaign.js";
import { createTutorialMatchConfig, getNextTutorialId, getTutorialList, readProgress } from "../tutorials/basics.js";

const TEAM_COLOR = { 1: "#5288c6", 2: "#c4463f", 3: "#d8a33f", 4: "#48a86f" };
const CONFETTI_COUNT = 44;

function emptyCampaignSquad(size = MAX_CAMPAIGN_SQUAD_SIZE) {
  return new Array(size).fill(null);
}
const RESET_PROGRESS_IDLE_LABEL = "Reset Progress";
const RESET_PROGRESS_CONFIRM_LABEL = "Confirm Reset";
const RESET_PROGRESS_WARNING = "Press Confirm Reset again to erase tutorials, campaign stars, units, and skins.";
const RESET_PROGRESS_CONFIRM_MS = 6000;

export function campaignUnitChoiceGroups(unlockedTypes = [], squad = [], slot = 0) {
  const pickableTypes = unlockedTypes.filter((type) => !squad.includes(type) || squad[slot] === type);
  return groupedUnitTypes(pickableTypes).map((group) => ({
    id: group.id,
    label: group.label,
    choices: group.types.map((type) => ({
      value: type,
      label: UNIT_TYPES[type].name,
      type,
    })),
  }));
}

export function syncScreenMusic(audio, screenName) {
  if (!screenName) return;
  if (screenName === "match") audio.stopMusic();
  else audio.startMusic("menu");
}

export function createMenuFlow({ audio, onStartMatch, onStartCampaignMission, onCampaignMissionSelected, onCampaignMapEntered, openCodex, onLeaveMatch }) {
  const screens = new ScreenManager();
  const $ = (sel, root = document) => root.querySelector(sel);
  const screenEl = (name) => $(`[data-screen="${name}"]`);

  for (const name of ["title", "hsSetup", "spSetup", "tempoMenu", "tempoSpSetup", "results", "tutorialComplete"]) {
    screens.register(name, { el: screenEl(name) });
  }
  screens.register("mainMenu", {
    el: screenEl("mainMenu"),
    onEnter: () => showQueuedProgressionAnnouncements({ audit: true }),
  });
  // The match screen disposes a live online session when left mid-game.
  screens.register("match", { el: screenEl("match"), onExit: () => onLeaveMatch?.() });

  // Online Versus owns its own relay client; it calls startMatchTracked once the
  // lobby starts and both squads are exchanged. Registered with ScreenManager's
  // onEnter/onExit so connecting/disconnecting is tied to the screen lifecycle.
  const onlineFlow = createOnlineFlow({ onStartMatch: startMatchTracked });
  screens.register("onlineSetup", { el: onlineFlow.el, onEnter: onlineFlow.onEnter, onExit: onlineFlow.onExit });

  // Every match start routes through here so `lastConfig` (used by the results
  // screen + Rematch) tracks hot-seat, single-player, AND online identically.
  function startMatchTracked(config) {
    lastConfig = config;
    audio.stopMusic();
    onStartMatch(config);
  }

  async function startCampaignMatchTracked(config) {
    lastConfig = config;
    audio.stopMusic();
    if (onStartCampaignMission) await onStartCampaignMission(config);
    else onStartMatch(config);
  }

  function showScreen(name, params) {
    screens.show(name, params);
    syncScreenMusic(audio, name);
  }

  // ── Setup screens: board size + custom squads (and difficulty for solo) ───
  // Squads are always custom — both sides build a four-piece squad from the roster
  // pop-up (squadPicker → rosterPicker). These modes are casual, so duplicate units
  // are allowed; draft/ranked will pass allowDuplicates:false later.
  function buildSquadPickers(host, p2Title) {
    host.replaceChildren();
    const p1 = createSquadPicker({ title: "Player 1", initial: DEFAULT_SQUAD, accent: TEAM_COLOR[1], allowDuplicates: true });
    const p2 = createSquadPicker({ title: p2Title, initial: DEFAULT_SQUAD, accent: TEAM_COLOR[2], allowDuplicates: true });
    host.append(p1.el, p2.el);
    return { p1, p2 };
  }

  const hsSetup = screenEl("hsSetup");
  const spSetup = screenEl("spSetup");
  const tempoSpSetup = screenEl("tempoSpSetup");
  const hsSquadHost = $("[data-squad-pickers]", hsSetup);
  const hsPickers = new Map();
  const spPickers = buildSquadPickers($("[data-sp-squad-pickers]", spSetup), "Computer");
  const tempoSpPickers = buildSquadPickers($("[data-tempo-sp-squad-pickers]", tempoSpSetup), "Computer");

  function ensureHotSeatPicker(player) {
    if (!hsPickers.has(player)) {
      hsPickers.set(player, createSquadPicker({
        title: `Player ${player}`,
        initial: DEFAULT_SQUAD,
        accent: TEAM_COLOR[player],
        allowDuplicates: true,
      }));
    }
    return hsPickers.get(player);
  }

  function syncHotSeatSetup() {
    const count = Number(selectedValue(hsSetup, "playerCount", "count")) || 2;
    const formatGroup = $("[data-group='format']", hsSetup);
    if (formatGroup) formatGroup.hidden = count !== 4;
    hsSquadHost.replaceChildren();
    for (let player = 1; player <= count; player += 1) {
      hsSquadHost.append(ensureHotSeatPicker(player).el);
    }
  }
  syncHotSeatSetup();

  function gatherHotSeatConfig() {
    const size = Number(selectedValue(hsSetup, "boardSize", "size")) || 13;
    const playerCount = Number(selectedValue(hsSetup, "playerCount", "count")) || 2;
    const format = playerCount === 4 ? (selectedValue(hsSetup, "format", "format") || "ffa") : "ffa";
    const squads = {};
    const skins = {};
    for (let player = 1; player <= playerCount; player += 1) {
      const picker = ensureHotSeatPicker(player);
      squads[player] = picker.getSquad();
      skins[player] = picker.getSkins();
    }
    return {
      mode: "hotseat",
      size,
      playerCount,
      format,
      teamColors: format === "teams" ? { 1: TEAM_COLOR[1], 2: TEAM_COLOR[2] } : null,
      squads,
      skins,
    };
  }

  function gatherSingleConfig() {
    const size = Number(selectedValue(spSetup, "boardSize", "size")) || 13;
    const difficulty = selectedValue(spSetup, "difficulty", "difficulty") || "normal";
    return {
      mode: "single",
      difficulty,
      size,
      squads: { 1: spPickers.p1.getSquad(), 2: spPickers.p2.getSquad() },
      skins: { 1: spPickers.p1.getSkins(), 2: spPickers.p2.getSkins() }
    };
  }

  function gatherTempoSingleConfig() {
    const size = Number(selectedValue(tempoSpSetup, "boardSize", "size")) || 13;
    const difficulty = selectedValue(tempoSpSetup, "difficulty", "difficulty") || "normal";
    return {
      mode: "tempo-single",
      battleMode: "tempo",
      difficulty,
      size,
      squads: { 1: tempoSpPickers.p1.getSquad(), 2: tempoSpPickers.p2.getSquad() },
      skins: { 1: tempoSpPickers.p1.getSkins(), 2: tempoSpPickers.p2.getSkins() }
    };
  }

  // ── Results ──────────────────────────────────────────────────────────────
  const campaignScreen = screenEl("campaign");
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
  let progressionAnnouncementRunning = false;
  let campaignMapResizeObserver = null;
  enableCampaignMapPanning(campaignMapHost);
  // On entering the campaign map, render it, then hand off to the host so a pending
  // post-mission sequence (The Wandering Party's farewell cutscene + skin reward pick)
  // can run once the player has been routed back onto the map from the results screen.
  screens.register("campaign", {
    el: campaignScreen,
    onEnter: () => {
      renderCampaign();
      void onCampaignMapEntered?.({ openCampaignRewardChoice });
    },
  });

  function showQueuedProgressionAnnouncements({ audit = false, delay = 0 } = {}) {
    if (progressionAnnouncementRunning) return;
    if (audit) syncMissingUnitUnlockAnnouncements(globalThis.localStorage);
    progressionAnnouncementRunning = true;
    window.setTimeout(() => {
      showPendingProgressionAnnouncements(globalThis.localStorage)
        .finally(() => { progressionAnnouncementRunning = false; });
    }, delay);
  }

  function campaignUnlockedTypes() {
    return UNIT_TYPE_KEYS.filter((type) => isUnitUnlocked(type, globalThis.localStorage));
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

  const CAMPAIGN_MAP_ASPECT = 1672 / 941;

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
    const playable = node && (node.status === "available" || node.status === "completed") && !node.comingSoon;
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
      `</dl>`;
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
        const skin = normalizeSkinSlug(type, campaignSquadSkins[type]);
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
    const result = await openSkinPicker({ type, initial: campaignSquadSkins[type] ?? null, accent: TEAM_COLOR[1] });
    if (!result) return;
    campaignSquadSkins = { ...campaignSquadSkins, [type]: result.skin };
    renderCampaignSquad();
  }

  async function chooseCampaignUnit(slot) {
    const groups = campaignUnitChoiceGroups(campaignUnlockedTypes(), campaignSquad, slot);
    const choices = campaignUnlockedTypes()
      .filter((type) => !campaignSquad.includes(type) || campaignSquad[slot] === type)
      .map((type) => ({
        value: type,
        label: UNIT_TYPES[type].name,
        sub: UNIT_TYPES[type].classType,
        type,
      }));
    const picked = await openChoiceModal({
      title: `Choose Slot ${slot + 1}`,
      subtitle: `This mission deploys ${campaignSquad.length} unit${campaignSquad.length === 1 ? "" : "s"}. Pick your approach.`,
      accent: TEAM_COLOR[1],
      choices,
      groups,
    });
    if (!picked) return null;
    campaignSquad[slot] = picked;
    renderCampaignSquad();
    return picked;
  }

  function unitLabel(type) {
    return UNIT_TYPES[type]?.name ?? type;
  }

  const results = screenEl("results");
  const burstEl = $("[data-results='burst']", results);
  let lastConfig = null;

  const rematchBtn = $("[data-action='rematch']", results);
  const campaignMapBtn = $("[data-results='campaign-map']", results);
  const resultsMainMenuBtn = $("[data-nav='mainMenu']", results);

  function showResults(summary) {
    const online = lastConfig?.mode === "online";
    const campaign = summary.campaign ?? null;
    $("[data-results='title']", results).textContent = campaign ? (campaign.victory ? "Mission Complete" : "Mission Failed") : "Victory";
    $("[data-results='winner']", results).textContent = campaign
      ? `${campaign.missionTitle}: ${campaign.stars}/3 stars, grade ${campaign.grade}.`
      : `${summary.winnerLabel ?? `Player ${summary.winner}`} wins.`;
    $("[data-results='winner']", results).style.setProperty("--team", summary.winnerColor ?? TEAM_COLOR[summary.winner]);
    renderReport($("[data-results='report']", results), summary.teams);
    const stats = $("[data-results='stats']", results);
    stats.innerHTML = "";
    addStat(stats, "Mode", online
      ? "Online Versus"
      : lastConfig?.mode === "campaign"
        ? "Campaign"
      : lastConfig?.mode === "tempo-single"
        ? `Tempo Battle Â· ${(lastConfig.difficulty ?? "normal").replace(/^./, (c) => c.toUpperCase())}`
      : lastConfig?.mode === "single"
        ? `Single Player · ${(lastConfig.difficulty ?? "normal").replace(/^./, (c) => c.toUpperCase())}`
        : "Hot Seat");
    if (campaign) {
      addStat(stats, "Stars", `${campaign.stars} / 3`);
      addStat(stats, "Grade", campaign.grade);
      if (campaign.bonusObjectives?.some((objective) => objective.earned)) {
        addStat(stats, "Bonus", campaign.bonusObjectives.filter((objective) => objective.earned).map((objective) => objective.label.replace(/^Bonus:\s*/i, "")).join(", "));
      }
      addStat(stats, "Reward", campaign.newRewardUnits?.length ? campaign.newRewardUnits.map(unitLabel).join(", ") : campaign.victory ? "Already unlocked" : "Win to unlock");
    }
    addStat(stats, "Board", `${summary.size} × ${summary.size}`);
    addStat(stats, "Squad turns", String(summary.turns));
    addStat(stats, "Duration", formatDuration(summary.durationMs));
    addStat(stats, "Ended by", "Squad eliminated");
    // A finished online session can't be locally replayed — Main Menu only.
    syncResultsActions({ rematchBtn, campaignMapBtn }, { online, campaign });
    // Some campaign missions (The Wandering Party) must route the player back through the
    // map so a post-match cutscene + reward pick can run without the player escaping to
    // the menu first. In that case Campaign Map is the only exit off the results screen.
    if (resultsMainMenuBtn) resultsMainMenuBtn.hidden = Boolean(campaign?.forceMapReturn);
    showScreen("results");
    spawnConfetti(burstEl, TEAM_COLOR[summary.winner]);
    if (campaign?.victory) showQueuedProgressionAnnouncements({ delay: 550 });
  }

  const tutorialComplete = screenEl("tutorialComplete");
  const tutorialSelect = screenEl("tutorialSelect");
  const tutorialList = $("[data-tutorial-list]", tutorialSelect);
  screens.register("tutorialSelect", { el: tutorialSelect, onEnter: renderTutorialSelect });

  function renderTutorialSelect() {
    tutorialList.replaceChildren();
    for (const tutorial of getTutorialList()) {
      const item = document.createElement("article");
      item.className = `tutorial-choice is-${tutorial.status}${tutorial.available ? "" : " is-placeholder"}`;
      const statusLabel = tutorial.status === "completed"
        ? "Completed"
        : tutorial.status === "locked"
          ? "Locked"
          : "Unlocked";
      const buttonLabel = tutorial.available
        ? tutorial.completed ? "Replay Tutorial" : "Start Tutorial"
        : tutorial.locked ? "Locked" : "Coming Soon";
      item.innerHTML =
        `<div class="tutorial-choice-copy">` +
        `<div class="tutorial-choice-kicker">${escapeHtml(tutorial.title)}</div>` +
        `<h3>${escapeHtml(tutorial.subtitle)}</h3>` +
        `<p>${escapeHtml(tutorial.description)}</p>` +
        `</div>` +
        `<div class="tutorial-choice-state">` +
        `<span class="tutorial-status">${statusLabel}</span>` +
        `<button type="button" class="menu-btn${tutorial.available ? " primary" : ""}" data-action="startTutorial" data-tutorial-id="${escapeHtml(tutorial.id)}"${tutorial.available ? "" : " disabled"}>${buttonLabel}</button>` +
        `</div>`;
      tutorialList.append(item);
    }
  }

  function showTutorialComplete(summary = {}) {
    lastConfig = null;
    const rewardPending = summary.allTutorialsComplete && !summary.rewardGranted;
    $("[data-tutorial-complete='title']", tutorialComplete).textContent = summary.title || "Tutorial Complete";
    $("[data-tutorial-complete='reward']", tutorialComplete).textContent =
      summary.rewardGranted && summary.selectedRewardSkin
        ? `Reward selected: ${skinRewardLabel(summary.selectedRewardSkin)}.`
        : rewardPending
          ? "Juggernaut unlocked. Choose one starter reward skin to add to your collection."
          : "Tutorial progress saved. Complete every tutorial to unlock Juggernaut and choose one reward skin.";
    const nextBtn = $("[data-tutorial-complete='next']", tutorialComplete);
    const nextTutorialId = getNextTutorialId(globalThis.localStorage, summary.tutorialId ?? null);
    if (nextBtn) {
      nextBtn.dataset.tutorialId = nextTutorialId ?? "";
      nextBtn.disabled = !nextTutorialId;
      nextBtn.textContent = nextTutorialId ? "Next Tutorial" : "Next Tutorial Coming Soon";
    }
    const rewardBtn = $("[data-tutorial-complete='reward-choice']", tutorialComplete);
    if (rewardBtn) rewardBtn.hidden = !rewardPending;
    showScreen("tutorialComplete");
    if (rewardPending) {
      window.setTimeout(async () => {
        await showPendingProgressionAnnouncements(globalThis.localStorage);
        await openTutorialRewardChoice(summary);
      }, 0);
    }
  }

  async function openTutorialRewardChoice(summary = {}) {
    const current = readProgress(globalThis.localStorage);
    if (!current.allTutorialsComplete || current.rewardGranted) return;
    const choice = await openChoiceModal({
      title: "Juggernaut Unlocked",
      subtitle: "Your first tank joins the roster. Choose one skin reward for this fresh playthrough.",
      accent: TEAM_COLOR[1],
      cancelLabel: "Choose Later",
      choices: current.rewardChoices.map((reward) => ({
        value: reward,
        label: skinRewardLabel(reward),
        sub: reward.type === "juggernaut" ? "New Juggernaut skin" : "Starter unit skin",
        type: reward.type,
        skin: reward.slug,
      })),
    });
    if (!choice) return;
    const result = selectTutorialRewardSkin(globalThis.localStorage, choice);
    if (result.accepted) {
      showTutorialComplete({
        ...summary,
        ...result.progress,
        title: "Juggernaut Unlocked",
      });
    }
  }

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

  // A skin-reward mission (The Wandering Party, Has-Been Heroes) pays out by letting the
  // player pick ONE skin from its pack. The grant is final (selectCampaignRewardSkin rejects
  // a second pick), so the pack can't be farmed by replaying the mission. Called by the host
  // after the post-match cutscene resolves. Returns the chosen reward (or null if declined /
  // already granted) so the host can play a closing beat only on a real pick.
  async function openCampaignRewardChoice(packId) {
    const choices = getCampaignSkinRewardChoices(packId);
    if (!choices || isCampaignSkinRewardGranted(globalThis.localStorage, packId)) return null;
    const copy = CAMPAIGN_REWARD_COPY[packId] ?? DEFAULT_CAMPAIGN_REWARD_COPY;
    const choice = await openChoiceModal({
      title: copy.title,
      subtitle: copy.subtitle,
      accent: TEAM_COLOR[1],
      cancelLabel: copy.cancelLabel,
      choices: choices.map((reward) => ({
        value: reward,
        label: skinRewardLabel(reward),
        sub: `${unitLabel(reward.type)} costume`,
        type: reward.type,
        skin: reward.slug,
      })),
    });
    if (!choice) return null;
    selectCampaignRewardSkin(globalThis.localStorage, packId, choice);
    if (screens.active === "campaign") renderCampaign();
    return choice;
  }

  // ── Settings overlay ─────────────────────────────────────────────────────
  const settingsModal = $("#settingsModal");
  const soundToggle = $("#setSoundToggle", settingsModal);
  const sfxRange = $("#setSfxVolume", settingsModal);
  const musicRange = $("#setMusicVolume", settingsModal);
  const themeSelect = $("#setTheme", settingsModal);
  const resetProgressBtn = $("#setResetProgressBtn", settingsModal);
  const progressStatus = $("#setProgressStatus", settingsModal);
  let progressStatusTimer = null;
  const resetProgressConfirmation = createResetProgressConfirmation({
    button: resetProgressBtn,
    status: progressStatus,
    onArm: () => {
      window.clearTimeout(progressStatusTimer);
      progressStatusTimer = null;
    },
    onConfirm: resetLocalProgress,
    timeoutMs: RESET_PROGRESS_CONFIRM_MS,
  });

  // Palette list comes straight from the registry so a new theme in themes.js
  // shows up here with no markup change. Applied live + persisted on change.
  for (const theme of THEMES) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.label;
    themeSelect.append(option);
  }
  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
    saveThemeId(themeSelect.value);
  });

  function openSettings() {
    soundToggle.checked = audio.enabled !== false;
    sfxRange.value = String(Math.round((audio.volume ?? 0.85) * 100));
    musicRange.value = String(Math.round((audio.musicVolume ?? 0.32) * 100));
    themeSelect.value = loadSavedThemeId();
    resetProgressConfirmation.disarm({ clearStatus: true });
    settingsModal.hidden = false;
  }
  function closeSettings() {
    resetProgressConfirmation.disarm({ clearStatus: true });
    settingsModal.hidden = true;
  }

  function resetLocalProgress() {
    resetUnlockProgress(globalThis.localStorage);
    resetCampaignProgress(globalThis.localStorage);
    resetProgressionAnnouncements(globalThis.localStorage);
    campaignSquad = emptyCampaignSquad();
    campaignSquadMissionId = null;
    campaignDynamicLockedSlots = null;
    campaignSquadSkins = {};
    spPickers.p1.setLoadout(DEFAULT_SQUAD);
    spPickers.p2.setLoadout(DEFAULT_SQUAD);
    tempoSpPickers.p1.setLoadout(DEFAULT_SQUAD);
    tempoSpPickers.p2.setLoadout(DEFAULT_SQUAD);
    for (const picker of hsPickers.values()) picker.setLoadout(DEFAULT_SQUAD);
    if (screens.active === "tutorialSelect") renderTutorialSelect();
    if (screens.active === "hsSetup") syncHotSeatSetup();
    if (screens.active === "campaign") renderCampaign();
    if (progressStatus) {
      progressStatus.textContent = "Progress reset. Tutorials, campaign stars, units, and skins are fresh.";
      window.clearTimeout(progressStatusTimer);
      progressStatusTimer = window.setTimeout(() => { progressStatus.textContent = ""; }, 3600);
    }
  }

  soundToggle.addEventListener("change", () => {
    audio.setEnabled(soundToggle.checked);
    syncScreenMusic(audio, screens.active);
  });
  sfxRange.addEventListener("input", () => audio.setVolume(Number(sfxRange.value) / 100));
  musicRange.addEventListener("input", () => audio.setMusicVolume(Number(musicRange.value) / 100));
  $("#setCloseBtn", settingsModal).addEventListener("click", closeSettings);
  resetProgressBtn?.addEventListener("click", resetProgressConfirmation.requestReset);
  settingsModal.addEventListener("click", (event) => { if (event.target === settingsModal) closeSettings(); });

  // ── Global delegated wiring (nav + actions + segmented controls) ──────────
  document.addEventListener("click", (event) => {
    const navBtn = event.target.closest("[data-nav]");
    if (navBtn && !navBtn.disabled) {
      showScreen(navBtn.dataset.nav);
      return;
    }

    const seg = event.target.closest(".seg");
    if (seg && !seg.disabled) {
      for (const sibling of seg.parentElement.querySelectorAll(".seg")) sibling.classList.toggle("is-selected", sibling === seg);
      if (seg.closest('[data-screen="hsSetup"]') && seg.closest('[data-field="playerCount"]')) syncHotSeatSetup();
      return;
    }

    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn || actionBtn.disabled) return;
    switch (actionBtn.dataset.action) {
      case "rules": openCodex(); break;
      case "skins": openSkinGallery(); break;
      case "chooseTutorialReward": openTutorialRewardChoice({ title: "Juggernaut Unlocked" }); break;
      case "settings": openSettings(); break;
      case "selectCampaignMission": {
        const missionId = actionBtn.dataset.missionId || CLOD_MISSION_ID;
        const previousMissionId = selectedCampaignMissionId;
        selectedCampaignMissionId = missionId;
        if (missionId === MINER_MISSION_ID && previousMissionId === missionId) {
          renderCampaign();
          break;
        }
        if (missionId === MINER_MISSION_ID && previousMissionId !== missionId) {
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
          break;
        }
        campaignDynamicLockedSlots = null;
        // Play the one-time overworld cutscene (if any) BEFORE revealing the mission
        // briefing, then render the detail panel once the dialogue closes.
        if (onCampaignMissionSelected) {
          void Promise.resolve(onCampaignMissionSelected(missionId)).finally(() => renderCampaign());
        } else {
          renderCampaign();
        }
        break;
      }
      case "chooseCampaignUnit": {
        void chooseCampaignUnit(Number(actionBtn.dataset.slot) || 0);
        break;
      }
      case "chooseCampaignSkin": {
        void chooseCampaignSkin(actionBtn.dataset.type);
        break;
      }
      case "startCampaignMission": {
        void startCampaignMatchTracked(createCampaignMatchConfig(actionBtn.dataset.missionId || selectedCampaignMissionId, campaignSquad, campaignSquadSkins));
        break;
      }
      case "startTutorial": {
        startMatchTracked(createTutorialMatchConfig(actionBtn.dataset.tutorialId || "basics"));
        break;
      }
      case "startHotSeat": { startMatchTracked(gatherHotSeatConfig()); break; }
      case "startSingle": { startMatchTracked(gatherSingleConfig()); break; }
      case "startTempoSingle": { startMatchTracked(gatherTempoSingleConfig()); break; }
      case "rematch": if (lastConfig && lastConfig.mode !== "online") startMatchTracked(lastConfig); break;
      default: break;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !settingsModal.hidden) closeSettings();
  });

  return {
    show: showScreen,
    showResults,
    showTutorialComplete,
    get active() { return screens.active; }
  };
}

// The selected button's data value within a named segmented control.
function selectedValue(root, field, dataKey) {
  const group = root.querySelector(`[data-field="${field}"]`);
  const selected = group?.querySelector(".seg.is-selected");
  return selected?.dataset[dataKey] ?? null;
}

// Per-player battle report card — winner first (caller sorts). Surviving force as
// an HP bar tinted to the team hue, plus the squad's offensive tally.
function renderReport(host, teams) {
  host.replaceChildren();
  for (const team of teams) {
    const card = document.createElement("div");
    card.className = `report-team${team.isWinner ? " is-winner" : ""}`;
    card.style.setProperty("--team", team.color);
    const pct = team.hpTotal > 0 ? Math.round((team.hpRemaining / team.hpTotal) * 100) : 0;
    card.innerHTML =
      `<div class="report-head"><span class="report-dot"></span>` +
      `<span class="report-name">${escapeHtml(team.label)}</span>` +
      `${team.isWinner ? '<span class="report-badge">Winner</span>' : ""}` +
      `<span class="report-survivors">${team.unitsAlive}/${team.unitsTotal} units</span></div>` +
      `<div class="report-hpbar"><div class="report-hpfill" style="width:${pct}%"></div></div>` +
      `<div class="report-tallies">${tally("Damage", team.damageDealt)}${tally("Kills", team.kills)}${tally("HP left", team.hpRemaining)}</div>`;
    host.append(card);
  }
}

function tally(label, value) {
  return `<span class="report-tally"><b>${value}</b><i>${label}</i></span>`;
}

function addStat(listEl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  listEl.append(dt, dd);
}

export function syncResultsActions({ rematchBtn, campaignMapBtn } = {}, { online = false, campaign = null } = {}) {
  const isCampaign = Boolean(campaign);
  // Campaign rewards and newly opened missions live on the map, so make that the
  // primary post-mission action while still leaving Main Menu available.
  if (rematchBtn) rematchBtn.hidden = online || isCampaign;
  if (campaignMapBtn) campaignMapBtn.hidden = !isCampaign;
}

export function isCampaignMapPanTarget(target, host) {
  if (!target || target === host) return true;
  return !target.closest?.("[data-action='selectCampaignMission']");
}

export function createResetProgressConfirmation({
  button,
  status,
  onArm,
  onConfirm,
  idleLabel = RESET_PROGRESS_IDLE_LABEL,
  confirmLabel = RESET_PROGRESS_CONFIRM_LABEL,
  warningText = RESET_PROGRESS_WARNING,
  timeoutMs = RESET_PROGRESS_CONFIRM_MS,
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  let armed = false;
  let timer = null;

  function clearTimer() {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
  }

  function render() {
    if (button) {
      button.textContent = armed ? confirmLabel : idleLabel;
      button.classList?.toggle("is-confirming", armed);
      button.setAttribute?.("aria-pressed", String(armed));
    }
  }

  function disarm({ clearStatus = false } = {}) {
    clearTimer();
    armed = false;
    render();
    if (clearStatus && status) status.textContent = "";
  }

  function arm() {
    clearTimer();
    armed = true;
    onArm?.();
    render();
    if (status) status.textContent = warningText;
    timer = setTimeoutFn(() => disarm(), timeoutMs);
  }

  function requestReset() {
    if (!armed) {
      arm();
      return false;
    }
    disarm();
    onConfirm?.();
    return true;
  }

  render();
  return { requestReset, disarm, get armed() { return armed; } };
}

function skinRewardLabel(reward) {
  const unit = String(reward?.type ?? "unit")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const skin = String(reward?.slug ?? "skin")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${skin} ${unit}`;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// Celebratory confetti shower tinted to the winner; each chip removes itself and
// the field is cleared first so a rematch loop never stacks. Skipped under reduced motion.
function spawnConfetti(host, winnerColor) {
  host.replaceChildren();
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const palette = [winnerColor, "#e6c065", "#f6edd4"];
  for (let i = 0; i < CONFETTI_COUNT; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = palette[i % palette.length];
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty("--spin", `${(Math.random() - 0.5) * 900}deg`);
    piece.style.setProperty("--dur", `${1.6 + Math.random() * 1.4}s`);
    piece.style.setProperty("--delay", `${Math.random() * 0.5}s`);
    piece.style.setProperty("--size", `${6 + Math.random() * 7}px`);
    host.appendChild(piece);
  }
  window.setTimeout(() => host.replaceChildren(), 4200);
}
