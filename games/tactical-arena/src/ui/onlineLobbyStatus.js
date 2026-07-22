// Pure derivation of the lobby's Start button + status-hint state, split out of
// onlineFlow.js's syncStart. The controller still computes the booleans that depend on
// live lobby helpers (full/locked/draftDone/…) and applies the result to the DOM; this
// module owns the branchy decision of what the owner/joiner sees, so that logic is
// testable in isolation. Returns { startHidden, startDisabled, hintHidden, hintText }.

import { currentBanSeat, currentDraftSeat, isBanPhaseComplete } from "./draftModel.js";

function ownerHint(vm) {
  const {
    full, count, maxPlayers, matchLabel, draftMode, draftDone, draftReady,
    rankedMode, draft, localSeat, draftPlayerLabel, localLocked, missingLocks, locked,
  } = vm;
  if (!full) {
    const remaining = maxPlayers - count;
    return `Waiting for ${remaining} more player${remaining === 1 ? "" : "s"} for ${matchLabel}.`;
  }
  if (draftMode && !draftDone) {
    if (rankedMode && draft && !isBanPhaseComplete(draft)) {
      const banSeat = currentBanSeat(draft);
      return banSeat === localSeat ? "Your ban is up." : `Waiting for ${draftPlayerLabel(banSeat)} to ban.`;
    }
    const seat = currentDraftSeat(draft);
    return seat === localSeat ? "Your draft pick is up." : `Waiting for ${draftPlayerLabel(seat)} to draft.`;
  }
  if (draftMode && !draftReady) {
    return localLocked
      ? `Waiting for ${missingLocks} formation lock-in${missingLocks === 1 ? "" : "s"}.`
      : "Arrange and lock your formation.";
  }
  if (!locked) {
    return `Waiting for ${missingLocks} squad lock-in${missingLocks === 1 ? "" : "s"}.`;
  }
  return "";
}

function joinerHint({ draftMode, draftDone, locked, localLocked }) {
  return draftMode
    ? (!draftDone ? "Draft your squad, then arrange formation." : localLocked ? "Formation locked. Waiting for the host to start..." : "Arrange and lock your formation.")
    : localLocked
    ? (locked ? "Locked in. Waiting for the host to start..." : "Locked in. Waiting for the other squad lock-ins...")
    : "Lock in when your squad is ready.";
}

export function deriveLobbyStartView(vm) {
  const { isOwner, full, locked } = vm;
  const startHidden = !isOwner;
  const startDisabled = !(isOwner && full && locked);
  if (isOwner) {
    return { startHidden, startDisabled, hintHidden: full && locked, hintText: ownerHint(vm) };
  }
  return { startHidden, startDisabled, hintHidden: false, hintText: joinerHint(vm) };
}
