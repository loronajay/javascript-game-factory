import { $, escapeHtml } from "./dom.mjs";

export function masteryCelebrationMarkup(event = {}) {
  const rewards = Array.isArray(event.rewards) ? event.rewards : [];
  const rewardMarkup = rewards.length
    ? rewards.map((reward) => `<li><b>Lv. ${escapeHtml(reward.level)}</b><span>${escapeHtml(reward.label)}</span></li>`).join("")
    : "<li><span>Mastery reward earned.</span></li>";
  return `<p class="eyebrow">Bowler mastery advanced</p>
    <h2>${escapeHtml(event.characterName || "Bowler")} reached Level ${escapeHtml(event.toLevel || 1)}</h2>
    <p class="mastery-celebration-copy">New rewards are now recorded on this bowler&rsquo;s full mastery path.</p>
    <ul class="mastery-celebration-rewards">${rewardMarkup}</ul>`;
}

export function createMasteryCelebrationPresenter({ queue, playerId, progression, roster, audio }) {
  let current = null;
  let bound = false;

  function showNext() {
    const dialog = $("mastery-celebration-dialog");
    if (current || dialog.open) return;
    current = queue.peek(playerId);
    if (!current) return;
    $("mastery-celebration-content").innerHTML = masteryCelebrationMarkup(current);
    dialog.showModal();
    $("mastery-celebration-dismiss").focus();
    audio?.play?.("win");
  }

  function dismiss() {
    if (!current) return;
    queue.acknowledge(playerId, current.id);
    current = null;
    const dialog = $("mastery-celebration-dialog");
    if (dialog.open) dialog.close();
    queueMicrotask(showNext);
  }

  function observe() {
    if (progression.getSyncState?.().stale) return [];
    const bowlers = progression.listBowlers().map((entry) => ({
      ...entry,
      name: roster.find((bowler) => bowler.slug === entry.slug)?.name || entry.slug,
    }));
    const added = queue.observe(playerId, bowlers);
    showNext();
    return added;
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

