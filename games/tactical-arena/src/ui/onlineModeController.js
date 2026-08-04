import {
  TOURNAMENT_ACCESS_CHANGED_EVENT,
  isTournamentAccessActive,
  isTournamentOrganizer,
  readTournamentPlayerName,
} from "../tournament/tournamentAccess.js";
import {
  assignmentForSeat,
  buildTournamentPlayerLink,
  createTournamentAssignment,
  createTournamentMatchmakingOptions,
  doesTournamentSettingsMatchAssignment,
  readTournamentAssignments,
  readTournamentPlayerAssignment,
  saveTournamentAssignments,
} from "../tournament/tournamentAssignments.js";
import {
  isTournamentContext,
  isTournamentLobbySettings,
  shouldAutoStartTournamentLobby,
  tournamentBanFirstSeat,
} from "../tournament/tournamentMode.js";

export function createOnlineModeController({ el, setStatus, getClient, getIdentity, onAccessChanged }) {
  const $ = (selector) => el.querySelector(selector);
  const modeSegs = [...el.querySelectorAll('[data-field="onlineMode"] .seg')];
  const modePanels = [...el.querySelectorAll("[data-online-mode-panel]")];
  const tournamentModeBtn = $('[data-online="tournamentModeButton"]');
  const organizerDesk = $('[data-online="tournamentOrganizerDesk"]');
  const playerDesk = $('[data-online="tournamentPlayerDesk"]');
  const missingAssignment = $('[data-online="tournamentMissingAssignment"]');
  const assignmentCard = $('[data-online="tournamentAssignment"]');
  const fixtureList = $('[data-online="tournamentFixtureList"]');
  const labelInput = $('[data-online="tournamentLabelInput"]');
  const playerOneInput = $('[data-online="tournamentPlayerOneInput"]');
  const playerTwoInput = $('[data-online="tournamentPlayerTwoInput"]');
  const tournamentHint = $('[data-online="tournamentHint"]');
  const startBtn = $('[data-online="startBtn"]');
  const lobbyHint = $('[data-online="lobbyHint"]');
  let autoStartRequested = false;

  const active = () => isTournamentAccessActive();
  const organizer = () => isTournamentOrganizer();
  const assignment = () => readTournamentPlayerAssignment();

  function matchesSettings(settings) {
    if (!active() || !isTournamentLobbySettings(settings)) return false;
    const assigned = assignment();
    return !assigned || doesTournamentSettingsMatchAssignment(assigned, settings);
  }

  const isTournamentLobby = (settings, onlineMode) => settings
    ? matchesSettings(settings)
    : isTournamentContext({ accessActive: active(), onlineMode });

  function playerLink(fixture, seat) {
    return buildTournamentPlayerLink(globalThis.location?.href || "http://localhost/", fixture, seat);
  }

  async function copyLink(link, button) {
    try {
      await globalThis.navigator?.clipboard?.writeText?.(link);
      button.textContent = "Copied";
      globalThis.setTimeout?.(() => { button.textContent = "Copy"; }, 1400);
    } catch {
      setStatus("Copy failed. Select the link and copy it manually.");
    }
  }

  function fixtureLinkRow(fixture, seat) {
    const assigned = assignmentForSeat(fixture, seat);
    const row = document.createElement("div");
    row.className = "tournament-link-row";
    const label = document.createElement("strong");
    label.textContent = assigned.player;
    const input = document.createElement("input");
    input.type = "text";
    input.readOnly = true;
    input.value = playerLink(fixture, seat);
    input.setAttribute("aria-label", `${assigned.player} match link`);
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "menu-btn";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => { void copyLink(input.value, copy); });
    row.append(label, input, copy);
    return row;
  }

  function renderFixtures() {
    if (!fixtureList) return;
    fixtureList.replaceChildren();
    const fixtures = readTournamentAssignments();
    if (!fixtures.length) {
      const empty = document.createElement("p");
      empty.className = "setup-hint";
      empty.textContent = "No matchups yet. Add the first pairing above.";
      fixtureList.append(empty);
      return;
    }
    for (const fixture of fixtures) {
      const card = document.createElement("article");
      card.className = "tournament-fixture-card";
      const head = document.createElement("div");
      head.className = "tournament-fixture-head";
      const title = document.createElement("strong");
      title.textContent = fixture.label;
      const matchup = document.createElement("span");
      matchup.textContent = `${fixture.players[0]} vs ${fixture.players[1]}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "menu-btn ghost";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        saveTournamentAssignments(fixtures.filter((item) => item.fixtureId !== fixture.fixtureId));
        renderFixtures();
      });
      head.append(title, matchup, remove);
      card.append(head, fixtureLinkRow(fixture, 1), fixtureLinkRow(fixture, 2));
      fixtureList.append(card);
    }
  }

  function renderAssignment() {
    const assigned = assignment();
    if (assignmentCard && assigned) {
      assignmentCard.replaceChildren();
      const label = document.createElement("strong");
      label.textContent = assigned.label;
      const matchup = document.createElement("p");
      matchup.textContent = `${assigned.player} vs ${assigned.opponent}`;
      const board = document.createElement("p");
      board.className = "setup-hint";
      board.textContent = "Standard 13 × 13 · Ranked ban/draft flow";
      assignmentCard.append(label, matchup, board);
    }
    if (playerDesk) playerDesk.hidden = organizer() || !assigned;
    if (missingAssignment) missingAssignment.hidden = organizer() || !!assigned;
  }

  function syncTournamentFields() {
    const enabled = active();
    if (tournamentModeBtn) {
      tournamentModeBtn.hidden = !enabled;
      tournamentModeBtn.disabled = !enabled;
    }
    if (organizerDesk) organizerDesk.hidden = !enabled || !organizer();
    if (enabled && organizer()) renderFixtures();
    renderAssignment();
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

  function syncLobbyStart({ tournament = false, isOwner = false, full = false, draftComplete = false, allLocked = false } = {}) {
    if (!tournament) return;
    if (startBtn) startBtn.hidden = true;
    if (allLocked && lobbyHint) {
      lobbyHint.hidden = false;
      lobbyHint.textContent = "Both formations are locked. Starting assigned match…";
    }
    if (shouldAutoStartTournamentLobby({
      tournament, isOwner, full, draftComplete, allLocked,
      alreadyRequested: autoStartRequested,
    })) {
      autoStartRequested = true;
      getClient()?.startLobby();
    }
  }

  $('[data-action="addTournamentFixture"]')?.addEventListener("click", () => {
    const fixture = createTournamentAssignment({
      label: labelInput?.value,
      playerOne: playerOneInput?.value,
      playerTwo: playerTwoInput?.value,
    });
    if (!fixture) {
      setStatus("Enter two different competitor names for this matchup.");
      return;
    }
    saveTournamentAssignments([...readTournamentAssignments(), fixture]);
    if (labelInput) labelInput.value = "";
    if (playerOneInput) playerOneInput.value = "";
    if (playerTwoInput) playerTwoInput.value = "";
    if (tournamentHint) tournamentHint.textContent = "Matchup added. Send each competitor their own link.";
    renderFixtures();
  });

  $('[data-action="joinAssignedTournament"]')?.addEventListener("click", () => {
    const assigned = assignment();
    const options = createTournamentMatchmakingOptions(assigned);
    if (!assigned || !options) {
      setStatus("This browser has no valid tournament assignment link.");
      return;
    }
    getClient()?.setIdentity(getIdentity());
    setStatus(`Finding ${assigned.opponent} for ${assigned.label}…`);
    getClient()?.findLobby(options);
  });

  document.addEventListener(TOURNAMENT_ACCESS_CHANGED_EVENT, () => onAccessChanged?.(active()));
  syncTournamentFields();

  return {
    active,
    assignment,
    banFirstSeat: tournamentBanFirstSeat,
    isTournamentLobby,
    matchesSettings,
    organizer,
    playerName: (enabled) => enabled ? (assignment()?.player || readTournamentPlayerName()) : "",
    resetLobbyStart: () => { autoStartRequested = false; },
    select,
    syncLobbyStart,
  };
}
