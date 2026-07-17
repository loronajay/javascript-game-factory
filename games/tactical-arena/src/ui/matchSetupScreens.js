// Hot-seat / single-player / Tempo setup screens: squad pickers plus the
// config-gathering that turns the picked options into a match config. Extracted
// from menuFlow.js; the menu router keeps screen navigation and start actions.

import { createSquadPicker, DEFAULT_SQUAD } from "./squadPicker.js";
import { MENU_TEAM_COLORS, playerSeatListLabel, teamGroupsForSetup, teamPairingSummary } from "./teamDisplay.js";

// The selected button's data value within a named segmented control.
export function selectedValue(root, field, dataKey) {
  const group = root.querySelector(`[data-field="${field}"]`);
  const selected = group?.querySelector(".seg.is-selected");
  return selected?.dataset[dataKey] ?? null;
}

export function createMatchSetupScreens() {
  const $ = (sel, root = document) => root.querySelector(sel);
  const screenEl = (name) => $(`[data-screen="${name}"]`);

  // Squads are always custom — both sides build a four-piece squad from the roster
  // pop-up (squadPicker → rosterPicker). These modes are casual, so duplicate units
  // are allowed; draft/ranked will pass allowDuplicates:false later.
  function buildSquadPickers(host, p2Title) {
    host.replaceChildren();
    const p1 = createSquadPicker({ title: "Player 1", initial: DEFAULT_SQUAD, accent: MENU_TEAM_COLORS[1], allowDuplicates: true, player: 1 });
    const p2 = createSquadPicker({ title: p2Title, initial: DEFAULT_SQUAD, accent: MENU_TEAM_COLORS[2], allowDuplicates: true, player: 2 });
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
        accent: MENU_TEAM_COLORS[player],
        allowDuplicates: true,
        player,
      }));
    }
    return hsPickers.get(player);
  }

  function syncHotSeatSetup() {
    const count = Number(selectedValue(hsSetup, "playerCount", "count")) || 2;
    const format = count === 4 ? (selectedValue(hsSetup, "format", "format") || "ffa") : "ffa";
    const formatGroup = $("[data-group='format']", hsSetup);
    if (formatGroup) formatGroup.hidden = count !== 4;
    const squadHint = $("[data-group='squads'] .setup-hint", hsSetup);
    if (squadHint) {
      const teamSummary = teamPairingSummary(count, format);
      squadHint.textContent = teamSummary
        ? `${teamSummary} Each squad deploys four pieces. Tap Edit Squad to choose units and read their stats, passives and ARTS.`
        : "Each squad deploys four pieces. Tap Edit Squad to choose units and read their stats, passives and ARTS.";
    }
    hsSquadHost.replaceChildren();
    for (const group of teamGroupsForSetup(count, format)) {
      if (format === "teams") {
        const teamGroup = document.createElement("section");
        teamGroup.className = "squad-team-group";
        teamGroup.style.setProperty("--team", MENU_TEAM_COLORS[group.team]);
        teamGroup.innerHTML = `<div class="squad-team-title"><span>Team ${group.team}</span><small>${playerSeatListLabel(group.seats)}</small></div>`;
        const row = document.createElement("div");
        row.className = "squad-team-pickers";
        for (const player of group.seats) {
          const picker = ensureHotSeatPicker(player);
          picker.setPlayer(player);
          picker.setPlayerCount(count);
          picker.setFormat(format);
          row.append(picker.el);
        }
        teamGroup.append(row);
        hsSquadHost.append(teamGroup);
      } else {
        for (const player of group.seats) {
          const picker = ensureHotSeatPicker(player);
          picker.setPlayer(player);
          picker.setPlayerCount(count);
          picker.setFormat(format);
          hsSquadHost.append(picker.el);
        }
      }
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
      teamColors: format === "teams" ? { 1: MENU_TEAM_COLORS[1], 2: MENU_TEAM_COLORS[2] } : null,
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
      skins: { 1: spPickers.p1.getSkins(), 2: spPickers.p2.getSkins() },
      // Player 2 is CPU-controlled — only the human's own nickname preferences
      // should ride onto the board, never re-derived onto the CPU's squad.
      nicknames: { 1: spPickers.p1.getNicknames(), 2: spPickers.p2.getSquad().map(() => null) }
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
      skins: { 1: tempoSpPickers.p1.getSkins(), 2: tempoSpPickers.p2.getSkins() },
      nicknames: { 1: tempoSpPickers.p1.getNicknames(), 2: tempoSpPickers.p2.getSquad().map(() => null) }
    };
  }

  // Progress reset: every picker returns to the starter loadout.
  function resetLoadouts() {
    spPickers.p1.setLoadout(DEFAULT_SQUAD);
    spPickers.p2.setLoadout(DEFAULT_SQUAD);
    tempoSpPickers.p1.setLoadout(DEFAULT_SQUAD);
    tempoSpPickers.p2.setLoadout(DEFAULT_SQUAD);
    for (const picker of hsPickers.values()) picker.setLoadout(DEFAULT_SQUAD);
  }

  return {
    syncHotSeatSetup,
    gatherHotSeatConfig,
    gatherSingleConfig,
    gatherTempoSingleConfig,
    resetLoadouts,
  };
}
