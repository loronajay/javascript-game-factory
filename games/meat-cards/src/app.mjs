import { bootGameBoard } from "./game-board-app.mjs";
import { mountMainMenu } from "./ui/menu/main-menu.mjs";
import { mountHowToPlay } from "./ui/menu/how-to-play.mjs";
import { mountDeckSelect } from "./ui/menu/deck-select.mjs";
import { mountResultsScreen } from "./ui/menu/results-screen.mjs";

const DEBUG_PLAYER_CONFIGS = [
  { id: "p1", name: readFactoryPlayerName() ?? "Player One", deckId: "meat_deck" },
  { id: "p2", name: "Player Two", deckId: "useless_deck" },
];

const root = document.getElementById("appRoot");

function navigate(screen, params = {}) {
  root.innerHTML = "";
  switch (screen) {
    case "main-menu":
      mountMainMenu(root, navigate);
      break;
    case "how-to-play":
      mountHowToPlay(root, navigate);
      break;
    case "deck-select":
      mountDeckSelect(root, navigate, params);
      break;
    case "debug":
      startGameBoard(DEBUG_PLAYER_CONFIGS);
      break;
    case "game-board":
      startGameBoard(params.playerConfigs ?? DEBUG_PLAYER_CONFIGS);
      break;
    case "results":
      mountResultsScreen(root, navigate, params);
      break;
    default:
      mountMainMenu(root, navigate);
  }
}

function startGameBoard(playerConfigs) {
  root.innerHTML = `<div class="loading">Loading match...</div>`;
  bootGameBoard(root, playerConfigs, {
    onMatchEnd(result) {
      navigate("results", { result, playerConfigs });
    },
  }).catch((err) => {
    root.innerHTML = `<p class="load-error">${err.message}</p>`;
  });
}

function readFactoryPlayerName() {
  try {
    const raw = localStorage.getItem("javascript-game-factory.factoryProfile");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.profileName === "string" && parsed.profileName.trim()) {
      return parsed.profileName.trim().slice(0, 12);
    }
    return null;
  } catch {
    return null;
  }
}

navigate("main-menu");
