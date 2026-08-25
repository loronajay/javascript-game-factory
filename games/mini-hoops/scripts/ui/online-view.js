import { BALLS } from "../assets/ball-catalog.js";
import { LOCATIONS } from "../assets/location-catalog.js";
import { ROUND_DURATIONS } from "../sim/constants.js";
import { HOOP_MODES } from "../sim/hoop.js";
import { normalizeRoomCode } from "../multiplayer/online-client.js";
import { normalizeMatchConfig } from "../multiplayer/match-config.js";

function options(select, values, valueOf, labelOf) {
  select?.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = valueOf(value);
    option.textContent = labelOf(value);
    return option;
  }));
}

export function createOnlineView(root, callbacks = {}) {
  const configInputs = {
    modeId: root.querySelector("#onlineMode"),
    duration: root.querySelector("#onlineDuration"),
    ballId: root.querySelector("#onlineBall"),
    locationId: root.querySelector("#onlineLocation"),
  };
  options(configInputs.modeId, HOOP_MODES, (item) => item.id, (item) => item.label);
  options(configInputs.duration, ROUND_DURATIONS, String, (item) => item === 60 ? "1 minute" : `${item} seconds`);
  options(configInputs.ballId, BALLS, (item) => item.id, (item) => item.label);
  options(configInputs.locationId, LOCATIONS, (item) => item.id, (item) => item.label);

  const readConfig = () => normalizeMatchConfig({
    modeId: configInputs.modeId?.value,
    duration: Number(configInputs.duration?.value),
    ballId: configInputs.ballId?.value,
    locationId: configInputs.locationId?.value,
  });
  Object.values(configInputs).forEach((input) => input?.addEventListener("change", () => callbacks.onConfig?.(readConfig())));
  root.querySelector("#onlineQuick")?.addEventListener("click", () => callbacks.onQuick?.(readConfig()));
  root.querySelector("#onlineCreate")?.addEventListener("click", () => callbacks.onCreate?.(readConfig()));
  root.querySelector("#onlineJoin")?.addEventListener("click", () => callbacks.onJoin?.(normalizeRoomCode(root.querySelector("#onlineRoomInput")?.value)));
  root.querySelector("#onlineStart")?.addEventListener("click", () => callbacks.onStart?.());
  root.querySelector("#onlineLeave")?.addEventListener("click", () => callbacks.onLeave?.());
  root.querySelector("#onlineRoomInput")?.addEventListener("input", (event) => { event.target.value = normalizeRoomCode(event.target.value); });

  return {
    render({ snapshot, config, identity, rating }) {
      const lobby = snapshot?.lobby;
      const effective = normalizeMatchConfig(lobby?.settings || config);
      for (const [key, input] of Object.entries(configInputs)) if (input) input.value = String(effective[key]);
      const isOwner = Boolean(lobby && lobby.ownerId === snapshot.clientId);
      const configLocked = Boolean(lobby && !isOwner);
      Object.values(configInputs).forEach((input) => { if (input) input.disabled = configLocked || Boolean(lobby && lobby.status !== "open"); });

      const name = root.querySelector("#onlineAccountName");
      const record = root.querySelector("#onlineRecord");
      if (name) name.textContent = identity?.displayName || "Factory Player";
      if (record) record.textContent = rating ? `${rating.wins}W ${rating.losses}L ${rating.draws}D · ${rating.rating} ELO` : "Factory record loading…";

      const code = root.querySelector("#onlineRoomCode");
      if (code) code.textContent = lobby?.roomCode || "-----";
      const status = root.querySelector("#onlineStatus");
      if (status) status.textContent = snapshot?.error?.message
        || (snapshot?.status === "searching" ? "Quick Search: finding an opponent…"
          : snapshot?.status === "creating" ? "Opening private room…"
            : snapshot?.status === "joining" ? "Joining private room…"
              : lobby ? (lobby.playerCount >= 2 ? "Both players ready. The host can start." : "Waiting for Player 2…")
                : "Choose Quick Search or open a private room.");
      const players = root.querySelector("#onlinePlayers");
      if (players) {
        const rows = lobby?.players?.length ? lobby.players : [{ name: identity?.displayName || "You" }];
        players.replaceChildren(...[0, 1].map((index) => {
          const article = document.createElement("article");
          article.className = "online-player";
          const player = rows[index];
          article.innerHTML = player
            ? `<strong>${player.name}</strong><span>${index === 0 && isOwner ? "Host" : "Ready"}</span>`
            : "<strong>Open slot</strong><span>Waiting</span>";
          return article;
        }));
      }
      const start = root.querySelector("#onlineStart");
      if (start) start.hidden = !isOwner || lobby?.playerCount < 2 || lobby?.status !== "open";
      root.querySelector("#onlinePairing").hidden = Boolean(lobby);
      root.querySelector("#onlineLobbyPanel").hidden = !lobby;
    },
  };
}
