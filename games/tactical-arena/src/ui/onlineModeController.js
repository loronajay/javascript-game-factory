import {
  TOURNAMENT_ACCESS_CHANGED_EVENT,
  isTournamentAccessActive,
  readTournamentPlayerName,
  saveTournamentPlayerName,
} from "../tournament/tournamentAccess.js";
import {
  createTournamentLobbySettings,
  isTournamentContext,
  isTournamentLobbySettings,
  randomTournamentBanFirstSeat,
  tournamentBanFirstSeat,
} from "../tournament/tournamentMode.js";

export function createOnlineModeController({ el, setStatus, normalizeRoomCode, getClient, getIdentity, onAccessChanged }) {
  const $ = (selector) => el.querySelector(selector);
  const modeSegs = [...el.querySelectorAll('[data-field="onlineMode"] .seg')];
  const modePanels = [...el.querySelectorAll("[data-online-mode-panel]")];
  const tournamentModeBtn = $('[data-online="tournamentModeButton"]');
  const tournamentNameInput = $('[data-online="tournamentNameInput"]');
  const tournamentCodeInput = $('[data-online="tournamentCodeInput"]');
  const tournamentHint = $('[data-online="tournamentHint"]');

  const active = () => isTournamentAccessActive();
  const matchesSettings = (settings) => active() && isTournamentLobbySettings(settings);
  const isTournamentLobby = (settings, onlineMode) => isTournamentContext({
    accessActive: active(),
    settings,
    onlineMode,
  });

  function syncTournamentFields() {
    const enabled = active();
    if (tournamentModeBtn) {
      tournamentModeBtn.hidden = !enabled;
      tournamentModeBtn.disabled = !enabled;
    }
    if (tournamentNameInput && !tournamentNameInput.value) tournamentNameInput.value = readTournamentPlayerName();
    return enabled;
  }

  function select(requested, { rankedEnabled = false } = {}) {
    const next = requested === "tournament" && active()
      ? "tournament"
      : requested === "ranked" && rankedEnabled ? "ranked" : "casual";
    for (const seg of modeSegs) seg.classList.toggle("is-selected", seg.dataset.onlineMode === next);
    for (const panel of modePanels) panel.hidden = panel.dataset.onlineModePanel !== next;
    syncTournamentFields();
    return next;
  }

  function lobbyOptions() {
    return {
      minPlayers: 2,
      maxPlayers: 2,
      settings: createTournamentLobbySettings({ banFirstSeat: randomTournamentBanFirstSeat() }),
    };
  }

  function prepareIdentity() {
    if (!active()) {
      setStatus("Enable Tournament access in Settings first.");
      return false;
    }
    const name = saveTournamentPlayerName(tournamentNameInput?.value);
    if (!name) {
      setStatus("Enter the competitor's bracket name first.");
      if (tournamentHint) tournamentHint.textContent = "A competitor name is required for the lobby and match.";
      tournamentNameInput?.focus();
      return false;
    }
    if (tournamentNameInput) tournamentNameInput.value = name;
    if (tournamentHint) tournamentHint.textContent = "All tournament unlocks are temporary and limited to Tournament rooms.";
    getClient()?.setIdentity(getIdentity());
    return true;
  }

  $('[data-action="createTournamentRoom"]')?.addEventListener("click", () => {
    if (prepareIdentity()) getClient()?.createLobby(lobbyOptions());
  });
  $('[data-action="joinTournamentRoom"]')?.addEventListener("click", () => {
    if (!prepareIdentity()) return;
    const code = normalizeRoomCode(tournamentCodeInput?.value);
    if (tournamentCodeInput) tournamentCodeInput.value = code;
    if (code.length !== 5) {
      setStatus("Enter the 5-character tournament room code.");
      return;
    }
    getClient()?.joinLobby(code);
  });
  tournamentCodeInput?.addEventListener("input", () => {
    const normalized = normalizeRoomCode(tournamentCodeInput.value);
    if (tournamentCodeInput.value !== normalized) tournamentCodeInput.value = normalized;
  });
  tournamentNameInput?.addEventListener("change", () => {
    tournamentNameInput.value = saveTournamentPlayerName(tournamentNameInput.value);
  });
  document.addEventListener(TOURNAMENT_ACCESS_CHANGED_EVENT, () => onAccessChanged?.(active()));
  syncTournamentFields();

  return {
    active,
    banFirstSeat: tournamentBanFirstSeat,
    isTournamentLobby,
    matchesSettings,
    playerName: (enabled) => enabled ? readTournamentPlayerName() : "",
    select,
  };
}
