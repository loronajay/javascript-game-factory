import { ensureBirdDutyFonts, loadBirdDutyManifest } from "./scripts/assets.js";
import {
  consumeDropRequest,
  createInputState,
  shouldPreventGameKey,
  updateInputForKey,
} from "./scripts/input.js";
import { advanceMenuBirdState } from "./scripts/menu-birds.js";
import {
  createMenuInteractionState,
  MENU_ACTIONS,
  resolveMenuActionAtCanvasPoint,
} from "./scripts/menu-input.js";
import { createBirdDutyRenderer } from "./scripts/renderer.js";
import { createSoundController } from "./scripts/sounds.js";
import { applyMenuAction, createInitialState, SCREEN } from "./scripts/state.js";
import { createPlayerState, updatePlayer } from "./scripts/player.js";
import { createPoopState, spawnPoopFromPlayer, updatePoop } from "./scripts/poop.js";
import {
  canFireShot,
  createPlaySession,
  fireShot,
  shouldReturnToMenu,
  updatePlaySession,
} from "./scripts/play-session.js";

const TICK_MS = 1000 / 60;

export async function initGame() {
  const canvas = document.getElementById("bird-duty-canvas");
  const status = document.getElementById("bird-duty-status");
  const selection = document.getElementById("bird-duty-selection");
  if (!canvas) {
    throw new Error("Bird Duty canvas was not found");
  }

  try {
    await ensureBirdDutyFonts();
    const manifest = await loadBirdDutyManifest();
    const renderer = await createBirdDutyRenderer(canvas, manifest);
    const sounds = createSoundController();
    let gameState = createInitialState();
    let playerState = createPlayerState();
    let poopState = createPoopState();
    let playSession = createPlaySession();
    let inputState = createInputState();
    let menuBirdState = { tick: 0 };
    let menuInteractionState = { selectedAction: null, lastAction: null };
    let lastTime = null;
    let accumulator = 0;

    function canvasPointFromEvent(event) {
      const rect = canvas.getBoundingClientRect();
      const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
      const clientY = event.clientY ?? event.touches?.[0]?.clientY ?? 0;
      return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    function actionFromEvent(event) {
      const point = canvasPointFromEvent(event);
      return resolveMenuActionAtCanvasPoint(point.x, point.y);
    }

    function updateMenuHover(event) {
      if (gameState.screen !== SCREEN.MENU) return;
      const action = actionFromEvent(event);
      menuInteractionState = createMenuInteractionState(menuInteractionState, action);
      canvas.classList.toggle("is-menu-hot", Boolean(action));
    }

    function activateMenuAction(event) {
      if (gameState.screen !== SCREEN.MENU) return;
      const action = actionFromEvent(event);
      if (!action) return;
      event.preventDefault();
      sounds.playButtonClick();
      menuInteractionState = createMenuInteractionState(menuInteractionState, action);
      if (action === MENU_ACTIONS.BACK_ARCADE) {
        window.location.href = "../../grid.html";
        return;
      }
      if (action === MENU_ACTIONS.BACK_HOME) {
        window.location.href = "../../index.html";
        return;
      }
      gameState = applyMenuAction(gameState, action);
      if (gameState.screen === SCREEN.PLAY) {
        playerState = createPlayerState();
        poopState = createPoopState();
        playSession = createPlaySession();
        inputState = createInputState();
        sounds.startGameMusic();
      }
      canvas.classList.remove("is-menu-hot");
      if (action === MENU_ACTIONS.RESET_SCORE) {
        if (selection) selection.textContent = "Reset score selected";
      } else if (action === MENU_ACTIONS.TWO_PLAYERS) {
        if (selection) selection.textContent = "Two-player setup coming next";
      } else if (selection) {
        selection.textContent = "";
      }
    }

    function tick() {
      menuBirdState = advanceMenuBirdState(menuBirdState);
      if (gameState.screen === SCREEN.PLAY) {
        if (playSession.phase === "running") {
          playerState = updatePlayer(playerState, inputState);
        }
        if (inputState.dropRequested && poopState.phase === "inactive" && canFireShot(playSession)) {
          poopState = spawnPoopFromPlayer(playerState);
          playSession = fireShot(playSession);
          sounds.playPoopRelease();
        }
        const previousPoopPhase = poopState.phase;
        poopState = updatePoop(poopState);
        if (previousPoopPhase === "airborne" && poopState.phase === "splat") {
          sounds.playSplat();
        }
        playSession = updatePlaySession(playSession, poopState);
        inputState = consumeDropRequest(inputState);
        if (shouldReturnToMenu(playSession)) {
          sounds.stopGameMusic();
          gameState = createInitialState();
          playerState = createPlayerState();
          poopState = createPoopState();
          playSession = createPlaySession();
          inputState = createInputState();
        }
      }
    }

    function handleKey(event, pressed) {
      if (!shouldPreventGameKey(event.key)) return;
      event.preventDefault();
      inputState = updateInputForKey(inputState, event.key, pressed);
    }

    function loop(timestamp) {
      if (lastTime === null) lastTime = timestamp ?? performance.now();
      if (timestamp == null) {
        requestAnimationFrame(loop);
        return;
      }

      accumulator += Math.min(timestamp - lastTime, 100);
      lastTime = timestamp;

      while (accumulator >= TICK_MS) {
        accumulator -= TICK_MS;
        tick();
      }

      renderer.render({
        screen: gameState.screen,
        menuBirdTick: menuBirdState.tick,
        hoverAction: menuInteractionState.selectedAction,
        player: playerState,
        poop: poopState,
        playSession,
      });
      requestAnimationFrame(loop);
    }

    if (status) status.hidden = true;
    canvas.addEventListener("pointermove", updateMenuHover);
    canvas.addEventListener("pointerleave", () => {
      menuInteractionState = createMenuInteractionState(menuInteractionState, null);
      canvas.classList.remove("is-menu-hot");
    });
    canvas.addEventListener("click", activateMenuAction);
    canvas.addEventListener("touchstart", activateMenuAction, { passive: false });
    window.addEventListener("keydown", (event) => handleKey(event, true));
    window.addEventListener("keyup", (event) => handleKey(event, false));
    renderer.render({
      screen: gameState.screen,
      menuBirdTick: menuBirdState.tick,
      hoverAction: menuInteractionState.selectedAction,
      player: playerState,
      poop: poopState,
      playSession,
    });
    requestAnimationFrame(loop);
  } catch (error) {
    if (status) {
      status.hidden = false;
      status.textContent = error.message;
    }
    throw error;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    initGame();
  });
}
