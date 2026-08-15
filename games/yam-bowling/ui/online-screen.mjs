import { $, escapeHtml, setSelected } from "./dom.mjs";
import { renderSkinOptions } from "./skin-options.mjs";

// The online bowler picker and the lobby it leads into. This module paints what
// the server reports; it does not connect, queue, or start a match — that is the
// online session's job, reached through `onBegin`.
export function createOnlineScreen({
  session,
  roster,
  animation,
  assets,
  onlineIdentity,
  normalizeRoomCode,
  onInspect,
  onBegin,
  onLeave,
}) {
  const { onlineSetup } = session;

  function renderSetup() {
    setSelected($("online-mode-options"), "data-online-mode", onlineSetup.modeId);
    const bowler = assets.bowlerBySlug(onlineSetup.characterSlug);
    $("online-selected-bowler").textContent = bowler.name;
    $("online-account-name").textContent = onlineIdentity.displayName || "Player";
    for (const card of $("online-character-grid").querySelectorAll(".character-card")) {
      const selected = card.dataset.slug === onlineSetup.characterSlug;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-selected", String(selected));
    }
    renderSkinOptions({
      containerId: "online-skin-options",
      slug: onlineSetup.characterSlug,
      selectedSkinId: onlineSetup.skinId,
      animation,
      assets,
      onEquip: (skinId) => {
        onlineSetup.skinId = skinId;
        renderSetup();
      },
    });
    $("online-inspect-bowler-button").textContent = `Inspect ${bowler.name}`;
  }

  function playerCards(snapshot) {
    const players = snapshot?.matchState?.match?.players || snapshot?.lobby?.players || [];
    if (!players.length) {
      return [{
        id: snapshot?.clientId || "local",
        name: onlineIdentity.displayName || "Player",
        characterSlug: onlineSetup.characterSlug,
        skinId: onlineSetup.skinId,
      }];
    }
    return players;
  }

  function statusFor(snapshot) {
    if (snapshot.error?.message) return snapshot.error.message;
    if (snapshot.disconnectedClientId) return "Opponent disconnected. Holding their lane for 30 seconds…";
    if (snapshot.status === "searching") return "Searching for an opponent on the public lanes…";
    if (snapshot.status === "creating") return "Opening your private lane…";
    if (snapshot.status === "joining") return "Joining the private lane…";
    if (snapshot.status === "reconnecting") return "Connection lost. Rejoining your lane…";
    if (snapshot.status === "lobby") {
      return snapshot.lobby?.playerCount >= 2
        ? "Both bowlers are here. Starting match…"
        : "Waiting for the second bowler…";
    }
    return "Connecting to Factory Network…";
  }

  function renderLobby(snapshot) {
    const lobby = snapshot.lobby;
    const roomCode = lobby?.roomCode || snapshot.matchState?.roomCode || "";
    const privateRoom = lobby?.isPrivate === true
      || onlineSetup.intent === "private-create"
      || onlineSetup.intent === "private-join";
    $("online-lobby-kind").textContent = privateRoom ? "Private room" : "Quick match";
    $("online-lobby-title").textContent = roomCode
      ? (privateRoom ? "Room ready" : "Opponent search")
      : "Finding a lane";
    $("online-room-code-wrap").hidden = !roomCode || !privateRoom;
    $("online-room-code").textContent = roomCode || "-----";

    $("online-status").textContent = statusFor(snapshot);
    $("online-status").classList.toggle(
      "is-error",
      Boolean(snapshot.error && snapshot.error.code !== "CONNECTION_LOST"),
    );
    $("online-menu-status").textContent = snapshot.error?.message || "Choose a bowler, then find a lane.";
    $("online-menu-status").classList.toggle("is-error", Boolean(snapshot.error));

    const host = $("online-lobby-players");
    host.innerHTML = "";
    playerCards(snapshot).forEach((player, index) => {
      const local = player.id === snapshot.clientId;
      // Remote looks arrive over the wire, so resolve them against the local
      // roster and skin catalog rather than trusting them into an asset path.
      const fallbackSlug = local
        ? onlineSetup.characterSlug
        : (index === 0 ? "daisy-monroe" : "nia-brooks");
      const slug = assets.bowlerBySlug(player.characterSlug || fallbackSlug).slug;
      const skinId = animation.normalizeSkinId(
        player.skinId || (local ? onlineSetup.skinId : animation.DEFAULT_SKIN_ID),
      );
      const card = document.createElement("article");
      card.className = `online-player-card${local ? " is-you" : ""}${player.connected === false ? " is-disconnected" : ""}`;
      card.innerHTML = `<img src="${assets.characterPortrait(slug, skinId)}" alt=""><span><strong>${escapeHtml(player.name || `Player ${index + 1}`)}</strong><small>${player.connected === false ? "Reconnecting" : local ? "You · Ready" : "Ready"}</small></span>`;
      host.appendChild(card);
    });
    while (host.children.length < 2) {
      const waiting = document.createElement("article");
      waiting.className = "online-player-card";
      waiting.innerHTML = `<img src="${assets.characterPortrait("nia-brooks")}" alt=""><span><strong>Open lane</strong><small>Waiting for player</small></span>`;
      host.appendChild(waiting);
    }
  }

  function build() {
    const grid = $("online-character-grid");
    for (const bowler of roster) {
      const card = document.createElement("button");
      card.className = "character-card";
      card.type = "button";
      card.dataset.slug = bowler.slug;
      card.setAttribute("role", "option");
      card.innerHTML = `<img src="${assets.characterPortrait(bowler.slug)}" alt="" loading="lazy"><span>${bowler.name}</span><i></i>`;
      card.addEventListener("click", () => {
        onlineSetup.characterSlug = bowler.slug;
        onlineSetup.skinId = assets.storedSkinId(bowler.slug);
        renderSetup();
      });
      grid.appendChild(card);
    }
  }

  function bind() {
    $("online-mode-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-online-mode]");
      if (!button) return;
      onlineSetup.modeId = button.dataset.onlineMode;
      renderSetup();
    });
    $("quick-match-button").addEventListener("click", () => onBegin("quick"));
    $("create-room-button").addEventListener("click", () => onBegin("private-create"));
    $("join-room-button").addEventListener("click", () => onBegin("private-join"));
    $("join-room-code").addEventListener("input", (event) => {
      event.target.value = normalizeRoomCode(event.target.value);
      $("online-menu-status").classList.remove("is-error");
    });
    $("join-room-code").addEventListener("keydown", (event) => {
      if (event.key === "Enter") onBegin("private-join");
    });
    $("copy-room-code").addEventListener("click", async () => {
      const code = $("online-room-code").textContent;
      await navigator.clipboard?.writeText?.(code).catch(() => {});
      $("copy-room-code").textContent = "Copied";
      setTimeout(() => { $("copy-room-code").textContent = "Copy code"; }, 1200);
    });
    $("leave-online-button").addEventListener("click", onLeave);
    $("online-inspect-bowler-button").addEventListener("click", (event) => {
      onInspect(onlineSetup.characterSlug, event.currentTarget);
    });
  }

  return { build, renderSetup, renderLobby, bind };
}
