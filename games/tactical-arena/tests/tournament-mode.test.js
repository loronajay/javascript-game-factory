import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createDraftState, currentBanSeat, currentDraftSeat, isBanPhaseComplete } from "../src/ui/draftModel.js";
import {
  createTournamentLobbySettings,
  isTournamentContext,
  isTournamentLobbySettings,
  shouldAutoStartTournamentLobby,
  tournamentBanFirstSeat,
} from "../src/tournament/tournamentMode.js";

test("tournament fixtures are fixed to the ranked-style 1v1 ban/draft format", () => {
  const settings = createTournamentLobbySettings({
    fixtureId: "round-1-table-1",
    players: ["Alice", "Bob"],
    banFirstSeat: 2,
  });

  assert.match(settings.matchType, /^ta-t:[a-f0-9]{16}:2$/);
  assert.ok(settings.matchType.length <= 32, "the relay caps matchType at 32 characters");
  assert.equal(settings.tournament, true);
  assert.equal(settings.fixtureId, "round-1-table-1");
  assert.deepEqual(settings.players, ["Alice", "Bob"]);
  assert.equal(settings.banFirstSeat, 2);
  assert.equal(isTournamentLobbySettings(settings), true);
  assert.equal(tournamentBanFirstSeat(settings), 2);

  const draft = createDraftState({ seats: [1, 2], banFirstSeat: tournamentBanFirstSeat(settings) });
  assert.equal(isBanPhaseComplete(draft), false);
  assert.equal(currentBanSeat(draft), 2);
  assert.equal(currentDraftSeat(draft), null, "picks stay closed until both ranked-style bans finish");
});

test("tournament identity and ban order survive the production relay settings sanitizer", () => {
  const local = createTournamentLobbySettings({
    fixtureId: "round-1-table-1",
    players: ["Alice", "Bob"],
    banFirstSeat: 2,
  });
  // factory-network-server deliberately drops tournament, fixtureId, players, and
  // banFirstSeat. This is the exact shape Tactical Arena receives back in lobby_joined.
  const relayed = {
    penaltyWord: "ECHO",
    packId: "pack_01",
    runFormat: "canon_10_stage",
    matchType: local.matchType,
    protocolVersion: 1,
  };

  assert.equal(isTournamentLobbySettings(relayed), true);
  assert.equal(tournamentBanFirstSeat(relayed), 2);
});

test("malformed tournament settings cannot enable the mode or an invalid ban seat", () => {
  assert.equal(isTournamentLobbySettings({ tournament: true, matchType: "draft1v1" }), false);
  assert.equal(isTournamentLobbySettings({ tournament: true, matchType: "duel" }), false);
  assert.equal(isTournamentLobbySettings({ tournament: false, matchType: "draft1v1" }), false);
  assert.equal(tournamentBanFirstSeat({ tournament: true, matchType: "draft1v1", banFirstSeat: 99 }), 1);
});

test("a full assigned fixture auto-starts for the relay owner only after both formations lock", () => {
  const ready = { tournament: true, isOwner: true, full: true, draftComplete: true, allLocked: true };
  assert.equal(shouldAutoStartTournamentLobby(ready), true);
  assert.equal(shouldAutoStartTournamentLobby({ ...ready, isOwner: false }), false);
  assert.equal(shouldAutoStartTournamentLobby({ ...ready, allLocked: false }), false);
  assert.equal(shouldAutoStartTournamentLobby({ ...ready, alreadyRequested: true }), false);
});

test("temporary unlocks stop at the tournament lobby boundary", () => {
  const tournament = createTournamentLobbySettings({ fixtureId: "m1", players: ["A", "B"], banFirstSeat: 1 });
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
  assert.match(setup, /data-online="tournamentPlayerOneInput"/);
  assert.match(setup, /data-online="tournamentPlayerTwoInput"/);
  assert.match(setup, /data-action="addTournamentFixture"/);
  assert.match(setup, /data-online="tournamentFixtureList"/);
  assert.match(setup, /data-online="tournamentAssignment"/);
  assert.match(setup, /data-action="joinAssignedTournament"/);
  assert.doesNotMatch(setup, /data-action="createTournamentRoom"/);
  assert.doesNotMatch(setup, /data-action="joinTournamentRoom"/);
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
  assert.match(onlineModeController, /createTournamentMatchmakingOptions/);
  assert.match(onlineModeController, /findLobby/);
  assert.doesNotMatch(onlineModeController, /\.createLobby\(/);
  assert.doesNotMatch(onlineModeController, /\.joinLobby\(/);
  assert.match(onlineFlow, /allowAll:\s*isTournamentLobby\(\)/);
  assert.match(onlineFlow, /trustSkin:\s*isTournamentLobby\(\)/);
  assert.match(onlineFlow, /isUnlocked:\s*\(\)\s*=>\s*true/);
});
