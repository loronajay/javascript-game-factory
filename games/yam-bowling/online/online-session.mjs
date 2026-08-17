import { $, showScreen } from "../ui/dom.mjs";

export function sanitizeOnlineSetupSkin(onlineSetup, getOwnedSkinId) {
  const skinId = getOwnedSkinId?.(onlineSetup?.characterSlug);
  onlineSetup.skinId = typeof skinId === "string" && skinId ? skinId : "canon";
  return onlineSetup.skinId;
}

// The client half of an online match. `factory-network-server` owns physics
// outcomes, scoring, turn order and rematches; this module's whole job is to
// take the snapshots it sends and make the local scene agree with them.
export function createOnlineSession({
  session,
  onlineClient,
  onlineIdentity,
  platformApi,
  progressionReporter,
  laneCore,
  matchRuntime,
  onlineScreen,
  scoreboard,
  resultsScreen,
  shotHud,
  audio,
  applyMatchLane,
  normalizeRoomCode,
  accountAccess,
  getOwnedSkinId = () => "canon",
  getMatchPresentation = () => ({}),
  normalizePresentation = (value) => value || {},
  onMatchStarted = () => {},
}) {
  const { scene } = session;

  function normalizeMatchState(matchState) {
    if (!matchState?.match?.players) return matchState;
    return {
      ...matchState,
      match: {
        ...matchState.match,
        players: matchState.match.players.map((player) => ({
          ...player,
          presentation: normalizePresentation(player.presentation, player.characterSlug),
        })),
      },
    };
  }

  function resetSceneForOnline(snapshot) {
    // The server deals the house so both bowlers see one lane; a player's own
    // pick is a local-play preference and never travels into an online room.
    applyMatchLane(laneCore.laneFromRoll(snapshot.laneRoll).slug);
    session.match = structuredClone(snapshot.match);
    session.onlineMatch = true;
    session.onlineSnapshot = snapshot;
    session.pendingAuthoritativeRoll = null;
    session.lastAppliedOnlineRoll = Number(snapshot.rollNumber) || 0;
    session.reportedRatingSessionId = "";
    session.matchFacts.rolls = [];
    session.resetScene(matchRuntime.clonePins(snapshot.nextPins));
    shotHud.resetChargeFeedback();
    shotHud.resetSpinFeedback();
    $("pause-overlay").hidden = true;
    $("restart-match-button").hidden = true;
    $("online-result-status").hidden = true;
    audio.resumeMusic();
    matchRuntime.prepareActivePlayer();
    scoreboard.updateMatchUI();
    showScreen("game-screen");
    onMatchStarted(session.match.players);
  }

  // A snapshot with no new roll in it: adopt the server's match state without
  // animating anything.
  function applyOnlineSnapshotDirect(snapshot) {
    if (!snapshot?.match) return;
    session.match = structuredClone(snapshot.match);
    session.onlineSnapshot = snapshot;
    session.lastAppliedOnlineRoll = Math.max(
      session.lastAppliedOnlineRoll,
      Number(snapshot.rollNumber) || 0,
    );
    scene.pins = matchRuntime.clonePins(snapshot.nextPins);
    session.pendingAuthoritativeRoll = null;
    if (session.match.status === "complete") {
      resultsScreen.showResults();
      return;
    }
    scene.phase = snapshot.phase === "paused" ? "network-paused" : "ready";
    // Presence and reaction messages carry the latest match document too. They
    // need a visual refresh, but they are not a new turn and must not replay the
    // "who's up" banner or its announcement sound.
    matchRuntime.prepareActivePlayer({ announce: false });
    scoreboard.updateMatchUI();
  }

  // A new roll arrived: replay it locally as animation. The pins it settles on
  // are the server's, applied in finalizeRoll, not whatever the local sim found.
  function playAuthoritativeRoll(snapshot) {
    const roll = snapshot?.lastRoll;
    if (!roll || Number(roll.rollNumber) <= session.lastAppliedOnlineRoll) {
      if (snapshot?.match && !session.pendingAuthoritativeRoll) applyOnlineSnapshotDirect(snapshot);
      return;
    }
    if (Number(session.pendingAuthoritativeRoll?.roll?.rollNumber) === Number(roll.rollNumber)) return;

    if (!session.match || $("game-screen").hidden) {
      resetSceneForOnline({ ...snapshot, rollNumber: Number(roll.rollNumber) - 1 });
    }
    session.onlineSnapshot = snapshot;
    session.pendingAuthoritativeRoll = { snapshot, roll };
    const shooterIndex = session.match.players.findIndex((player) => player.id === roll.shooterClientId);
    if (shooterIndex >= 0) session.match.activePlayer = shooterIndex;
    scene.pins = matchRuntime.clonePins(roll.pinsBefore);

    // prepareActivePlayer restores that seat's own saved line, so the served
    // shot has to be written over it afterwards, not before.
    Object.assign(scene.liveShot, roll.shot);
    matchRuntime.applyBallProfile();
    matchRuntime.prepareActivePlayer();
    Object.assign(scene.liveShot, roll.shot);
    matchRuntime.applyBallProfile();
    shotHud.syncControlsFromShot();
    matchRuntime.beginThrow(roll.shot.power, { release: roll.shot.release });
  }

  function handleSnapshot(snapshot) {
    if (snapshot?.matchState) snapshot = { ...snapshot, matchState: normalizeMatchState(snapshot.matchState) };
    onlineScreen.renderLobby(snapshot);
    if (
      snapshot.status === "lobby"
      && snapshot.lobby?.status === "open"
      && snapshot.lobby?.ownerId === snapshot.clientId
      && snapshot.lobby.playerCount >= 2
    ) {
      onlineClient.startLobby();
    }
    if (!snapshot.matchState) return;
    const isNewSession = !session.onlineMatch
      || (session.onlineSnapshot?.sessionId
        && snapshot.matchState.sessionId !== session.onlineSnapshot.sessionId);
    if (isNewSession) {
      resetSceneForOnline(snapshot.matchState);
      return;
    }
    playAuthoritativeRoll(snapshot.matchState);
  }

  function begin(intent) {
    if (!accountAccess.requireFactoryAccount()) return false;
    sanitizeOnlineSetupSkin(session.onlineSetup, getOwnedSkinId);
    session.onlineSetup.intent = intent;
    onlineClient.setIdentity(onlineIdentity);
    onlineClient.connect();
    showScreen("online-lobby-screen");
    onlineScreen.renderLobby(onlineClient.getSnapshot());
    const options = {
      modeId: session.onlineSetup.modeId,
      characterSlug: session.onlineSetup.characterSlug,
      skinId: session.onlineSetup.skinId,
      presentation: getMatchPresentation(session.onlineSetup.characterSlug),
    };
    if (intent === "quick") onlineClient.findQuickMatch(options);
    if (intent === "private-create") onlineClient.createPrivateRoom(options);
    if (intent === "private-join") {
      const code = normalizeRoomCode($("join-room-code").value);
      if (!code) {
        showScreen("online-screen");
        $("online-menu-status").textContent = "Enter the private room code first.";
        $("online-menu-status").classList.add("is-error");
        return;
      }
      onlineClient.joinPrivateRoom(code, options);
    }
    return true;
  }

  function leave() {
    onlineClient.leaveLobby();
    session.onlineMatch = false;
    session.onlineSnapshot = null;
    showScreen("online-screen");
    onlineScreen.renderSetup();
  }

  // Leaving from the results screen goes home rather than back to the lobby, so
  // it drops the room without re-rendering the online setup on the way past.
  function leaveToTitle() {
    onlineClient.leaveLobby();
    session.onlineMatch = false;
    showScreen("title-screen");
  }

  function requestRematch() {
    onlineClient.requestRematch();
    $("online-result-status").hidden = false;
    $("online-result-status").textContent = "Rematch requested. Waiting for your opponent…";
  }

  // Re-files results whose request never reached the server. It runs through the
  // same call site a fresh result does, so the wire still has exactly one owner,
  // and it sends each stored request verbatim: the server dedups on the session
  // id, so a replay settles the grant instead of paying it twice.
  async function flushPendingReports() {
    let settled = 0;
    for (const { grantId, request } of progressionReporter.listUnsentRequests()) {
      const accepted = await platformApi.updateGameRating("yam-bowling", request).catch(() => null);
      if (!accepted) continue;
      progressionReporter.settleSent(grantId);
      settled += 1;
    }
    return settled;
  }

  // Files the finished match to the player's Factory record. Guarded by session
  // id so a re-render of the results screen cannot double-report a result.
  async function reportResult() {
    if (!session.onlineMatch) return;
    const sessionId = session.onlineSnapshot?.sessionId || "";
    if (!sessionId || session.reportedRatingSessionId === sessionId) return;
    session.reportedRatingSessionId = sessionId;
    const clientId = onlineClient.getSnapshot().clientId;
    const me = session.match.players.find((player) => player.id === clientId);
    const opponent = session.match.players.find((player) => player.id !== clientId);
    const status = $("online-result-status");
    status.hidden = false;
    if (!me?.accountPlayerId || !opponent?.accountPlayerId) {
      status.textContent = "Sign in to a Factory account to save online records.";
      return;
    }
    const outcome = session.match.winnerIds.length > 1 ? "draw"
      : session.match.winnerIds.includes(me.id) ? "win" : "loss";
    status.textContent = "Saving this match to your Factory record…";

    // The rating and the XP travel together, under one session id. Preparing the
    // block queues the grant locally first, so a report that never lands is still
    // known to be outstanding rather than silently lost.
    const prepared = progressionReporter.prepare({
      match: session.match,
      clientId,
      sessionId,
      snapshotResult: session.onlineSnapshot?.result || null,
      opponentPlayerId: opponent.accountPlayerId,
      outcome,
    });

    const reported = await platformApi.updateGameRating("yam-bowling", prepared?.request || {
      opponentPlayerId: opponent.accountPlayerId,
      outcome,
      sessionId,
    }).catch(() => null);
    progressionReporter.settle({ grant: prepared?.grant, accepted: Boolean(reported) });
    // An older result whose request never landed files here too, rather than
    // waiting for a match that may never be bowled.
    await flushPendingReports();

    const [rating] = await Promise.all([
      platformApi.getGameRating("yam-bowling", me.accountPlayerId).catch(() => null),
      progressionReporter.sync(me.accountPlayerId),
    ]);
    const ratingLine = rating
      ? `Factory record · ${rating.wins}W ${rating.losses}L ${rating.draws}D · ${rating.rating} ELO`
      : "Match complete. Sign in to save wins, losses, and rating.";
    const progressionLine = progressionReporter.describe();
    status.textContent = progressionLine ? `${ratingLine} · ${progressionLine}` : ratingLine;
  }

  return { handleSnapshot, begin, flushPendingReports, leave, leaveToTitle, requestRematch, reportResult };
}
