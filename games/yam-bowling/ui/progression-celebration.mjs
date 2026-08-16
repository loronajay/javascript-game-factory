import { $, escapeHtml } from "./dom.mjs";

function rewardMarkup(reward = {}) {
  const status = reward.status
    ? `<small class="mastery-celebration-reward-status">${escapeHtml(reward.status)}</small>`
    : "";
  return `<li><b>Lv. ${escapeHtml(reward.level)}</b><span>${escapeHtml(reward.label)}${status}</span></li>`;
}

export function progressionCelebrationMarkup(event = {}) {
  const rewards = Array.isArray(event.rewards) ? event.rewards : [];
  const fallback = event.track === "player" ? "Player reward earned." : "Mastery reward earned.";
  const rewardsMarkup = rewards.length ? rewards.map(rewardMarkup).join("") : `<li><span>${fallback}</span></li>`;
  if (event.track === "player") {
    const copy = rewards.some((reward) => reward?.equipment?.itemId)
      ? "Your new equippable rewards are available from your player profile."
      : "Your player reward path has advanced.";
    return `<p class="eyebrow">Player level advanced</p>
      <h2>You reached Level ${escapeHtml(event.toLevel || 1)}</h2>
      <p class="mastery-celebration-copy">${copy}</p>
      <ul class="mastery-celebration-rewards">${rewardsMarkup}</ul>`;
  }
  return `<p class="eyebrow">Bowler mastery advanced</p>
    <h2>${escapeHtml(event.characterName || "Bowler")} reached Level ${escapeHtml(event.toLevel || 1)}</h2>
    <p class="mastery-celebration-copy">New rewards are now recorded on this bowler&rsquo;s full mastery path.</p>
    <ul class="mastery-celebration-rewards">${rewardsMarkup}</ul>`;
}

function playerRewardStatus(reward, loadout) {
  const target = reward?.equipment;
  if (!target?.itemId || !target.slot) return "Reward recorded";
  return loadout?.getGlobalSlot?.(target.slot) === target.itemId ? "Equipped" : "Unlocked";
}

export function createProgressionCelebrationPresenter({
  masteryQueue,
  playerQueue,
  playerId,
  progression,
  roster,
  loadout,
  audio,
}) {
  let current = null;
  let bound = false;
  const sources = [playerQueue, masteryQueue].filter(Boolean);

  function nextPending() {
    for (const queue of sources) {
      const event = queue.peek(playerId);
      if (event) return { queue, event };
    }
    return null;
  }

  function presentable(event) {
    if (event.track !== "player") return event;
    return {
      ...event,
      rewards: event.rewards.map((reward) => ({
        ...reward,
        status: playerRewardStatus(reward, loadout),
      })),
    };
  }

  function showNext() {
    const dialog = $("mastery-celebration-dialog");
    if (current || dialog.open) return;
    current = nextPending();
    if (!current) return;
    $("mastery-celebration-content").innerHTML = progressionCelebrationMarkup(presentable(current.event));
    dialog.showModal();
    $("mastery-celebration-dismiss").focus();
    audio?.play?.("win");
  }

  function dismiss() {
    if (!current) return;
    current.queue.acknowledge(playerId, current.event.id);
    current = null;
    const dialog = $("mastery-celebration-dialog");
    if (dialog.open) dialog.close();
    queueMicrotask(showNext);
  }

  function observe() {
    if (progression.getSyncState?.().stale) return [];
    const playerAdded = playerQueue?.observe(playerId, progression.getPlayer()) || [];
    const bowlers = progression.listBowlers().map((entry) => ({
      ...entry,
      name: roster.find((bowler) => bowler.slug === entry.slug)?.name || entry.slug,
    }));
    const masteryAdded = masteryQueue?.observe(playerId, bowlers) || [];
    showNext();
    return [...playerAdded, ...masteryAdded];
  }

  function bind() {
    if (bound) return;
    bound = true;
    $("mastery-celebration-dismiss").addEventListener("click", dismiss);
    $("mastery-celebration-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      dismiss();
    });
  }

  return { bind, dismiss, observe };
}
