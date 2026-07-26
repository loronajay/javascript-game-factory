// The friend-action button group shared by the friends panel and the player profile
// viewer. One place owns "what buttons does this relationship get, and what happens
// when you press one", so the two surfaces can never drift into offering different
// actions for the same relationship.
//
// Every press disables the button until the server answers, then re-renders from the
// relationship the server implies (taFriendsModel.nextRelationshipAfter). A failure
// restores the previous state and surfaces the reason — it never leaves a button
// stuck in "Adding…" or silently pretending it worked.
import { el } from "./domHelpers.js";
import {
  canBlockRelationship,
  nextRelationshipAfter,
  taRelationshipAction,
  taSocialErrorMessage,
} from "./taFriendsModel.js";

// Confirm-on-second-press for the destructive actions, so a misclick on a row can't
// silently drop a friendship.
const CONFIRM_LABELS = Object.freeze({
  remove: "Remove?",
  block: "Block?",
});

const ACTION_HINTS = Object.freeze({
  cancel: "Withdraw your friend request.",
  remove: "Remove this friend.",
  unblock: "Unblock this player.",
});

/**
 * Render the action buttons for one player into `host`.
 *
 * `client` is a taFriendsClient; `player` needs `playerId`, `relationship`, and
 * (for pending requests) `requestId`. `onChanged(relationship)` fires after any
 * successful action so the owning list can update its own state.
 */
export function renderTaSocialActions(host, { player, client, onChanged = () => {}, compact = false } = {}) {
  if (!host) return;
  const state = {
    playerId: player?.playerId || "",
    relationship: player?.relationship || "none",
    requestId: player?.requestId || null,
    pendingConfirm: null,
  };
  if (!state.playerId) return;

  const draw = () => {
    host.replaceChildren();
    const primary = taRelationshipAction(state.relationship);
    const status = el("span", "ta-social-action-status");

    const run = async (action, button, { confirmable = false } = {}) => {
      if (confirmable && state.pendingConfirm !== action) {
        state.pendingConfirm = action;
        button.textContent = CONFIRM_LABELS[action] || "Confirm?";
        button.classList.add("is-confirming");
        return;
      }
      state.pendingConfirm = null;
      const previousLabel = button.textContent;
      button.disabled = true;
      button.textContent = "…";
      status.textContent = "";

      const result = await invoke(client, action, state);
      const next = nextRelationshipAfter(action, result);
      if (!next) {
        button.disabled = false;
        button.textContent = previousLabel;
        button.classList.remove("is-confirming");
        status.textContent = result?.error
          ? taSocialErrorMessage(result.error)
          : "That didn't work. Try again in a moment.";
        return;
      }
      state.relationship = next;
      // A resolved request id is spent; a newly sent one comes back on the result.
      state.requestId = next === "request-sent" ? (result?.requestId || null) : null;
      draw();
      onChanged(next, result);
    };

    if (primary.action) {
      const button = el("button", `menu-btn ta-social-action${compact ? " is-compact" : ""}`, primary.label);
      button.type = "button";
      // "Requested" and "Friends" read as status, so say what pressing them does.
      if (ACTION_HINTS[primary.action]) button.title = ACTION_HINTS[primary.action];
      const destructive = primary.action === "remove";
      if (destructive) button.classList.add("is-destructive");
      button.addEventListener("click", () => { void run(primary.action, button, { confirmable: destructive }); });
      host.appendChild(button);
    } else {
      host.appendChild(el("span", "ta-social-action-note", primary.label));
    }

    // An incoming request gets Decline alongside Accept — otherwise the only way to
    // clear it would be to accept it.
    if (state.relationship === "request-received") {
      const decline = el("button", `menu-btn ghost ta-social-action${compact ? " is-compact" : ""}`, "Decline");
      decline.type = "button";
      decline.addEventListener("click", () => { void run("decline", decline); });
      host.appendChild(decline);
    }

    if (canBlockRelationship(state.relationship)) {
      const block = el("button", `menu-btn ghost ta-social-action is-destructive${compact ? " is-compact" : ""}`, "Block");
      block.type = "button";
      block.addEventListener("click", () => { void run("block", block, { confirmable: true }); });
      host.appendChild(block);
    }

    host.appendChild(status);
  };

  draw();
  return {
    get relationship() { return state.relationship; },
    refresh(relationship) {
      state.relationship = relationship || state.relationship;
      draw();
    },
  };
}

function invoke(client, action, state) {
  if (!client) return Promise.resolve(null);
  switch (action) {
    case "send": return client.sendRequest(state.playerId);
    case "accept": return client.acceptRequest(state.requestId);
    case "decline": return client.declineRequest(state.requestId);
    case "cancel": return client.cancelRequest(state.requestId);
    case "remove": return client.removeFriend(state.playerId);
    case "block": return client.blockPlayer(state.playerId);
    case "unblock": return client.unblockPlayer(state.playerId);
    default: return Promise.resolve(null);
  }
}
