// Composition root: owns the canvas, the fixed-timestep loop, and the wiring
// between input, the pure sim, and the renderers.
//
// Deliberately thin. Every rule lives in scripts/sim/, every measurement and
// every flow decision in scripts/ui/, every draw call in scripts/render/. This
// file should stay a place where those meet, not somewhere behaviour accumulates.
//
// There are three input paths, and which one a key press takes is decided by the
// shell's current screen: the menus, the setup cursor, or the race. Nothing here
// decides what a menu item means — `ui/shell.js` returns a command and this file
// carries it out.

import { DEFAULT_CAR, RACE_DISTANCES, TICK_MS, TICK_SECONDS } from "./sim/constants.js";
import { createGameAudio, raceSoundEvents, stickMoved } from "./audio.js";
import { GATE_6_SPEED, createGate } from "./sim/gate.js";
import { raceOptionsFor } from "./sim/modes.js";
import { createRace, startRace, stepRace, pressShift, gateInput, STAGING, FINISHED } from "./sim/race.js";
import { MODEL_SHEETS, modelById } from "./assets/car-atlas.js";
import {
  createSetup,
  moveSetup,
  confirmSetup,
  cancelSetup,
  rewindSetup,
  focusSetup,
  cycleSetupModel,
  cycleSetupPreset,
  setupModel,
  setupPreset,
  setupTrack,
  setupView,
  setupSelection,
  resolveSelection,
  TARGET_START,
} from "./ui/setup-menu.js";
import {
  SCREEN_TITLE,
  SCREEN_MODES,
  SCREEN_SETUP,
  SCREEN_RACE,
  SCREEN_PAUSED,
  SCREEN_RESULTS,
  SCREEN_RADIO,
  SCREEN_GARAGE,
  SCREEN_ONLINE,
  COMMAND_BEGIN,
  COMMAND_RESTART,
  COMMAND_MODE,
  COMMAND_TUTORIAL,
  COMMAND_ONLINE,
  COMMAND_ONLINE_LEAVE,
  createShell,
  enterScreen,
  showsTheRace,
  menuFor,
  moveShell,
  confirmShell,
  cancelShell,
} from "./ui/shell.js";
import { createMusicLibrary } from "./radio/library.js";
import { LIBRARY_LOCKED } from "./radio/library-status.js";
import { createStereo } from "./radio/stereo.js";
import { loadRadioPreferences, saveRadioPreferences } from "./radio/preferences.js";
import {
  VOLUME_STEP,
  adjustVolume,
  createRadio,
  cycleLoop,
  moveCursor,
  nextTrack,
  nowPlaying,
  playCursor,
  playPause,
  previousTrack,
  restartTrack,
  selectTrack,
  setTracks,
  setVolume,
  stopPlayback,
  trackEnded,
  trackFailed,
} from "./radio/playlist.js";
import { hitRadio, radioView, stripAlpha } from "./ui/radio-panel.js";
import { drawRadioScreen, drawNowPlaying } from "./render/radio.js";
import { createPointer } from "./pointer.js";
import { drawSetup, hitSetup } from "./render/setup.js";
import { createLiveryCache, drawUnderglow, liverySprite, tailLightColour } from "./render/livery.js";
import { emptyGarage, savePreset, updatePreset, deletePreset, selectPreset } from "./garage/garage.js";
import { LAYER_PRESETS, createLivery } from "./garage/livery.js";
import { drawGarage, hitGarage } from "./render/garage.js";
import { createGarageStore } from "./garage/garage-store.js";
import {
  ACTION_SAVE as GARAGE_SAVE,
  ACTION_UPDATE as GARAGE_UPDATE,
  ACTION_DELETE as GARAGE_DELETE,
  ACTION_DONE as GARAGE_DONE,
  createEditor,
  moveEditor,
  editorFocus,
  editorView,
  editorPresetName,
  focusEditor,
  selectPalette,
  selectSection,
  selectPick,
  setRowRatio,
  adjustRow,
  activateEditorRow,
  rowIsActionable,
} from "./ui/garage-editor.js";
import {
  MENU_SPLASH,
  drawTitleScreen,
  drawModeSelect,
  drawPauseMenu,
  drawResults,
  menuListBox,
  hitMenuList,
} from "./render/menus.js";
import { loadFactoryProfile } from "../../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../../js/platform/identity/match-identity.mjs";
import { createNet } from "./online/net.js";
import {
  STATUS_COUNTDOWN,
  STATUS_LOBBY,
  STATUS_MATCH_RESULT,
  STATUS_RACING,
  STATUS_ROUND_RESULT,
  applyForfeit,
  applyLobby,
  applyRematch,
  applyRoundResult,
  applyRoundStart,
  connecting,
  createSession,
  failed,
  leftSession,
  opponent,
  racing,
  readyToLaunch,
  restartNote,
  roundHeadline,
  roundRows,
  searchCancelled,
  searching,
} from "./online/session.js";
import { advanceTo, createOpponent, receiveInputs } from "./online/opponent.js";
import {
  LOBBY_SET_CONFIG,
  LOBBY_STEP_CAR,
  ONLINE_CREATE,
  ONLINE_CUSTOMISE,
  ONLINE_JOIN,
  ONLINE_OPEN_JOIN,
  ONLINE_READY,
  ONLINE_SEARCH,
  PANE_HOME,
  PANE_JOIN,
  TARGET_BACK,
  TARGET_CANCEL_SEARCH,
  TARGET_CUSTOMISE,
  TARGET_HOME,
  TARGET_JOIN_SUBMIT,
  TARGET_LOBBY_ROW,
  TARGET_LOBBY_STEP,
  adjustLobby,
  adjustLobbyAt,
  closeJoin,
  confirmOnline,
  createOnlineMenu,
  hitOnline,
  moveOnline,
  onlineView,
  resultButtons,
  openJoin,
  paneFor,
  typeCode,
  wantsTextCapture,
} from "./ui/online-menu.js";
import { drawOnlineResult, drawOnlineScreen } from "./render/online.js";
import {
  createInputLog,
  eventsSince,
  recordClutch,
  recordGate,
  recordStart,
  recordThrottle,
} from "./sim/input-log.js";
import { gateLayout, gateSlots, createKnob, stepKnob, knobTargetFor } from "./ui/shifter-gate.js";
import { smoothToward, shiftLightState } from "./ui/gauges.js";
import { gearNodeId } from "./sim/gate.js";
import {
  WORLD,
  PIXELS_PER_METRE,
  buildTrackTile,
  drawRoad,
  drawSpeedStreaks,
  drawFinishLine,
  drawRoadVignette,
} from "./render/scene.js";
import { TRACKS } from "./ui/track-layout.js";
import { drawCar, drawTailLights, carAttitude, carBox } from "./render/car.js";
import {
  SHIFTER_BOX,
  GAUGE_ASSETS,
  drawDashPanel,
  drawTachometer,
  drawSpeedometer,
  drawShiftLight,
  drawGearIndicator,
  drawReadouts,
  drawGradeFlash,
} from "./render/dashboard.js";
import { drawShifter } from "./render/shifter.js";
import { drawChristmasTree, drawDriverCue, drawStagingPrompt } from "./render/overlay.js";
import {
  createCoach,
  acknowledgeCoach,
  advanceCoach,
  coachHolds,
  coachFinished,
  coachView,
} from "./ui/coach.js";
import { drawCoachPanel } from "./render/coach.js";
import {
  createInput,
  ACTION_CONFIRM,
  ACTION_CANCEL,
  ACTION_MOVE,
  ACTION_SHIFT,
  ACTION_RESTART,
  ACTION_STEREO,
  ACTION_TEXT,
} from "./input.js";

const KNOB_SPEED = 620; // px/s through the gate
const NEEDLE_RATE_RPM = 15;
const NEEDLE_RATE_SPEED = 7;

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

function newView(layout, race) {
  return {
    scroll: 0,
    smoothedRpm: race.vehicle.rpm,
    smoothedSpeed: 0,
    knob: createKnob(layout, gearNodeId(race.vehicle.gear)),
    tick: 0,
    prevSpeed: 0,
    attitude: 0,
    flash: null,
    gradeAge: Infinity,
    shiftCount: 0,
    launchGrade: null,
  };
}

/**
 * Turns a finished shift into the flash label.
 *
 * A shift can be spoiled by two different things and the player needs to know
 * which, so the hint names whichever one actually cost them the grade. The catch
 * wins when it went wrong, because it is the more recent of the two and the one
 * the player is least likely to have noticed.
 */
function shiftFlash(shift) {
  if (!shift) {
    return null;
  }
  const CATCH_HINTS = { early: "EARLY GAS", late: "LATE GAS", never: "NO GAS" };
  const hint = CATCH_HINTS[shift.catch?.reason] ?? (shift.reason ? shift.reason.toUpperCase() : null);
  return { label: hint ? `${shift.grade.toUpperCase()} · ${hint}` : shift.grade.toUpperCase(), tone: shift.grade };
}

export function boot(canvas) {
  const ctx = canvas.getContext("2d");
  const carSpec = DEFAULT_CAR;
  const gate = createGate(GATE_6_SPEED);
  const layout = gateLayout(gate, SHIFTER_BOX);
  const slots = gateSlots(gate, layout);

  // Every sheet and every track, because the setup screen shows all of them at
  // once. The renderers already skip images that have not resolved, so a cold
  // cache degrades to empty cells rather than blocking the first frame.
  const sheetImages = new Map(MODEL_SHEETS.map((sheet) => [sheet.id, loadImage(sheet.src)]));
  const trackImages = new Map(TRACKS.map((track) => [track.id, loadImage(track.src)]));
  const splashImage = loadImage(MENU_SPLASH);

  let shell = createShell();
  // The player's saved configs, and the seam that persists them.
  //
  // Customization is account-backed by decision: an opponent has to be able to
  // read the car you are driving, and a config living only in one browser cannot
  // be shown to anyone. Signed out the store reports `available: false` and the
  // cabinet races on Factory paint — a missing garage is a normal state here,
  // never an error.
  //
  // The load is deliberately not awaited. The first frame must draw now; the
  // server's copy replaces the empty one when it arrives, and the setup screen
  // is rebuilt around it at that point.
  const garageStore = createGarageStore({ isKnownModel: (id) => Boolean(modelById(id)) });
  let garage = emptyGarage();
  // Baked livery sprites, keyed by model + livery. Held by the composition root
  // so the preview and the in-race car draw the same pixels.
  const liveryCache = createLiveryCache();
  // The garage editor's working copy. Null unless the garage screen is open —
  // the editor is a screen's worth of state, not part of the cabinet's.
  let editor = null;
  let setup = createSetup({ modeId: shell.modeId }, garage);
  // What the pointer is over on the setup screen. Sampled rather than queued,
  // like the throttle — and deliberately *not* part of `setup`, because the
  // setup cursor is also the pick and hovering must never choose anything.
  let setupHover = null;

  garageStore.load().then((loaded) => {
    garage = loaded;
    // Rebuild the picker around what arrived, keeping whatever the player has
    // already chosen. Only safe while they have not started a run — once a race
    // is on, `chosen` is the truth and the cursor behind it may move freely.
    setup = createSetup({ ...setupSelection(setup, garage), modeId: shell.modeId }, garage);
    render();
  });
  // The resolved selection: which model, which livery, which track. Replaced
  // wholesale when a race begins, never edited in place.
  let chosen = resolveSelection(setupSelection(setup, garage));

  // The seamless scrolling tile is built on the first frame after the chosen
  // track's image resolves, and thrown away when the track changes. Until then
  // drawRoad falls back to a flat fill.
  let trackTile = null;

  // Authored gauge art. Every renderer falls back to a procedural dial while
  // these are still in flight, so a cold cache never blocks the first frame.
  const gaugeImages = Object.fromEntries(
    Object.entries(GAUGE_ASSETS).map(([key, src]) => [key, loadImage(src)]),
  );

  /** A fresh race on whatever the setup screen currently says. */
  function newRace() {
    const { modeId, objectiveId } = setupSelection(setup, garage);
    return createRace({
      car: carSpec,
      gate,
      countdownSeconds: 3,
      ...raceOptionsFor(modeId, objectiveId),
    });
  }

  let race = newRace();
  let view = newView(layout, race);
  // The driving coach, or null. Only a guided practice run has one, and it is
  // cleared the moment any other race is built — a lesson belongs to the run it
  // was started for.
  let coach = null;
  // Whether the run on track is a guided one. Outlives `coach`, which is cleared
  // when the lesson finishes mid-run: restarting after that has to rebuild the
  // tutorial, not a normal race.
  let coachedRun = false;
  const audio = createGameAudio();

  // -------------------------------------------------------------------------
  // Speed Demon Radio
  //
  // Four pieces, and the split between them is the point: `playlist.js` holds
  // the rules and is pure, `library.js` holds the folder and is the only thing
  // that touches the file system, `stereo.js` holds the one <audio> element and
  // does as it is told, and `ui/radio-panel.js` shapes what gets drawn. This
  // block is where they meet, and nothing more.
  // -------------------------------------------------------------------------

  let radio = createRadio(loadRadioPreferences());
  /** Seconds since the stereo last changed — drives the in-race strip's fade. */
  let radioAge = Infinity;
  let playback = { elapsed: 0, duration: 0, ready: false };
  /** The object URL currently in the deck, and which track it belongs to. */
  let source = { trackId: null, url: null };
  /** Consecutive unplayable tracks, so a dead folder stops rather than spins. */
  let sourceFailures = 0;

  function setRadio(next) {
    if (next === radio) {
      return;
    }
    radio = next;
    radioAge = 0;
  }

  /**
   * A track the browser will not play. Steps to the next one, but gives up once
   * it has been all the way round: with repeat-all on, a folder of files the
   * browser cannot decode would otherwise skip forever.
   */
  function trackUnplayable() {
    sourceFailures += 1;
    setRadio(sourceFailures >= Math.max(1, radio.tracks.length) ? stopPlayback(radio) : trackFailed(radio));
  }

  let loadedTracks = null;
  const library = createMusicLibrary({
    onChange: ({ tracks }) => {
      // Fires for status changes too. Only a genuinely new playlist should
      // reset the deck — otherwise opening the picker and cancelling would stop
      // whatever was already playing.
      if (tracks === loadedTracks) {
        return;
      }
      loadedTracks = tracks;
      sourceFailures = 0;
      setRadio(setTracks(radio, tracks));
    },
  });

  const stereo = createStereo({
    onEnded: () => setRadio(trackEnded(radio)),
    onFailed: () => trackUnplayable(),
  });

  /**
   * Keeps the deck pointed at whatever the reducer selected. Safe to call every
   * tick: it only does work when the selected track has actually changed.
   *
   * The URL arrives asynchronously, so `source.url` is null for a moment after
   * every track change — the stereo treats that as "nothing to play yet" rather
   * than as an error.
   */
  function syncStereo() {
    const track = nowPlaying(radio);
    const id = track?.id ?? null;
    if (id !== source.trackId) {
      source = { trackId: id, url: null };
      if (track) {
        library.urlFor(track).then((url) => {
          if (source.trackId !== track.id) {
            return; // skipped past it while the file was being opened
          }
          if (url === null) {
            trackUnplayable();
            return;
          }
          source.url = url;
          sourceFailures = 0;
        });
      }
    }
    stereo.apply({
      src: source.url,
      playing: radio.playing,
      volume: radio.volume,
      seekToken: radio.seekToken,
    });
    playback = stereo.playback();
  }

  /**
   * Everything both radio surfaces draw, shaped by the pure view model.
   *
   * The pointer is only offered on the radio screen: `hover` is what the
   * renderer highlights, and a highlight on the in-race strip would be a lie
   * because nothing there is clickable.
   */
  function currentRadioView({ pointer = null } = {}) {
    return radioView(
      radio,
      playback,
      { ...library.state(), supported: library.supported },
      { tick: view.tick, pointer },
    );
  }

  // A folder picker is a modal browser dialog: opening one mid-run would stop
  // the world with the tree running down, so F is inert while racing.
  function openFolderPicker() {
    if (shell.screen === SCREEN_RACE) {
      return;
    }
    audio.play("button");
    library.pick();
  }

  /** A stereo button. These mean the same thing on every screen. */
  function stereoAction(control) {
    switch (control) {
      case "previous":
        setRadio(previousTrack(radio));
        break;
      case "next":
        setRadio(nextTrack(radio));
        break;
      case "playPause":
        setRadio(playPause(radio));
        break;
      case "restartTrack":
        setRadio(restartTrack(radio));
        break;
      case "loop":
        setRadio(cycleLoop(radio));
        saveRadioPreferences(radio);
        break;
      case "volumeUp":
      case "volumeDown":
        setRadio(adjustVolume(radio, control === "volumeUp" ? VOLUME_STEP : -VOLUME_STEP));
        saveRadioPreferences(radio);
        break;
      case "folder":
        openFolderPicker();
        break;
      default:
        break;
    }
  }

  // Silent: a remembered folder is re-read without a prompt where the browser
  // allows it, and parks in LOCKED where it does not. A permission dialog
  // nobody asked for on page load is a dialog people dismiss without reading.
  library.restore();

  // The first keypress is both the autoplay unlock and, since it runs inside the
  // trusted event, the one moment the deck can start without being rejected.
  const input = createInput(window, () => {
    audio.unlock();
    syncStereo();
  });
  const pointer = createPointer(canvas, WORLD);

  // -------------------------------------------------------------------------
  // Online Versus
  //
  // The same split the radio follows: `online/net.js` is the only thing that
  // touches a socket, `online/session.js` holds every rule about a match and is
  // pure, `ui/online-menu.js` shapes the screen, and this block is where they
  // meet. The match itself is **not a screen** — it is the race screen with a
  // session attached, exactly as the tutorial is the race screen with a coach
  // attached, so there is no second copy of the driving to drift out of sync.
  // -------------------------------------------------------------------------

  let session = createSession();
  let onlineMenu = createOnlineMenu();
  // The driver's own inputs this round, and the tick they are numbered against.
  // Tick 0 is the tick `startRace` is called, which is the same instant on both
  // machines because both wait for the server's `startAt`.
  let myLog = createInputLog();
  let raceTick = 0;
  // How much of `myLog` has been sent. The log is append-only and the server
  // merges by identity, so only the tail ever goes out.
  let sentThrough = 0;
  // The opponent's car: their inputs, run through the same sim. Null offline.
  let opponentCar = null;
  // Whether this round's run has already been reported. See the latch in tick().
  let reportedRound = false;

  const net = createNet();

  /**
   * Lanes 1 and 2 straddle the double-yellow divider and are the drag-race pair,
   * so this driver keeps lane 1 (the offline default) and the opponent takes 2.
   */
  const OPPONENT_LANE = 2;

  /** True when the race on track belongs to an online match. */
  const isOnlineRace = () => opponentCar !== null;

  /**
   * True while the server's verdict is on screen. The strip stays lit underneath
   * it — a round result belongs to the run that just happened — but nothing
   * advances, and the race screen's keys mean different things.
   */
  const showsOnlineResult = () =>
    session.status === STATUS_ROUND_RESULT || session.status === STATUS_MATCH_RESULT;

  net.on({
    onOpen: () => {
      net.setIdentity(onlineIdentity());
      // Whichever way in the player chose is carried out once the socket is up,
      // because none of them can be sent before it is.
      if (pendingEntry) {
        pendingEntry();
        pendingEntry = null;
      }
    },
    onError: ({ message }) => {
      session = failed(session, message ?? "Connection lost");
    },
    onClose: () => {
      // A socket that drops mid-match ends it here rather than leaving the
      // player staring at a tree that will never resolve.
      if (shell.screen === SCREEN_ONLINE || isOnlineRace()) {
        session = failed(session, "Connection lost");
        returnToOnlineScreen();
      }
    },
    onSearching: () => {
      session = searching(session);
    },
    onSearchCancelled: () => {
      session = searchCancelled(session);
    },
    onLobby: (message) => {
      session = applyLobby(session, message);
      // **Only when we are genuinely back in a lobby.** A lobby frame arrives
      // for all sorts of reasons that are not "the match is over" — the opponent
      // staging for the next round, or repainting their car mid-result — and
      // treating every one of them as a teardown threw away the race the result
      // panel was still drawn over. With the race gone, `isOnlineRace()` went
      // false, the panel's own keys and clicks stopped being routed to it, and
      // pressing its button dropped the player onto the setup screen.
      if (session.status === STATUS_LOBBY) returnToOnlineScreen();
    },
    onRoundStart: (message, localNow) => {
      session = applyRoundStart(session, message, localNow);
      buildOnlineRace(message);
    },
    onInputs: (message) => {
      if (opponentCar) opponentCar = receiveInputs(opponentCar, message.events);
    },
    onRoundResult: (message) => {
      session = applyRoundResult(session, message);
    },
    onForfeit: (message) => {
      session = applyForfeit(session, message);
    },
    onRematch: (message) => {
      session = applyRematch(session, message);
    },
  });

  /** Queued until the socket opens; see `onOpen`. */
  let pendingEntry = null;

  /**
   * Who this driver is, and what they are driving. The car travels with every
   * entry path so the opponent can draw the real thing — the public loadout
   * endpoints exist for exactly this, and this is what finally consumes them.
   */
  function onlineIdentity() {
    const preset = setupPreset(setup, garage);
    // Identity comes from the factory profile, not from anything this cabinet
    // invents — canonical player identity belongs to the shell, and a game that
    // minted its own name would be a second source of truth for who someone is.
    return {
      ...createOnlineIdentityPayload(loadFactoryProfile()),
      modelId: setupModel(setup).id,
      livery: preset?.livery ?? null,
    };
  }

  /** Opens the connection and remembers what to do once it is up. */
  function enterOnline(entry) {
    pendingEntry = entry;
    if (net.isOpen()) {
      net.setIdentity(onlineIdentity());
      pendingEntry();
      pendingEntry = null;
      return;
    }
    session = connecting(session);
    net.connect();
  }

  function leaveOnline() {
    if (net.isOpen()) net.leaveRoom();
    net.close();
    session = leftSession(session);
    onlineMenu = createOnlineMenu();
    endOnlineRace();
  }

  /**
   * Builds both cars for a round: the driver's, and the reconstruction of the
   * opponent's. They are the same kind of object running the same reducer —
   * that is what makes the two screens agree without any correction traffic.
   */
  function buildOnlineRace(message) {
    const options = {
      car: carSpec,
      gate,
      countdownSeconds: message.countdownSeconds,
      distanceMetres: message.distanceMetres,
      timeLimitSeconds: null,
    };
    chosen = resolveSelection(setupSelection(setup, garage));
    // The strip belongs to the room, so the local pick is overridden by it.
    const track = TRACKS.find((entry) => entry.id === message.config?.trackId);
    if (track) {
      chosen = { ...chosen, track };
      trackTile = null;
    }
    race = createRace(options);
    view = newView(layout, race);
    coach = null;
    coachedRun = false;
    myLog = createInputLog();
    raceTick = 0;
    sentThrough = 0;
    reportedRound = false;
    opponentCar = createOpponent(options);
    shell = enterScreen(shell, SCREEN_RACE);
  }

  function endOnlineRace() {
    opponentCar = null;
    myLog = createInputLog();
    raceTick = 0;
    sentThrough = 0;
    reportedRound = false;
  }

  /**
   * The round is over and the room has gone back to being a room. Tearing the
   * race down and moving the screen are **one** operation, and separating them
   * was the rematch bug.
   *
   * `endOnlineRace` clears `opponentCar`, which is what `isOnlineRace()` reads.
   * Doing that while the shell is still on `SCREEN_RACE` does not leave the
   * player with no race — it leaves them with a *single-player* one: the pause
   * menu comes back, `R` restarts, the stale race steps forward again, and
   * nothing on screen says the match ended. That is exactly what pressing
   * REMATCH did, because the server answers a completed handshake with a lobby
   * frame and the frame handler only did half the job.
   */
  function returnToOnlineScreen() {
    endOnlineRace();
    if (showsTheRace(shell.screen)) shell = enterScreen(shell, SCREEN_ONLINE);
  }

  /**
   * Tells the room what this driver is driving.
   *
   * Sent as its own message rather than riding on the way in, because the car can
   * change *inside* a lobby now — stepping the car or paint rows, or coming back
   * from the garage. `setIdentity` is refreshed straight away either way, because
   * it costs nothing and every later entry path reads it.
   *
   * **The wire message is coalesced, and that is not premature.** A direction key
   * auto-repeats, and the server answers each loadout with a lobby broadcast to
   * the whole room — so a message per step is ~30 broadcasts a second, at both
   * drivers, for as long as somebody holds ‹. Settling first sends one message for
   * the whole sweep. Driven from the game loop, the same place `garageStore.tick`
   * and the stereo's `apply` run, rather than from a timer of its own.
   */
  const LOADOUT_SETTLE_SECONDS = 0.25;
  let loadoutSettling = 0;

  function publishLoadout({ immediate = false } = {}) {
    net.setIdentity(onlineIdentity());
    if (immediate) flushLoadout();
    else loadoutSettling = LOADOUT_SETTLE_SECONDS;
  }

  function flushLoadout() {
    loadoutSettling = 0;
    if (net.isOpen()) net.sendLoadout();
  }

  function tickLoadout(seconds) {
    if (loadoutSettling <= 0) return;
    loadoutSettling -= seconds;
    if (loadoutSettling <= 0) flushLoadout();
  }

  /**
   * One tick of an online race.
   *
   * Three things happen here that do not offline: the tree is released only when
   * the server's shared start time arrives, every input is recorded into a log
   * as it is made, and the tail of that log is streamed. The driver's own car is
   * never held up waiting for a packet — the opponent cannot affect it, so there
   * is nothing to wait for, and the shift timing keeps its zero input delay.
   */
  function tickOnline(throttle) {
    if (session.status === STATUS_COUNTDOWN) {
      if (!readyToLaunch(session, Date.now())) {
        return false; // the tree has not been released yet
      }
      session = racing(session);
      race = startRace(race);
      myLog = recordStart(myLog, raceTick);
    }
    if (session.status !== STATUS_RACING) {
      return false;
    }

    myLog = recordThrottle(myLog, raceTick, throttle);
    return true;
  }

  /** Sends whatever the driver has done since the last tick. */
  function streamInputs() {
    if (!session.liveRound) return;
    const tail = eventsSince(myLog, sentThrough);
    if (tail.length === 0) return;
    net.sendInputs(session.liveRound.round, session.liveRound.attempt, tail);
    // `raceTick` has already been advanced past the tick just simulated, so it
    // is the earliest tick that can still receive an input — and therefore the
    // earliest one still worth sending from.
    //
    // It was `raceTick + 1`, which skipped exactly one tick's worth of inputs
    // every time: whatever the driver did on that tick was recorded locally and
    // never sent. A launch landing there meant the server replayed a car that
    // never moved and scored the run DNF, with nothing on either screen to
    // explain it. **When in doubt, under-advance this** — `mergeEvents` drops a
    // duplicate on arrival, so re-sending an event costs a few bytes, while
    // skipping one costs the whole run.
    sentThrough = raceTick;
  }

  /** ENTER on the online screen. */
  function confirmOnlineScreen() {
    // On a result panel the key means "get on with it": ask for the next round,
    // or ask for a rematch. The round itself is started by the server.
    if (session.status === STATUS_ROUND_RESULT) {
      net.sendReady(true);
      return;
    }
    if (session.status === STATUS_MATCH_RESULT) {
      net.sendRematch();
      return;
    }

    switch (confirmOnline(onlineMenu, session)) {
      case ONLINE_SEARCH:
        enterOnline(() => net.findMatch());
        break;
      case ONLINE_CREATE:
        enterOnline(() => net.createRoom({ trackId: chosen.track.id, distanceId: "quarter", bestOf: 3 }));
        break;
      case ONLINE_OPEN_JOIN:
        onlineMenu = openJoin(onlineMenu);
        break;
      case ONLINE_JOIN: {
        const code = onlineMenu.entry.value;
        onlineMenu = closeJoin(onlineMenu);
        enterOnline(() => net.joinRoom(code));
        break;
      }
      case ONLINE_READY:
        net.sendReady(true);
        break;
      case ONLINE_CUSTOMISE:
        // Same guard as the setup screen's paint pane: signed out there is
        // nowhere to save a config, so the editor is not opened at all.
        if (garageStore.available) openGarage();
        break;
      default:
        break;
    }
  }

  /**
   * Carries out a step on a lobby row. Two kinds, because two different things
   * own the rows: the room's settings are the host asking the server, and the
   * driver's car is a local pick that is then published to the room.
   */
  function applyLobbyRequest(request) {
    if (!request) return;
    if (request.kind === LOBBY_SET_CONFIG) {
      net.sendConfig(request.config);
      return;
    }
    setup = request.kind === LOBBY_STEP_CAR
      ? cycleSetupModel(setup, request.step, garage)
      : cycleSetupPreset(setup, request.step, garage);
    publishLoadout();
  }

  /** ESC on the online screen: out of the code field, or out of online play. */
  function cancelOnlineScreen() {
    if (paneFor(onlineMenu, session) === PANE_JOIN) {
      onlineMenu = closeJoin(onlineMenu);
      return false; // handled here; the shell does not move
    }
    if (paneFor(onlineMenu, session) !== PANE_HOME) {
      // Backing out of a search or a lobby returns to the ways in, rather than
      // straight out of online play — one press, one step.
      if (net.isOpen()) {
        net.cancelSearch();
        net.leaveRoom();
      }
      session = leftSession(session);
      return false;
    }
    return true; // nothing left to back out of here; let the shell leave
  }

  function onlineAction(action) {
    switch (action.type) {
      case ACTION_TEXT:
        onlineMenu = typeCode(onlineMenu, action);
        break;
      case ACTION_MOVE: {
        audio.play("button");
        const request = adjustLobby(onlineMenu, action.direction, session);
        if (request) applyLobbyRequest(request);
        else onlineMenu = moveOnline(onlineMenu, action.direction, session);
        break;
      }
      case ACTION_CONFIRM:
        audio.play("button");
        confirmOnlineScreen();
        break;
      case ACTION_CANCEL:
        audio.play("button");
        // Through `cancelScreen` rather than straight to the shell, so the key,
        // the pointer and the debug handle all get the same answer.
        cancelScreen();
        break;
      default:
        break;
    }
  }

  /**
   * The online view with the pointer folded in, so hover and click agree, and
   * with the car this driver is taking to the line.
   *
   * The car comes from the *same* setup the solo picker uses. That is deliberate:
   * "what am I driving" has one answer in this cabinet, and the lobby is a second
   * way to change it rather than a second copy of it — a player who paints a car
   * in a lobby and then races solo finds the car they just built.
   */
  function currentOnlineView({ pointer: at = null } = {}) {
    return onlineView(onlineMenu, session, { pointer: at, car: onlineCarView() });
  }

  function onlineCarView() {
    return {
      modelLabel: setupModel(setup).label,
      paintLabel: setupPreset(setup, garage).name,
      canCustomise: garageStore.available,
    };
  }

  /**
   * A click on the online screen. One gesture does the whole job, exactly as it
   * does on the setup screen: pressing a way in takes it, pressing a stepper
   * steps that setting, pressing the button stages the car.
   */
  function clickOnline(click) {
    const target = hitOnline(currentOnlineView(), click.x, click.y);
    if (!target) return;
    audio.play("button");

    if (target.kind === TARGET_HOME) {
      onlineMenu = { ...onlineMenu, cursor: target.index };
      confirmOnlineScreen();
      return;
    }
    if (target.kind === TARGET_JOIN_SUBMIT) {
      confirmOnlineScreen();
      return;
    }
    if (target.kind === TARGET_CANCEL_SEARCH || target.kind === TARGET_BACK) {
      // The same one-step-back the key does, so the mouse and ESC cannot
      // disagree about how far out a single press takes you.
      if (cancelOnlineScreen()) cancelScreen();
      return;
    }
    if (target.kind === TARGET_CUSTOMISE) {
      if (garageStore.available) openGarage();
      return;
    }
    if (target.kind === TARGET_LOBBY_STEP) {
      // Against the clicked row rather than the cursor's: pointing at a
      // distance arrow means the distance, wherever the caret happens to be.
      applyLobbyRequest(adjustLobbyAt(target.index, target.direction, session));
      return;
    }
    if (target.kind === TARGET_LOBBY_ROW) {
      onlineMenu = { ...onlineMenu, lobbyCursor: target.index };
      // Through the same confirm the key takes, so the mouse and ENTER cannot
      // disagree about which rows do something: the button stages, the paint row
      // opens the garage, every other row is inert.
      confirmOnlineScreen();
    }
  }

  /** A click on the result panel drawn over the strip. */
  function clickOnlineResult(click) {
    const buttons = resultButtons(session);
    const hit = buttons.find(
      (button) =>
        click.x >= button.rect.x && click.x <= button.rect.x + button.rect.width
        && click.y >= button.rect.y && click.y <= button.rect.y + button.rect.height,
    );
    if (!hit) return;
    audio.play("button");
    if (hit.id === "leave") {
      leaveOnline();
      shell = enterScreen(shell, SCREEN_MODES);
      return;
    }
    confirmOnlineScreen();
  }

  /**
   * Keeps the keyboard's capture mode in step with the screen. The stereo row is
   * live everywhere *except* a focused field, because a room code contains B, N,
   * L, P and F — see `ui/text-entry.js`.
   */
  function syncTextCapture() {
    const wants = shell.screen === SCREEN_ONLINE && wantsTextCapture(onlineMenu, session);
    if (wants !== input.capturingText()) input.setTextCapture(wants);
  }

  /** Replaces race state and emits only the sounds implied by that transition. */
  function updateRace(nextRace) {
    const previous = race;
    race = nextRace;
    for (const sound of raceSoundEvents(previous, race)) {
      audio.play(sound);
    }
  }

  /** A direction key moves the physical stick only while its gate is open. */
  function moveRaceGate(direction) {
    if (isOnlineRace()) {
      if (session.status !== STATUS_RACING) return;
      myLog = recordGate(myLog, raceTick, direction);
    }
    const previous = race;
    const next = gateInput(race, direction);
    if (stickMoved(previous, next)) {
      audio.play("stick");
    }
    updateRace(next);
  }

  /** Commits the setup screen's selection and builds a race on it. */
  function beginRace() {
    chosen = resolveSelection(setupSelection(setup, garage));
    // The run is committed, so the setup screen rewinds: coming back to it from
    // the pause or results menu starts the lock walk at the car again.
    setup = rewindSetup(setup);
    trackTile = null; // rebuilt for the newly chosen track on the next frame
    race = newRace();
    view = newView(layout, race);
    coach = null;
    coachedRun = false;
  }

  /**
   * The guided practice run. A real race on the current car and track — the
   * coach teaches the game rather than a simulation of it — over a mile, which
   * is long enough to hold every step and still finish on a proper run.
   */
  function beginTutorial() {
    beginRace();
    race = createRace({
      car: carSpec,
      gate,
      countdownSeconds: 3,
      distanceMetres: RACE_DISTANCES.mile.metres,
    });
    view = newView(layout, race);
    coach = createCoach();
    coachedRun = true;
  }

  /**
   * The same run again. RESTART RUN, RUN IT AGAIN and the `R` key all mean this,
   * and on a guided run "the same run" is the lesson — dropping out of it into a
   * normal race is the sort of surprise that makes a menu feel untrustworthy.
   * Picking a new car or track is the separate act that ends it, and that comes
   * back as `COMMAND_BEGIN` from the setup screen instead.
   */
  function restartRun() {
    if (coachedRun) {
      beginTutorial();
    } else {
      beginRace();
    }
  }

  /** Rebuilds the setup screen around a newly chosen mode, carrying the rest. */
  function adoptMode() {
    setup = createSetup({ ...setupSelection(setup, garage), modeId: shell.modeId }, garage);
  }

  function runCommand(command) {
    if (command === COMMAND_BEGIN) {
      beginRace();
    } else if (command === COMMAND_RESTART) {
      restartRun();
    } else if (command === COMMAND_TUTORIAL) {
      beginTutorial();
    } else if (command === COMMAND_MODE) {
      adoptMode();
    } else if (command === COMMAND_ONLINE) {
      // Entering the screen does not connect: the socket opens when the player
      // picks a way in, so browsing the menu costs nobody a connection.
      onlineMenu = createOnlineMenu();
      session = createSession();
    } else if (command === COMMAND_ONLINE_LEAVE) {
      leaveOnline();
    }
  }

  /**
   * ENTER, whichever screen is up. The setup screen gets first refusal: while it
   * still has a pane to lock in, the key is its own and the shell does not move.
   * This file is not deciding what the key *means* — the setup menu says whether
   * it is done and the shell says what happens next.
   */
  function confirmScreen() {
    if (shell.screen === SCREEN_RACE) {
      // A coaching beat has stopped the world, so ENTER means "read it" — the
      // clutch has nothing to do while nothing is moving.
      if (coachHolds(coach)) {
        audio.play("button");
        coach = acknowledgeCoach(coach);
        return;
      }
      stageOrShift();
      return;
    }
    if (shell.screen === SCREEN_RADIO) {
      confirmRadio();
      return;
    }
    if (shell.screen === SCREEN_ONLINE) {
      confirmOnlineScreen();
      return;
    }
    if (shell.screen === SCREEN_GARAGE) {
      const focus = editorFocus(editor, garage);
      // Two things ENTER can mean here, and the editor decides which: an action
      // at the bottom of the screen belongs to the garage (save, delete), while
      // a row that fires — add a layer, remove this one — belongs to the section
      // and never leaves the editor.
      if (focus?.kind === "action") garageAction(focus.id);
      else if (focus?.kind === "row" && rowIsActionable(editor, focus.id)) {
        audio.play("button");
        editor = activateEditorRow(editor, focus.id);
      }
      return;
    }
    if (shell.screen === SCREEN_SETUP) {
      const { setup: next, done, customise } = confirmSetup(setup, garage);
      setup = next;
      if (customise) {
        // Without an account there is nowhere to save a config, so the row is
        // inert rather than opening an editor that would lose the player's work.
        if (garageStore.available) openGarage();
        return;
      }
      if (!done) {
        return;
      }
    }
    confirmShellNow();
  }

  /**
   * Hands the confirmation to the shell. Split out of `confirmScreen` because
   * the setup screen's START button means "the setup is finished with this key"
   * without any pane left to lock — and going straight to `beginRace` instead
   * would build the race while leaving the screen showing the picker.
   */
  function confirmShellNow() {
    const { shell: nextShell, command } = confirmShell(shell);
    shell = nextShell;
    runCommand(command);
  }

  /**
   * Opens the garage on whatever config the paint pane has chosen. From Factory
   * that is a new paint; from a saved preset it is that preset, and the editor
   * offers Save Changes / Delete because it was handed a preset id.
   */
  function openGarage() {
    const preset = setupPreset(setup, garage);
    editor = createEditor({
      modelId: setupModel(setup).id,
      presetId: preset.id,
      livery: preset.livery,
    });
    shell = enterScreen(shell, SCREEN_GARAGE);
  }

  /**
   * Carries out one garage action. Saving re-selects the config that was just
   * written, so leaving the editor lands on the paint you have been looking at
   * rather than on whatever was chosen when you opened it.
   */
  function garageAction(id) {
    if (id === GARAGE_SAVE) {
      commitGarage(savePreset(garage, {
        modelId: editor.modelId,
        name: editorPresetName(editor),
        livery: editor.livery,
      }));
    } else if (id === GARAGE_UPDATE) {
      commitGarage(selectPreset(
        updatePreset(garage, editor.presetId, {
          name: editorPresetName(editor),
          livery: editor.livery,
        }),
        editor.presetId,
      ));
    } else if (id === GARAGE_DELETE) {
      commitGarage(deletePreset(garage, editor.presetId));
    } else if (id !== GARAGE_DONE) {
      return;
    }
    leaveGarage();
  }

  /**
   * The one place the garage changes. Routing every mutation through here is
   * what stops a future edit path from changing a player's paints without the
   * server ever hearing about it.
   */
  function commitGarage(next) {
    garage = next;
    garageStore.save(garage);
  }

  /**
   * Back to whichever screen opened the editor, rebuilt around whatever the
   * garage did. The setup is recreated rather than patched because the paint list
   * may have grown, shrunk or been re-selected underneath it — that is true of
   * both ways out, because the online lobby reads its car from the same setup.
   */
  function leaveGarage() {
    const selection = setupSelection(setup, garage);
    setup = createSetup(
      { ...selection, presetId: garage.selection.presetId ?? selection.presetId, modeId: shell.modeId },
      garage,
    );
    // The paint pane is where the player was, so put them back on it rather
    // than at the top of the walk.
    setup = confirmSetup(setup, garage).setup;
    editor = null;
    const back = shell.garageReturn ?? SCREEN_SETUP;
    shell = enterScreen(shell, back);
    // A lobby is a room with an opponent in it who is drawing your car, so the
    // paint you just built has to reach them. Sent on the way out rather than on
    // every save: the working copy is not the car until the editor is done with
    // it, and ESC discards it entirely. Immediate, because leaving the editor is
    // one deliberate act with no auto-repeat to coalesce.
    if (back === SCREEN_ONLINE) publishLoadout({ immediate: true });
  }

  /** ESC. Same split: a locked pane is unlocked before the shell backs out. */
  function cancelScreen() {
    if (shell.screen === SCREEN_ONLINE && !cancelOnlineScreen()) {
      return; // handled inside the online screen; the shell does not move
    }
    if (shell.screen === SCREEN_GARAGE) {
      // Backing out throws the working copy away — that is what makes trying a
      // colour safe.
      leaveGarage();
      return;
    }
    if (shell.screen === SCREEN_SETUP) {
      const { setup: next, exit } = cancelSetup(setup);
      setup = next;
      if (!exit) {
        return;
      }
    }
    const { shell: nextShell, command } = cancelShell(shell);
    shell = nextShell;
    runCommand(command);
  }

  let renderScale = 1;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(window.innerWidth / WORLD.width, window.innerHeight / WORLD.height);
    canvas.style.width = `${Math.round(WORLD.width * fit)}px`;
    canvas.style.height = `${Math.round(WORLD.height * fit)}px`;
    canvas.width = Math.round(WORLD.width * fit * dpr);
    canvas.height = Math.round(WORLD.height * fit * dpr);
    renderScale = fit * dpr;
  }
  resize();
  window.addEventListener("resize", resize);

  /**
   * While racing, ENTER stages the car and then works the clutch.
   *
   * The live throttle goes with the press because the clutch cannot go in under
   * power: on the gas, `pressShift` arms instead of opening, and the gate opens
   * by itself on the lift. `input.throttle()` rather than the tick's argument so
   * the pointer path and the debug handle get the same answer as the keyboard.
   */
  function stageOrShift() {
    // Online, the tree is released by the server rather than by this key, so
    // staging never happens here and ENTER is only ever the clutch.
    if (isOnlineRace()) {
      if (session.status !== STATUS_RACING) return;
      myLog = recordClutch(myLog, raceTick);
      updateRace(pressShift(race, { throttle: input.throttle() }));
      return;
    }
    updateRace(
      race.phase === STAGING ? startRace(race) : pressShift(race, { throttle: input.throttle() }),
    );
  }

  function raceAction(action) {
    // An online result panel is drawn over the strip, and while it is up the
    // race is over — so ENTER asks for the next round instead of the clutch, and
    // ESC leaves the match rather than pausing a race nobody is driving.
    if (isOnlineRace() && showsOnlineResult()) {
      if (action.type === ACTION_CONFIRM) {
        audio.play("button");
        confirmOnlineScreen();
      } else if (action.type === ACTION_CANCEL) {
        audio.play("button");
        leaveOnline();
        shell = enterScreen(shell, SCREEN_MODES);
      }
      return;
    }
    switch (action.type) {
      case ACTION_CONFIRM:
        // Through `confirmScreen` rather than straight to `stageOrShift`, so the
        // key, the pointer and the debug handle all get the same answer — which
        // on a coaching beat is "read, got it" rather than the clutch.
        confirmScreen();
        break;
      case ACTION_SHIFT:
        stageOrShift();
        break;
      case ACTION_MOVE:
        moveRaceGate(action.direction);
        break;
      case ACTION_RESTART:
        // Restarting is an offline convenience. Online the round belongs to the
        // server, and a driver who could re-run one at will would be choosing
        // which of their attempts counted.
        if (isOnlineRace()) break;
        audio.play("button");
        restartRun();
        break;
      case ACTION_CANCEL:
        // Likewise pause: stopping the clock to line up a shift would defeat
        // the timing skill outright, so it is simply not available online.
        if (isOnlineRace()) break;
        audio.play("button");
        cancelScreen(); // pauses
        break;
      default:
        break;
    }
  }

  /** Every screen that is not the race: the menus, and the setup cursor. */
  function menuAction(action) {
    switch (action.type) {
      case ACTION_MOVE:
        audio.play("button");
        if (shell.screen === SCREEN_GARAGE) {
          editor = moveEditor(editor, action.direction, garage);
        } else if (shell.screen === SCREEN_SETUP) {
          setup = moveSetup(setup, action.direction, garage);
        } else {
          shell = moveShell(shell, action.direction);
        }
        break;
      case ACTION_CONFIRM:
        audio.play("button");
        confirmScreen();
        break;
      case ACTION_CANCEL:
        audio.play("button");
        cancelScreen();
        break;
      case ACTION_RESTART:
        audio.play("button");
        if (shell.screen === SCREEN_SETUP) {
          setup = createSetup({ modeId: shell.modeId }, garage);
        }
        break;
      default:
        // SHIFT is the clutch and means nothing outside a race. Ignoring it here
        // is why confirming a car does not also punch the clutch on frame one.
        break;
    }
  }

  /**
   * ENTER on the radio screen: play the highlighted row, reconnect a folder the
   * browser has locked, or go and find one. Which of the three is a question
   * about the library, which is why it is answered here rather than in the
   * shell — the shell has no business knowing what a folder is.
   */
  function confirmRadio() {
    if (radio.tracks.length > 0) {
      setRadio(playCursor(radio));
      return;
    }
    if (library.state().status === LIBRARY_LOCKED) {
      library.resume();
      return;
    }
    library.pick();
  }

  /** The radio screen, which owns its own cursor exactly as the setup does. */
  function radioAction(action) {
    switch (action.type) {
      case ACTION_MOVE:
        audio.play("button");
        setRadio(moveCursor(radio, action.direction));
        break;
      case ACTION_CONFIRM:
        audio.play("button");
        // Through the shared entry point, not straight to `confirmRadio` — there
        // must be exactly one ENTER path, or the debug handle's `confirm()`
        // quietly stops matching what the key does.
        confirmScreen();
        break;
      case ACTION_CANCEL:
        audio.play("button");
        cancelScreen();
        break;
      default:
        break;
    }
  }

  /**
   * A click on the head unit. Routed to the same operations the keys use — the
   * mouse is a second way to press a button, never a second set of rules.
   *
   * `dragging` is what separates a swipe across the faceplate from a press: only
   * the volume bar honours it, because only the volume bar is a continuous
   * control. Sliding off one button and onto another must not fire both.
   */
  function clickRadio(click) {
    const target = hitRadio(currentRadioView(), click.x, click.y);
    if (!target) {
      return;
    }
    if (target.kind === "volume") {
      setRadio(setVolume(radio, target.value));
      saveRadioPreferences(radio);
      return;
    }
    if (click.dragging) {
      return; // everything else is a press, and a press is not a drag
    }
    audio.play("button");
    switch (target.kind) {
      case "button":
        // The faceplate's ids and the key controls are deliberately the same
        // vocabulary, so this is a lookup rather than a second switch.
        stereoAction({ prev: "previous", play: "playPause", next: "next", restart: "restartTrack", loop: "loop" }[target.id]);
        break;
      case "row":
        setRadio(selectTrack(radio, target.index));
        break;
      case "folder":
        openFolderPicker();
        break;
      default:
        break;
    }
  }

  /** A click on one of the shell's menu screens: choose the item under it. */
  function clickMenu(click) {
    if (click.dragging) {
      return;
    }
    const index = menuItemUnder(click);
    if (index < 0) {
      return;
    }
    audio.play("button");
    // Moving the cursor there first means a click goes through exactly the path
    // ENTER goes through, including the buzz on a locked mode.
    shell = { ...shell, cursor: index };
    confirmScreen();
  }

  /** Where the mouse is pointing on a shell menu, or -1 for anywhere else. */
  function menuItemUnder(at) {
    const menu = at && shell.screen !== SCREEN_RADIO ? menuFor(shell) : null;
    // `menuFor` is null on the race and setup screens, which is what keeps the
    // mouse out of them without this needing to name them.
    return menu ? hitMenuList(menu.items.length, menuListBox(shell.screen), at.x, at.y) : -1;
  }

  /**
   * A click on the setup screen. **One click does the whole job** — it picks the
   * thing under it and settles that pane, wherever the keyboard cursor happened
   * to be, because pointing at a car and pressing is not an ambiguous request.
   *
   * The one exception is the objective strip. Locking that pane is what starts
   * the race, so a click there would launch you for looking at a distance;
   * clicking an objective picks it and the START button does the rest.
   */
  function clickSetup(click) {
    // A held drag is a stream of clicks — fine for a slider, wrong for a button
    // that opens a screen or drops the clutch.
    if (click.dragging) return;
    const target = hitSetup(currentSetupView(), click.x, click.y);
    if (!target) return;

    if (target.target === TARGET_START) {
      audio.play("button");
      // Through the shell, exactly as locking the last pane does — the shell is
      // what moves the screen, and `beginRace` alone would build a race behind a
      // picker that never went away.
      confirmShellNow();
      return;
    }

    audio.play("button");
    setup = focusSetup(setup, target, garage);

    // The paint pane's action row opens the garage rather than locking anything.
    // It goes through `confirmSetup` with the real garage, exactly as ENTER
    // does, so the mouse and the key cannot disagree about which rows are
    // configs and which is the button.
    const { setup: next, done, customise } = confirmSetup(setup, garage);
    if (customise) {
      if (garageStore.available) openGarage();
      return;
    }
    if (done) return; // the objective pane: picked, not started
    setup = next;
  }

  /**
   * A click in the garage. A bar is set straight to where it was clicked rather
   * than stepped, which is also what makes dragging work — the pointer reports a
   * click per frame while held, and each one sets the value under it.
   */
  function clickGarage(click) {
    const target = hitGarage(currentGarageView(), click.x, click.y);
    if (!target) return;
    if (target.kind === "bar") {
      editor = setRowRatio(focusEditor(editor, { kind: "row", id: target.id }, garage), target.id, target.ratio);
    } else if (target.kind === "step") {
      // A stepper is an event, not a level, so only the press itself steps. The
      // pointer reports a click per frame while held — which is exactly what a
      // bar wants and exactly what would run a held ▶ through every finish.
      if (!click.dragging) {
        editor = adjustRow(focusEditor(editor, { kind: "row", id: target.id }, garage), target.id, target.step);
      }
    } else if (target.kind === "palette") {
      editor = selectPalette(editor, target.index);
    } else if (target.kind === "section") {
      editor = selectSection(editor, target.id);
    } else if (target.kind === "pick") {
      // One gesture: pointing at a layer preset picks it *and* adds it. Same
      // rule as the setup screen — a mouse has nowhere to put a separate commit,
      // and a click that only highlighted would read as a dead control.
      if (!click.dragging) {
        editor = activateEditorRow(selectPick(editor, target.index), target.id);
      }
    } else if (target.kind === "activate") {
      if (!click.dragging) {
        editor = activateEditorRow(focusEditor(editor, { kind: "row", id: target.id }, garage), target.id);
      }
    } else if (target.kind === "action") {
      garageAction(target.id);
    } else {
      editor = focusEditor(editor, target, garage);
    }
  }

  function applyPointer() {
    // Hovering moves the menu cursor, so the caret is always on the item a click
    // would take. Without it the highlight and the mouse disagree, and the first
    // click after reaching for the mouse lands somewhere surprising.
    const index = menuItemUnder(pointer.hover());
    if (index >= 0 && index !== shell.cursor) {
      shell = { ...shell, cursor: index };
    }

    // On the setup screen the pointer only *highlights*. It used to move the
    // cursor the way it moves a menu caret, but the setup cursor is also the
    // pick: sweeping the mouse across the grid on the way to the track strip
    // silently changed your car, and re-applying the hover every frame put the
    // pane straight back under the pointer after a click had advanced it, so
    // clicking anything looked like it did nothing.
    setupHover = shell.screen === SCREEN_SETUP
      ? hitSetupAt(pointer.hover())
      : null;

    if (shell.screen === SCREEN_ONLINE) {
      const at = pointer.hover();
      const hovered = at ? hitOnline(currentOnlineView(), at.x, at.y) : null;
      // Safe here for the same reason it is safe on the menus and in the garage:
      // this cursor picks nothing on its own. The setup screen is the exception,
      // because there the cursor *is* the pick.
      if (hovered?.kind === TARGET_HOME) {
        onlineMenu = { ...onlineMenu, cursor: hovered.index };
      } else if (hovered?.kind === TARGET_LOBBY_ROW || hovered?.kind === TARGET_LOBBY_STEP) {
        onlineMenu = { ...onlineMenu, lobbyCursor: hovered.index };
      }
    }

    if (shell.screen === SCREEN_GARAGE) {
      const at = pointer.hover();
      const hovered = at ? hitGarage(currentGarageView(), at.x, at.y) : null;
      // Every hit inside a row carries that row's id, so the cursor follows the
      // pointer onto the tabs and the strips too. Here that is safe — unlike on
      // the setup screen, the garage cursor chooses nothing on its own.
      if (hovered?.rowId) {
        editor = focusEditor(editor, { kind: "row", id: hovered.rowId }, garage);
      } else if (hovered) {
        editor = focusEditor(editor, hovered, garage);
      }
    }

    for (const click of pointer.drain()) {
      if (shell.screen === SCREEN_RADIO) {
        clickRadio(click);
      } else if (shell.screen === SCREEN_SETUP) {
        clickSetup(click);
      } else if (shell.screen === SCREEN_GARAGE) {
        clickGarage(click);
      } else if (shell.screen === SCREEN_ONLINE) {
        clickOnline(click);
      } else if (isOnlineRace() && showsOnlineResult()) {
        clickOnlineResult(click);
      } else {
        clickMenu(click);
      }
    }
  }

  function applyActions() {
    for (const action of input.drain()) {
      // The stereo row is handled before the screen split, because those keys
      // are the one group that means the same thing everywhere.
      if (action.type === ACTION_STEREO) {
        stereoAction(action.control);
      } else if (shell.screen === SCREEN_RACE) {
        raceAction(action);
      } else if (shell.screen === SCREEN_RADIO) {
        radioAction(action);
      } else if (shell.screen === SCREEN_ONLINE) {
        onlineAction(action);
      } else {
        menuAction(action);
      }
    }
  }

  function tick(throttle) {
    applyActions();
    applyPointer();
    syncTextCapture();
    view.tick += 1;

    // The radio runs on every screen — that is what makes it a car stereo
    // rather than a race feature — so it is advanced before the race is.
    radioAge += TICK_SECONDS;
    syncStereo();

    // Drives the garage's retry backoff, for the same reason the stereo's
    // `apply` runs here: a failed save keeps trying without a timer of its own,
    // and a save must survive a dropped connection whatever screen you are on.
    garageStore.tick(TICK_SECONDS);
    // Likewise the room's copy of which car this driver is in: coalesced so a
    // held arrow key is one message rather than one per repeat.
    tickLoadout(TICK_SECONDS);

    if (shell.screen !== SCREEN_RACE) {
      audio.engine({ active: false, throttle: 0, gear: race.vehicle.gear });
      return; // nothing to advance behind a menu
    }

    // An online round holds on the line until the server's shared start time
    // arrives, so both trees go green at the same instant and the two reaction
    // times mean the same thing. Once it is over, the strip keeps rendering
    // under the result panel but nothing advances.
    if (isOnlineRace()) {
      if (showsOnlineResult()) {
        audio.engine({ active: true, throttle: 0, gear: race.vehicle.gear });
        return;
      }
      if (!tickOnline(throttle)) {
        audio.engine({ active: true, throttle: 0, gear: race.vehicle.gear });
        return;
      }
    }

    // A coaching beat stops the world. It is not the pause screen — the race is
    // still the screen you are on — it is the lesson holding the car still while
    // something gets explained.
    if (coachHolds(coach)) {
      audio.engine({ active: true, throttle: 0, gear: race.vehicle.gear });
      return;
    }

    updateRace(stepRace(race, { throttle }, TICK_SECONDS));

    // The other car, run forward on the same reducer from the inputs that have
    // arrived. It is simulated rather than interpolated — see online/opponent.js.
    if (isOnlineRace()) {
      raceTick += 1;
      opponentCar = advanceTo(opponentCar, raceTick);
      streamInputs();
      // "I have sent you everything." Deliberately carries no time: the server
      // replays the log and works out for itself what it achieved.
      //
      // **Once per round.** `liveRound` stays set until the verdict arrives, so
      // without the latch this fired on every tick in between — and the server
      // decided the round again on each one, awarding a win every time and
      // settling a best-of-three off a single race. The server refuses a second
      // adjudication too; this stops the flood at the source.
      if (race.phase === FINISHED && session.liveRound && !reportedRound) {
        reportedRound = true;
        streamInputs();
        net.sendDone(session.liveRound.round, session.liveRound.attempt);
      }
    }

    if (coach) {
      coach = advanceCoach(coach, race);
      if (coachFinished(coach)) {
        coach = null; // the rest of the run is the player's own
      }
    }

    const speed = race.vehicle.speed;
    view.scroll += speed * PIXELS_PER_METRE * TICK_SECONDS;
    view.smoothedRpm = smoothToward(view.smoothedRpm, race.vehicle.rpm, NEEDLE_RATE_RPM, TICK_SECONDS);
    view.smoothedSpeed = smoothToward(view.smoothedSpeed, speed, NEEDLE_RATE_SPEED, TICK_SECONDS);
    view.knob = stepKnob(view.knob, knobTargetFor(layout, race), KNOB_SPEED, TICK_SECONDS);
    view.attitude = carAttitude(view.prevSpeed, speed, TICK_SECONDS);
    view.prevSpeed = speed;

    view.gradeAge += TICK_SECONDS;

    if (race.launchGrade && race.launchGrade !== view.launchGrade) {
      view.launchGrade = race.launchGrade;
      view.flash = {
        label: race.launchGrade === "foul" ? "RED LIGHT" : race.launchGrade.toUpperCase(),
        tone: race.launchGrade,
      };
      view.gradeAge = 0;
    }

    if (race.shifts.length !== view.shiftCount) {
      view.shiftCount = race.shifts.length;
      view.flash = shiftFlash(race.lastShift);
      view.gradeAge = 0;
    }

    // The run ending is what opens the results screen — the shell never has to
    // ask the race whether it is over.
    if (race.phase === FINISHED && !isOnlineRace()) {
      shell = enterScreen(shell, SCREEN_RESULTS);
      // A lesson ends with the run it belongs to, however far through it got:
      // there is nothing left to coach, and its strip would otherwise stick out
      // either side of the results panel. `coachedRun` is what survives, so
      // RUN IT AGAIN still rebuilds the tutorial rather than a normal race.
      coach = null;
    }
    audio.engine({
      active: shell.screen === SCREEN_RACE,
      throttle,
      gear: race.vehicle.gear,
    });
  }

  /**
   * The other car, in the neighbouring lane, offset by the real gap between the
   * two runs.
   *
   * The world scrolls with *this* driver, so their car is fixed on screen and
   * the opponent moves relative to it: ahead is up the strip. The gap comes from
   * two independent simulations of the same deterministic reducer, so it is the
   * true gap rather than a smoothed guess at one.
   */
  function drawOpponentCar() {
    const them = opponent(session);
    const model = them?.modelId ? modelById(them.modelId) : null;
    if (!model) return;

    const gap = opponentCar.race.vehicle.distance - race.vehicle.distance;
    const offsetY = -gap * PIXELS_PER_METRE;
    // Cheap enough to skip entirely once they are off the end of the strip.
    if (Math.abs(offsetY) > WORLD.height) return;

    const livery = them.livery ?? null;
    ctx.save();
    ctx.translate(0, offsetY);
    drawUnderglow(ctx, carBox(model, { laneIndex: OPPONENT_LANE }), livery);
    drawCar(
      ctx,
      liverySprite(liveryCache, {
        image: sheetImages.get(model.sheetId),
        model,
        livery,
      }),
      model,
      { laneIndex: OPPONENT_LANE },
    );
    drawTailLights(
      ctx,
      model,
      opponentCar.race.shift !== null || opponentCar.race.clutchTimer > 0 ? 1 : 0.25,
      { colour: (alpha) => tailLightColour(livery, alpha), laneIndex: OPPONENT_LANE },
    );
    ctx.restore();
  }

  /** The world and the instrument cluster, drawn under the race-side screens. */
  function renderRace() {
    if (!trackTile) {
      trackTile = buildTrackTile(trackImages.get(chosen.track.id), chosen.track);
    }
    drawRoad(ctx, trackTile, view.scroll);
    if (race.distanceMetres !== null) {
      drawFinishLine(ctx, race.distanceMetres - race.vehicle.distance);
    }
    drawSpeedStreaks(ctx, race.vehicle.speed, view.tick);
    drawRoadVignette(ctx);

    // Underglow goes down before the body: it is a pool of light on the tarmac,
    // not an outline on the car.
    drawUnderglow(ctx, carBox(chosen.model, { attitude: view.attitude }), chosen.livery);
    drawCar(
      ctx,
      liverySprite(liveryCache, {
        image: sheetImages.get(chosen.model.sheetId),
        model: chosen.model,
        livery: chosen.livery,
      }),
      chosen.model,
      { attitude: view.attitude },
    );
    drawTailLights(ctx, chosen.model, race.shift !== null || race.clutchTimer > 0 ? 1 : 0.25, {
      colour: (alpha) => tailLightColour(chosen.livery, alpha),
    });

    if (isOnlineRace()) {
      drawOpponentCar();
    }

    drawChristmasTree(ctx, race);
    // The coach says everything the staging prompt would, in its own words and
    // at its own point in the lesson. Two panels saying "press ENTER" is one too
    // many, and they would sit on top of each other.
    if (!coach) {
      drawStagingPrompt(ctx, race);
    }
    drawDriverCue(ctx, race);
    // The flash fades on the race clock, and a coaching beat stops that clock —
    // so it would hang at full strength behind the panel that is already saying
    // the same thing in more words. The beat is the better message; drop it.
    drawGradeFlash(ctx, coachHolds(coach) ? null : view.flash, view.gradeAge);
    // Over the world but under the cluster: a lesson never covers the gauges it
    // is telling you to read.
    drawCoachPanel(ctx, coach && coachView(coach, race));

    drawDashPanel(ctx);
    drawTachometer(ctx, gaugeImages, view.smoothedRpm);
    drawSpeedometer(ctx, gaugeImages, view.smoothedSpeed);
    drawShiftLight(ctx, gaugeImages, carSpec, race.vehicle.rpm, shiftLightState(carSpec, race.vehicle.rpm), view.tick);
    drawGearIndicator(ctx, gaugeImages, race.vehicle.gear, race.shift !== null);
    drawReadouts(ctx, race);
    drawShifter(ctx, gate, layout, slots, view.knob, race);

    // Last, over the road: what the stereo is doing, for a few seconds after you
    // touch it. The instrument cluster is full and a permanent strip down there
    // would compete with the shift light for the same glance.
    drawNowPlaying(ctx, currentRadioView(), stripAlpha(radioAge));
  }

  /**
   * The setup view, told whether the garage is usable at this sign-in state and
   * what the pointer is over. Hover rides through the view rather than through
   * the setup, so pointing at something can never be mistaken for choosing it.
   */
  function currentSetupView() {
    return setupView(setup, garage, { canCustomise: garageStore.available, hover: setupHover });
  }

  /** What is under a world point on the setup screen, or null. */
  function hitSetupAt(at) {
    // Built without a hover so this cannot depend on the answer it is computing.
    return at ? hitSetup(setupView(setup, garage, { canCustomise: garageStore.available }), at.x, at.y) : null;
  }

  /**
   * The garage view, with the track it is previewed against folded in.
   *
   * `pointer` is opt-in so the hit test never has to consult a hover it is in
   * the middle of computing. With one, the hover is resolved from the finished
   * view by the same function that resolves a click — so the arrow that lights
   * up is provably the arrow that would fire.
   */
  function currentGarageView({ pointer: at = null } = {}) {
    const view = { ...editorView(editor, garage), trackId: setupTrack(setup).id };
    view.hover = at ? hitGarage(view, at.x, at.y) : null;
    return view;
  }

  function render() {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    // The authored art is painted, not pixel art, so smoothing stays on — the
    // repo's nearest-neighbour default would alias the downscaled road badly.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);

    const menu = menuFor(shell);
    const at = pointer.hover();

    if (shell.screen === SCREEN_RADIO) {
      const radioScreen = currentRadioView({ pointer: at });
      // The one DOM write in the render path, and it earns its place: a drawn
      // button that does not change the cursor does not read as a button.
      canvas.style.cursor = radioScreen.hover ? "pointer" : "default";
      drawRadioScreen(ctx, radioScreen, { splashImage });
      return;
    }

    if (shell.screen === SCREEN_ONLINE) {
      const onlineScreen = currentOnlineView({ pointer: at });
      canvas.style.cursor = onlineScreen.hover ? "pointer" : "default";
      drawOnlineScreen(ctx, onlineScreen, { splashImage });
      return;
    }

    if (shell.screen === SCREEN_GARAGE) {
      const view = currentGarageView({ pointer: at });
      canvas.style.cursor = view.hover ? "pointer" : "default";
      drawGarage(ctx, view, {
        model: modelById(editor.modelId),
        sheetImages,
        trackImages,
        liveryCache,
      });
      return;
    }

    const overItem = shell.screen === SCREEN_SETUP
      ? Boolean(setupHover)
      : Boolean(menu && at && hitMenuList(menu.items.length, menuListBox(shell.screen), at.x, at.y) >= 0);
    canvas.style.cursor = overItem ? "pointer" : "default";

    switch (shell.screen) {
      case SCREEN_TITLE:
        drawTitleScreen(ctx, { menu, splashImage });
        return;
      case SCREEN_MODES:
        drawModeSelect(ctx, { menu, splashImage });
        return;
      case SCREEN_SETUP:
        drawSetup(ctx, currentSetupView(), { sheetImages, trackImages, liveryCache });
        return;
      default:
        break;
    }

    renderRace();
    if (isOnlineRace() && showsOnlineResult()) {
      // Over the strip rather than instead of it: the run that just happened is
      // still on screen underneath, the way pause and the offline results are.
      drawOnlineResult(ctx, {
        headline: roundHeadline(session),
        note: restartNote(session),
        rows: roundRows(session),
        score: session.score,
        matchResult: session.matchResult,
        buttons: resultButtons(session).map((button, index) => ({ ...button, primary: index === 0 })),
      });
      return;
    }
    if (shell.screen === SCREEN_PAUSED) {
      drawPauseMenu(ctx, menu);
    } else if (shell.screen === SCREEN_RESULTS) {
      drawResults(ctx, race, menu);
    }
  }

  // Fixed-timestep accumulator: logic at a steady 60hz regardless of display
  // refresh rate, render every frame.
  let lastTime = null;
  let accumulator = 0;
  function loop(timestamp) {
    if (lastTime === null) {
      lastTime = timestamp ?? performance.now();
    }
    if (timestamp == null) {
      requestAnimationFrame(loop);
      return;
    }
    accumulator += Math.min(timestamp - lastTime, 100);
    lastTime = timestamp;
    while (accumulator >= TICK_MS) {
      accumulator -= TICK_MS;
      tick(input.throttle());
    }
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Debug handle. Lets a run be driven and inspected without the animation
  // loop — needed for automated checks, since a browser suspends
  // requestAnimationFrame entirely while its window is hidden.
  const handle = {
    advance(ticks = 1, throttle = 1) {
      for (let i = 0; i < ticks; i += 1) {
        tick(throttle);
      }
      render();
      return this.state();
    },
    /** Presses ENTER, exactly as the key does, whichever screen is up. */
    confirm() {
      confirmScreen();
      render();
      return this.state();
    },
    /** Presses ESC. */
    cancel() {
      cancelScreen();
      render();
      return this.state();
    },
    move(direction) {
      if (shell.screen === SCREEN_SETUP) {
        setup = moveSetup(setup, direction, garage);
      } else if (shell.screen === SCREEN_GARAGE) {
        editor = moveEditor(editor, direction, garage);
      } else if (shell.screen === SCREEN_RACE) {
        race = gateInput(race, direction);
      } else if (shell.screen === SCREEN_RADIO) {
        setRadio(moveCursor(radio, direction));
      } else if (shell.screen === SCREEN_ONLINE) {
        // Through the same handler the key takes, because a direction on this
        // screen does two different things — walk the rows, or step the one
        // under the caret — and only `onlineAction` knows which. Falling through
        // to `moveShell` made the whole online screen unreachable from here.
        onlineAction({ type: ACTION_MOVE, direction });
      } else {
        shell = moveShell(shell, direction);
      }
      render();
      return this.state();
    },
    /** Presses a stereo button: previous / next / playPause / restartTrack /
     *  loop / volumeUp / volumeDown / folder. */
    stereo(control) {
      stereoAction(control);
      render();
      return this.state();
    },
    /** Jumps straight to a screen, skipping the walk through the menus. */
    screen(name) {
      shell = enterScreen(shell, name);
      render();
      return this.state();
    },
    /** Jumps straight to a mode, rebuilding the setup around it. */
    mode(modeId) {
      shell = { ...shell, modeId };
      adoptMode();
      render();
      return this.state();
    },
    /** Jumps straight to a car, track and objective. */
    choose(modelId, trackId, objectiveId, presetId = null) {
      const next = createSetup({
        modeId: shell.modeId,
        modelId,
        presetId,
        trackId,
        objectiveId: objectiveId ?? setupSelection(setup, garage).objectiveId,
      }, garage);
      if (!resolveSelection(setupSelection(next, garage))) {
        throw new Error(`No such car or track: ${modelId} on ${trackId}`);
      }
      setup = next;
      render();
      return this.state();
    },
    /**
     * Saves a config for the car the picker is on, the way the garage editor
     * will. Exposed because the preset pane cannot be exercised at all without
     * something in the garage, and the folder-picker precedent applies: a
     * surface that only real user data can reach is a surface nothing can check.
     */
    savePaint(name, livery) {
      garage = savePreset(garage, { modelId: setupModel(setup).id, name, livery });
      setup = createSetup({ ...setupSelection(setup, garage), modeId: shell.modeId }, garage);
      render();
      return this.state();
    },
    /** Selects a config by its row in the paint list. Row 0 is always Factory. */
    paint(index) {
      setup = focusSetup(setup, { pane: "preset", index }, garage);
      render();
      return this.state();
    },
    /**
     * The garage editor's section tabs, by id — `paint`, `fade`, `trim`, `glow`,
     * `new-layer`, or `layer-0` upward.
     *
     * The editor is now several screens' worth of controls behind one cursor, so
     * driving it a keypress at a time from automation means counting rows and
     * getting it wrong. These three do what the mouse does.
     */
    section(id) {
      if (!editor) throw new Error("the garage is not open");
      editor = selectSection(editor, id);
      render();
      return this.state();
    },
    /** Adds a colour layer, as clicking a preset on the `+ Layer` tab does. */
    addLayer(presetId = "stripes") {
      if (!editor) throw new Error("the garage is not open");
      const index = LAYER_PRESETS.findIndex((preset) => preset.id === presetId);
      if (index < 0) throw new Error(`No such layer preset: ${presetId}`);
      editor = activateEditorRow(selectPick(selectSection(editor, "new-layer"), index), "layerPreset");
      render();
      return this.state();
    },
    /** Sets fields on the working livery directly, then re-renders. */
    livery(changes) {
      if (!editor) throw new Error("the garage is not open");
      editor = { ...editor, livery: createLivery({ ...editor.livery, ...changes }) };
      render();
      return this.state();
    },
    begin() {
      beginRace();
      shell = enterScreen(shell, SCREEN_RACE);
      render();
      return this.state();
    },
    /** Starts the guided practice run, exactly as the title menu does. */
    tutorial() {
      beginTutorial();
      shell = enterScreen(shell, SCREEN_RACE);
      render();
      return this.state();
    },
    start() {
      updateRace(startRace(race));
      render();
    },
    /** The clutch. `throttle` mirrors the key: on the gas, it only arms it. */
    shift(throttle = 0) {
      updateRace(pressShift(race, { throttle }));
      render();
      return this.state();
    },
    gate(direction) {
      moveRaceGate(direction);
      render();
    },
    restart() {
      restartRun();
      render();
      return this.state();
    },
    menu() {
      shell = enterScreen(shell, SCREEN_MODES);
      render();
      return this.state();
    },
    /**
     * The online path, for automation. `receive` feeds a server frame straight
     * into the net layer's parser, which is the only way to exercise the glue
     * between the wire and the race without a live opponent — and the folder
     * picker note above applies here too: a socket cannot be driven from a
     * script, so the frames are injected instead.
     */
    online: {
      receive(frame) {
        net.receive(frame);
        render();
        return { status: session.status, round: session.round, attempt: session.attempt };
      },
      session: () => ({
        status: session.status,
        roomCode: session.roomCode,
        isHost: session.isHost,
        players: session.players.map((player) => player.displayName),
        config: session.config,
        score: session.score,
        headline: roundHeadline(session),
      }),
      /** The other car, as it is currently being drawn. */
      opponent: () =>
        opponentCar
          ? {
              distance: opponentCar.race.vehicle.distance,
              speed: opponentCar.race.vehicle.speed,
              gear: opponentCar.race.vehicle.gear,
              tick: opponentCar.tick,
            }
          : null,
      log: () => myLog.events.length,
      /** Where the screen's own cursor is, and what each driver has staged. */
      menu: () => ({
        pane: paneFor(onlineMenu, session),
        cursor: onlineMenu.cursor,
        lobbyCursor: onlineMenu.lobbyCursor,
        code: onlineMenu.entry.value,
        ready: session.players.map((player) => ({ name: player.displayName, ready: player.ready })),
      }),
    },
    state() {
      const selection = setupSelection(setup, garage);
      // Before the race is built the cursor is the truth; once it is on track,
      // the resolved car and track are, because the cursor can move on behind it.
      const racing = showsTheRace(shell.screen);
      return {
        screen: shell.screen,
        pane: shell.screen === SCREEN_SETUP ? setup.pane : null,
        menu: menuFor(shell)?.items.map((item) => (item.highlighted ? `[${item.id}]` : item.id)) ?? null,
        mode: selection.modeId,
        objective: selection.objectiveId,
        car: racing ? chosen.model.id : selection.modelId,
        track: racing ? chosen.track.id : selection.trackId,
        phase: race.phase,
        gear: race.vehicle.gear,
        rpm: Math.round(race.vehicle.rpm),
        speed: Number(race.vehicle.speed.toFixed(2)),
        distance: Number(race.vehicle.distance.toFixed(1)),
        elapsed: Number(race.elapsed.toFixed(3)),
        finishTime: race.finishTime,
        shifting: race.shift !== null,
        armed: race.shiftArmed,
        awaitingCatch: race.pendingShift !== null,
        falseStart: race.falseStart,
        launchGrade: race.launchGrade,
        reactionTime: race.reactionTime,
        grades: race.shifts.map(
          (entry) => `${entry.grade}${entry.reason ? `/${entry.reason}` : ""}+${entry.catch?.grade ?? "open"}`,
        ),
        coach: coach ? { step: coachView(coach, race)?.id ?? null, holding: coachHolds(coach) } : null,
        radio: {
          status: library.state().status,
          folder: library.state().folderName,
          tracks: radio.tracks.length,
          index: radio.index,
          cursor: radio.cursor,
          playing: radio.playing,
          loop: radio.loop,
          volume: Number(radio.volume.toFixed(2)),
          nowPlaying: nowPlaying(radio)?.title ?? null,
          loaded: source.url !== null,
          // Straight off the element. Without these there is no way to tell a
          // deck that is running from one that only thinks it is.
          elapsed: Number(playback.elapsed.toFixed(2)),
          duration: Number(playback.duration.toFixed(2)),
        },
      };
    },
  };
  return handle;
}
