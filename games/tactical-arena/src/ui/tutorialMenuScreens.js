// Tutorial menu surfaces: the tutorial-select list, the tutorial-complete screen,
// and the one-time all-tutorials-complete reward pick. Extracted from menuFlow.js.

import { escapeHtml } from "./domHelpers.js";
import { MENU_TEAM_COLORS } from "./teamDisplay.js";
import { openRewardSkinPicker } from "./rewardSkinPicker.js";
import { showPendingProgressionAnnouncements } from "./progressionAnnouncements.js";
import { selectTutorialRewardSkin } from "../progression/unlocks.js";
import { getNextTutorialId, getTutorialList, readProgress } from "../tutorials/basics.js";
import { skinRewardLabel } from "./campaignMenuModel.js";

export function createTutorialMenuScreens({
  showScreen = () => {},
  clearLastConfig = () => {},
} = {}) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const tutorialComplete = $('[data-screen="tutorialComplete"]');
  const tutorialSelect = $('[data-screen="tutorialSelect"]');
  const tutorialList = $("[data-tutorial-list]", tutorialSelect);

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
    clearLastConfig();
    const rewardPending = summary.allTutorialsComplete && !summary.rewardGranted;
    $("[data-tutorial-complete='title']", tutorialComplete).textContent = summary.title || "Tutorial Complete";
    $("[data-tutorial-complete='reward']", tutorialComplete).textContent =
      summary.rewardGranted && summary.selectedRewardSkin
        ? `Reward selected: ${skinRewardLabel(summary.selectedRewardSkin)}.`
        : rewardPending
          ? "Juggernaut unlocked. 500 Valor earned. Choose one starter reward skin to add to your collection."
          : "Tutorial progress saved. Complete every tutorial to unlock Juggernaut, earn 500 Valor, and choose one reward skin.";
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
    const choice = await openRewardSkinPicker({
      title: "Juggernaut Unlocked",
      subtitle: "Your first tank joins the roster. Choose one skin reward for this fresh playthrough.",
      accent: MENU_TEAM_COLORS[1],
      cancelLabel: "Choose Later",
      choices: current.rewardChoices.map((reward) => ({
        value: reward,
        label: skinRewardLabel(reward),
        sub: reward.type === "juggernaut" ? "New Juggernaut skin" : "Starter unit skin",
        type: reward.type,
        slug: reward.slug,
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

  return {
    tutorialSelectEl: tutorialSelect,
    renderTutorialSelect,
    showTutorialComplete,
    openTutorialRewardChoice,
  };
}
