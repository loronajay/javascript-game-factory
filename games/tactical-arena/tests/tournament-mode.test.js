import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createDraftState, currentBanSeat, currentDraftSeat, isBanPhaseComplete } from "../src/ui/draftModel.js";
import {
  createTournamentLobbySettings,
  isTournamentContext,
  isTournamentLobbySettings,
  tournamentBanFirstSeat,
} from "../src/tournament/tournamentMode.js";

test("tournament rooms are fixed to the ranked-style 1v1 ban/draft format", () => {
  const settings = createTournamentLobbySettings({ banFirstSeat: 2 });

  assert.deepEqual(settings, {
    matchType: "draft1v1",
    tournament: true,
    banFirstSeat: 2,
  });
  assert.equal(isTournamentLobbySettings(settings), true);
  assert.equal(tournamentBanFirstSeat(settings), 2);

  const draft = createDraftState({ seats: [1, 2], banFirstSeat: tournamentBanFirstSeat(settings) });
  assert.equal(isBanPhaseComplete(draft), false);
  assert.equal(currentBanSeat(draft), 2);
  assert.equal(currentDraftSeat(draft), null, "picks stay closed until both ranked-style bans finish");
});

test("malformed tournament settings cannot enable the mode or an invalid ban seat", () => {
  assert.equal(isTournamentLobbySettings({ tournament: true, matchType: "duel" }), false);
  assert.equal(isTournamentLobbySettings({ tournament: false, matchType: "draft1v1" }), false);
  assert.equal(tournamentBanFirstSeat({ tournament: true, matchType: "draft1v1", banFirstSeat: 99 }), 1);
});

test("temporary unlocks stop at the tournament lobby boundary", () => {
  const tournament = createTournamentLobbySettings({ banFirstSeat: 1 });
  assert.equal(isTournamentContext({ accessActive: true, onlineMode: "tournament" }), true);
  assert.equal(isTournamentContext({ accessActive: true, onlineMode: "tournament", settings: { matchType: "duel" } }), false);
  assert.equal(isTournamentContext({ accessActive: true, onlineMode: "casual", settings: tournament }), true);
  assert.equal(isTournamentContext({ accessActive: false, onlineMode: "tournament", settings: tournament }), false);
});

test("page fragments expose organizer access and a dedicated tournament room panel", async () => {
  const [settings, setup] = await Promise.all([
    readFile(new URL("../html/settings-modal.html", import.meta.url), "utf8"),
    readFile(new URL("../html/setup-screens.html", import.meta.url), "utf8"),
  ]);

  assert.match(settings, /id="setTournamentPassword"/);
  assert.match(settings, /id="setTournamentUnlockBtn"/);
  assert.match(settings, /id="setTournamentStatus"/);
  assert.match(setup, /data-online-mode="tournament"/);
  assert.match(setup, /data-online-mode-panel="tournament"/);
  assert.match(setup, /data-online="tournamentNameInput"/);
  assert.match(setup, /data-action="createTournamentRoom"/);
  assert.match(setup, /data-action="joinTournamentRoom"/);
});

test("bootstrap and online flow wire URL activation and tournament-only availability", async () => {
  const [bootstrap, menuFlow, onlineFlow, onlineModeController] = await Promise.all([
    readFile(new URL("../src/bootstrap.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ui/menuFlow.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ui/onlineFlow.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ui/onlineModeController.js", import.meta.url), "utf8"),
  ]);

  assert.match(bootstrap, /activateTournamentAccessFromUrl/);
  assert.match(menuFlow, /isTournamentAccessActive/);
  assert.match(onlineFlow, /createOnlineModeController/);
  assert.match(onlineModeController, /createTournamentLobbySettings/);
  assert.match(onlineFlow, /allowAll:\s*isTournamentLobby\(\)/);
  assert.match(onlineFlow, /trustSkin:\s*isTournamentLobby\(\)/);
  assert.match(onlineFlow, /isUnlocked:\s*\(\)\s*=>\s*true/);
});
