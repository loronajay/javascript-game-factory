import {
  DRAFT_BATTLE_REQUIRED_UNITS,
  isDraftBattleAvailable,
  unlockedDraftUnitCount,
} from "../progression/draftAvailability.js";
import { matchTypeConfigFor, normalizeMatchType } from "./onlineMatchTypes.js";

export function createOnlineMatchTypeController({ el, getSelected, setSelected, canSelect = () => true }) {
  const segments = [...el.querySelectorAll('[data-field="onlineMatchType"] .seg')];
  const hint = el.querySelector('[data-online="matchTypeHint"]');
  const unlockedCount = () => unlockedDraftUnitCount(globalThis.localStorage);
  const draftAvailable = () => isDraftBattleAvailable(globalThis.localStorage);

  function sync() {
    const draftReady = draftAvailable();
    for (const segment of segments) {
      const locked = normalizeMatchType(segment.dataset.matchType) === "draft1v1" && !draftReady;
      segment.disabled = locked;
      segment.classList.toggle("is-locked", locked);
      segment.title = locked
        ? `Must own ${DRAFT_BATTLE_REQUIRED_UNITS} unique units to draft (${unlockedCount()} unlocked)`
        : "";
    }
    if (!hint) return;
    const showHint = !draftReady && normalizeMatchType(getSelected()) === "draft1v1";
    hint.hidden = !showHint;
    hint.textContent = showHint
      ? `Draft 1v1 needs ${DRAFT_BATTLE_REQUIRED_UNITS} unique units — you have ${unlockedCount()} unlocked.`
      : "";
  }

  function select(type) {
    const normalized = normalizeMatchType(type);
    if (normalized === "draft1v1" && !draftAvailable()) return;
    setSelected(normalized);
    for (const segment of segments) {
      segment.classList.toggle("is-selected", normalizeMatchType(segment.dataset.matchType) === getSelected());
    }
    sync();
  }

  for (const segment of segments) {
    segment.addEventListener("click", () => {
      if (canSelect()) select(segment.dataset.matchType);
    });
  }
  sync();

  return {
    lobbyOptions() {
      const type = normalizeMatchType(getSelected());
      const config = matchTypeConfigFor(type);
      return { minPlayers: config.minPlayers, maxPlayers: config.maxPlayers, settings: { matchType: type } };
    },
    select,
  };
}
