// The lobby panel, drawn from one snapshot.
//
// The same contract the HUD keeps: it takes state and writes text, and it never
// reads a class back off an element to decide anything. Which button is live is
// a question about the lobby, not about the page.
//
// It owns no network code and no match code. Every button hands out through a
// callback, so this file can be pointed at a stub in a test and the client can
// be driven without a document.

import { RACE_LENGTHS, describeRace, normalizeMatchConfig } from "../multiplayer/match-config.js";
import { normalizeRoomCode } from "../multiplayer/online-client.js";

export function createOnlineView(elements, callbacks = {}) {
  const readConfig = () => normalizeMatchConfig({ raceTo: Number(elements.onlineRace?.value) });

  elements.onlineRace?.addEventListener("change", () => {
    paintRaceNote();
    callbacks.onConfig?.(readConfig());
  });

  elements.onlineQuick?.addEventListener("click", () => callbacks.onQuick?.(readConfig()));
  elements.onlineCreate?.addEventListener("click", () => callbacks.onCreate?.(readConfig()));
  elements.onlineJoin?.addEventListener("click", () =>
    callbacks.onJoin?.(normalizeRoomCode(elements.onlineRoomInput?.value)));
  elements.onlineStart?.addEventListener("click", () => callbacks.onStart?.());
  elements.onlineLeave?.addEventListener("click", () => callbacks.onLeave?.());
  elements.onlineBack?.addEventListener("click", () => callbacks.onBack?.());

  // A room code is upper-case and alphanumeric wherever it is written down, so
  // the field is corrected as it is typed rather than validated after the fact.
  elements.onlineRoomInput?.addEventListener("input", (event) => {
    event.target.value = normalizeRoomCode(event.target.value);
  });

  function paintRaceNote() {
    if (elements.onlineRaceNote) elements.onlineRaceNote.textContent = describeRace(Number(elements.onlineRace?.value)).note;
  }

  paintRaceNote();

  return {
    readConfig,

    /**
     * @param snapshot the online client's snapshot
     * @param identity the signed-in account, for the name at the top
     */
    render({ snapshot, identity, signedIn = true }) {
      const lobby = snapshot?.lobby;
      const inLobby = Boolean(lobby);
      const isOwner = Boolean(lobby && lobby.ownerId === snapshot.clientId);
      const full = (lobby?.playerCount || 0) >= 2;

      if (elements.onlineAccountName) {
        elements.onlineAccountName.textContent = signedIn
          ? identity?.displayName || "Factory player"
          : "Not signed in";
      }

      // The host owns the settings; a guest reads them. Locking rather than
      // hiding, so a guest can see what they have joined.
      if (elements.onlineRace) {
        if (lobby) elements.onlineRace.value = String(normalizeMatchConfig(lobby.settings).raceTo);
        elements.onlineRace.disabled = inLobby && (!isOwner || lobby.status !== "open");
      }
      paintRaceNote();

      if (elements.onlinePairing) elements.onlinePairing.hidden = inLobby;
      if (elements.onlineLobbyPanel) elements.onlineLobbyPanel.hidden = !inLobby;
      if (elements.onlineRoomCode) elements.onlineRoomCode.textContent = lobby?.roomCode || "-----";

      if (elements.onlinePlayers) {
        const rows = lobby?.players || [];
        elements.onlinePlayers.replaceChildren(...[0, 1].map((index) => {
          const article = document.createElement("article");
          article.className = "online-player";
          const player = rows[index];
          const name = document.createElement("strong");
          const role = document.createElement("span");
          if (player) {
            name.textContent = player.name;
            role.textContent = player.id === lobby.ownerId ? "Host · breaks first" : "Ready";
            article.classList.toggle("you", player.id === snapshot.clientId);
          } else {
            name.textContent = "Open seat";
            role.textContent = "Waiting";
            article.classList.add("empty");
          }
          article.append(name, role);
          return article;
        }));
      }

      if (elements.onlineStart) {
        // Only the host starts, and only with both seats filled. Hidden rather
        // than disabled for a guest: it is not their button to be denied.
        elements.onlineStart.hidden = !inLobby || !isOwner;
        elements.onlineStart.disabled = !full || lobby?.status !== "open";
      }

      if (elements.onlineStatus) elements.onlineStatus.textContent = statusLine(snapshot, { inLobby, isOwner, full, signedIn });
    },
  };
}

function statusLine(snapshot, { inLobby, isOwner, full, signedIn }) {
  if (snapshot?.error?.message) return snapshot.error.message;
  // Said once, up front. An online opponent is a Factory account, which is what
  // makes them the same person twice and what a rating would later hang off.
  if (!signedIn && !inLobby) return "Online play needs a Factory account. Quick search or a private room will take you to sign in.";
  switch (snapshot?.status) {
    case "searching":
      return "Quick search · looking for an opponent…";
    case "creating":
      return "Opening a private room…";
    case "joining":
      return "Joining that room…";
    case "connecting":
      return "Reaching the Factory Network…";
    case "reconnecting":
      return "Connection lost · rejoining the table…";
    default:
      break;
  }
  if (!inLobby) return "Choose Quick search, or open a private room and share the code.";
  if (!full) return "Waiting for a second player · share the room code.";
  return isOwner ? "Both seats filled. Break when you are ready." : "Both seats filled. Waiting on the host to break.";
}

export { RACE_LENGTHS };
