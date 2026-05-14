import { PHASES } from "./config.js";
import { getOwner } from "./state.js";

export function getPhaseCopy(state) {
  const owner = getOwner(state);
  switch (state.phase) {
    case PHASES.OWNER_CREATE_INITIAL:
      return ["Driver Create", `${owner?.name || "Driver"} enters a 4-input pattern.`, "The completed signal will play back before copy mode."];
    case PHASES.OWNER_REPLAY:
      return ["Driver Replay", `${owner?.name || "Driver"} must replay their own pattern.`, "If successful, the completed signal plays back for everyone."];
    case PHASES.OWNER_APPEND:
      return ["Driver Append", `${owner?.name || "Driver"} adds ${state.settings?.patternAppendCount || 2} inputs.`, "The updated sequence will be presented before copy begins."];
    case PHASES.SIGNAL_PLAYBACK:
      return ["Memorize", "Signal playback.", "Watch the full pattern now. It disappears before copy mode."];
    case PHASES.CHALLENGER_COPY:
      return ["Copy Phase", "Challengers copy the pattern.", "No sequence readout. Memory only."];
    case PHASES.RESULT_REVEAL:
      return ["Thinking", "Echo is preparing the next signal.", "Next playback starts after a short beat."];
    case PHASES.MATCH_OVER:
      return ["Finished", "Match over.", ""];
    default:
      return ["Match", "Waiting.", ""];
  }
}

export function getLocalPlayerId(state) {
  return state?.network?.myClientId || null;
}

export function getSinglePlayerScoreText(state) {
  return `Score: ${Number(state?.singlePlayer?.score || 0)}`;
}

export function getSinglePlayerFinalScoreText(state) {
  return `Final score: ${Number(state?.singlePlayer?.score || 0)}`;
}

export function isLocalOwner(state) {
  const localId = getLocalPlayerId(state);
  const owner = getOwner(state);
  if (!localId) return state.mode !== "online";
  return owner?.id === localId || owner?.clientId === localId;
}

export function getLocalCopyProgress(state) {
  const localId = getLocalPlayerId(state);
  if (localId && state.copyProgress?.[localId]) return state.copyProgress[localId];
  const firstCopying = Object.values(state.copyProgress || {}).find((progress) => progress.status === "copying");
  return firstCopying || null;
}

export function getExpectedSlotCount(state) {
  if (state.phase === PHASES.OWNER_CREATE_INITIAL) return state.settings.startingPatternLength;
  if (state.phase === PHASES.OWNER_APPEND) {
    return Math.min(
      state.settings.maxPatternLength,
      state.appendTargetLength || (state.activeSequence.length + (state.settings.patternAppendCount || 1))
    );
  }
  if (state.phase === PHASES.OWNER_REPLAY || state.phase === PHASES.CHALLENGER_COPY || state.phase === PHASES.SIGNAL_PLAYBACK) {
    return state.activeSequence.length;
  }
  return Math.max(state.activeSequence.length, state.settings.startingPatternLength);
}

export function getProgressCountForPhase(state, now = performance.now()) {
  if (state.phase === PHASES.OWNER_CREATE_INITIAL) return state.ownerDraft.length;
  if (state.phase === PHASES.OWNER_REPLAY) return state.ownerReplayIndex || 0;
  if (state.phase === PHASES.OWNER_APPEND) return state.activeSequence.length;
  if (state.phase === PHASES.CHALLENGER_COPY) return Number(getLocalCopyProgress(state)?.index || 0);
  if (state.phase === PHASES.SIGNAL_PLAYBACK && state.playback) {
    const elapsed = Math.max(0, now - Number(state.playback.startedAt || now));
    const perInputMs = Number(state.playback.perInputMs || 570);
    return Math.min(state.activeSequence.length, Math.floor(elapsed / perInputMs) + 1);
  }
  return 0;
}

export function buildInputModeState(state) {
  const owner = getOwner(state);
  const ownerName = owner?.name || "Driver";
  const ownerLocal = isLocalOwner(state);

  if (state.phase === PHASES.OWNER_CREATE_INITIAL) {
    return ownerLocal
      ? { label: "CREATE STARTING SIGNAL", detail: `${state.ownerDraft.length}/${state.settings.startingPatternLength}`, className: "mode-owner-append", locked: false }
      : { label: `WATCH ${ownerName}`, detail: "Memorize the signal", className: "mode-watch", locked: true };
  }

  if (state.phase === PHASES.OWNER_REPLAY) {
    return ownerLocal
      ? { label: "REPLAY YOUR SIGNAL", detail: `${state.ownerReplayIndex || 0}/${state.activeSequence.length}`, className: "mode-owner-replay", locked: false }
      : { label: `WATCH ${ownerName}`, detail: "Driver can drop control here", className: "mode-watch", locked: true };
  }

  if (state.phase === PHASES.OWNER_APPEND) {
    const target = Math.min(
      state.settings.maxPatternLength,
      state.appendTargetLength || (state.activeSequence.length + (state.settings.patternAppendCount || 1))
    );
    const remaining = Math.max(1, target - state.activeSequence.length);
    const label = remaining === 1 ? "ADD 1 NEW INPUT" : `ADD ${remaining} NEW INPUTS`;
    return ownerLocal
      ? { label, detail: `${state.activeSequence.length}/${target}`, className: "mode-owner-append", locked: false }
      : { label: `WATCH ${ownerName}`, detail: `${remaining} new input${remaining === 1 ? "" : "s"} incoming`, className: "mode-watch", locked: true };
  }

  if (state.phase === PHASES.SIGNAL_PLAYBACK) {
    return { label: "MEMORIZE", detail: `${state.activeSequence.length} inputs`, className: "mode-playback", locked: true };
  }

  if (state.phase === PHASES.RESULT_REVEAL) {
    return { label: "ECHO THINKING", detail: `${state.activeSequence.length} inputs next`, className: "mode-watch", locked: true };
  }

  if (state.phase === PHASES.CHALLENGER_COPY) {
    const progress = getLocalCopyProgress(state);
    const isCopying = !ownerLocal && progress?.status === "copying";
    return isCopying
      ? { label: "COPY THE SIGNAL", detail: `${progress.index || 0}/${state.activeSequence.length}`, className: "mode-challenger-copy", locked: false }
      : { label: "WATCH RESULTS", detail: "Input locked", className: "mode-watch", locked: true };
  }

  return { label: "WATCH", detail: "", className: "mode-watch", locked: true };
}

export function getRoleLabel(state, player) {
  const owner = getOwner(state);
  if (owner?.id === player.id) return "Driver";
  const progress = state.copyProgress?.[player.id];
  if (state.phase === PHASES.CHALLENGER_COPY && progress) {
    if (progress.status === "safe") return "Safe";
    if (progress.status === "fail") return "Failed";
    return `Copying ${progress.index}/${state.activeSequence.length}`;
  }
  return "Challenger";
}

function getLocalPlayer(state) {
  const localId = getLocalPlayerId(state);
  if (!localId) return null;
  return state.players.find((player) => player.id === localId || player.clientId === localId) || null;
}

export function shouldShowLoserCallout(state) {
  const winner = state.players.find((player) => player.id === state.winnerId);
  const local = getLocalPlayer(state);

  if (local) {
    return !winner || (local.id !== winner.id && local.clientId !== winner.clientId);
  }

  // Local/hotseat mode has no single client identity. Show the payoff once if anyone lost.
  return state.mode !== "online" && state.players.some((player) => player.eliminated);
}
