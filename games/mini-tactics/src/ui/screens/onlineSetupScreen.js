import { bindCommonControls, bindSegmented, screenRoot } from "./common.js";
import { BOARD_SIZES, PLAYER_COLORS } from "../../config.js";
import { createOnlineClient } from "../../online/onlineClient.js";
import { createOnlineSession } from "../../online/onlineSession.js";
import { createSquadPicker } from "./squadBuilder.js";
import { DEFAULT_COMPOSITION } from "../../core/composition.js";

// Online Versus lobby. Owns the relay client for the whole lobby phase: connects
// on entry, runs quick-match / private-room pairing, and once both players are
// paired AND the host's board size has been exchanged, builds the onlineSession
// and hands off to the match screen. The match then owns the live socket — so
// onExit only tears the client down when we leave WITHOUT starting a match.
//
// Pairing model (see onlineClient.js / the server game definition):
//   - Quick Match  → find_match; the relay auto-balances p1/p2 (symmetric seats).
//   - Create Room  → create_room as p1 (host); share the 5-char code.
//   - Join Room    → join_room as p2 (guest) with a code.
// The authoritative side always comes from match_ready.remoteSide, never a local
// claim. p1 = host (seat 1) and chooses the board size; p2 = guest (seat 2) and
// adopts it from the host's `setup` message.
//
// Squads are a blind pick: each player builds their own squad here, and on
// match_ready BOTH sides broadcast a `setup` message carrying their composition
// (the host's also carries the board size). The match builds only once each side
// holds the seed, the board size, AND both compositions — so neither squad is
// revealed until the board renders.
export function createOnlineSetupScreen(ctx) {
  const el = screenRoot("onlineSetup");
  bindCommonControls(el, ctx);

  const statusEl = el.querySelector('[data-online="status"]');
  const idlePanel = el.querySelector('[data-online-panel="idle"]');
  const waitPanel = el.querySelector('[data-online-panel="waiting"]');
  const waitTextEl = el.querySelector('[data-online="waitText"]');
  const roomCodeEl = el.querySelector('[data-online="roomCode"]');
  const codeInput = el.querySelector('[data-online="codeInput"]');

  let client = null;
  let chosenSize = 10; // host's board choice
  let customSquads = false; // local Standard/Custom toggle
  let handedOff = false; // true once the match screen owns the socket

  // Match-start staging — filled from match_ready (+ both setup messages) and
  // consumed exactly once by tryStart().
  let seed = null;
  let boardSize = null;
  let mySeat = null;
  let isHost = false;
  let myComposition = null; // our chosen squad, captured at match_ready
  let peerComposition = null; // the opponent's squad, from their setup message

  // The local player's squad picker. Standard keeps the classic one-of-each
  // squad; the value is read at match_ready time.
  const squadHost = el.querySelector("[data-squad-pickers]");
  const squadHint = el.querySelector("[data-squad-hint]");
  const squadPicker = createSquadPicker({ title: "Your squad", accent: PLAYER_COLORS[1] });

  bindSegmented(el, "boardSize", (seg) => {
    const chosen = Number(seg.dataset.size);
    if (BOARD_SIZES.includes(chosen)) chosenSize = chosen;
  });

  bindSegmented(el, "squadMode", (seg) => {
    customSquads = seg.dataset.squad === "custom";
    syncSquads();
  });

  function syncSquads() {
    squadHost.hidden = !customSquads;
    squadHint.hidden = !customSquads;
    if (customSquads) squadHost.replaceChildren(squadPicker.el);
  }

  function setPanel(name) {
    idlePanel.hidden = name !== "idle";
    waitPanel.hidden = name !== "waiting";
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function resetStaging() {
    seed = null;
    boardSize = null;
    mySeat = null;
    isHost = false;
    myComposition = null;
    peerComposition = null;
  }

  function identity() {
    try {
      return {
        playerId: window.FactoryIdentity?.getPlayerId?.() ?? "",
        displayName: window.FactoryIdentity?.getProfileName?.() ?? "Commander",
      };
    } catch {
      return { playerId: "", displayName: "Commander" };
    }
  }

  // Build the session and hand off to the match — only once the shared seed, the
  // (host-chosen) board size, and BOTH squad compositions are known. Each side
  // captures its own squad at match_ready and waits for the peer's setup message.
  function tryStart() {
    if (seed == null || boardSize == null || handedOff) return;
    if (myComposition == null || peerComposition == null) return;
    const session = createOnlineSession({ client, mySeat, isHost, size: boardSize, seed });
    handedOff = true; // onExit must NOT disconnect — the match owns the client now
    // Key by seat so both clients build the identical { 1: p1Squad, 2: p2Squad }
    // map — the authoritative state must match for lockstep.
    const peerSeat = mySeat === 1 ? 2 : 1;
    const compositions = {
      [mySeat]: myComposition,
      [peerSeat]: peerComposition,
    };
    ctx.nav("match", { mode: "online", net: session, seed, size: boardSize, compositions });
  }

  function wireLobby() {
    const cb = client.cb;

    cb.onConnected = () => {
      setStatus("Connected. Choose how to play.");
      setPanel("idle");
    };

    cb.onSearching = () => {
      setPanel("waiting");
      waitTextEl.textContent = "Searching for an opponent…";
      roomCodeEl.hidden = true;
    };

    cb.onSearchCancelled = () => {
      setPanel("idle");
      setStatus("Search cancelled.");
    };

    cb.onRoomCreated = (code) => {
      setPanel("waiting");
      waitTextEl.textContent = "Waiting for a player to join…";
      roomCodeEl.hidden = false;
      roomCodeEl.textContent = `Room code: ${code}`;
    };

    cb.onSideConflict = () => {
      setPanel("idle");
      setStatus("That room is full or unavailable.");
    };

    cb.onError = (_code, message) => {
      setPanel("idle");
      setStatus(message || "Connection problem. Try again.");
    };

    cb.onMatchReady = ({ seed: matchSeed }) => {
      isHost = client.isHost();
      mySeat = isHost ? 1 : 2;
      seed = matchSeed;
      // Capture our own squad now: the picker's value in Custom, the default
      // one-of-each squad in Standard. Always a concrete 4-type array so it can
      // double as the "captured" signal and travel intact to the peer.
      myComposition = customSquads
        ? squadPicker.getComposition()
        : [...DEFAULT_COMPOSITION];
      waitTextEl.textContent = "Opponent found — starting…";
      if (isHost) {
        // Host's choice of board size is canonical; the guest adopts it.
        boardSize = chosenSize;
        client.sendSetup({ size: chosenSize, composition: myComposition });
      } else {
        client.sendSetup({ composition: myComposition });
      }
      tryStart(); // both sides wait for the peer's setup (board size + squad)
    };

    cb.onRemoteSetup = ({ size, composition }) => {
      if (BOARD_SIZES.includes(size)) boardSize = size;
      // The peer always sends a concrete squad array; receiving it is what lets
      // tryStart() proceed (a still-null peerComposition means "not yet").
      if (Array.isArray(composition)) peerComposition = composition;
      tryStart();
    };
  }

  el.querySelector('[data-action="quickMatch"]').addEventListener("click", () => {
    // Side is server-balanced for symmetric games; the value sent is just a hint.
    client?.findMatch("p1");
  });

  el.querySelector('[data-action="createRoom"]').addEventListener("click", () => {
    client?.createRoom("p1"); // creator hosts as p1
  });

  el.querySelector('[data-action="joinRoom"]').addEventListener("click", () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length < 4) {
      setStatus("Enter the room code to join.");
      return;
    }
    client?.joinRoom("p2", code); // joiner is the guest, p2
  });

  el.querySelector('[data-action="cancelOnline"]').addEventListener("click", () => {
    // Cancel whichever wait we're in (queue or hosted room) and return to idle.
    client?.cancelSearch();
    client?.cancelRoom();
    resetStaging();
    setPanel("idle");
    setStatus("Connected. Choose how to play.");
  });

  function onEnter() {
    handedOff = false;
    resetStaging();
    syncSquads();
    setPanel("none");
    setStatus("Connecting to the network…");
    client = createOnlineClient();
    client.setIdentity(identity());
    wireLobby();
    client.connect();
  }

  function onExit() {
    // Leaving the lobby without starting a match: drop the connection. After a
    // successful handoff the match screen owns the socket, so leave it alone.
    if (client && !handedOff) client.disconnect();
    client = null;
  }

  return { el, onEnter, onExit };
}
