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
import {
  TWO_PLAYER_ACTIONS,
  resolveTwoPlayerActionAtCanvasPoint,
} from "./scripts/two-player-menu.js";
import { createPlayerState, updatePlayer } from "./scripts/player.js";
import { createPoopState, spawnPoopFromPlayer, updatePoop } from "./scripts/poop.js";
import { clearPersonalBest, getPersonalBest, updatePersonalBest } from "./scripts/personal-best.js";
import {
  addScore,
  canFireShot,
  createPlaySession,
  fireShot,
  shouldReturnToMenu,
  updatePlaySession,
} from "./scripts/play-session.js";
import { createNpcState, processNpcHits, updateNpcState } from "./scripts/npcs.js";
import {
  HOTSEAT_PHASE,
  addHotseatScore,
  advanceHotseatReady,
  createHotseatSession,
  createHotseatTurnSession,
  finishHotseatTurn,
  startHotseatTurn,
} from "./scripts/hotseat-session.js";

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
    let npcState = createNpcState();
    let hotseatSession = createHotseatSession();
    let personalBest = getPersonalBest();
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
      if (gameState.screen === SCREEN.TWO_PLAYER_MENU) {
        return resolveTwoPlayerActionAtCanvasPoint(point.x, point.y);
      }
      return resolveMenuActionAtCanvasPoint(point.x, point.y);
    }

    function updateMenuHover(event) {
      if (gameState.screen !== SCREEN.MENU && gameState.screen !== SCREEN.TWO_PLAYER_MENU) return;
      const action = actionFromEvent(event);
      menuInteractionState = createMenuInteractionState(menuInteractionState, action);
      canvas.classList.toggle("is-menu-hot", Boolean(action));
    }

    function activateMenuAction(event) {
      if (gameState.screen !== SCREEN.MENU && gameState.screen !== SCREEN.TWO_PLAYER_MENU) return;
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
        npcState = createNpcState();
        inputState = createInputState();
        sounds.startGameMusic();
      }
      if (gameState.screen === SCREEN.HOTSEAT_PLAY) {
        playerState = createPlayerState();
        poopState = createPoopState();
        playSession = createHotseatTurnSession();
        npcState = createNpcState();
        hotseatSession = createHotseatSession();
        inputState = createInputState();
        sounds.startGameMusic();
      }
      canvas.classList.remove("is-menu-hot");
      if (action === MENU_ACTIONS.RESET_SCORE) {
        clearPersonalBest();
        personalBest = getPersonalBest();
        if (selection) selection.textContent = "Reset score selected";
      } else if (action === TWO_PLAYER_ACTIONS.ONLINE) {
        if (selection) selection.textContent = "Online play coming next";
      } else if (selection) {
        selection.textContent = "";
      }
    }

    function tick() {
      menuBirdState = advanceMenuBirdState(menuBirdState);
      if (gameState.screen === SCREEN.HOTSEAT_PLAY) {
        let handledHotseatContinue = false;
        if (inputState.dropRequested) {
          if (hotseatSession.phase === HOTSEAT_PHASE.READY || hotseatSession.phase === HOTSEAT_PHASE.TURN_OVER) {
            hotseatSession = startHotseatTurn(advanceHotseatReady(hotseatSession));
            playerState = createPlayerState();
            poopState = createPoopState();
            playSession = createHotseatTurnSession();
            npcState = createNpcState();
            handledHotseatContinue = true;
          } else if (hotseatSession.phase === HOTSEAT_PHASE.MATCH_OVER) {
            sounds.stopGameMusic();
            gameState = createInitialState();
            hotseatSession = createHotseatSession();
            playerState = createPlayerState();
            poopState = createPoopState();
            playSession = createPlaySession();
            npcState = createNpcState();
            handledHotseatContinue = true;
          }
        }

        if (hotseatSession.phase === HOTSEAT_PHASE.PLAYING) {
          playerState = updatePlayer(playerState, inputState);
          if (!handledHotseatContinue && inputState.dropRequested && poopState.phase === "inactive" && canFireShot(playSession)) {
            poopState = spawnPoopFromPlayer(playerState);
            playSession = fireShot(playSession);
            sounds.playPoopRelease();
          }
          const previousPoopPhase = poopState.phase;
          poopState = updatePoop(poopState);
          if (previousPoopPhase === "airborne" && poopState.phase === "splat") {
            sounds.playSplat();
          }
          npcState = updateNpcState(npcState);
          const hitResult = processNpcHits(npcState.entities, poopState);
          npcState = {
            ...npcState,
            entities: hitResult.entities,
          };
          if (hitResult.scoreDelta > 0) {
            playSession = addScore(playSession, hitResult.scoreDelta);
            hotseatSession = addHotseatScore(hotseatSession, hitResult.scoreDelta);
            for (const type of hitResult.hitTypes) {
              sounds.playNpcHit(type);
            }
          }
          const previousSessionPhase = playSession.phase;
          playSession = updatePlaySession(playSession, poopState);
          if (previousSessionPhase === "running" && playSession.phase === "game-over") {
            hotseatSession = finishHotseatTurn(hotseatSession);
            playerState = createPlayerState();
            poopState = createPoopState();
            playSession = createHotseatTurnSession();
            npcState = createNpcState();
          }
        }
        inputState = consumeDropRequest(inputState);
        return;
      }

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
        if (playSession.phase === "running") {
          npcState = updateNpcState(npcState);
          const hitResult = processNpcHits(npcState.entities, poopState);
          npcState = {
            ...npcState,
            entities: hitResult.entities,
          };
          if (hitResult.scoreDelta > 0) {
            playSession = addScore(playSession, hitResult.scoreDelta);
            for (const type of hitResult.hitTypes) {
              sounds.playNpcHit(type);
            }
          }
        }
        const previousSessionPhase = playSession.phase;
        playSession = updatePlaySession(playSession, poopState);
        if (previousSessionPhase === "running" && playSession.phase === "game-over") {
          personalBest = updatePersonalBest(playSession.finalScore ?? playSession.score).value;
        }
        inputState = consumeDropRequest(inputState);
        if (shouldReturnToMenu(playSession)) {
          sounds.stopGameMusic();
          gameState = createInitialState();
          playerState = createPlayerState();
          poopState = createPoopState();
          playSession = createPlaySession();
          npcState = createNpcState();
          hotseatSession = createHotseatSession();
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
        npcs: npcState.entities,
        personalBest,
        hotseat: hotseatSession,
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
      npcs: npcState.entities,
      personalBest,
      hotseat: hotseatSession,
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
