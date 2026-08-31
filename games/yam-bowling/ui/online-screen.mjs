import { $, setSelected } from "./dom.mjs";
import { renderSkinOptions } from "./skin-options.mjs";
import { buildCompactIdentityModel } from "../profile/public-profile-model.mjs";
import { compactIdentityCardMarkup } from "./compact-identity-card.mjs";

// The online bowler picker and the lobby it leads into. This module paints what
// the server reports; it does not connect, queue, or start a match - that is the
// online session's job, reached through `onBegin`.
export function createOnlineScreen({
  session,
  roster,
  animation,
  cosmetics,
  assets,
  loadout,
  campaign,
  onlineIdentity,
  normalizeRoomCode,
  publicProfiles,
  onOpenProfile,
  onInspect,
  onBegin,
  onLeave,
}) {
  const { onlineSetup } = session;
  let latestLobbySnapshot = null;

  // Online is the scored track: a finished online match files a record and XP
  // against the bowler that played it, so a bowler this account has not
  // unlocked must not be able to take the lane. The card stays visible and
  // locked rather than hidden, the same rule the skin strip uses - a reward
  // nobody can see is a reward nobody plays for.
  function ownedSlugs() {
    return new Set(campaign.getUnlockedBowlerSlugs());
  }

  function resolveOwnedSlug(preferred, owned) {
    if (owned.has(preferred)) return preferred;
    return roster.find((bowler) => owned.has(bowler.slug))?.slug || roster[0].slug;
  }

  function renderSetup() {
    // A revoked entitlement or a sign-out can strip the bowler that was already
    // chosen, so the selection is re-resolved against ownership on every paint.
    const owned = ownedSlugs();
    onlineSetup.characterSlug = resolveOwnedSlug(onlineSetup.characterSlug, owned);
    onlineSetup.skinId = assets.storedSkinId(onlineSetup.characterSlug);
    setSelected($("online-style-options"), "data-online-style", onlineSetup.bowlingStyle || "arcade");
    $("online-style-note").textContent = onlineSetup.bowlingStyle === "3d"
      ? "Full 3D pin physics, scored by the server. Both bowlers share the same rack. Requires WebGL 2."
      : "The original 2D lane. Private-room guests use the host's bowling style.";
    setSelected($("online-mode-options"), "data-online-mode", onlineSetup.modeId);
    setSelected($("online-stakes-options"), "data-online-stakes", onlineSetup.ranked ? "ranked" : "casual");
    $("online-stakes-note").textContent = onlineSetup.ranked
      ? "Ranked matches move your Factory rating and win/loss record — and your opponent's."
      : "Casual matches still earn XP and bowler mastery. Nothing touches your Factory record.";
    const bowler = assets.bowlerBySlug(onlineSetup.characterSlug);
    $("online-selected-bowler").textContent = bowler.name;
    $("online-account-name").textContent = onlineIdentity.displayName || "Player";
    for (const card of $("online-character-grid").querySelectorAll(".character-card")) {
      const selected = card.dataset.slug === onlineSetup.characterSlug;
      const locked = !owned.has(card.dataset.slug);
      card.classList.toggle("is-selected", selected);
      card.classList.toggle("is-locked", locked);
      card.setAttribute("aria-selected", String(selected));
      // Locked cards stay clickable so the click can explain itself; a disabled
      // button would swallow the event and say nothing.
      card.setAttribute("aria-disabled", String(locked));
    }
    $("online-roster-count").textContent = `${owned.size} / ${roster.length} unlocked`;
    renderSkinOptions({
      containerId: "online-skin-options",
      slug: onlineSetup.characterSlug,
      selectedSkinId: onlineSetup.skinId,
      animation,
      assets,
      loadout,
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
    if (snapshot.disconnectedClientId) return "Opponent disconnected. Holding their lane for 30 seconds...";
    if (snapshot.status === "searching") return "Searching for an opponent on the public lanes...";
    if (snapshot.status === "creating") return "Opening your private lane...";
    if (snapshot.status === "joining") return "Joining the private lane...";
    if (snapshot.status === "reconnecting") return "Connection lost. Rejoining your lane...";
    if (snapshot.status === "lobby") {
      return snapshot.lobby?.playerCount >= 2
        ? "Both bowlers are here. Starting match..."
        : "Waiting for the second bowler...";
    }
    return "Connecting to Factory Network...";
  }

  function renderLobby(snapshot) {
    latestLobbySnapshot = snapshot;
    const lobby = snapshot.lobby;
    const roomCode = lobby?.roomCode || snapshot.matchState?.roomCode || "";
    const privateRoom = lobby?.isPrivate === true
      || onlineSetup.intent === "private-create"
      || onlineSetup.intent === "private-join";
    // The stakes shown are the room's, not this device's pick: a player joining
    // by code takes the stakes the room was opened with, so the toggle they left
    // behind on the setup screen must not be what the lobby card claims. Before
    // the server has answered there is no room yet, and the local intent is the
    // only honest thing to show.
    const ranked = snapshot.matchState
      ? snapshot.matchState.ranked === true
      : lobby?.settings
        ? lobby.settings.ranked === true
        : onlineSetup.ranked === true;
    const style = snapshot.matchState ? snapshot.matchState.match?.bowlingStyle
      : lobby?.settings ? lobby.settings.bowlingStyle : onlineSetup.bowlingStyle;
    $("online-lobby-kind").textContent = `${style === "3d" ? "3D Bowl · " : ""}${privateRoom ? "Private room" : "Quick match"} · ${ranked ? "Ranked" : "Casual"}`;
    $("online-lobby-title").textContent = lobby?.playerCount >= 2
      ? "Match found"
      : roomCode
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
    host.innerHTML = playerCards(snapshot).map((player, index) => {
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
      const playerId = player.accountPlayerId || player.playerId || "";
      const profile = publicProfiles.peek(playerId);
      if (playerId && !publicProfiles.has(playerId)) {
        publicProfiles.load(playerId, player.name).then(() => {
          if (latestLobbySnapshot) renderLobby(latestLobbySnapshot);
        });
      }
      const model = buildCompactIdentityModel({
        profile,
        matchPlayer: { ...player, playerId, characterSlug: slug, skinId },
        animation,
        cosmetics,
      });
      return compactIdentityCardMarkup(model, {
        local,
        connected: player.connected !== false && snapshot.disconnectedClientId !== player.id,
        inspectable: !local && Boolean(playerId),
      });
    }).join("");
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
      card.innerHTML = `<img src="${assets.characterPortrait(bowler.slug)}" alt="" loading="lazy"><span>${bowler.name}</span><i></i><b>Locked</b>`;
      card.addEventListener("click", () => {
        // Ownership is re-read on the click rather than captured at build time,
        // because a circuit clear or a sign-in can unlock a bowler mid-session.
        if (!ownedSlugs().has(bowler.slug)) {
          $("online-menu-status").textContent = `${bowler.name} is locked. Win their circuit match to bowl as them online.`;
          $("online-menu-status").classList.remove("is-error");
          return;
        }
        onlineSetup.characterSlug = bowler.slug;
        onlineSetup.skinId = assets.storedSkinId(bowler.slug);
        renderSetup();
      });
      grid.appendChild(card);
    }
  }

  function bind() {
    $("online-style-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-online-style]");
      if (!button) return;
      onlineSetup.bowlingStyle = button.dataset.onlineStyle === "3d" ? "3d" : "arcade";
      renderSetup();
    });
    $("online-mode-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-online-mode]");
      if (!button) return;
      onlineSetup.modeId = button.dataset.onlineMode;
      renderSetup();
    });
    $("online-stakes-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-online-stakes]");
      if (!button) return;
      onlineSetup.ranked = button.dataset.onlineStakes === "ranked";
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
    $("online-lobby-players").addEventListener("click", (event) => {
      const button = event.target.closest("[data-public-profile-id]");
      if (button) onOpenProfile(button.dataset.publicProfileId, button.dataset.publicProfileName, button);
    });
    $("online-inspect-bowler-button").addEventListener("click", (event) => {
      onInspect(onlineSetup.characterSlug, event.currentTarget);
    });
  }

  return { build, renderSetup, renderLobby, bind };
}
