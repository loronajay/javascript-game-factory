// The jukebox's own page: the record list a player picks from.
//
// Inside the Arcade Room's overlay it is a remote control — every click is a
// `postMessage` to the room, and the room answers with the state, which is the
// only thing this page renders. Opened on its own (no parent window) it plays
// the records itself through the same room player, so the page is a real
// jukebox either way and there is one list to maintain.

import {
  JUKEBOX_MESSAGE,
  JUKEBOX_TRACKS,
  findJukeboxTrack,
  isJukeboxState,
  jukeboxTracksByGame,
  type JukeboxCommand,
  type JukeboxState,
} from "./arcade-room-catalog/jukebox.mjs";
import { createRoomJukebox } from "./arcade-room-jukebox.mjs";

type Sink = Readonly<{ send: (command: JukeboxCommand) => void }>;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Jukebox page is missing ${selector}`);
  return element;
}

const list = requiredElement<HTMLElement>("#jukeboxList");
const nowTitle = requiredElement<HTMLElement>("#jukeboxNowTitle");
const nowGame = requiredElement<HTMLElement>("#jukeboxNowGame");
const nowState = requiredElement<HTMLElement>("#jukeboxNowState");
const toggleButton = requiredElement<HTMLButtonElement>("#jukeboxToggle");
const previousButton = requiredElement<HTMLButtonElement>("#jukeboxPrevious");
const nextButton = requiredElement<HTMLButtonElement>("#jukeboxNext");
const stopButton = requiredElement<HTMLButtonElement>("#jukeboxStop");
const count = requiredElement<HTMLElement>("#jukeboxCount");

const embedded = window.parent !== window;

function renderState(state: Readonly<{ trackId: string | null; playing: boolean }>): void {
  const track = state.trackId ? findJukeboxTrack(state.trackId) : undefined;
  nowTitle.textContent = track?.title ?? "Nothing on the turntable";
  nowGame.textContent = track ? `from ${track.gameTitle}` : "Pick a record below";
  nowState.textContent = state.playing ? "NOW PLAYING" : track ? "PAUSED" : "IDLE";
  document.body.dataset.playing = String(state.playing);
  toggleButton.textContent = state.playing ? "Pause" : "Play";
  toggleButton.disabled = !track && !state.playing;
  stopButton.disabled = !track;
  for (const row of list.querySelectorAll<HTMLButtonElement>("[data-track-id]")) {
    const current = row.dataset.trackId === track?.id;
    row.classList.toggle("is-current", current);
    row.classList.toggle("is-playing", current && state.playing);
    row.setAttribute("aria-pressed", String(current));
  }
}

function renderList(): void {
  count.textContent = `${JUKEBOX_TRACKS.length} records · ${jukeboxTracksByGame().length} cabinets`;
  const groups = jukeboxTracksByGame().map((group) => {
    const section = document.createElement("section");
    section.className = "jukebox-game";
    const heading = document.createElement("h2");
    heading.textContent = group.gameTitle;
    section.append(heading);
    let number = 0;
    for (const track of group.tracks) {
      number += 1;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "jukebox-record";
      row.dataset.trackId = track.id;
      row.setAttribute("aria-pressed", "false");
      const index = document.createElement("span");
      index.className = "jukebox-record__index";
      index.textContent = String(number).padStart(2, "0");
      const title = document.createElement("span");
      title.className = "jukebox-record__title";
      title.textContent = track.title;
      const mark = document.createElement("span");
      mark.className = "jukebox-record__mark";
      mark.setAttribute("aria-hidden", "true");
      row.append(index, title, mark);
      section.append(row);
    }
    return section;
  });
  list.replaceChildren(...groups);
}

function createSink(): Sink {
  if (embedded) {
    return Object.freeze({
      send: (command) => window.parent.postMessage(command, location.origin),
    });
  }
  // Standalone: this page IS the room, with a frame nobody will ever load so the message
  // path stays closed and every command comes through the API below.
  const player = createRoomJukebox({
    siteRoot: new URL("../../", location.href).toString(),
    frame: document.createElement("iframe"),
    onChange: (status) => renderState({ trackId: status.track?.id ?? null, playing: status.playing }),
  });
  return Object.freeze({
    send: (command) => {
      if (command.action === "play") player.play(command.trackId);
      else if (command.action === "stop") player.stop();
      else if (command.action === "next") player.next();
      else if (command.action === "previous") player.previous();
      else player.toggle();
    },
  });
}

const sink = createSink();

list.addEventListener("click", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>("[data-track-id]");
  if (!row?.dataset.trackId) return;
  sink.send({ type: JUKEBOX_MESSAGE.command, action: "play", trackId: row.dataset.trackId });
});
toggleButton.addEventListener("click", () => sink.send({ type: JUKEBOX_MESSAGE.command, action: "toggle" }));
previousButton.addEventListener("click", () => sink.send({ type: JUKEBOX_MESSAGE.command, action: "previous" }));
nextButton.addEventListener("click", () => sink.send({ type: JUKEBOX_MESSAGE.command, action: "next" }));
stopButton.addEventListener("click", () => sink.send({ type: JUKEBOX_MESSAGE.command, action: "stop" }));

window.addEventListener("message", (event: MessageEvent) => {
  if (!embedded || event.origin !== location.origin || event.source !== window.parent) return;
  const state: unknown = event.data;
  if (isJukeboxState(state)) renderState(state as JukeboxState);
});

renderList();
renderState({ trackId: null, playing: false });
if (embedded) window.parent.postMessage({ type: JUKEBOX_MESSAGE.hello }, location.origin);
