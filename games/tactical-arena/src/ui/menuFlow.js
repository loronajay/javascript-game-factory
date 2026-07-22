// Menu / screen flow — the ROUTER for the title → main menu → setup → match →
// results loop. Each heavyweight screen owns its own module (campaignMapScreen,
// resultsScreen, tutorialMenuScreens, settingsScreen, matchSetupScreens); this
// file keeps screen registration/navigation, match-start tracking (`lastConfig`
// powers the results screen + Rematch identically for every mode), screen music,
// and the delegated click wiring that routes data-action buttons to their owners.
import { ScreenManager } from "./screenManager.js";
import { createOnlineFlow } from "./onlineFlow.js";
import { openShop } from "./shop.js";
import { openInventory } from "./inventory.js";
import { openSkinGallery } from "./skinGallery.js";
import { openNicknameGallery } from "./nicknameGallery.js";
import { openRankedProfile } from "./rankedProfile.js";
import { showPendingProgressionAnnouncements } from "./progressionAnnouncements.js";
import { syncMissingUnitUnlockAnnouncements } from "../progression/announcements.js";
import { shouldSyncHotSeatSetupForSegment } from "./teamDisplay.js";
import { createMatchSetupScreens } from "./matchSetupScreens.js";
import { createCampaignMapScreen } from "./campaignMapScreen.js";
import { createResultsScreen } from "./resultsScreen.js";
import { createTutorialMenuScreens } from "./tutorialMenuScreens.js";
import { createSettingsScreen } from "./settingsScreen.js";
import { createTutorialMatchConfig } from "../tutorials/basics.js";
import { syncRankedAccountFeatureControls } from "./rankedFeatureGate.js";

export function syncScreenMusic(audio, screenName) {
  if (!screenName) return;
  if (screenName === "match") audio.stopMusic();
  else audio.startMusic("menu");
}

export function createMenuFlow({ audio, onStartMatch, onStartCampaignMission, onCampaignMissionSelected, onCampaignMapEntered, openCodex, onLeaveMatch, syncGameProgress = () => {} }) {
  const screens = new ScreenManager();
  const $ = (sel, root = document) => root.querySelector(sel);
  const screenEl = (name) => $(`[data-screen="${name}"]`);

  let lastConfig = null;
  let progressionAnnouncementRunning = false;

  for (const name of ["title", "hsSetup", "spSetup", "tempoMenu", "tempoSpSetup", "results", "tutorialComplete"]) {
    screens.register(name, { el: screenEl(name) });
  }
  screens.register("mainMenu", {
    el: screenEl("mainMenu"),
    onEnter: () => {
      syncRankedAccountFeatureControls(screenEl("mainMenu"));
      showQueuedProgressionAnnouncements({ audit: true });
    },
  });
  // The match screen disposes a live online session when left mid-game.
  screens.register("match", { el: screenEl("match"), onExit: () => onLeaveMatch?.() });

  // Online Versus owns its own relay client; it calls startMatchTracked once the
  // lobby starts and both players' squads are exchanged. Registered with ScreenManager's
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

  function showQueuedProgressionAnnouncements({ audit = false, delay = 0 } = {}) {
    if (progressionAnnouncementRunning) return;
    if (audit) syncMissingUnitUnlockAnnouncements(globalThis.localStorage);
    progressionAnnouncementRunning = true;
    window.setTimeout(() => {
      showPendingProgressionAnnouncements(globalThis.localStorage)
        .finally(() => { progressionAnnouncementRunning = false; });
    }, delay);
  }

  // ── Screen modules ────────────────────────────────────────────────────────
  const matchSetup = createMatchSetupScreens();

  const campaignMap = createCampaignMapScreen({
    isActive: () => screens.active === "campaign",
    onCampaignMissionSelected,
    onCampaignMapEntered,
    startCampaignMission: (config) => { void startCampaignMatchTracked(config); },
    syncGameProgress,
  });
  screens.register("campaign", { el: campaignMap.el, onEnter: campaignMap.onEnter });

  const resultsScreen = createResultsScreen({
    showScreen,
    getLastConfig: () => lastConfig,
    announceProgression: showQueuedProgressionAnnouncements,
  });

  const tutorialScreens = createTutorialMenuScreens({
    showScreen,
    clearLastConfig: () => { lastConfig = null; },
  });
  screens.register("tutorialSelect", { el: tutorialScreens.tutorialSelectEl, onEnter: tutorialScreens.renderTutorialSelect });

  const settings = createSettingsScreen({
    audio,
    syncMusic: () => syncScreenMusic(audio, screens.active),
    refreshUnlockedScreens: () => {
      if (screens.active === "tutorialSelect") tutorialScreens.renderTutorialSelect();
      if (screens.active === "hsSetup") matchSetup.syncHotSeatSetup();
      if (screens.active === "campaign") campaignMap.renderCampaign();
    },
    onProgressReset: () => {
      campaignMap.resetProgressState();
      matchSetup.resetLoadouts();
    },
  });

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
      if (shouldSyncHotSeatSetupForSegment(seg)) matchSetup.syncHotSeatSetup();
      return;
    }

    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn || actionBtn.disabled) return;
    if (campaignMap.handleAction(actionBtn)) return;
    switch (actionBtn.dataset.action) {
      case "rules": openCodex(); break;
      case "shop": openShop(globalThis.localStorage); break;
      case "inventory": openInventory(globalThis.localStorage); break;
      case "skins": openSkinGallery(); break;
      case "nicknames": openNicknameGallery(); break;
      case "rankedProfile": openRankedProfile(); break;
      case "chooseTutorialReward": tutorialScreens.openTutorialRewardChoice({ title: "Juggernaut Unlocked" }); break;
      case "settings": settings.openSettings(); break;
      case "startTutorial": {
        startMatchTracked(createTutorialMatchConfig(actionBtn.dataset.tutorialId || "basics"));
        break;
      }
      case "startHotSeat": { startMatchTracked(matchSetup.gatherHotSeatConfig()); break; }
      case "startSingle": { startMatchTracked(matchSetup.gatherSingleConfig()); break; }
      case "startTempoSingle": { startMatchTracked(matchSetup.gatherTempoSingleConfig()); break; }
      case "rematch": if (lastConfig && lastConfig.mode !== "online") startMatchTracked(lastConfig); break;
      default: break;
    }
  });

  return {
    show: showScreen,
    showResults: resultsScreen.showResults,
    showTutorialComplete: tutorialScreens.showTutorialComplete,
    get active() { return screens.active; }
  };
}
