import { $, showScreen } from "../ui/dom.mjs";
import { createModeReadiness } from "./mode-readiness.mjs";

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
  prepareBowlingMode = async () => {},
}) {
  const { scene } = session;
  const readiness = createModeReadiness(prepareBowlingMode);
  const replayQueue = new Map();
  const retiredSessions = new Set();

  function loadingFailed(error) {
    // Never silently substitute Arcade for a server-authoritative 3D match.
    $("online-status").textContent = "3D Bowl could not load. Leave the room and retry with a WebGL 2 capable browser.";
    $("online-status").classList.add("is-error");
    $("online-status").title = String(error.message || error);
  }

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
    scene.phase = snapshot.phase === "paused" ? "network-paused" : "ready";
    shotHud.resetChargeFeedback();
    shotHud.resetSpinFeedback();
    $("pause-overlay").hidden = true;
    // Same seam the local start uses, so the pause card can never be left saying
    // what the previous match was — an ended lesson used to leave "End lesson"
    // on the quit button of an online room.
    matchRuntime.syncPauseChrome();
    $("online-result-status").hidden = true;
    audio.resumeMusic();
    matchRuntime.prepareActivePlayer();
    scoreboard.updateMatchUI();
    showScreen("game-screen");
    if (session.match.status === "complete") { resultsScreen.showResults(); return; }
    onMatchStarted(session.match.players);
  }

  // A snapshot with no new roll in it: adopt the server's match state without
  // animating anything.
  function applyOnlineSnapshotDirect(snapshot) {
    if (!snapshot?.match) return;
    if (Number(snapshot.rollNumber) < session.lastAppliedOnlineRoll) return;
    const rollAdvanced = (Number(snapshot.rollNumber) || 0) > session.lastAppliedOnlineRoll;
    session.match = structuredClone(snapshot.match);
    session.onlineSnapshot = snapshot;
    session.lastAppliedOnlineRoll = Math.max(
      session.lastAppliedOnlineRoll,
      Number(snapshot.rollNumber) || 0,
    );
    session.pendingAuthoritativeRoll = null;
    // A reaction or presence ping carries the match document but advances nothing:
    // same roll, no pause change, not complete. Adopt it for the scoreboard only —
    // touching the scene here would reset the active bowler's aim, spin and
    // approach mid-shot, which read as an opponent's emote hijacking your controls.
    const pauseChanged = (snapshot.phase === "paused") !== (scene.phase === "network-paused");
    if (session.onlineMatch && !rollAdvanced && !pauseChanged
      && session.match.status !== "complete") {
      scoreboard.updateMatchUI();
      return;
    }
    // Presence/reaction updates must not skip a result hold or reset live input.
    if (scene.phase === "transition" || (["spin", "charging", "submitting"].includes(scene.phase)
      && snapshot.phase !== "paused" && session.match.status !== "complete")) return;
    scene.pins = matchRuntime.clonePins(snapshot.nextPins);
    if (session.match.status === "complete") {
      resultsScreen.showResults();
      return;
    }
    scene.phase = snapshot.phase === "paused" ? "network-paused" : "ready";
    // Presence and reaction messages carry the latest match document too. They
    // need a visual refresh, but they are not a new turn and must not replay the
    // "who's up" banner or its announcement sound.
    const liveShot = { ...scene.liveShot };
    matchRuntime.prepareActivePlayer({ announce: false });
    Object.assign(scene.liveShot || {}, liveShot);
    scoreboard.updateMatchUI();
  }

  // A new roll arrived: replay it locally as animation. The pins it settles on
  // are the server's, applied in finalizeRoll, not whatever the local sim found.
  function playAuthoritativeRoll(snapshot) {
    const roll = snapshot?.lastRoll;
    if (session.pendingAuthoritativeRoll) {
      const pending = session.pendingAuthoritativeRoll;
      if (Number(roll?.rollNumber) > Number(pending.roll.rollNumber)) {
        replayQueue.set(Number(roll.rollNumber), snapshot);
      } else if (Number(roll?.rollNumber) === Number(pending.roll.rollNumber)) {
        pending.snapshot = snapshot;
      }
      return;
    }
    if (scene.phase === "transition" && Number(roll?.rollNumber) > session.lastAppliedOnlineRoll) {
      replayQueue.set(Number(roll.rollNumber), snapshot);
      return;
    }
    if (!roll || Number(roll.rollNumber) <= session.lastAppliedOnlineRoll) {
      if (snapshot?.match && !session.pendingAuthoritativeRoll) applyOnlineSnapshotDirect(snapshot);
      return;
    }
    if (Number(session.pendingAuthoritativeRoll?.roll?.rollNumber) === Number(roll.rollNumber)) return;
    if (Number(roll.rollNumber) > session.lastAppliedOnlineRoll + 1) {
      applyOnlineSnapshotDirect(snapshot);
      return;
    }

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
    // This is a replay of the shot the server just accepted, not a new turn.
    // The actual handoff is announced after the roll settles.
    matchRuntime.prepareActivePlayer({ announce: false });
    Object.assign(scene.liveShot, roll.shot);
    matchRuntime.applyBallProfile();
    shotHud.syncControlsFromShot();
    matchRuntime.beginThrow(roll.shot.power, { release: roll.shot.release });
  }

  function handleSnapshot(snapshot) {
    if (snapshot?.matchState) snapshot = { ...snapshot, matchState: normalizeMatchState(snapshot.matchState) };
    onlineScreen.renderLobby(snapshot);
    const style = snapshot.matchState?.match?.bowlingStyle || snapshot.lobby?.settings?.bowlingStyle;
    return readiness.run(style, () => acceptSnapshot(snapshot), loadingFailed);
  }

  function acceptSnapshot(snapshot) {
    if (scene.phase === "submitting" && ["SHOT_FAILED", "INVALID_SHOT", "NOT_YOUR_TURN", "NOT_READY_FOR_SHOT"].includes(snapshot.error?.code)) {
      scene.phase = "ready";
    }
    if (
      snapshot.status === "lobby"
      && snapshot.lobby?.status === "open"
      && snapshot.lobby?.ownerId === snapshot.clientId
      && snapshot.lobby.playerCount >= 2
    ) {
      onlineClient.startLobby();
    }
    if (!snapshot.matchState) return;
    if (retiredSessions.has(snapshot.matchState.sessionId)) return;
    const isNewSession = !session.onlineMatch
      || (session.onlineSnapshot?.sessionId
        && snapshot.matchState.sessionId !== session.onlineSnapshot.sessionId);
    if (isNewSession) {
      if (session.onlineSnapshot?.sessionId) retiredSessions.add(session.onlineSnapshot.sessionId);
      replayQueue.clear();
      resetSceneForOnline(snapshot.matchState);
      return;
    }
    playAuthoritativeRoll(snapshot.matchState);
  }

  function tick() {
    if (!session.onlineMatch || session.pendingAuthoritativeRoll || scene.phase !== "ready") return;
    const next = [...replayQueue.keys()].sort((a, b) => a - b)[0];
    if (next === undefined) return;
    const snapshot = replayQueue.get(next);
    replayQueue.delete(next);
    playAuthoritativeRoll(snapshot);
  }

  function begin(intent) {
    if (!accountAccess.requireFactoryAccount()) return false;
    sanitizeOnlineSetupSkin(session.onlineSetup, getOwnedSkinId);
    session.onlineSetup.intent = intent;
    showScreen("online-lobby-screen");
    onlineScreen.renderLobby(onlineClient.getSnapshot());
    const options = {
      modeId: session.onlineSetup.modeId,
      bowlingStyle: session.onlineSetup.bowlingStyle === "3d" ? "3d" : "arcade",
      ranked: session.onlineSetup.ranked === true,
      characterSlug: session.onlineSetup.characterSlug,
      skinId: session.onlineSetup.skinId,
      presentation: getMatchPresentation(session.onlineSetup.characterSlug),
    };
    let code = "";
    if (intent === "private-join") {
      code = normalizeRoomCode($("join-room-code").value);
      if (!code) {
        showScreen("online-screen");
        $("online-menu-status").textContent = "Enter the private room code first.";
        $("online-menu-status").classList.add("is-error");
        return;
      }
    }
    if (options.bowlingStyle === "3d") $("online-status").textContent = "Preparing the 3D lane…";
    // Code joins learn the host's style from the server. Creation/search can
    // preflight graphics before opening a room for another player.
    return readiness.run(intent === "private-join" ? "arcade" : options.bowlingStyle, () => {
      onlineClient.connect();
      if (intent === "quick") onlineClient.findQuickMatch(options);
      if (intent === "private-create") onlineClient.createPrivateRoom(options);
      if (intent === "private-join") onlineClient.joinPrivateRoom(code, options);
      return true;
    }, loadingFailed);
  }

  function leave() {
    readiness.cancel(); replayQueue.clear();
    onlineClient.leaveLobby();
    session.onlineMatch = false;
    session.onlineSnapshot = null;
    showScreen("online-screen");
    onlineScreen.renderSetup();
  }

  // Leaving from the results screen goes home rather than back to the lobby, so
  // it drops the room without re-rendering the online setup on the way past.
  function leaveToTitle() {
    readiness.cancel(); replayQueue.clear();
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
    // The stakes are read off the authoritative snapshot, never off this device's
    // setup screen: the server froze them into the match at start, and a local
    // toggle flipped afterwards — or a resumed match whose setup was never
    // touched — must not be able to decide whether somebody's ELO moves.
    const ranked = session.onlineSnapshot?.ranked === true;
    status.textContent = ranked
      ? "Saving this match to your Factory record…"
      : "Casual match — filing your XP…";

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
      ranked,
    });

    const reported = await platformApi.updateGameRating("yam-bowling", prepared?.request || {
      opponentPlayerId: opponent.accountPlayerId,
      outcome,
      sessionId,
      ranked,
    }).catch(() => null);
    progressionReporter.settle({ grant: prepared?.grant, accepted: Boolean(reported) });
    // An older result whose request never landed files here too, rather than
    // waiting for a match that may never be bowled.
    await flushPendingReports();

    const [rating] = await Promise.all([
      // A casual match still shows the standing record, so a player can see for
      // themselves that it did not move.
      platformApi.getGameRating("yam-bowling", me.accountPlayerId).catch(() => null),
      progressionReporter.sync(me.accountPlayerId),
    ]);
    const ratingLine = !rating
      ? "Match complete. Sign in to save wins, losses, and rating."
      : ranked
        ? `Factory record · ${rating.wins}W ${rating.losses}L ${rating.draws}D · ${rating.rating} ELO`
        : `Casual match · record unchanged at ${rating.wins}W ${rating.losses}L ${rating.draws}D · ${rating.rating} ELO`;
    const progressionLine = progressionReporter.describe();
    status.textContent = progressionLine ? `${ratingLine} · ${progressionLine}` : ratingLine;
  }

  return { handleSnapshot, tick, begin, flushPendingReports, leave, leaveToTitle, requestRematch, reportResult };
}
