// The Online panel both Pet Games events share: sign in, find or make a room,
// see who is in it and what they are bringing, and (as host) set the race up.
//
// Built once and patched on every state change — never rebuilt — so a room
// code being typed keeps its focus and a select being opened stays open.
// It knows nothing about sockets: the cabinet hands it state and callbacks.

import { speciesStyle } from "../pets.js";

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className, label, onClick) {
  const node = el("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

const BUSY = {
  connecting: "Reaching the Factory Network…",
  connected: "Connected.",
  searching: "Looking for a room to join…",
  creating: "Opening a private room…",
  joining: "Joining the room…",
  reconnecting: "Connection lost · rejoining…",
};

/**
 * `options`: { eventNoun ("race"), settings: [{ key, label, options: [{ value, label }] }],
 *   onQuick, onCreate, onJoin(code), onStart, onLeave, onSetting(key, value), onSignIn, onBack }
 */
export function createOnlinePanel(root, options) {
  const noun = options.eventNoun ?? "match";
  root.replaceChildren();
  root.classList.add("online-panel");

  const head = el("div", "online-panel__head");
  head.append(el("span", "event-chip", "ONLINE · FARM FRIENDS"), el("h2", "", "Race your"), el("p", "lede", ""));
  head.querySelector("h2").innerHTML = `Play with<br><em>other farms.</em>`;
  head.querySelector(".lede").textContent = `Bring your pet into a room of up to ${options.maxPlayers ?? 8}. The Factory Network runs every ${noun}, so nobody's connection decides who won.`;
  const record = el("p", "online-record", "");

  // Signed out.
  const gate = el("section", "online-panel__gate");
  const gateText = el("p", "online-note", "");
  gate.append(gateText, button("primary", "Sign in to play online", () => options.onSignIn?.()));

  // Idle: find, make or join a room.
  const idle = el("section", "online-panel__idle");
  const modes = el("div", "online-modes");
  modes.append(
    button("mode-card", "", () => options.onQuick?.()),
    button("mode-card", "", () => options.onCreate?.()),
  );
  modes.children[0].innerHTML = `<b>Quick match</b><small>Join the next open room</small>`;
  modes.children[1].innerHTML = `<b>Private room</b><small>Get a code for friends</small>`;
  const join = el("form", "online-join");
  const code = el("input", "online-join__code");
  code.placeholder = "ROOM CODE";
  code.maxLength = 8;
  code.autocomplete = "off";
  code.setAttribute("aria-label", "Room code");
  code.addEventListener("input", () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  const joinButton = el("button", "secondary", "Join");
  joinButton.type = "submit";
  join.append(code, joinButton);
  join.addEventListener("submit", (event) => {
    event.preventDefault();
    if (code.value.trim()) options.onJoin?.(code.value.trim());
  });
  idle.append(modes, join);

  // Waiting on the network.
  const busy = el("section", "online-panel__busy");
  const busyText = el("p", "online-note online-note--pulse", "");
  busy.append(busyText, button("secondary", "Cancel", () => options.onLeave?.()));

  // In a room.
  const room = el("section", "online-panel__room");
  const roomHead = el("div", "room-head");
  const roomCode = el("strong", "room-code", "");
  const roomMeta = el("small", "room-meta", "");
  roomHead.append(el("span", "kicker", "ROOM"), roomCode, roomMeta);
  const roster = el("ol", "room-roster");
  const settings = el("div", "room-settings");
  const selects = new Map();
  for (const spec of options.settings ?? []) {
    const label = el("label", "race-options");
    const select = el("select");
    for (const choice of spec.options) {
      const option = el("option", "", choice.label);
      option.value = String(choice.value);
      select.append(option);
    }
    select.addEventListener("change", () => options.onSetting?.(spec.key, spec.parse ? spec.parse(select.value) : select.value));
    label.append(el("span", "", spec.label), select);
    settings.append(label);
    selects.set(spec.key, select);
  }
  const roomNote = el("p", "online-note", "");
  const startButton = button("primary", `Start the ${noun}`, () => options.onStart?.());
  const roomActions = el("div", "room-actions");
  roomActions.append(startButton, button("secondary", "Leave room", () => options.onLeave?.()));
  room.append(roomHead, roster, settings, roomNote, roomActions);

  const error = el("p", "online-error", "");
  const back = button("secondary online-back", "← Back", () => options.onBack?.());
  root.append(head, record, gate, idle, busy, room, error, back);

  const show = (section) => {
    for (const node of [gate, idle, busy, room]) node.hidden = node !== section;
  };

  return {
    /** `view`: { signedIn, gateMessage, client (lobby client state), recordText } */
    render(view) {
      record.textContent = view.recordText ?? "";
      record.hidden = !view.recordText;
      const client = view.client ?? { status: "idle" };
      error.textContent = client.error && client.error.code !== "CONNECTION_LOST" ? client.error.message : "";
      back.hidden = client.status !== "idle";

      if (!view.signedIn) {
        gateText.textContent = view.gateMessage || "Sign in to your Factory account to race other players.";
        show(gate);
        return;
      }
      if (client.status === "lobby" && client.lobby) {
        show(room);
        const lobby = client.lobby;
        const host = lobby.ownerId === client.clientId;
        roomCode.textContent = lobby.roomCode;
        roomMeta.textContent = `${lobby.isPrivate ? "Private room · share the code" : "Quick match room"} · ${lobby.playerCount}/${lobby.maxPlayers}`;
        roster.replaceChildren(...lobby.players.map((player) => {
          const row = el("li", player.id === client.clientId ? "is-me" : "");
          const style = speciesStyle(player.pet?.speciesId);
          const dot = el("i", "pet-dot");
          dot.style.color = style.color;
          dot.style.background = style.color;
          const who = el("span", "roster-name", player.name);
          const pet = el("small", "roster-pet", player.pet ? `${player.pet.name} · ${style.title}` : "choosing a pet…");
          row.append(dot, who, pet);
          if (player.id === lobby.ownerId) row.append(el("b", "roster-host", "HOST"));
          return row;
        }));
        for (const [key, select] of selects) {
          const value = lobby.settings?.[key];
          if (value !== undefined && document.activeElement !== select) select.value = String(value);
          select.disabled = !host;
        }
        settings.classList.toggle("is-guest", !host);
        const enough = lobby.playerCount >= lobby.minPlayers;
        startButton.hidden = !host;
        startButton.disabled = !enough;
        roomNote.textContent = host
          ? enough ? `Everyone in? Start when ready.` : `Waiting for at least ${lobby.minPlayers} players…`
          : `Waiting for the host to start the ${noun}.`;
        return;
      }
      if (BUSY[client.status]) {
        busyText.textContent = BUSY[client.status];
        show(busy);
        return;
      }
      show(idle);
    },
    focusCode() { code.focus(); },
  };
}
