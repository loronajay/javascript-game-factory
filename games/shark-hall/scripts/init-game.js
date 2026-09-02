// The composition root: the one file that knows every layer exists.
//
// It imports THREE, builds the scene, the match, the audio and the UI, wires
// them to each other, and runs the frame loop. Nothing else in the cabinet
// imports across a layer boundary — the sim never reaches the DOM, the render
// layer never reaches the match, the audio never reaches either.
//
// It is deliberately the ONLY file allowed to get long, and it is still short,
// because everything it does is connect two things that were built to be
// connected. The moment a rule or a piece of geometry appears in here, it
// belongs somewhere else.
//
// THE FRAME LOOP DOES FOUR THINGS in order: advance the match by real time
// (which drains a fixed-timestep accumulator inside `world.js`), draw the charge
// meter, mirror the state onto the scene, and render. The physics never sees the
// frame rate.

import { createGameAudio } from "./audio/game-audio.js";
import { MODE_CPU, createMatch } from "./match/match.js";
import { createTableScene } from "./render/scene.js";
import { ballColor } from "./render/textures.js";
import { aimSolution } from "./sim/aim.js";
import { describeBall } from "./sim/rules.js";
import { ZONE_NONE } from "./sim/placement.js";
import { loadSettings, saveSettings } from "./store/settings.js";
import { createControls } from "./ui/controls.js";
import { findElements } from "./ui/elements.js";
import { createHud } from "./ui/hud.js";
import { createMenu } from "./ui/menu.js";
import { createSpinDial } from "./ui/spin-dial.js";

/** Pinned. One import, one version, one place to change it. */
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.168.0/+esm";

/** Cap on a frame's dt, so a backgrounded tab does not teleport the balls on return. */
const MAX_FRAME_SECONDS = 0.04;

export async function bootGame() {
  const elements = findElements();
  if (!elements.canvas) return;

  let THREE;
  try {
    THREE = await import(/* @vite-ignore */ THREE_URL);
  } catch (error) {
    // A cabinet that cannot load its renderer must say so in the interface, not
    // in the console. This is the one failure the player can actually act on.
    if (elements.status) elements.status.textContent = "3D engine failed to load";
    if (elements.sub) elements.sub.textContent = "Open this page in a browser with internet access.";
    if (elements.log) elements.log.textContent = String(error?.message || error);
    console.error(error);
    return;
  }

  // --- the layers ---------------------------------------------------------
  let settings = loadSettings();
  const audio = createGameAudio({ muted: settings.muted });
  const scene = createTableScene(THREE, elements.canvas);
  const hud = createHud(elements);
  const match = createMatch({ mode: MODE_CPU, difficulty: settings.difficulty });

  let cameraMode = settings.camera;

  const spinDial = createSpinDial(elements.spin, {
    onChange: ({ spinX, spinY }) => {
      audio.unlock();
      live.setContact(spinX, spinY);
    },
  });

  const menu = createMenu({
    elements,
    audio,
    settings,
    onStart(mode) {
      // The match is rebuilt rather than reconfigured, because mode is not a
      // setting a live match can absorb — a hotseat rack halfway through cannot
      // grow a CPU. One line here beats a mode-change path through every module.
      swapMatch(mode);
      audio.unlock();
    },
    // Every callback below goes through `live`, never through the `match` built
    // above: `swapMatch` replaces it on a mode change, and a menu button still
    // holding the first one would resume a match nobody is playing.
    onResume: () => live.resume(),
    onRestart: () => live.rack(),
    onQuit: () => {
      live.quit();
      audio.silence();
      refresh();
    },
    onSettingsChange(patch) {
      settings = saveSettings(patch);
      if (patch.difficulty !== undefined) live.setDifficulty(settings.difficulty);
      if (patch.camera !== undefined && !live.started) cameraMode = settings.camera;
      if (patch.muted !== undefined) audio.setMuted(settings.muted);
      refresh();
    },
  });

  // --- match wiring -------------------------------------------------------
  // One live match at a time; `swapMatch` replaces it and re-subscribes. The
  // subscriptions are re-made rather than proxied because a stale listener on a
  // dead match is the classic way a cabinet starts playing two games at once.
  let live = match;
  let unsubscribe = [];

  function subscribe(target) {
    for (const off of unsubscribe) off();
    unsubscribe = [
      target.on("physics", (event) => audio.handlePhysics(event)),
      target.on("shot", () => scene.strike()),
      target.on("rack", (balls) => scene.reset(balls)),
      target.on("message", (text) => hud.message(text)),
      target.on("turn-card", (card) => hud.turnCard(card)),
      target.on("turn-card-done", () => hud.turnCard(null)),
      target.on("settled", (outcome) => {
        if (outcome.foul) audio.reject();
      }),
      target.on("win", ({ name }) => {
        audio.silence();
        menu.showResult({
          title: `${name} wins`,
          sub: `${live.mode === MODE_CPU ? "Vs CPU" : "Hotseat"} · 8-ball rack complete.`,
        });
      }),
      target.on("change", () => refresh()),
    ];
  }

  function swapMatch(mode) {
    live.quit();
    live = createMatch({ mode, difficulty: settings.difficulty });
    subscribe(live);
    scene.reset(live.world.balls);
    live.start();
    menu.showTable();
    refresh();
  }

  subscribe(live);
  scene.reset(live.world.balls);

  // --- controls -----------------------------------------------------------
  let chargePercent = 0;

  const controls = createControls({
    canvas: elements.canvas,
    elements,
    match: {
      // A thin forwarder, so the controls never hold a reference to a match that
      // `swapMatch` has already replaced.
      humanCanAct: () => live.humanCanAct() && menu.isTableLive(),
      snapshot: () => live.snapshot(),
      setAngle: (angle) => live.setAngle(angle),
      nudgeAngle: (delta) => live.nudgeAngle(delta),
      aimAt: (x, z) => live.aimAt(x, z),
      balls: () => live.world.balls,
      tryPlaceCue: (x, z) => live.tryPlaceCue(x, z),
      confirmPlacement: () => live.confirmPlacement(),
      shoot: (power) => live.shoot(power),
    },
    scene,
    audio,
    isInteractive: () => menu.isTableLive(),
    onCharge(power, { released = false } = {}) {
      chargePercent = Math.round(power * 100);
      hud.charge(chargePercent);
      if (released) {
        // Let the number the player released on stay up for a moment before the
        // meter resets, so a shot has a readable power afterwards.
        setTimeout(() => {
          if (!controls.isCharging()) {
            chargePercent = 0;
            hud.charge(0);
          }
        }, 450);
      }
    },
    onCameraToggle() {
      cameraMode = cameraMode === "aim" ? "over" : "aim";
      refresh();
    },
    // Which ball the cursor is over. The sim names it, `textures.js` colours it,
    // and the HUD places it — this only introduces the three to each other.
    onHover(hit) {
      if (!hit) return hud.ballTip(null);
      const snapshot = live.snapshot();
      const described = describeBall(hit.n, snapshot.groups[snapshot.shooter]);
      hud.ballTip({
        ...described,
        color: ballColor(hit.n),
        owner: described.mine === null ? "" : described.mine ? "Yours" : "Theirs",
        clientX: hit.clientX,
        clientY: hit.clientY,
      });
    },
  });

  elements.pauseBtn?.addEventListener("click", () => {
    audio.unlock();
    audio.click();
    live.pause();
    audio.silence();
    menu.showPause();
  });
  menu.onPause(() => {
    live.pause();
    audio.silence();
  });

  elements.muteBtn?.addEventListener("click", () => {
    audio.unlock();
    settings = saveSettings({ muted: !settings.muted });
    audio.setMuted(settings.muted);
    audio.click();
    refresh();
  });

  // The first gesture anywhere is what a browser will accept an AudioContext
  // from, so it is caught at the document rather than on any one control.
  for (const type of ["pointerdown", "keydown"]) {
    window.addEventListener(type, () => audio.unlock(), { once: false, passive: true });
  }

  // --- painting -----------------------------------------------------------
  function refresh() {
    const snapshot = live.snapshot();
    hud.render(snapshot);
    hud.shootLabel(shootLabel(snapshot));
    spinDial.draw(snapshot.spinX, snapshot.spinY);
    menu.syncMatch(snapshot);
    if (elements.camBtn) elements.camBtn.textContent = cameraMode === "aim" ? "Overhead view" : "Cue view";
    if (elements.muteBtn) {
      elements.muteBtn.textContent = settings.muted ? "Sound off" : "Sound on";
      elements.muteBtn.setAttribute("aria-pressed", String(!settings.muted));
    }
    if (elements.nowPlaying) {
      const track = audio.currentTrackTitle();
      elements.nowPlaying.textContent = settings.muted ? "Muted" : track ? `Now playing · ${track}` : "Starts on first click";
    }
  }

  function shootLabel(snapshot) {
    if (controls.isCharging()) return `CHARGING · ${chargePercent}%`;
    if (snapshot.ballInHand !== ZONE_NONE && snapshot.humanCanAct) return "Place cue ball first";
    return "Hold · Release to shoot";
  }

  // --- the loop -----------------------------------------------------------
  let lastFrame = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);
    lastFrame = now;

    live.tick(dt);

    if (controls.isCharging()) {
      const percent = Math.round(controls.chargeLevel() * 100);
      if (percent !== chargePercent) {
        chargePercent = percent;
        hud.charge(percent);
        hud.shootLabel(`CHARGING · ${percent}%`);
      }
    }

    const snapshot = live.snapshot();
    const cue = live.world.cue();
    scene.sync(dt, {
      balls: live.world.balls,
      cue,
      angle: snapshot.angle,
      charge: controls.chargeLevel(),
      moving: snapshot.moving,
      paused: snapshot.paused,
      guideMode: settings.guide,
      placing: snapshot.ballInHand === ZONE_NONE || !snapshot.humanCanAct ? null : snapshot.ballInHand,
      cameraMode,
      // Recomputed each frame rather than cached: the aim, the cue ball and the
      // balls in the way all move, and a stale guide line is a lie about where
      // the shot goes.
      solution: cue && !cue.pocketed ? aimSolution(live.world.balls, cue, snapshot.angle) : null,
    });
    scene.render();
  }

  refresh();
  requestAnimationFrame(frame);
}
